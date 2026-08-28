-- 030 — hours and timesheets
--
-- Run after: 029
-- Safe to re-run: yes
-- Also needed: nothing in the dashboard.
--
-- The fourth tile on /hub has said "Still working on it" since 026. This is
-- what goes behind it.
--
-- A week is the unit. Seven days are entered as they happen, the week is sent
-- once, and somebody approves it or sends it back. Weekly rather than
-- semi-monthly because a wrong number surfaces in days instead of a fortnight,
-- and semi-monthly pay can still be run by adding up approved weeks — the
-- other direction, splitting a fortnight back into the days it was worked, is
-- not available at all once the detail is gone.
--
-- One number a day, not a clock-in and a clock-out. A timesheet somebody keeps
-- up with beats a more honest one they abandon, and start/end times drag in
-- timezone questions the moment a shift crosses midnight — which, for
-- assistants working US hours from the Philippines, is most of them.
--
-- Nothing here says who the work was FOR. There is no client or placement
-- anywhere in this database: an assistant is a row in applications and nothing
-- links them to whoever they work for. Splitting hours across clients is a
-- placements table and its own piece of work. The free-text note on each day
-- is the only hint of what the time went on, and it is deliberately not a
-- foreign key pretending to be one.

-- ==========================================================================
-- THE WEEK
-- ==========================================================================
--
-- Shaped like leave_requests in 026: the person asks, somebody decides, and
-- the row carries both halves. The difference is the fourth state. Leave is
-- approved or declined and that is the end of it; a timesheet with a wrong
-- number in it needs to go BACK, with a reason, and be sent again. Declining a
-- week of somebody's work is not an answer to "Thursday looks like a double
-- entry".
--
--   draft      being filled in. Theirs to change.
--   submitted  sent. Locked to them, waiting on us.
--   approved   agreed. Locked to everyone; this is the number pay is run from.
--   returned   sent back with a note. Theirs again.

create table if not exists public.timesheets (
  id              uuid primary key default gen_random_uuid(),
  application_id  uuid not null
    references public.applications (id) on delete cascade,
  week_starts_on  date not null,
  status          text not null default 'draft',
  -- Why a week was sent back. Staff write it, the assistant reads it, and the
  -- trigger further down is what keeps it that way.
  note            text,
  created_at      timestamptz not null default now(),
  submitted_at    timestamptz,
  decided_at      timestamptz,
  decided_by      text,

  constraint timesheets_status_check
    check (status in ('draft', 'submitted', 'approved', 'returned')),

  -- The week is named by its Monday, and only ever by its Monday. Storing an
  -- arbitrary start date would let two overlapping "weeks" exist for the same
  -- person, and then the total for August depends on which rows you happened
  -- to add up. isodow is 1 on Monday.
  constraint timesheets_starts_monday
    check (extract(isodow from week_starts_on) = 1),

  constraint timesheets_note_sane
    check (coalesce(length(note), 0) <= 2000),

  -- One sheet per person per week. Without this, a page that creates the
  -- current week on load creates a second one the next time it is opened, and
  -- the hours are split silently across both.
  constraint timesheets_one_per_week
    unique (application_id, week_starts_on)
);

create index if not exists timesheets_app_idx
  on public.timesheets (application_id, week_starts_on desc);

-- The queue in /admin reads this one: everything waiting, oldest first.
create index if not exists timesheets_waiting_idx
  on public.timesheets (status, week_starts_on)
  where status = 'submitted';

-- ==========================================================================
-- THE DAYS
-- ==========================================================================
--
-- A row per day worked rather than seven columns on the week. Seven columns
-- would be smaller and would mean every question about a single day —  what
-- was worked on, when it was entered — has nowhere to go, and adding an
-- eighth is a migration.
--
-- hours is numeric(4,2): up to 24.00, two decimals, and exact. A float would
-- make 7.7 + 8.1 + 6.2 land a hair off 22.00 and put a rounding artefact in
-- somebody's pay.

create table if not exists public.timesheet_days (
  id            uuid primary key default gen_random_uuid(),
  timesheet_id  uuid not null
    references public.timesheets (id) on delete cascade,
  worked_on     date not null,
  hours         numeric(4,2) not null default 0,
  note          text,

  constraint timesheet_days_hours_sane
    check (hours >= 0 and hours <= 24),

  constraint timesheet_days_note_sane
    check (coalesce(length(note), 0) <= 500),

  constraint timesheet_days_one_per_day
    unique (timesheet_id, worked_on)
);

create index if not exists timesheet_days_sheet_idx
  on public.timesheet_days (timesheet_id, worked_on);

