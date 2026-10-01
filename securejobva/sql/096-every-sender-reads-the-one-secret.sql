-- 096 — every sender reads the one secret, and posts through the outbox
--
-- Run after: 095 (and 094 before it). Refuses to run without both.
-- Safe to re-run: yes
-- Also needed: nothing pasted in — paste it exactly as committed. Nothing in
--   the dashboard. api/notify.js and api/invite.js need no change for this
--   file alone: every body they receive is the same as before, byte for byte,
--   with one new header (x-idempotency-key) they may ignore until they use it.
--
-- ==========================================================================
-- WHAT CHANGES (F51, F52)
-- ==========================================================================
--
-- Every function and trigger in this database that posts to /api/notify or
-- /api/invite is replaced by the same thing it was, with one difference: the
-- post is no longer a net.http_post carrying its own copy of the secret, it is
-- a call to public.notify_send() (095), which
--
--   - reads the secret from private.webhook_secret (094), the one place it
--     now lives
--   - writes the post into public.notify_outbox and tries it again with
--     backoff if it does not land
--
-- The eight places, and what each one is otherwise:
--
--   notify_decision         037's, unchanged but for one field: a leave
--                           decision now carries `previous`, the answer it
--                           replaced, so a changed decision (F44) can say so
--   notify_swap             036's, unchanged
--   post_interview_note     058's, unchanged
--   notify_payment_receipt  093's, unchanged
--   invite_the_client       040's, unchanged, posting to /api/invite
--   notify-applications     028's Supabase webhook, now a plain trigger
--   notify-seat-requests    021's, the same
--   notify-contact-messages 021's, the same
--
-- The three form webhooks were supabase_functions.http_request triggers, with
-- the secret written into the trigger definition, where nothing but dropping
-- and recreating the trigger could change it. They become one small trigger
-- function, public.notify_form(), that posts the body Supabase's webhook
-- posted — { type: 'INSERT', table, schema, record, old_record: null } — so
-- api/notify reads them exactly as before. Same trigger names, same tables,
-- AFTER INSERT as before.
--
-- After this file no function body and no trigger definition in this
-- database holds the secret. verify.sql section 5 checks that.
--
-- ==========================================================================
-- RE-RUNNING THE OLDER FILES
-- ==========================================================================
--
-- 021, 028, 031, 035, 036, 037, 040, 058 and 093 each put back a sender with
-- the secret written into it and no outbox. Each now carries (or already
-- carried) a DO NOT RE-RUN block naming this file. If one of them is ever run
-- again, run this file straight afterwards.

do $pre$
begin
  if to_regprocedure('public.notify_send(jsonb, text, text)') is null then
    raise exception 'sql/095 has not been run on this database. It creates notify_send, which every sender in this file calls.';
  end if;
  if coalesce(private.webhook_secret(), '') = '' then
    raise exception 'sql/094 has not filled the webhook secret. Run 094 and read its check before this one.';
  end if;
  if to_regclass('public.client_payments') is null then
    raise exception 'sql/055 has not been run on this database.';
  end if;
end
$pre$;

-- ==========================================================================
-- 1. notify_decision — 037's, through the outbox
-- ==========================================================================

create or replace function public.notify_decision()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  who     record;
  ev      text;
  total   numeric := 0;
  daysx   text    := '';
  cname   text;
  rec     jsonb;
  payload jsonb;
