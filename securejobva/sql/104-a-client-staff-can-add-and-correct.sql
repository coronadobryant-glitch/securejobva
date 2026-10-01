-- 104 — a client staff can add, correct, and invite again
--
-- Run after: 103
-- Safe to re-run: yes
-- Also needed: /admin given a Clients list that uses these (CONTRACT.md).
--   Nothing breaks before it does: the existing match form keeps working, it
--   simply does not call these yet. api/invite.js should answer a failed
--   send with a 5xx (CONTRACT.md) so the outbox can try it again.
--
-- ==========================================================================
-- A BUSINESS NOBODY CAN FIX (F37, F38, F40, F16)
-- ==========================================================================
--
-- A client is a name on clients and a contact on client_private (039). The
-- contact address is the whole of the client's way in: it is how /seats and
-- /pay know who they are, where the invite goes (040), and where the payment
-- receipt goes (093). And /admin
--
--   - never shows it after the business is created          (F37, F40)
--   - has no way to change it, or the billing cycle          (F37, F40)
--   - creates a business only while matching somebody to it (F38)
--   - sends the invite once, at the first placement, with no way to send it
--     again when the address was wrong or the email never came   (F16)
--
-- The tables already let staff do all of it — 039's grants and policies give
-- applications.edit insert and update on both halves, and view_all reads them
-- — so this is not a permission anybody lacked. What was missing is a way to
-- do it in ONE step that cannot half-happen, with the rules the address has
-- to keep written in one place. Three functions:
--
--   create_client(business, contact, address, cycle, note, from_request)
--       -> uuid       both halves in one transaction; optionally links the
--                     seat request it came from (102)
--   update_client(client, business, contact, address, cycle, note)
--       -> text       every field, as given (null clears it); re-sends the
--                     invite when the address changed and there is somebody
--                     placed with them, and says so: 'saved' or 'saved, invite sent'
--   resend_client_invite(client)
--       -> text       posts the invite again to /api/invite, through the
--                     outbox; refuses when there is no address
--
-- Reading needs no function: /admin can embed the private half —
--
--   clients?select=id,name,client_private(contact_name,contact_email,billing_cycle,notes)
--
-- — which 039's staff policy already answers.
--
-- ==========================================================================
-- THE ADDRESS RULES, IN ONE PLACE
-- ==========================================================================
--
--   - the same pattern 073 and 092 hold every other address to
--   - one client per address (039's unique index), refused here first with a
--     sentence that names the business already holding it, rather than a
--     23505 the page has to translate
--   - a business name that already exists is refused by create_client, which
--     is what stops "try again" after a failure making the same client twice
--     (F39); pick the existing one instead
--
-- Refusals carry an sjva- hint and a sentence for the person, as every
-- deliberate refusal here does:
--
--   sjva-client-name          no name, or longer than 200
--   sjva-client-exists        a client by that name already exists
--   sjva-client-address       not an email address
--   sjva-client-address-taken that address is another client's contact
--   sjva-client-cycle         not weekly or monthly
--   sjva-client-no-address    an invite asked for with no address on file
--   sjva-client-invite-just-sent  the same invite asked for again within two minutes

do $pre$
begin
  if to_regclass('public.client_private') is null then
    raise exception 'sql/039 has not been run on this database.';
  end if;
  if to_regprocedure('public.notify_send(jsonb, text, text)') is null then
    raise exception 'sql/095 has not been run on this database.';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'seat_requests'
                   and column_name = 'client_id') then
    raise exception 'sql/102 has not been run on this database.';
  end if;
end
$pre$;

-- ── the rules, shared by all three ──────────────────────────────────────────
--
-- Not callable by anybody: it is a piece of the three below, and on its own it
-- would be a way to ask which addresses are already clients.

