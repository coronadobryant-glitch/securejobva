-- 026 — hired, and the two tables the hub needs
--
-- Run after: 024
-- Safe to re-run: yes
-- Also needed: nothing in the dashboard.
--
-- The ladder ended at `approved`, which means "you passed, paid training starts
-- within a week". Passing is not the same day as being placed with a client,
-- and the second one is a decision somebody makes rather than something the
-- database can work out. So `hired` becomes the fifth rung, set from the same
-- dropdown in /admin that sets the other four, and it is the door to /hub.
--
-- Nothing about pay lives here. The payout method is a preference — which way
-- somebody would rather be paid — and not an account number, a bank detail or a
-- wallet credential. Those never come near this database. A table that does not
-- hold them cannot leak them, and this one already holds names, addresses,
-- phone numbers and CVs.

-- ==========================================================================
-- THE FIFTH RUNG
-- ==========================================================================
--
-- Dropping the constraint before adding it, because a check constraint cannot
-- be altered in place and `add constraint if not exists` does not exist.

alter table public.applications
  drop constraint if exists applications_status_check;

alter table public.applications
  add constraint applications_status_check
  check (status in ('applied', 'assessment', 'interview', 'approved', 'hired', 'declined'));

-- Already granted to authenticated in 003 and put back in 020, so staff can
-- set it the moment this file runs. Nothing else to open.

-- ==========================================================================
-- HOW THEY WOULD RATHER BE PAID
-- ==========================================================================
--
-- Wise is what we send with: it reaches a Philippine bank account or a GCash,
-- Maya, GrabPay or ShopeePay wallet by mobile number, and a bank transfer
-- usually lands in under a minute. Payoneer is kept because plenty of people
-- already have one and would rather not learn another.
--
-- The column holds the choice and nothing else. Where the money actually goes
-- is agreed with a person and set up on the provider's own site.

alter table public.applications
  add column if not exists payout_method text;

alter table public.applications
  drop constraint if exists applications_payout_method_check;

alter table public.applications
  add constraint applications_payout_method_check
  check (payout_method is null or payout_method in ('wise_bank', 'wise_wallet', 'payoneer'));

-- Theirs to set, like the phone number and the CV in 006.
grant update (payout_method) on public.applications to authenticated;

-- ==========================================================================
-- ASKING FOR TIME OFF
-- ==========================================================================
--
-- Shaped like seat_requests: the person asks, somebody decides, and the row
-- carries both. An assistant may write a request and read their own; they may
-- never write the decision, which is a separate column list rather than a
-- promise made in a policy.

create table if not exists public.leave_requests (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null
    references public.applications (id) on delete cascade,
  starts_on      date not null,
  ends_on        date not null,
  reason         text,
  status         text not null default 'pending',
  created_at     timestamptz not null default now(),
  decided_at     timestamptz,
  decided_by     text,

  constraint leave_requests_status_check
    check (status in ('pending', 'approved', 'declined')),
  constraint leave_requests_sane check (
    ends_on >= starts_on
    and coalesce(length(reason), 0) <= 2000
    and ends_on < starts_on + interval '180 days'
  )
);

create index if not exists leave_requests_app_idx
  on public.leave_requests (application_id, starts_on desc);

alter table public.leave_requests enable row level security;
revoke all on public.leave_requests from anon, authenticated;

-- Column lists, not `grant insert` and `grant update` on the table. status,
-- decided_at and decided_by are ours; the four an assistant fills in are theirs.
grant select on public.leave_requests to authenticated;
grant insert (application_id, starts_on, ends_on, reason) on public.leave_requests to authenticated;
grant update (status, decided_at, decided_by) on public.leave_requests to authenticated;

-- Who owns a request is decided by the application it hangs off, which is
-- already fenced: an applicant reaches their own row by user_id or by the
-- address on their verified token, and by nothing else.
create or replace function public.owns_application(app uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1 from public.applications a
    where a.id = app
      and (a.user_id = auth.uid()
           or lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', '__nobody__')))
  );
$fn$;

revoke all on function public.owns_application(uuid) from public, anon;
grant execute on function public.owns_application(uuid) to authenticated;

drop policy if exists "an assistant reads their own leave" on public.leave_requests;
create policy "an assistant reads their own leave"
  on public.leave_requests for select to authenticated
  using (public.owns_application(application_id) or public.has_permission('applications.view_all'));

drop policy if exists "an assistant asks for their own leave" on public.leave_requests;
create policy "an assistant asks for their own leave"
  on public.leave_requests for insert to authenticated
  with check (public.owns_application(application_id));

drop policy if exists "staff decide leave" on public.leave_requests;
create policy "staff decide leave"
  on public.leave_requests for update to authenticated
  using (public.has_permission('applications.edit'))
  with check (public.has_permission('applications.edit'));

-- ==========================================================================
-- THE NOTICE BOARD
-- ==========================================================================
--
-- One way: staff write, everybody who has been hired reads. No comments and no
-- replies — the support links go to a person, and a board nobody moderates
-- becomes a place complaints go to be ignored.

create table if not exists public.notices (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  body         text not null,
  pinned       boolean not null default false,
  published_at timestamptz,
  created_at   timestamptz not null default now(),
  created_by   text,

  constraint notices_sane check (
    length(btrim(title)) between 1 and 200
    and length(btrim(body)) between 1 and 20000
  )
);

create index if not exists notices_published_idx
  on public.notices (pinned desc, published_at desc);

alter table public.notices enable row level security;
revoke all on public.notices from anon, authenticated;
grant select on public.notices to authenticated;
grant insert (title, body, pinned, published_at, created_by) on public.notices to authenticated;
grant update (title, body, pinned, published_at) on public.notices to authenticated;

-- A draft is a notice with no published_at. Only staff see those, so something
-- half-written does not appear on somebody's home page while it is being
-- thought about.
drop policy if exists "the hired read published notices" on public.notices;
create policy "the hired read published notices"
  on public.notices for select to authenticated
  using (
    (published_at is not null and published_at <= now())
    or public.has_permission('applications.view_all')
  );

drop policy if exists "staff write notices" on public.notices;
create policy "staff write notices"
  on public.notices for insert to authenticated
  with check (public.has_permission('applications.edit'));

drop policy if exists "staff edit notices" on public.notices;
create policy "staff edit notices"
  on public.notices for update to authenticated
  using (public.has_permission('applications.edit'))
  with check (public.has_permission('applications.edit'));

-- ==========================================================================
-- Check it worked
-- ==========================================================================
--
-- hired must appear in the status constraint, both tables must have RLS on,
-- and anon must hold nothing on either.

select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conname = 'applications_status_check';

select c.relname as table_name,
       c.relrowsecurity as rls_enabled,
       coalesce(string_agg(distinct p.polname, ' | '), 'none') as policies
from pg_class c
left join pg_policy p on p.polrelid = c.oid
where c.relname in ('leave_requests', 'notices')
group by c.relname, c.relrowsecurity
order by c.relname;

select table_name, grantee,
       string_agg(distinct privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_name in ('leave_requests', 'notices')
  and grantee in ('anon', 'authenticated')
group by table_name, grantee
order by table_name, grantee;
