-- 097 — a pass moves on when the typing is checked
--
-- Run after: 096
-- Safe to re-run: yes
-- Also needed: nothing in the dashboard. This file emails nobody: it fixes the
--   trigger only. The applicants the bug already stranded are listed by its
--   check and moved, by hand, with sql/catch-up-passes-left-at-assessment.sql.
--
-- ==========================================================================
-- THE GATE THAT NEVER OPENED (F34, F4)
-- ==========================================================================
--
-- 063 made the verdict automatic and the move to Interview not: a pass waits
-- until somebody on staff has read her typing proof and written the checked
-- figures into typing_verified_wpm / typing_verified_accuracy. The admin
-- screen says so — check the typing and she goes through.
--
-- She does not. advance_on_assessment begins
--
--   if new.verdict <> 'passed' or old.verdict = 'passed' then
--     return new;
--
-- which only ever acts on the update where the verdict TURNS 'passed'. But the
-- verdict turns 'passed' the moment she sends the assessment — on her own
-- typed figures, which is 063's whole point — and at that moment nobody has
-- checked anything, so the second test (the typing has been verified) stops
-- it. When staff then fill in the checked figures, score_assessment re-scores,
-- the verdict is 'passed' again, old.verdict is already 'passed', and the
-- first line returns. Every passing applicant has sat at Assessment ever
-- since, with the screen telling staff she would move.
--
-- ==========================================================================
-- THE FIX
-- ==========================================================================
--
-- She moves when two things are true on the same row — the verdict is 'passed'
-- and the typing has been checked by a person — and at the update that made
-- the second of them true, whichever order they arrived in:
--
--   verdict turns 'passed' while the typing is already checked     (045/063's case)
--   the checked typing figures are written, or change, while passed (the missing case)
--
-- Still only from 'assessment' — somebody already at interview or hired is
-- never walked anywhere by a re-score — and still 'interview' and nothing
-- else: this trigger never declines anybody (tools/check.mjs holds it to that).
--
-- Moving her sets applications.status, which fires 031's notify_decision, so
-- she is emailed "interview next" exactly as if staff had moved her by hand.

do $pre$
begin
  if to_regclass('public.application_assessment') is null then
    raise exception 'sql/045 has not been run on this database.';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'application_assessment'
                   and column_name = 'typing_verified_wpm') then
    raise exception 'sql/048 has not been run on this database. It adds the checked typing figures.';
  end if;
end
$pre$;

create or replace function public.advance_on_assessment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  checked_now  boolean;
  checked_then boolean;
begin
  if new.verdict <> 'passed' then
    return new;
  end if;

  -- The gate 063 kept: an email to somebody nobody has read is the part of the
  -- old rule worth keeping. Either checked figure counts, as in 063.
  checked_now  := new.typing_verified_wpm is not null or new.typing_verified_accuracy is not null;
  checked_then := old.typing_verified_wpm is not null or old.typing_verified_accuracy is not null;

  if not checked_now then
    return new;
  end if;

  -- Something that matters to the decision has to have changed on THIS
  -- update: the verdict arrived at 'passed', or the checked figures were
  -- written or corrected. A note, a mark on the writing that leaves her
  -- passed, or any other edit to a row that has already been through here is
  -- not a reason to act again — though the 'assessment' test below would make
  -- acting again harmless anyway.
  if old.verdict = 'passed'
     and checked_then
     and new.typing_verified_wpm is not distinct from old.typing_verified_wpm
     and new.typing_verified_accuracy is not distinct from old.typing_verified_accuracy then
    return new;
  end if;

  -- Only from assessment. Somebody already at interview or hired must not be
  -- walked backwards or forwards by a re-sit.
  update public.applications
     set status = 'interview',
         status_changed_at = now()
   where id = new.application_id
     and status = 'assessment';

  return new;
end
$fn$;

revoke all on function public.advance_on_assessment() from public, anon, authenticated;

drop trigger if exists assessment_advances on public.application_assessment;
create trigger assessment_advances
  after update on public.application_assessment
  for each row execute function public.advance_on_assessment();

-- ==========================================================================
-- THE PEOPLE IT ALREADY LEFT BEHIND — not moved here
-- ==========================================================================
--
-- Everybody the bug left behind is still at Assessment: passed, typing
-- checked by a person, never moved. This file does NOT move them. Moving one
-- emails her "Your application — interview next", and some of them may have
-- been left at Assessment on purpose, months ago, by somebody who had a
-- reason. This file is pasted in order on the way to 098–111; it must not
-- email anybody as a side effect of that.
--
-- They are moved, if at all, by sql/catch-up-passes-left-at-assessment.sql —
-- not a migration, run by hand after reading its list. The check below lists
-- the same people, so the size of the job is seen here first.

insert into public.schema_migrations (n) values (97) on conflict (n) do nothing;

-- ==========================================================================
-- Check it worked
-- ==========================================================================
--
-- One list, two kinds of row:
--
--   left at Assessment   passed and checked, and still at Assessment — the
--                        people the bug stranded. Nothing moves them now
--                        except a person: read them, then run
--                        sql/catch-up-passes-left-at-assessment.sql (or move
--                        them one by one in /admin). days_since is how long
--                        since the typing was checked.
--   still waiting        passed but nobody has checked the typing yet — these
--                        move, and are emailed, the moment somebody fills in
--                        the checked figures in /admin. That is the fix working.

select 'left at Assessment — see the catch-up file' as what, a.name, a.status,
       s.typing_verified_at as when_,
       (current_date - s.typing_verified_at::date) as days_since
from public.application_assessment s
join public.applications a on a.id = s.application_id
where a.status = 'assessment'
  and s.verdict = 'passed'
  and (s.typing_verified_wpm is not null or s.typing_verified_accuracy is not null)
union all
select 'still waiting on a typing check', a.name, a.status, s.submitted_at,
       (current_date - s.submitted_at::date)
from public.application_assessment s
join public.applications a on a.id = s.application_id
where a.status = 'assessment'
  and s.verdict = 'passed'
  and s.typing_verified_wpm is null and s.typing_verified_accuracy is null
order by 1, 4;