create or replace function public.client_details_are_sane(
  client uuid, business text, address text, cycle text
)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  holder text;
begin
  if length(coalesce(btrim(business), '')) not between 1 and 200 then
    raise exception 'Give the business a name (up to 200 characters).'
      using hint = 'sjva-client-name';
  end if;

  if cycle is null or cycle not in ('weekly', 'monthly') then
    raise exception 'Billing is weekly or monthly.'
      using hint = 'sjva-client-cycle';
  end if;

  if address is not null then
    if address !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' then
      raise exception 'That is not an email address: %', address
        using hint = 'sjva-client-address';
    end if;

    select c.name into holder
      from public.client_private cp
      join public.clients c on c.id = cp.client_id
     where lower(cp.contact_email) = lower(address)
       and cp.client_id is distinct from client
     limit 1;

    if holder is not null then
      raise exception '% is already the contact for %. One address can sign in to one business.',
        address, holder
        using hint = 'sjva-client-address-taken';
    end if;
  end if;
end;
$fn$;

revoke all on function public.client_details_are_sane(uuid, text, text, text)
  from public, anon, authenticated;

-- ── the invite, shared by update_client and resend_client_invite ───────────
--
-- The same body 040 and 096 post when a placement is made, built from the
-- client's newest placement — live first, then any — so the email can still
-- say who their assistant is. No placement at all is fine: the invite is a
-- way in, and api/invite treats the assistant and the date as optional.

