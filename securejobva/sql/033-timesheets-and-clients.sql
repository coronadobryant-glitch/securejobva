-- 033 — a week of hours belongs to a placement, and the client approves it
--
-- Run after: 032
-- Safe to re-run: yes
-- Also needed: nothing in the dashboard.
--
-- Two things that only make sense together.
--
-- FIRST: a week of hours has hung off a person and nothing else since 030, so
-- there has been no way to say who owes anything for it. Hours are the
-- invoice. A week now carries the placement it was worked under, which means a
-- week worked in July still points at the client it was worked for long after
-- that placement has ended and the assistant has moved on. Reading it off the
-- live placement at the time of asking would answer a different question every
-- month.
--
-- SECOND: the client approves. That was always how it works — the person whose
-- work it is checks the hours — and until 032 there was nobody to be. Staff
-- keep the same buttons, because a client who goes quiet for a week must not
-- be able to stall somebody's pay, and the row records which of them decided.

-- ==========================================================================
-- WHICH PLACEMENT
-- ==========================================================================

alter table public.timesheets
  add column if not exists placement_id uuid references public.placements (id);

create index if not exists timesheets_placement_idx
  on public.timesheets (placement_id, week_starts_on desc);

-- Readable, and writable by nobody. 030 grants SELECT on this table rather
-- than column by column, so this column is readable by anyone who can already
-- see the row — deliberately, because both sides need to know which placement
-- a week belongs to. It appears in neither write list, so the page never sends
-- it and could not if it tried: a trigger writes columns the caller has no
-- privilege on, the same reason 030 stamps submitted_at and decided_by rather
-- than trusting a request body. Who a week is billed to is not a claim a
-- browser gets to make.
--
-- 'matched' is excluded because nobody has started: a week of hours against a
-- placement that has not begun is a week worked for somebody they have only
-- been introduced to.
create or replace function public.timesheet_placement()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  select p.id into new.placement_id
  from public.placements p
  where p.application_id = new.application_id
    and p.status in ('trial', 'ongoing', 'ended')
    and (p.started_on is null or p.started_on <= new.week_starts_on + 6)
    and (p.ended_on is null or p.ended_on >= new.week_starts_on)
  order by p.started_on desc nulls last
  limit 1;

  -- No match is not an error. Somebody hired and not yet placed still records
  -- their hours; the week simply belongs to nobody, and cannot be billed until
  -- it does.
  return new;
end;
$fn$;

drop trigger if exists timesheets_placement on public.timesheets;
create trigger timesheets_placement
  before insert on public.timesheets
  for each row execute function public.timesheet_placement();

-- Weeks that already exist were written before any placement did, so they
-- carry nothing. Fill in the ones that can be worked out; the rest stay null
-- and are visible as such rather than being guessed at.
update public.timesheets t
   set placement_id = p.id
  from public.placements p
 where t.placement_id is null
   and p.application_id = t.application_id
   and p.status in ('trial', 'ongoing', 'ended')
   and (p.started_on is null or p.started_on <= t.week_starts_on + 6)
   and (p.ended_on is null or p.ended_on >= t.week_starts_on);

-- ==========================================================================
-- THE CLIENT READS, AND DECIDES
-- ==========================================================================
--
-- Replacing the policies from 030 rather than adding beside them, because two
-- permissive policies on the same command are OR'd and the second would widen
-- the first in ways nobody would notice.

drop policy if exists "an assistant reads their own weeks" on public.timesheets;
create policy "an assistant reads their own weeks"
  on public.timesheets for select to authenticated
  using (
    public.owns_application(application_id)
    or (placement_id is not null and public.is_placement_client(placement_id))
    or public.has_permission('applications.view_all')
  );

-- The days hang off the week, so the question has to be asked one step up.
-- Defined before the policy that calls it: a policy naming a function that
-- does not exist yet fails the whole paste.
create or replace function public.timesheet_is_clients(ts uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1 from public.timesheets t
    where t.id = ts
      and t.placement_id is not null
      and public.is_placement_client(t.placement_id)
  );
$fn$;

revoke all on function public.timesheet_is_clients(uuid) from public, anon;
grant execute on function public.timesheet_is_clients(uuid) to authenticated;

drop policy if exists "an assistant reads their own days" on public.timesheet_days;
create policy "an assistant reads their own days"
  on public.timesheet_days for select to authenticated
  using (
    public.owns_timesheet(timesheet_id)
    or public.timesheet_is_clients(timesheet_id)
    or public.has_permission('applications.view_all')
  );

-- A client may take a submitted week and leave it approved or returned. They
-- may not touch a draft — that week is not theirs to see the inside of yet —
-- and they may not reopen one they already approved, because the number an
-- invoice was built from should not move afterwards.
drop policy if exists "a client decides a week" on public.timesheets;
create policy "a client decides a week"
  on public.timesheets for update to authenticated
  using (
    placement_id is not null
    and public.is_placement_client(placement_id)
    and status = 'submitted'
  )
  with check (
    placement_id is not null
    and public.is_placement_client(placement_id)
    and status in ('approved', 'returned')
  );

-- Staff keep theirs from 030 untouched: "staff decide a week" still stands, so
-- a quiet client never stalls somebody's pay. The trigger from 030 stamps
-- decided_by from the verified token either way, so the row always says which
-- of them it was.

-- ==========================================================================
-- Check it worked
-- ==========================================================================

select column_name, data_type
from information_schema.columns
where table_name = 'timesheets' and column_name = 'placement_id';

-- placement_id must appear in NO grant. If it does, a page can choose who a
-- week is billed to.
select grantee, privilege_type
from information_schema.column_privileges
where table_name = 'timesheets' and column_name = 'placement_id'
  and grantee in ('anon', 'authenticated');

select polname, pg_get_expr(polqual, polrelid) as using_clause
from pg_policy
where polrelid = 'public.timesheets'::regclass
order by polname;

-- How many weeks are billable, and how many are not yet.
select count(*) filter (where placement_id is not null) as billable,
       count(*) filter (where placement_id is null)     as unattached
from public.timesheets;
