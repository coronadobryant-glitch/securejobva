-- 085 — a trial is counted in days
--
-- Run after: 084
-- Safe to re-run: yes
-- Also needed: nothing in the dashboard. /seats and /pay change to read the
-- view below — see the contract — and until they do they bill exactly as
-- they did before this file.
--
-- ==========================================================================
-- THE TUESDAY START
-- ==========================================================================
--
-- 034 marks a week free when it begins on or before the trial's last day:
--
--   week_starts_on <= started_on + trial_weeks * 7 - 1
--
-- and its own comment shows the arithmetic with a start on "Monday the 7th",
-- where it is exactly right. Nothing makes started_on a Monday. /seats offers
-- a plain date picker and 042 checks only that the date is within a window.
-- Start on Tuesday 8 September with one trial week and the last free day is
-- Monday the 14th; the week of the 7th is free (six days), and so is the week
-- of the 14th, because it BEGINS on the 14th — so seven more days go free.
-- Thirteen days for a seven-day trial. A start on the Nth day of the week
-- (Monday = 1) gives away 8 - N extra days, on every placement that does not
-- start on a Monday, and
-- SecureJobVA pays the assistant for days it can never bill. 043's adoption
-- repeats the same test.
--
-- A week is the wrong unit to answer this in. "Is this week free" has no
-- right yes-or-no for a week that is partly inside the trial.
--
-- ==========================================================================
-- THE SAME WEEK, BILLED TO THE WRONG PLACEMENT'S DATES
-- ==========================================================================
--
-- N93 is the same mistake from the other end. A week is attached to one
-- placement (034's timesheet_placement picks the latest that overlaps), and
-- then every hour on it is billed to that placement — including days before
-- its start and after its end. An assistant whose placement with A ends on
-- Wednesday and whose placement with B starts on Thursday records Monday to
-- Friday in one sheet; all five days go to B. If B is in trial, A's three days
-- are never billed to anybody; if not, B pays for three days worked for A.
--
-- ==========================================================================
-- THE ANSWER, PER DAY
-- ==========================================================================
--
-- Each day on a week is one of three things, decided by its own date against
-- the placement the week belongs to:
--
--   outside    before started_on or after ended_on. Not this client's day.
--              Not billed to them. (086 stops new ones being written; this
--              is what keeps the ones already there off the bill.)
--   free       inside the placement, and on or before
--              started_on + trial_weeks * 7 - 1. Exactly trial_weeks * 7
--              calendar days from the first day, whatever weekday that is.
--   billable   inside the placement and after the trial.
--
-- The view below adds those up per week, with the week's rate and the amount
-- in integer cents (rounded once per week, so a line on the bill and the
-- total cannot disagree by a cent the way N43 found). /seats and /pay read
-- this instead of multiplying hours by the rate themselves.
--
-- ==========================================================================
-- MONEY ALREADY BILLED DOES NOT MOVE
-- ==========================================================================
--
-- 034's own rule, and the reason this cannot simply recount history: a week
-- invoiced and paid under the old arithmetic must go on saying what it said.
-- Recounting would make an old mid-week trial suddenly owe a day, or an old
-- straddled week suddenly owe less, on a statement a client already settled.
--
-- So every week that exists when this file runs is marked billed_by_day =
-- false and is counted exactly as before: trial_week decides the whole week,
-- and every day on it is the placement's. Every week created after it runs
-- defaults to billed_by_day = true and is counted by the day.
--
-- trial_week itself is left alone, still stamped by 034/043 on every new week.
-- It now means "this week holds at least one free day", which is what the
-- pages show a trial badge for. It is no longer what decides the money for a
-- new week; the view is.

do $pre$
begin
  if to_regclass('public.placement_billing') is null or to_regclass('public.timesheets') is null then
    raise exception
      'sql/030 and sql/032 have to be run first. This reads timesheets, placements and placement_billing.';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'timesheets' and column_name = 'trial_week'
  ) then
    raise exception
      'sql/034 has not been run on this database. It adds trial_week, which old weeks are still counted by.';
  end if;
end
$pre$;

-- ==========================================================================
-- 1. WHICH RULE A WEEK IS COUNTED BY
-- ==========================================================================
--
-- Added with no default so the backfill below sees every existing row as null
-- and marks it false; the default is set afterwards, so only rows created from
-- here on are true. On a re-run the column exists, nothing is null, and the
-- two alters are no-ops.
--
-- Granted to nobody for writing. 030 grants SELECT on the table as a whole,
-- so it is readable wherever the week is; 030's INSERT names two columns and
-- this is not one of them, so a page cannot choose how its own week is billed.

alter table public.timesheets add column if not exists billed_by_day boolean;

update public.timesheets set billed_by_day = false where billed_by_day is null;

alter table public.timesheets alter column billed_by_day set default true;
alter table public.timesheets alter column billed_by_day set not null;

-- ==========================================================================
-- 2. WHAT A WEEK COSTS
-- ==========================================================================
--
-- security_invoker, so every table underneath is read under the caller's own
-- policies: a client sees only weeks on their placements and their own rate;
-- an assistant sees her own weeks and, because placement_billing is not hers
-- to read, a null rate and a zero amount; staff see everything. The same
-- arrangement as 057's interview_state.

drop view if exists public.timesheet_charges;
create view public.timesheet_charges
with (security_invoker = true) as
select
  t.id                                                            as timesheet_id,
  t.application_id,
  t.placement_id,
  p.client_id,
  t.week_starts_on,
  t.status,
  t.trial_week,
  t.billed_by_day,
  b.rate,
  coalesce(sum(d.hours), 0)                                       as hours_worked,
  coalesce(sum(d.hours) filter (where k.kind = 'free'), 0)        as hours_free,
  coalesce(sum(d.hours) filter (where k.kind = 'billable'), 0)    as hours_billable,
  coalesce(sum(d.hours) filter (where k.kind = 'outside'), 0)     as hours_outside,
  round(coalesce(sum(d.hours) filter (where k.kind = 'billable'), 0)
        * coalesce(b.rate, 0) * 100)::bigint                      as amount_cents
