-- 012 — where a seat request has got to
--
-- Run after: 011
-- Safe to re-run: yes
-- Also needed: nothing in the dashboard.
--
-- 009 let a business read its own seat requests. It could see what it had
-- asked for and nothing about what happened next, which is the only question
-- anybody actually opens that page to answer.
--
-- Note the shape of the grant at the bottom before adding a column here. 011
-- exists because 006 granted a column for UPDATE and not for SELECT, and a
-- column-level grant refuses the ENTIRE statement over one missing column
-- rather than returning the rest — so the page did not lose one field, it
-- lost everything, with a 42501 nobody could read. Any column added to
-- seat_requests from now on has to be added to that grant in the same file.

-- ==========================================================================
-- THE STAGES A CLIENT SEES
-- ==========================================================================
--
-- Five, and they are the ones the home page already promises: a call, a
-- shortlist, a seat running in about a week. A stage the site does not talk
-- about anywhere else would be a stage nobody could ask about.
--
-- Unlike applications there is no second, internal status here. A seat request
-- is a short conversation with somebody we are talking to directly, not a
-- queue worked over weeks, so a private pipeline alongside it would be a place
-- for notes nobody reads.

alter table public.seat_requests
  add column if not exists status text not null default 'received';

alter table public.seat_requests
  add column if not exists status_changed_at timestamptz not null default now();

alter table public.seat_requests drop constraint if exists seat_requests_status_valid;
alter table public.seat_requests add constraint seat_requests_status_valid
  check (status in ('received', 'call_booked', 'matching', 'shortlist', 'running', 'closed'));

-- --------------------------------------------------------------------------
-- What a business may read
-- --------------------------------------------------------------------------
--
-- Re-granted in full rather than added to. GRANT is additive, so listing every
-- column again is harmless, and it means this file shows the complete set a
-- signed-in client can see instead of a fragment that only makes sense next to
-- 009. The next person to add a column copies this list, not that one.

grant select (
  id, created_at, seats, hours, weekly, blocks, timezone,
  name, company, email, phone, notes,
  status, status_changed_at
) on public.seat_requests to authenticated;

-- The policy from 009 already limits this to rows carrying the caller's own
-- verified address, or to staff. Restated here so re-running this file alone
-- leaves the table in the right state.
drop policy if exists "read your own seat requests" on public.seat_requests;
create policy "read your own seat requests"
  on public.seat_requests for select to authenticated
  using (
    lower(email) = lower(coalesce(auth.jwt() ->> 'email', '__nobody__'))
    or public.has_permission('applications.view_all')
  );

-- --------------------------------------------------------------------------
-- Who may move it along
-- --------------------------------------------------------------------------
--
-- Staff only, and only these two columns. A client can read their request and
-- cannot edit any of it: the details were agreed on a call, and a quiet change
-- to the hours or the rate after the fact is worth a conversation rather than
-- a form field. If they want something different they say so and we change it.

grant update (status, status_changed_at) on public.seat_requests to authenticated;

drop policy if exists "staff move a seat request along" on public.seat_requests;
create policy "staff move a seat request along"
  on public.seat_requests for update to authenticated
  using (public.has_permission('applications.edit'))
  with check (public.has_permission('applications.edit'));

create index if not exists seat_requests_status_idx
  on public.seat_requests (status, created_at desc);
create index if not exists seat_requests_email_idx
  on public.seat_requests (lower(email));

-- ==========================================================================
-- Check it worked
-- ==========================================================================
--
-- anon must STILL hold insert and nothing else. The whole arrangement rests on
-- that: the key is in the page source, and a select here publishes every
-- company that ever asked us for a quote.

select grantee, string_agg(distinct privilege_type, ',' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_name = 'seat_requests' and grantee in ('anon', 'authenticated')
group by grantee;

-- Every column a signed-in client can read. If `status` is missing from this
-- list the portal fails whole, not partially.
select string_agg(column_name, ', ' order by column_name) as readable
from information_schema.column_privileges
where table_name = 'seat_requests'
  and grantee = 'authenticated'
  and privilege_type = 'SELECT';

select status, count(*) from public.seat_requests group by status order by status;