-- A day has to fall inside the week it hangs off. That cannot be a check
-- constraint — the week lives on the other table — so it is a trigger, which
-- is the only place left that both sides can be seen at once. Without it a day
-- can be filed against any week at all, and the total for a week stops meaning
-- the hours worked in it.
create or replace function public.timesheet_day_in_week()
returns trigger
language plpgsql
as $fn$
declare
  wk date;
begin
  select week_starts_on into wk from public.timesheets where id = new.timesheet_id;
  if wk is null then
    raise exception 'timesheet % does not exist', new.timesheet_id;
  end if;
  if new.worked_on < wk or new.worked_on > wk + 6 then
    raise exception 'worked_on % is outside the week beginning %', new.worked_on, wk;
  end if;
  return new;
end;
$fn$;

drop trigger if exists timesheet_days_in_week on public.timesheet_days;
create trigger timesheet_days_in_week
  before insert or update on public.timesheet_days
  for each row execute function public.timesheet_day_in_week();

-- ==========================================================================
-- WHO MAY DO WHAT
-- ==========================================================================

alter table public.timesheets     enable row level security;
alter table public.timesheet_days enable row level security;

revoke all on public.timesheets     from anon, authenticated;
revoke all on public.timesheet_days from anon, authenticated;

-- Column lists, not `grant update` on the table — the same rule 026 follows,
-- and for the same reason: the column list is the only thing standing between
-- an assistant and their own approval.
--
-- Only two columns are writable by anybody, and neither is a timestamp. An
-- assistant needs UPDATE on this table (sending a week is a status change, and
-- 026's leave rows never needed one), which means every granted column is
-- writable by them on their own rows — column grants separate roles, and staff
-- and assistants are the same role here. So the timestamps and the record of
-- who decided are not granted to anyone at all: the trigger below stamps them,
-- and a trigger writes columns the caller has no privilege on.
grant select on public.timesheets to authenticated;
grant insert (application_id, week_starts_on) on public.timesheets to authenticated;
grant update (status, note) on public.timesheets to authenticated;

grant select on public.timesheet_days to authenticated;
grant insert (timesheet_id, worked_on, hours, note) on public.timesheet_days to authenticated;
grant update (hours, note) on public.timesheet_days to authenticated;
grant delete on public.timesheet_days to authenticated;

-- ── the stamps, and the one column staff own ──────────────────────────────
--
-- `note` is the reason a week was sent back — "Thursday looks like a double
-- entry, can you check?" — and it is the only thing on the row an assistant
-- must be able to READ and must not be able to REWRITE. A column grant cannot
-- express that, because staff and assistants are both `authenticated`, and a
-- policy cannot either, because WITH CHECK never sees the old row. A trigger
-- is the only place both are visible, so this is where the rule goes.
--
-- It also stamps the three timestamp-ish columns rather than trusting a page
-- to send them. submitted_at set by the client is a number somebody can
-- choose; set here it is the moment the row actually changed. Same for who
-- approved it — taken from the verified token, not from the request body.

create or replace function public.timesheet_stamp()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  -- Not staff? The reason stays exactly as it was found.
  if not public.has_permission('applications.edit') then
    new.note := old.note;
  end if;

  if new.status is distinct from old.status then
    if new.status = 'submitted' then
      new.submitted_at := now();
      -- Sending again after a send-back clears the old decision, so the row
      -- never shows "declined by David" against a week now waiting on him.
      new.decided_at := null;
      new.decided_by := null;
    elsif new.status in ('approved', 'returned') then
      new.decided_at := now();
      new.decided_by := coalesce(auth.jwt() ->> 'email', 'somebody');
    end if;
  else
    -- Nothing about the state changed, so nothing about the record of it may.
    new.submitted_at := old.submitted_at;
    new.decided_at   := old.decided_at;
    new.decided_by   := old.decided_by;
  end if;

  return new;
end;
$fn$;

drop trigger if exists timesheets_stamp on public.timesheets;
create trigger timesheets_stamp
  before update on public.timesheets
  for each row execute function public.timesheet_stamp();

-- ── helpers ───────────────────────────────────────────────────────────────
--
-- owns_application() already exists from 026 and answers "is this application
-- mine". These two answer the questions that are specific to a timesheet, and
-- they are security definer for the same reason that one is: the policy needs
-- to see rows the caller cannot.

create or replace function public.owns_timesheet(ts uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1 from public.timesheets t
    where t.id = ts and public.owns_application(t.application_id)
  );
$fn$;

revoke all on function public.owns_timesheet(uuid) from public, anon;
grant execute on function public.owns_timesheet(uuid) to authenticated;

-- "Open" means theirs AND still in a state they may write to. Once a week is
-- sent, the number somebody is about to approve has to be the number they were
-- shown — a sheet that stays editable after sending means the total you agreed
-- to and the total sitting in the row are two different things, and nothing in
-- the row would tell you which you were looking at.
create or replace function public.timesheet_open(ts uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1 from public.timesheets t
    where t.id = ts
      and public.owns_application(t.application_id)
      and t.status in ('draft', 'returned')
  );
$fn$;

revoke all on function public.timesheet_open(uuid) from public, anon;
grant execute on function public.timesheet_open(uuid) to authenticated;

-- ── the week ──────────────────────────────────────────────────────────────

drop policy if exists "an assistant reads their own weeks" on public.timesheets;
create policy "an assistant reads their own weeks"
  on public.timesheets for select to authenticated
  using (public.owns_application(application_id) or public.has_permission('applications.view_all'));

drop policy if exists "an assistant starts their own week" on public.timesheets;
create policy "an assistant starts their own week"
  on public.timesheets for insert to authenticated
  with check (public.owns_application(application_id));

-- The whole of the locking rule, and the whole of the approval rule, in one
-- policy.
--
-- USING says which rows they may touch: their own, and only while open. WITH
-- CHECK says what they may leave behind: still their own, and in a state that
-- is either still open or sent. 'approved' is absent from that list, which is
-- what stops an assistant with a granted UPDATE(status) approving their own
-- week. The grant permits the column; the policy decides the value.
drop policy if exists "an assistant edits an open week" on public.timesheets;
create policy "an assistant edits an open week"
  on public.timesheets for update to authenticated
  using (
    public.owns_application(application_id)
    and status in ('draft', 'returned')
  )
  with check (
    public.owns_application(application_id)
    and status in ('draft', 'returned', 'submitted')
  );

drop policy if exists "staff decide a week" on public.timesheets;
create policy "staff decide a week"
  on public.timesheets for update to authenticated
  using (public.has_permission('applications.edit'))
  with check (public.has_permission('applications.edit'));

-- ── the days ──────────────────────────────────────────────────────────────
--
-- Ownership is decided by the sheet the day hangs off, which is already fenced
-- above. Nothing here matches on an email or a user_id a second time; one
-- fence with two gates is a fence, two fences are two things to keep in step.

drop policy if exists "an assistant reads their own days" on public.timesheet_days;
create policy "an assistant reads their own days"
  on public.timesheet_days for select to authenticated
  using (public.owns_timesheet(timesheet_id) or public.has_permission('applications.view_all'));

drop policy if exists "an assistant writes days on an open week" on public.timesheet_days;
create policy "an assistant writes days on an open week"
  on public.timesheet_days for insert to authenticated
  with check (public.timesheet_open(timesheet_id));

drop policy if exists "an assistant edits days on an open week" on public.timesheet_days;
create policy "an assistant edits days on an open week"
  on public.timesheet_days for update to authenticated
  using (public.timesheet_open(timesheet_id))
  with check (public.timesheet_open(timesheet_id));

-- Deleting a day is how a mistyped row is cleared, so it is theirs — but only
-- while the week is open, same as writing one.
drop policy if exists "an assistant clears days on an open week" on public.timesheet_days;
create policy "an assistant clears days on an open week"
  on public.timesheet_days for delete to authenticated
  using (public.timesheet_open(timesheet_id));

-- Staff read every day through the view_all arm of the select policy above.
-- They are given no write at all here: correcting somebody's hours behind
-- their back is exactly what "send it back with a reason" exists to avoid.

-- ==========================================================================
-- Check it worked
-- ==========================================================================
--
-- Both tables must have RLS on, anon must hold nothing on either, and the
-- assistant's update policy must not admit 'approved'.

select c.relname as table_name,
       c.relrowsecurity as rls_enabled,
       coalesce(string_agg(distinct p.polname, ' | '), 'none') as policies
from pg_class c
left join pg_policy p on p.polrelid = c.oid
where c.relname in ('timesheets', 'timesheet_days')
group by c.relname, c.relrowsecurity
order by c.relname;

select table_name, grantee,
       string_agg(distinct privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_name in ('timesheets', 'timesheet_days')
  and grantee in ('anon', 'authenticated')
group by table_name, grantee
order by table_name, grantee;

-- Should list the columns an assistant may write, and neither decided_at nor
-- decided_by should appear for INSERT.
select table_name, column_name, privilege_type
from information_schema.column_privileges
where table_name in ('timesheets', 'timesheet_days')
  and grantee = 'authenticated'
order by table_name, privilege_type, column_name;