from public.timesheets t
left join public.placements p        on p.id = t.placement_id
left join public.placement_billing b on b.placement_id = t.placement_id
left join public.timesheet_days d    on d.timesheet_id = t.id
left join lateral (
  select case
    when d.id is null then null
    -- A week nobody has been placed on yet. Nobody is billed for it.
    when p.id is null then 'outside'
    -- Weeks from before this file: exactly the old rule, whole week.
    when not t.billed_by_day then
      case when t.trial_week then 'free' else 'billable' end
    when (p.started_on is not null and d.worked_on < p.started_on)
      or (p.ended_on   is not null and d.worked_on > p.ended_on) then 'outside'
    when p.trial_weeks is not null and p.started_on is not null
      and d.worked_on <= p.started_on + (p.trial_weeks * 7) - 1 then 'free'
    else 'billable'
  end as kind
) k on true
group by t.id, t.application_id, t.placement_id, p.client_id, t.week_starts_on,
         t.status, t.trial_week, t.billed_by_day, b.rate;

revoke all on public.timesheet_charges from anon, authenticated;
grant select on public.timesheet_charges to authenticated;

-- ==========================================================================
-- 3. WHAT A CLIENT OWES, ADDED UP WHERE ALL OF IT IS
-- ==========================================================================
--
-- N34. /seats and /pay work the balance out in the browser from the newest
-- 260 timesheet rows — rows, across every assistant and every status, not 260
-- weeks — and then subtract EVERY payment ever recorded. Past the 260th row
-- each paid old week drops out of "approved" while its payment is still taken
-- off, and "Due now" shrinks below what is really owed, or turns into a
-- credit. The fix is to stop adding it up somewhere that only has part of it.
--
-- Approved weeks only (a submitted week is not owed until it is agreed), in
-- cents, from the view above so the trial and the placement dates are
-- counted once and the same way everywhere. Less every payment. SECURITY
-- INVOKER and a plain SQL function, so it sees what the caller's policies let
-- it see and nothing more: a client gets their own row, staff get every
-- client, anybody else gets nothing.

create or replace function public.client_balances()
returns table (client_id uuid, approved_cents bigint, paid_cents bigint, balance_cents bigint)
language sql
stable
security invoker
set search_path = public, pg_temp
as $fn$
  select c.id,
         coalesce(a.cents, 0)::bigint,
         coalesce(pd.cents, 0)::bigint,
         (coalesce(a.cents, 0) - coalesce(pd.cents, 0))::bigint
  from public.clients c
  left join lateral (
    select sum(tc.amount_cents) as cents
    from public.timesheet_charges tc
    where tc.client_id = c.id and tc.status = 'approved'
  ) a on true
  left join lateral (
    select sum(cp.amount_cents) as cents
    from public.client_payments cp
    where cp.client_id = c.id
  ) pd on true
  where public.is_client_contact(c.id)
     or public.has_permission('applications.view_all');
$fn$;

revoke all on function public.client_balances() from public, anon;
grant execute on function public.client_balances() to authenticated;

-- ==========================================================================
-- Check it worked
-- ==========================================================================

-- Every week that existed is on the old rule, and new ones will not be.
select billed_by_day, count(*)
from public.timesheets
group by billed_by_day;

select column_default, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'timesheets' and column_name = 'billed_by_day';

-- Nobody may write it. Empty is the pass.
select grantee, privilege_type
from information_schema.column_privileges
where table_name = 'timesheets' and column_name = 'billed_by_day'
  and grantee in ('anon', 'authenticated')
  and privilege_type in ('INSERT', 'UPDATE');

-- What the old arithmetic gave away, for the record. Placements that did not
-- start on a Monday and have a trial: each one had 8 - isodow(start) extra
-- free days under 034's rule (six for a Tuesday start, one for a Sunday). The weeks are left as billed; this is so the
-- number is known.
select p.id as placement_id, c.name as client, p.started_on,
       extract(isodow from p.started_on)::int as start_weekday,
       p.trial_weeks,
       8 - extract(isodow from p.started_on)::int as extra_free_days_under_034
from public.placements p
join public.clients c on c.id = p.client_id
where p.trial_weeks is not null
  and p.started_on is not null
  and extract(isodow from p.started_on) <> 1
order by p.started_on desc;

-- Hours on existing weeks that fall outside their placement's dates. On old
-- weeks these were billed to the placement anyway (and stay that way); this
-- is the list to look at for N93's straddled weeks.
select t.id as timesheet_id, t.week_starts_on, p.started_on, p.ended_on,
       d.worked_on, d.hours
from public.timesheets t
join public.placements p on p.id = t.placement_id
join public.timesheet_days d on d.timesheet_id = t.id
where d.hours > 0
  and ((p.started_on is not null and d.worked_on < p.started_on)
    or (p.ended_on   is not null and d.worked_on > p.ended_on))
order by t.week_starts_on desc;

-- The balance, both ways, side by side. On the old rule the view agrees with
-- 055's hand query to the cent; any difference here is a week the view
-- counts differently and is worth reading before the pages switch over.
select c.name, b.approved_cents, b.paid_cents, b.balance_cents
from public.client_balances() b
join public.clients c on c.id = b.client_id
order by c.name;

insert into public.schema_migrations (n) values (85) on conflict (n) do nothing;
