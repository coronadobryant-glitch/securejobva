-- 034 — the trial is on us
--
-- Run after: 033
-- Safe to re-run: yes
-- Also needed: nothing in the dashboard.
--
-- An assistant is paid for the trial. We pay it, and we carry it — it is what
-- we spend to win the placement, not something the client is charged for. So a
-- week worked during a trial is a real week in every respect except one: it
-- does not reach the client's statement.
--
-- Nothing about the assistant's side changes, and that is deliberate. She
-- works, the week is sent, the client agrees the hours, she is paid. For her
-- a trial week and any other week are the same week, because they are.
--
-- ==========================================================================
-- WHY THIS IS STAMPED AND NOT WORKED OUT
-- ==========================================================================
--
-- Whether a week fell inside the trial can be calculated: compare its Monday
-- against started_on plus trial_weeks. It would need no column and no trigger.
--
-- And it would be wrong. trial_weeks is editable — a two-week trial corrected
-- to three, months later, would quietly move a boundary that bills had already
-- been built on, and a statement somebody has already paid against would come
-- out different the next time it was opened. Money that changes retroactively
-- because a length was tidied up is the kind of bug nobody finds until a
-- client disputes an invoice.
--
-- So it is written once, when the week is created, and never again. The same
-- reasoning as placement_id in 033.

alter table public.timesheets
  add column if not exists trial_week boolean not null default false;

-- Not granted to anybody, for the same reason placement_id is not: whether a
-- week is chargeable is not a claim a browser gets to make.

-- ==========================================================================
-- THE TRIGGER, REPLACED
-- ==========================================================================
--
-- 033 set placement_id here. It now answers both questions in one lookup
-- rather than reading the placement twice.

create or replace function public.timesheet_placement()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  p record;
begin
  select pl.id, pl.started_on, pl.trial_weeks into p
  from public.placements pl
  where pl.application_id = new.application_id
    and pl.status in ('trial', 'ongoing', 'ended')
    and (pl.started_on is null or pl.started_on <= new.week_starts_on + 6)
    and (pl.ended_on is null or pl.ended_on >= new.week_starts_on)
  order by pl.started_on desc nulls last
  limit 1;

  -- No match is not an error. Somebody hired and not yet placed still records
  -- their hours; the week simply belongs to nobody, and cannot be billed until
  -- it does.
  if p.id is null then
    return new;
  end if;

  new.placement_id := p.id;

  -- Inside the trial if the week begins on or before its last day. A trial of
  -- two weeks beginning Monday the 7th runs to Sunday the 20th, so the week
  -- beginning the 14th is the second and last trial week and the 21st is the
  -- first chargeable one.
  new.trial_week := (
    p.trial_weeks is not null
    and p.started_on is not null
    and new.week_starts_on <= p.started_on + (p.trial_weeks * 7) - 1
  );

  return new;
end;
$fn$;

drop trigger if exists timesheets_placement on public.timesheets;
create trigger timesheets_placement
  before insert on public.timesheets
  for each row execute function public.timesheet_placement();

-- Weeks that already exist were written before this column did. Marked with
-- the same arithmetic, once, so what is stamped now is what would have been
-- stamped then.
update public.timesheets t
   set trial_week = true
  from public.placements p
 where t.placement_id = p.id
   and t.trial_week = false
   and p.trial_weeks is not null
   and p.started_on is not null
   and t.week_starts_on <= p.started_on + (p.trial_weeks * 7) - 1;

-- ==========================================================================
-- Check it worked
-- ==========================================================================

select grantee, privilege_type
from information_schema.column_privileges
where table_name = 'timesheets' and column_name = 'trial_week'
  and grantee in ('anon', 'authenticated');

select count(*) filter (where trial_week)                            as on_us,
       count(*) filter (where not trial_week and placement_id is not null) as chargeable,
       count(*) filter (where placement_id is null)                  as unattached
from public.timesheets;
