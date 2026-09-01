-- 050 — who marked the writing
--
-- Run after: 049
-- Safe to re-run: yes
-- Also needed: nothing in the dashboard.
--
-- ==========================================================================
-- THE LAST TWO FIELDS NOBODY WAS STAMPING
-- ==========================================================================
--
-- 046 went through this project's "who did this" fields and moved the two that
-- a browser was filling in onto the verified token, because a record of who
-- agreed something is worth exactly what it cannot be talked into saying.
-- Every one of them now comes from the session: decided_by on a timesheet,
-- confirmed_by on a start date, a note's author, scored_by on an interview
-- score, resolved_by on a swap, contacted_by on an application, and
-- typing_verified_by from 048.
--
-- Two were missed, and running 045 is what surfaced them:
--
--   written_scored_by   UPDATE, granted to authenticated
--   written_scored_at   UPDATE, granted to authenticated
--
-- They were in a grant 045 wrote, not in one 046 looked at, so the sweep went
-- straight past them.
--
-- Until 049 that cost nothing, because the written mark decided nothing and
-- almost nobody set it. 049 made the written reply part of the verdict and the
-- new panel in /admin made marking it a thing somebody does every day — so
-- these two went from unused to load-bearing without ever being filled in.
-- The panel does not send them, deliberately, which means today the answer to
-- "who decided she passed?" is null.
--
-- Same fix as everywhere else. The grant goes first: with the columns still
-- writable a trigger would be overwriting a value the page was entitled to
-- send, which works and teaches the next reader the wrong thing.

do $pre$
begin
  if to_regclass('public.application_assessment') is null then
    raise exception
      'sql/045 has not been run on this database. Run 045, 048 and 049 first, then this one.';
  end if;
end
$pre$;

revoke update (written_scored_by, written_scored_at)
  on public.application_assessment from authenticated;

-- ==========================================================================
-- ONE STAMP FOR BOTH HUMAN JUDGEMENTS
-- ==========================================================================
--
-- 048 added a trigger for the typing check. The written mark is the same act
-- by the same person at the same moment — the two boxes sit next to each other
-- on the panel and are saved together — so this is one function rather than a
-- second one that has to be kept in step with the first.
--
-- The old trigger is dropped by name at the bottom. Its function is left
-- defined rather than dropped: nothing calls it once the trigger is gone, and
-- dropping a function that a later migration might still reference is how a
-- paste fails halfway through on somebody else's database.
--
-- The name still sorts before 'assessment_scored', which matters: Postgres
-- fires same-timing triggers in name order, and the scorer has to see the
-- stamps it is about to score from.

create or replace function public.stamp_assessment_marks()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  -- ── who read the typing proof ──
  if new.typing_verified_wpm is distinct from old.typing_verified_wpm
  or new.typing_verified_accuracy is distinct from old.typing_verified_accuracy then
    if new.typing_verified_wpm is null and new.typing_verified_accuracy is null then
      -- Cleared, which is how a wrong reading is taken back.
      new.typing_verified_by := null;
      new.typing_verified_at := null;
    else
      new.typing_verified_by := coalesce(auth.jwt() ->> 'email', 'somebody');
      new.typing_verified_at := now();
    end if;
  else
    new.typing_verified_by := old.typing_verified_by;
    new.typing_verified_at := old.typing_verified_at;
  end if;

  -- ── who marked the writing ──
  if new.written_score is distinct from old.written_score then
    if new.written_score is null then
      new.written_scored_by := null;
      new.written_scored_at := null;
    else
      new.written_scored_by := coalesce(auth.jwt() ->> 'email', 'somebody');
      new.written_scored_at := now();
    end if;
  else
    new.written_scored_by := old.written_scored_by;
    new.written_scored_at := old.written_scored_at;
  end if;

  return new;
end;
$fn$;

revoke all on function public.stamp_assessment_marks() from public, anon, authenticated;

drop trigger if exists a_typing_check_stamp on public.application_assessment;
drop trigger if exists a_assessment_marks_stamp on public.application_assessment;
create trigger a_assessment_marks_stamp
  before update on public.application_assessment
  for each row execute function public.stamp_assessment_marks();

-- ==========================================================================
-- AND WHO DECIDED SOMEBODY'S LEAVE
-- ==========================================================================
--
-- Found by the check this file's rule is now written down as, rather than by
-- reading. 026 created leave_requests and timesheets in the same week and gave
-- them the same shape — the person asks, somebody decides, the row carries
-- both halves. 030 then stamped the timesheet's decided_by from the token and
-- nobody went back for the leave one, so:
--
--   a timesheet says who approved it, taken from the session
--   a leave request says whatever /admin typed into it
--
-- Same field, same table family, same week, two different answers. The page
-- sends `decided_by: ME` today, which is true right up until it is not.
--
-- Approving somebody's leave is a smaller thing than approving their hours,
-- and the fix is the same size either way.

revoke update (decided_at, decided_by) on public.leave_requests from authenticated;

create or replace function public.stamp_leave_decision()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if new.status is distinct from old.status and new.status <> 'pending' then
    new.decided_at := now();
    new.decided_by := coalesce(auth.jwt() ->> 'email', 'somebody');
  else
    new.decided_at := old.decided_at;
    new.decided_by := old.decided_by;
  end if;
  return new;
end;
$fn$;

revoke all on function public.stamp_leave_decision() from public, anon, authenticated;

drop trigger if exists leave_requests_stamp on public.leave_requests;
create trigger leave_requests_stamp
  before update on public.leave_requests
  for each row execute function public.stamp_leave_decision();

-- ==========================================================================
-- Check it worked
-- ==========================================================================

-- The four columns a person's judgement lands in. written_score and the two
-- typing figures may be written; the four _by and _at stamps may not.
-- Anything ending in _by or _at appearing here is a field a browser can choose.
select column_name, privilege_type
from information_schema.column_privileges
where table_name = 'application_assessment'
  and grantee = 'authenticated'
  and privilege_type = 'UPDATE'
  and (column_name like '%_by' or column_name like '%_at')
order by column_name;

-- Two triggers before the scorer, and the stamp must sort first.
select tgname
from pg_trigger
where tgrelid = 'public.application_assessment'::regclass and not tgisinternal
order by tgname;

-- Anything already marked before this file ran has no author and never will —
-- the moment was not recorded. Listed so you know rather than wonder.
select a.name, s.written_score, s.written_scored_by
from public.application_assessment s
join public.applications a on a.id = s.application_id
where s.written_score is not null and s.written_scored_by is null;

insert into public.schema_migrations (n) values (50) on conflict (n) do nothing;