begin
  if tg_table_name = 'applications' then
    who := new;
  else
    select a.name, a.email into who
    from public.applications a
    where a.id = new.application_id;
  end if;

  if who is null or coalesce(btrim(who.email), '') = '' then
    return new;
  end if;

  -- status exists on all four tables, so this one expression is safe.
  if tg_table_name = 'applications' then
    ev := case when new.status in ('assessment', 'interview', 'approved', 'hired', 'declined')
               then 'decided' else null end;
  elsif tg_table_name = 'placements' then
    ev := case when new.status in ('matched', 'trial', 'ongoing') then 'decided' else null end;
  elsif tg_table_name = 'timesheets' then
    ev := case when new.status = 'submitted' then 'arrived'
               when new.status in ('approved', 'returned') then 'decided'
               else null end;
  else
    ev := case when tg_op = 'INSERT' then 'arrived'
               when new.status in ('approved', 'declined') then 'decided'
               else null end;
  end if;

  if ev is null then
    return new;
  end if;

  -- One block per table. Each names only columns that table has, and a block
  -- that is not reached is never prepared (037).
  if tg_table_name = 'applications' then
    rec := jsonb_build_object(
      'id',     new.id,
      'status', new.status,
      'name',   new.name,
      'again',  (coalesce(new.status_changed_at, new.created_at) + interval '3 months')::date);

  elsif tg_table_name = 'placements' then
    select c.name into cname from public.clients c where c.id = new.client_id;
    rec := jsonb_build_object(
      'id',             new.id,
      'status',         new.status,
      'client',         cname,
      'started_on',     new.started_on,
      'hours_per_week', new.hours_per_week,
      'trial_weeks',    new.trial_weeks);

  elsif tg_table_name = 'timesheets' then
    select coalesce(sum(d.hours), 0),
           coalesce(string_agg(
             to_char(d.worked_on, 'Dy') || ' ' || trim(to_char(d.hours, 'FM990.99')),
             ' · ' order by d.worked_on) filter (where d.hours > 0), '')
      into total, daysx
      from public.timesheet_days d
     where d.timesheet_id = new.id;

    rec := jsonb_build_object(
      'id',             new.id,
      'status',         new.status,
      'week_starts_on', new.week_starts_on,
      'note',           new.note,
      'decided_by',     new.decided_by,
      'hours',          total,
      'days',           daysx);

  else
    -- Leave. `previous` is new (F44): the answer this one replaces, when it
    -- replaces one. /admin can now change a decision, and "your leave is not
    -- approved" means something different to somebody who was told yesterday
    -- that it was. null on a first decision and on a request arriving.
    rec := jsonb_build_object(
      'id',         new.id,
      'status',     new.status,
      'starts_on',  new.starts_on,
      'ends_on',    new.ends_on,
      'reason',     new.reason,
      'decided_by', new.decided_by,
      'previous',   case when tg_op = 'UPDATE' and old.status in ('approved', 'declined')
                         then old.status end);
  end if;

  payload := jsonb_build_object(
    'type',   'STATUS',
    'event',  ev,
    'table',  tg_table_name,
    'person', jsonb_build_object('name', who.name, 'email', who.email),
    'record', rec
  );

  -- notify_send never raises: an email that could not be queued is a warning
  -- and a row in the outbox, never a stage change undone.
  perform public.notify_send(payload, 'https://www.securejobva.com/api/notify', 'notify_decision');

  return new;
end;
$fn$;

revoke all on function public.notify_decision() from public, anon, authenticated;

-- ==========================================================================
-- 2. notify_swap — 036's, through the outbox
-- ==========================================================================

create or replace function public.notify_swap()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  info    record;
  payload jsonb;
begin
  select a.name as assistant, c.name as client, p.started_on, p.status as placement_status
    into info
    from public.placements p
    join public.applications a on a.id = p.application_id
    left join public.clients c on c.id = p.client_id
   where p.id = new.placement_id;

  payload := jsonb_build_object(
    'type',  'STATUS',
    'event', 'arrived',
    'table', 'swap_requests',
    -- No person block. Addressed to staff and to nobody else (036).
    'person', jsonb_build_object(),
    'record', jsonb_build_object(
      'id',         new.id,
      'reason',     new.reason,
      'assistant',  coalesce(info.assistant, 'an assistant'),
      'client',     coalesce(info.client, 'a client'),
      'since',      info.started_on,
      'placement',  info.placement_status)
  );

  perform public.notify_send(payload, 'https://www.securejobva.com/api/notify', 'notify_swap');

  return new;
end;
$fn$;

revoke all on function public.notify_swap() from public, anon, authenticated;

-- ==========================================================================
-- 3. post_interview_note — 058's, through the outbox
-- ==========================================================================

