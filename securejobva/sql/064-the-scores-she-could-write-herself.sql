-- 064 — the three figures she could write about herself

-- Run after: 050, 063
-- Safe to re-run: yes
-- Also needed: nothing in the dashboard.
--
-- ==========================================================================
-- WHAT WAS WRONG
-- ==========================================================================
--
-- 048 says, in the comment directly above its grants:
--
--   "The whole point of this file is in these two grants. She may write what
--    she scored and where the proof is. She may not write what somebody here
--    read, and staff may not write what she claimed — so the row keeps both
--    accounts and neither party can quietly become the other."
--
-- The two grants underneath that sentence both go to `authenticated`. A
-- signed-in applicant is `authenticated`. So does staff. The grant separates
-- nobody from anybody.
--
-- Confirmed against the live database with the query 049 already ships for
-- this exact purpose. It returns thirteen columns, and three of them are
-- figures the applicant is not supposed to be able to write:
--
--   typing_verified_wpm       what somebody here read off her proof
--   typing_verified_accuracy  the same
--   written_score             what somebody here thought her writing was worth
--
-- 049's comment on that query says "None of score_english, score_detail,
-- score_sales, score_typing or score_scenarios may appear here." That rule is
-- right and it is not the whole rule — it names the five columns the scorer
-- computes and none of the three a person fills in. So the query was run, the
-- three were in the output, and the comment said the output was fine.
--
-- ==========================================================================
-- WHY IT MATTERS, CONCRETELY
-- ==========================================================================
--
-- RLS fences rows, not columns. 045's applicant policy is
--
--   using (owns_application(application_id) and submitted_at is null)
--
-- which says nothing about which columns, so while her row is unsent she can
-- write any column she has been granted. Then she sends it, and the scorer
-- runs for the first time on a row she has finished filling in herself.
--
-- Both halves of the old gate were columns on that list. She could set
-- typing_verified_wpm, so `checked` was true. She could set written_score, so
-- `marked` was true — and written_score is half the english axis, which every
-- track is gated on, so a 10 there lifts a mediocre english score over the
-- line on its own. A pass sets applications.status to 'interview' through
-- advance_on_assessment, and 031 sends the invitation.
--
-- That is a straight line from the browser console to an interview
-- invitation, and it exists today, before 063 changes anything.
--
-- ==========================================================================
-- WHY THIS IS NOT A REVOKE
-- ==========================================================================
--
-- The obvious fix is
--
--   revoke update (typing_verified_wpm, typing_verified_accuracy, written_score)
--     on public.application_assessment from authenticated;
--
-- and it would lock out the people who are supposed to write those columns.
-- Staff sign in through the same Supabase project and hold the same
-- `authenticated` role; what makes them staff is a row in user_roles, which a
-- column grant cannot see. Revoking takes the column away from everybody, and
-- /admin's typing panel and marking box would both start failing silently on
-- a permission error.
--
-- The distinction that is actually wanted is not role, it is permission —
-- has_permission('applications.view_all'), the same test every staff policy
-- in this schema already uses. A grant cannot ask that question. A trigger
-- can, so the grant stays as it is and the write is refused instead.
--
-- This also keeps every existing client working untouched: /admin writes the
-- columns exactly as it does today and nothing about the page changes.

do $pre$
begin
  if to_regclass('public.application_assessment') is null then
    raise exception
      'sql/045 has not been run on this database. Run sql/045-the-assessment.sql first, then this one.';
  end if;
end
$pre$;

-- ==========================================================================
-- THE GUARD
-- ==========================================================================
--
-- Raises rather than silently putting the old value back. A refusal that
-- quietly succeeds teaches somebody probing this that nothing is watching,
-- and leaves whoever reads the row later with no sign it was attempted.
--
-- Trigger order does not matter here, which is worth saying because 048 and
-- 050 both had to think about it. Those two stamp columns the scorer then
-- reads, so they must run first. This one aborts the statement, and an
-- exception unwinds everything the other triggers did in the same statement
-- whatever order they ran in.

create or replace function public.staff_only_assessment_figures()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if new.typing_verified_wpm      is not distinct from old.typing_verified_wpm
 and new.typing_verified_accuracy is not distinct from old.typing_verified_accuracy
 and new.written_score            is not distinct from old.written_score then
    return new;
  end if;

  if public.has_permission('applications.view_all') then
    return new;
  end if;

  -- Named without saying which column, deliberately. Somebody who is allowed
  -- to do this never sees it; somebody who is not gets no map of what else to
  -- try.
  raise exception 'that figure is not yours to write';
end;
$fn$;

revoke all on function public.staff_only_assessment_figures() from public, anon, authenticated;

drop trigger if exists assessment_figures_are_staff_only on public.application_assessment;
create trigger assessment_figures_are_staff_only
  before update on public.application_assessment
  for each row execute function public.staff_only_assessment_figures();

-- ==========================================================================
-- WHAT THIS DOES NOT COVER
-- ==========================================================================
--
-- `attempt` is on the same grant and she can still write it. It is left
-- alone: the constraint holds it between 1 and 5, she can only touch the row
-- while it is unsent, and nothing about part_done or her answers is cleared by
-- changing it — so the worst available is renumbering her own first attempt.
-- The re-sit control that would give that number meaning does not exist yet,
-- and when it does it should own this column rather than the applicant.
--
-- typing_wpm, typing_accuracy, typing_proof, connection_proof, the four
-- answer columns and written_reply all stay hers to write. That is the whole
-- point of the two-account arrangement 048 wanted: she says what she scored,
-- somebody here says what they read, and the row keeps both. This file is the
-- half of that sentence the SQL was missing.
--
-- ==========================================================================
-- CHECK IT WORKED
-- ==========================================================================
--
-- The grant list is unchanged on purpose, so 049's query still returns all
-- thirteen columns and that is now the expected answer rather than the
-- finding. What changed is what happens when a non-staff session writes one:
--
--   -- as a signed-in applicant, on her own unsent row:
--   update public.application_assessment
--      set typing_verified_wpm = 200
--    where application_id = '...';
--   -- ERROR: that figure is not yours to write
--
--   -- as staff, on any row: unchanged, still works.
--
-- tools/guard-rls.mjs is where a probe for this belongs, next to the checks
-- that already prove the publishable key cannot read applicants.

insert into public.schema_migrations (n) values (64) on conflict (n) do nothing;
