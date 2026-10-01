-- 102 — a seat request belongs to a client
--
-- Run after: 101, and 039 (client_private)
-- Safe to re-run: yes
-- Also needed: nothing in the dashboard. /seats should start asking for
--   client_id and treat a row as the reader's when it points at a client they
--   are the contact of, not only when the address matches (CONTRACT.md). Until
--   it does, nothing changes on that page — the column is extra, not instead.
--
-- ==========================================================================
-- TWO RECORDS JOINED BY A TYPED ADDRESS (F15)
-- ==========================================================================
--
-- A business asks for an assistant on the home page: a seat_requests row with
-- the address they typed. Weeks later staff set the business up as a client in
-- /admin and type a contact address into client_private. The two are joined by
-- nothing but those two strings being the same. When they differ — a personal
-- address on the enquiry, a work one on the client, a typo in either — the
-- business sees its enquiry under one sign-in and its assistant and its bill
-- under another.
--
-- So a seat request can now point at the client it became:
--
--   seat_requests.client_id    uuid, references clients, null until set.
--
-- Set by:
--
--   - create_client(... from_request) and place_assistant(... from_request)
--     (104, 105), when staff make the client from the request in front of them
--   - link_seat_request(request, client), below, for a request and a client
--     that already both exist
--   - the backfill below, once, for every request whose address already
--     matches a client contact exactly
--
-- And read by the seat_requests policy: the client contact of that client may
-- read the request, whatever address it was sent from. The address match
-- stays, so nothing anybody can see today disappears.
--
-- Not writable by a page. A column a signed-in client could set would let
-- them attach somebody else's enquiry to their own business; the function is
-- staff-only and the column is granted for reading alone.

do $pre$
begin
  if to_regclass('public.client_private') is null then
    raise exception 'sql/039 has not been run on this database.';
  end if;
end
$pre$;

alter table public.seat_requests
  add column if not exists client_id uuid references public.clients (id) on delete set null;

create index if not exists seat_requests_client_idx
  on public.seat_requests (client_id)
  where client_id is not null;

-- Readable by name, with the rest of 046's list re-granted in full, which is
-- 012's convention: this line is the complete set a signed-in session may ask
-- for, so the next person copies it rather than a fragment.
grant select (
  id, created_at, seats, hours, weekly, weekly_cents, blocks, timezone,
  name, company, email, phone, notes,
  status, status_changed_at, client_id
) on public.seat_requests to authenticated;

drop policy if exists "read your own seat requests" on public.seat_requests;
create policy "read your own seat requests"
  on public.seat_requests for select to authenticated
  using (
    lower(email) = lower(coalesce(auth.jwt() ->> 'email', '__nobody__'))
    or (client_id is not null and public.is_client_contact(client_id))
    or public.has_permission('applications.view_all')
  );

-- ── linking one by hand ─────────────────────────────────────────────────────

create or replace function public.link_seat_request(request uuid, client uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if auth.uid() is null then
    raise exception 'sign in first';
  end if;
  if not public.has_permission('applications.edit') then
    raise exception 'only SecureJobVA staff can link a request to a client';
  end if;
  if client is not null and not exists (select 1 from public.clients c where c.id = client) then
    raise exception 'no such client';
  end if;

  -- null unlinks, for the request linked to the wrong business.
  update public.seat_requests set client_id = client where id = request;
  if not found then
    raise exception 'no such request';
  end if;
end;
$fn$;

revoke all on function public.link_seat_request(uuid, uuid) from public, anon;
grant execute on function public.link_seat_request(uuid, uuid) to authenticated;

-- ── the backfill ────────────────────────────────────────────────────────────
--
-- Only exact address matches, which is the join the pages make today. Nothing
-- is guessed from a company name: two businesses can share one, and a wrong
-- link shows one business another's enquiry.

update public.seat_requests sr
   set client_id = cp.client_id
  from public.client_private cp
 where sr.client_id is null
   and cp.contact_email is not null
   and lower(btrim(cp.contact_email)) = lower(btrim(sr.email));

insert into public.schema_migrations (n) values (102) on conflict (n) do nothing;

-- ==========================================================================
-- Check it worked
-- ==========================================================================
--
-- One row per client, with how many requests now point at it, and the
-- requests whose company name looks like a client's but which point at
-- nothing — the ones to link by hand with link_seat_request (or from /admin,
-- once it has the button).

select c.name as client,
       count(sr.id) filter (where sr.client_id = c.id) as linked_requests,
       count(sr.id) filter (where sr.client_id is null
                              and lower(btrim(sr.company)) = lower(btrim(c.name))) as same_name_not_linked
from public.clients c
left join public.seat_requests sr
  on sr.client_id = c.id
  or (sr.client_id is null and lower(btrim(sr.company)) = lower(btrim(c.name)))
group by c.id, c.name
order by same_name_not_linked desc, c.name;
