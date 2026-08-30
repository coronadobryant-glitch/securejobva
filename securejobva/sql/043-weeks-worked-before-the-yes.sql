-- 043 — the weeks worked before the client said yes
--
-- Run after: 042
-- Safe to re-run: yes
-- Also needed: nothing in the dashboard.
--
-- ==========================================================================
-- A HOLE 042 MADE WIDER
-- ==========================================================================
--
-- 034 ties a week to a placement when the week is created, and only then:
--
--   where pl.application_id = new.application_id
--     and pl.status in ('trial', 'ongoing', 'ended')
--
-- `matched` is not in that list, and the trigger is BEFORE INSERT only. So a
-- week recorded while a placement is still matched keeps placement_id null and
-- trial_week false, and keeps them for good. Nothing ever looks again.
--
-- That was defensible when matched lasted seconds. Staff matched somebody and
-- moved them to trial in the same sitting, so the window barely existed.
--
-- 042 replaced that with a window measured in days. The placement now waits at
-- matched until the client confirms a start date, and in the meantime the
-- assistant has already been emailed "we have found you a client", her portal
-- is open, and nothing stops her recording hours. Every hour she puts in
-- during that wait belongs to nobody: the client never sees it, it can never
-- be billed, and no screen anywhere says so. She sends the week, it is
-- approved, she is paid, and it simply never reaches a statement.
--
-- ==========================================================================
-- ADOPTION, NOT RESTAMPING
-- ==========================================================================
--
-- 034 is emphatic that a week is stamped once and never again, because a trial
-- length corrected months later must not move money that has already been
-- billed. This does not break that rule. It only touches weeks that were never
-- stamped at all — placement_id is null — and gives them the answer they would
-- have been given had the placement been live when they were made. A week that
-- already belongs to a placement is not looked at.
--
-- On the placement rather than on placement_starts, so it covers both ways a
-- placement goes live: the client confirming a date, which updates the row,
-- and staff moving the dropdown by hand in /admin.

create or replace function public.adopt_orphan_weeks()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  taken integer;
begin
  if new.started_on is null then
    return new;
  end if;

  update public.timesheets t
     set placement_id = new.id,
         -- The same arithmetic 034 uses, deliberately repeated rather than
         -- shared: a week is inside the trial if it begins on or before the
         -- trial's last day.
         trial_week = (
           new.trial_weeks is not null
           and t.week_starts_on <= new.started_on + (new.trial_weeks * 7) - 1
         )
   where t.application_id = new.application_id
     and t.placement_id is null
     -- Only weeks the placement actually covers. A week worked before the
     -- agreed start belongs to nobody and stays that way, which is correct:
     -- the client did not ask for those days and is not billed for them.
     and new.started_on <= t.week_starts_on + 6
     and (new.ended_on is null or new.ended_on >= t.week_starts_on);

  get diagnostics taken = row_count;
  if taken > 0 then
    raise notice 'adopt_orphan_weeks: % week(s) now belong to placement %', taken, new.id;
  end if;

  return new;
end;
$fn$;

revoke all on function public.adopt_orphan_weeks() from public, anon, authenticated;

-- Only on the move out of matched. Firing on every update would re-run this on
-- every rate change and every status nudge for no reason, and the WHEN clause
-- says the intent plainly enough to survive being read in a year.
--
-- No emails come of this. notify-timesheet-status fires only on a status
-- change and this changes none; timesheets_stamp fires on any update but puts
-- submitted_at, decided_at and decided_by straight back when the status is
-- untouched, so nothing about who decided what is rewritten.
drop trigger if exists placement_adopts_its_weeks on public.placements;
create trigger placement_adopts_its_weeks
  after update of status on public.placements
  for each row
  when (old.status = 'matched' and new.status in ('trial', 'ongoing'))
  execute function public.adopt_orphan_weeks();

-- ==========================================================================
-- THE ONES ALREADY STRANDED
-- ==========================================================================
--
-- Anything orphaned before this file ran, for a placement that is live now.
-- Same arithmetic, same refusal to touch a week that already has a placement.

update public.timesheets t
   set placement_id = pl.id,
       trial_week = (
         pl.trial_weeks is not null
         and t.week_starts_on <= pl.started_on + (pl.trial_weeks * 7) - 1
       )
  from public.placements pl
 where t.placement_id is null
   and pl.application_id = t.application_id
   and pl.status in ('trial', 'ongoing', 'ended')
   and pl.started_on is not null
   and pl.started_on <= t.week_starts_on + 6
   and (pl.ended_on is null or pl.ended_on >= t.week_starts_on);

-- ==========================================================================
-- Check it worked
-- ==========================================================================
--
-- Any week still without a placement, and whether that is right. A week before
-- its placement's start is correctly homeless; a week on or after it is not.

select a.name,
       t.week_starts_on,
       t.status,
       coalesce(c.name, '— no placement —') as billed_to,
       case
         when t.placement_id is not null then 'placed'
         when not exists (
           select 1 from public.placements pl
           where pl.application_id = t.application_id
             and pl.status in ('trial', 'ongoing', 'ended')
         ) then 'nobody placed — correct'
         else 'STRANDED — worked inside a placement and billed to nobody'
       end as verdict
from public.timesheets t
join public.applications a on a.id = t.application_id
left join public.placements pl on pl.id = t.placement_id
left join public.clients c on c.id = pl.client_id
order by a.name, t.week_starts_on desc;

-- The trigger is on, and only on the way out of matched.

select tgname, pg_get_triggerdef(oid) as definition
from pg_trigger
where tgrelid = 'public.placements'::regclass
  and not tgisinternal
order by tgname;