create or replace function public.post_interview_note(
  moment text, side text, who text, addr text, other text, slot public.interview_slots
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  payload jsonb;
begin
  payload := jsonb_build_object(
    'type',  'STATUS',
    'event', moment,
    'table', 'interview_slots',
    'person', jsonb_build_object('name', who, 'email', addr),
    'record', jsonb_build_object(
      'id',          slot.id,
      'side',        side,
      'other',       other,
      -- Sent as the instant it is. The page renders it in whoever is reading
      -- it; the email cannot know their zone, so it names Central and says so.
      'starts_at',   slot.starts_at,
      'minutes',     slot.minutes,
      'meeting_url', slot.meeting_url)
  );

  perform public.notify_send(payload, 'https://www.securejobva.com/api/notify', 'post_interview_note');
end;
$fn$;

revoke all on function public.post_interview_note(text, text, text, text, text, public.interview_slots)
  from public, anon, authenticated;

-- ==========================================================================
-- 4. notify_payment_receipt — 093's, through the outbox
-- ==========================================================================

create or replace function public.notify_payment_receipt()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  info    record;
  payload jsonb;
begin
  select c.name as business, cp.contact_name, cp.contact_email
    into info
  from public.clients c
  left join public.client_private cp on cp.client_id = c.id
  where c.id = new.client_id;

  if coalesce(btrim(info.contact_email), '') = '' then
    return new;
  end if;

  payload := jsonb_build_object(
    'type',   'STATUS',
    'event',  'recorded',
    'table',  'client_payments',
    'person', jsonb_build_object('name', info.contact_name, 'email', info.contact_email),
    'record', jsonb_build_object(
      'id',           new.id,
      'business',     info.business,
      'amount_cents', new.amount_cents,
      'paid_on',      new.paid_on,
      'method',       new.method,
      'reference',    new.reference)
  );

  -- Of every email here, the receipt is the one a retry must never double:
  -- a second receipt is how a client comes to believe they paid twice. The
  -- outbox row's key goes with every try for exactly that reason (095).
  perform public.notify_send(payload, 'https://www.securejobva.com/api/notify', 'notify_payment_receipt');

  return new;
end;
$fn$;

revoke all on function public.notify_payment_receipt() from public, anon, authenticated;

-- ==========================================================================
-- 5. invite_the_client — 040's, through the outbox, to /api/invite
-- ==========================================================================

create or replace function public.invite_the_client()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  cmail text;
  cname text;
  aname text;
begin
  select p.contact_email, c.name
    into cmail, cname
    from public.clients c
    left join public.client_private p on p.client_id = c.id
   where c.id = new.client_id;

  if cmail is null or btrim(cmail) = '' then
    return new;
  end if;

  select a.name into aname
    from public.applications a
   where a.id = new.application_id;

  perform public.notify_send(
    jsonb_build_object(
      'email',     cmail,
      'business',  cname,
      'assistant', aname,
      'starts_on', new.started_on),
    'https://www.securejobva.com/api/invite',
    'invite_the_client');

  return new;
end;
$fn$;

revoke all on function public.invite_the_client() from public, anon, authenticated;

-- ==========================================================================
-- 6. the three forms — a trigger function in place of the dashboard webhook
-- ==========================================================================
--
-- The body Supabase's http_request posted, rebuilt: the whole new row, under
-- `record`. Nothing is looked up, so nothing here can fail on a missing join;
-- api/notify has always done the rendering.

create or replace function public.notify_form()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  perform public.notify_send(
    jsonb_build_object(
      'type',       'INSERT',
      'table',      tg_table_name,
      'schema',     tg_table_schema,
      'record',     to_jsonb(new),
      'old_record', null),
    'https://www.securejobva.com/api/notify',
    'notify-' || tg_table_name);
  return new;
end;
$fn$;

revoke all on function public.notify_form() from public, anon, authenticated;

drop trigger if exists "notify-applications" on public.applications;
create trigger "notify-applications"
  after insert on public.applications
  for each row execute function public.notify_form();

drop trigger if exists "notify-seat-requests" on public.seat_requests;
create trigger "notify-seat-requests"
  after insert on public.seat_requests
  for each row execute function public.notify_form();

drop trigger if exists "notify-contact-messages" on public.contact_messages;
create trigger "notify-contact-messages"
  after insert on public.contact_messages
  for each row execute function public.notify_form();

insert into public.schema_migrations (n) values (96) on conflict (n) do nothing;

-- ==========================================================================
-- Check it worked
-- ==========================================================================
--
-- One row per sender. Every one must say 'outbox + stored secret'. Anything
-- else names the sender still posting the old way:
--
--   OWN COPY OF THE SECRET   still has a secret in its body or definition
--   http_request trigger     still a dashboard webhook
--   (missing)                the trigger or function is not there at all
--
-- The secret is never printed.

select s.sender,
       case
         when s.def is null then 'MISSING'
         when s.def like '%http\_request%' then 'http_request trigger'
         when s.def ~ 'x-webhook-secret(''\s*,\s*''[^'']|"\s*:\s*"[^"])' then 'OWN COPY OF THE SECRET'
         when s.def like '%notify\_send(%' or s.def like '%notify\_form()%' then 'outbox + stored secret'
         else 'posts nothing?'
       end as how_it_posts
from (
  select v.sender,
         coalesce(
           (select p.prosrc from pg_proc p
             where p.pronamespace = 'public'::regnamespace and p.proname = v.sender),
           (select pg_get_triggerdef(t.oid) from pg_trigger t
             where not t.tgisinternal and t.tgname = v.sender)) as def
  from (values ('notify_decision'), ('notify_swap'), ('post_interview_note'),
               ('notify_payment_receipt'), ('invite_the_client'), ('notify_form'),
               ('notify-applications'), ('notify-seat-requests'),
               ('notify-contact-messages')) as v(sender)
) s
order by 1;