create or replace function public.post_client_invite(client uuid, source text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  cmail text;
  cname text;
  pl    record;
begin
  select cp.contact_email, c.name into cmail, cname
    from public.clients c
    left join public.client_private cp on cp.client_id = c.id
   where c.id = client;

  if coalesce(btrim(cmail), '') = '' then
    return null;
  end if;

  select a.name as assistant, p.started_on into pl
    from public.placements p
    join public.applications a on a.id = p.application_id
   where p.client_id = client
   order by (p.status in ('matched', 'trial', 'ongoing')) desc, p.created_at desc
   limit 1;

  perform public.notify_send(
    jsonb_build_object(
      'email',     cmail,
      'business',  cname,
      'assistant', pl.assistant,
      'starts_on', pl.started_on),
    'https://www.securejobva.com/api/invite',
    source);

  return cmail;
end;
$fn$;

revoke all on function public.post_client_invite(uuid, text) from public, anon, authenticated;

-- ── creating one ────────────────────────────────────────────────────────────

create or replace function public.create_client(
  business     text,
  contact      text default null,
  address      text default null,
  cycle        text default 'weekly',
  note         text default null,
  from_request uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  b    text := btrim(coalesce(business, ''));
  mail text := nullif(btrim(coalesce(address, '')), '');
  cid  uuid;
begin
  if auth.uid() is null then
    raise exception 'sign in first';
  end if;
  if not public.has_permission('applications.edit') then
    raise exception 'only SecureJobVA staff can add a client';
  end if;

  perform public.client_details_are_sane(null, b, mail, coalesce(cycle, 'weekly'));

  if exists (select 1 from public.clients c where lower(btrim(c.name)) = lower(b)) then
    raise exception 'There is already a client called %. Pick it from the list instead of adding it again.', b
      using hint = 'sjva-client-exists';
  end if;

  insert into public.clients (name) values (b) returning id into cid;

  insert into public.client_private (client_id, contact_name, contact_email, billing_cycle, notes)
  values (cid, nullif(btrim(coalesce(contact, '')), ''), mail,
          coalesce(cycle, 'weekly'), nullif(btrim(coalesce(note, '')), ''));

  if from_request is not null then
    update public.seat_requests set client_id = cid where id = from_request;
  end if;

  return cid;
end;
$fn$;

revoke all on function public.create_client(text, text, text, text, text, uuid) from public, anon;
grant execute on function public.create_client(text, text, text, text, text, uuid) to authenticated;

-- ── correcting one ──────────────────────────────────────────────────────────

create or replace function public.update_client(
  client   uuid,
  business text,
  contact  text,
  address  text,
  cycle    text,
  note     text default null
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  b       text := btrim(coalesce(business, ''));
  mail    text := nullif(btrim(coalesce(address, '')), '');
  before_ text;
  live    boolean;
begin
  if auth.uid() is null then
    raise exception 'sign in first';
  end if;
  if not public.has_permission('applications.edit') then
    raise exception 'only SecureJobVA staff can change a client';
  end if;
  if not exists (select 1 from public.clients c where c.id = client) then
    raise exception 'no such client';
  end if;

  perform public.client_details_are_sane(client, b, mail, cycle);

  -- create_client's guard, held here too. Without it, renaming one client to
  -- another's name makes the very duplicate that guard exists to prevent,
  -- and 105's check then reports the same business twice. Its own name, in
  -- any case or spacing, is fine: that is a correction, not a second client.
  if exists (select 1 from public.clients c
              where lower(btrim(c.name)) = lower(b) and c.id <> client) then
    raise exception 'There is already a client called %.', b
      using hint = 'sjva-client-exists';
  end if;

  select cp.contact_email into before_ from public.client_private cp where cp.client_id = client;

  update public.clients set name = b where id = client;

  -- Upserted: a client made before 039, or by a half-finished match (F39),
  -- may have no private half at all, which is exactly the one that needs
  -- fixing here.
  insert into public.client_private (client_id, contact_name, contact_email, billing_cycle, notes)
  values (client, nullif(btrim(coalesce(contact, '')), ''), mail, cycle,
          nullif(btrim(coalesce(note, '')), ''))
  on conflict (client_id) do update
    set contact_name  = excluded.contact_name,
        contact_email = excluded.contact_email,
        billing_cycle = excluded.billing_cycle,
        notes         = excluded.notes;

  -- A new address with somebody placed: the invite they never had, or had at
  -- the wrong address, goes now. No placement yet and the invite waits for
  -- the first one, as 040 has always done.
  select exists (select 1 from public.placements p
                  where p.client_id = client and p.status in ('matched', 'trial', 'ongoing'))
    into live;

  if mail is not null and live and lower(mail) is distinct from lower(before_) then
    perform public.post_client_invite(client, 'update_client');
    return 'saved, invite sent';
  end if;

  return 'saved';
end;
$fn$;

revoke all on function public.update_client(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.update_client(uuid, text, text, text, text, text) to authenticated;

-- ── sending the invite again ───────────────────────────────────────────────

create or replace function public.resend_client_invite(client uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  cmail text;
begin
  if auth.uid() is null then
    raise exception 'sign in first';
  end if;
  if not public.has_permission('applications.edit') then
    raise exception 'only SecureJobVA staff can send a client their invite';
  end if;

  select cp.contact_email into cmail from public.client_private cp where cp.client_id = client;

  if coalesce(btrim(cmail), '') = '' then
    raise exception 'There is no contact address on this client. Add one first; saving it sends the invite.'
      using hint = 'sjva-client-no-address';
  end if;

  -- A double click is not two invites. Two minutes is long enough to catch
  -- one and short enough that a real "it did not come, send it again" is not
  -- turned away.
  if exists (select 1 from public.notify_outbox o
              where o.url = 'https://www.securejobva.com/api/invite'
                and lower(o.payload ->> 'email') = lower(cmail)
                and o.created_at > now() - interval '2 minutes') then
    raise exception 'An invite went to % less than two minutes ago. Give it a few minutes to arrive.', cmail
      using hint = 'sjva-client-invite-just-sent';
  end if;

  return public.post_client_invite(client, 'resend_client_invite');
end;
$fn$;

revoke all on function public.resend_client_invite(uuid) from public, anon;
grant execute on function public.resend_client_invite(uuid) to authenticated;

insert into public.schema_migrations (n) values (104) on conflict (n) do nothing;

-- ==========================================================================
-- Check it worked
-- ==========================================================================
--
-- Every client, with what /admin can now show and fix. 'no address' and
-- 'no private half' are the clients nobody can sign in as and no receipt or
-- invite can reach — fix them with update_client (or the Clients list in
-- /admin once it is built), which sends the invite as it saves.

select c.name as client,
       case when cp.client_id is null then 'NO PRIVATE HALF'
            when coalesce(btrim(cp.contact_email), '') = '' then 'no address'
            else 'has an address' end as contact,
       coalesce(cp.billing_cycle, '—') as billing,
       (select count(*) from public.placements p
         where p.client_id = c.id and p.status in ('matched', 'trial', 'ongoing')) as live_placements
from public.clients c
left join public.client_private cp on cp.client_id = c.id
order by (cp.client_id is not null and coalesce(btrim(cp.contact_email), '') <> ''), c.name;
