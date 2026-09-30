-- rescore — Sales & Marketing applicants who were never shown the Sales part
--
-- NOT A MIGRATION. Not numbered, not stamped, and not part of the paste-in-
-- order sequence. Run by hand, once, AFTER reading what step 1 returns — and
-- after 079 has run and status.html shows the Sales part again (N14), or the
-- next Sales applicant lands in the same place.
--
-- Step 1 changes nothing. Step 2 and step 3 are commented out on purpose;
-- they are two different answers to the same problem and only one of them
-- should be run, and only by somebody who has read the rows first.
--
-- ==========================================================================
-- WHAT HAPPENED TO THEM
-- ==========================================================================
--
-- status.html decided whether to show the Sales part from applications.track
-- — the single column 002 replaced with tracks[], which nothing has written
-- since. So it was null for everybody and the Sales part was hidden from
-- everybody. But the assessment row was created with track = tracks[0], and
-- 063's scorer gates 'Sales & Marketing' on english + sales + customer, with
-- a missing sales score counted as 0. Every applicant whose first ticked role
-- was Sales & Marketing was graded below the line on a part she was never
-- given, however well she did on the rest, and advance_on_assessment never
-- moved her to interview.
--
-- ==========================================================================
-- STEP 1 — WHO (read-only)
-- ==========================================================================
--
-- Everyone graded on the Sales axis with no Sales answers. `would_pass_without_sales`
-- recomputes 063's gate on the axes she WAS shown (english and customer) and
-- the typing floor, from the scores already on her row, so you can see who
-- the missing part actually cost something.

select a.id              as application_id,
       a.name,
       a.email,
       a.status,
       s.track,
       s.verdict,
       s.submitted_at::date as sent,
       s.score_english, s.written_score, s.score_scenarios, s.score_sales,
       coalesce(s.typing_verified_wpm, s.typing_wpm)           as wpm,
       coalesce(s.typing_verified_accuracy, s.typing_accuracy) as accuracy,
       (
         (case when s.written_score is not null
               then round((coalesce(s.score_english, 0) + s.written_score)::numeric / 2)
               else coalesce(s.score_english, 0) end) >= 7
         and coalesce(s.score_scenarios, 0) >= 7
         and coalesce(s.typing_verified_wpm, s.typing_wpm, 0) >= 40
         and coalesce(s.typing_verified_accuracy, s.typing_accuracy, 0) >= 95
       ) as would_pass_without_sales
from public.application_assessment s
join public.applications a on a.id = s.application_id
where s.track = 'Sales & Marketing'
  and s.sales_answers is null
order by s.submitted_at desc nulls last;

-- ==========================================================================
-- STEP 2 — OPTION A: GRADE HER ON WHAT SHE WAS SHOWN
-- ==========================================================================
--
-- Re-scores each row on the Customer Service axes (english + customer), which
-- are exactly the Sales & Marketing axes minus the part she never saw. The
-- row's track is changed to say so, and a note goes in her log saying why.
--
-- READ BEFORE RUNNING:
--   * A row that now passes, AND has a verified typing figure, is moved to
--     Interview by 063's advance_on_assessment — and 031 emails her the
--     interview invitation. That is the point, but it is an email.
--   * Scoring only runs when submitted_at goes from null to a value, so the
--     block sets it to null and back to the original moment. The moment is
--     kept exactly; nothing about when she sent it changes.
--   * Only rows still in 'assessment' are touched. Anybody staff have already
--     moved on by hand is left as they are.
--
-- To run: delete the /* and */ lines around the block, run it, put them back.

/*
do $rescore$
declare
  r record;
begin
  for r in
    select s.application_id, s.submitted_at
    from public.application_assessment s
    join public.applications a on a.id = s.application_id
    where s.track = 'Sales & Marketing'
      and s.sales_answers is null
      and s.submitted_at is not null
      and a.status = 'assessment'
  loop
    update public.application_assessment
       set submitted_at = null
     where application_id = r.application_id;

    update public.application_assessment
       set track = 'Customer Service',
           submitted_at = r.submitted_at
     where application_id = r.application_id;

    insert into public.application_note_log (application_id, note)
    values (r.application_id,
      'Assessment re-scored on English and Customer only: the Sales part was never shown to her ' ||
      '(status.html read the old track column), so it could not count against her. ' ||
      'Run by hand from sql/rescore-sales-without-a-sales-part.sql.');
  end loop;
end
$rescore$;
*/

-- ==========================================================================
-- STEP 3 — OPTION B: LET HER SIT THE SALES PART
-- ==========================================================================
--
-- The fairer answer if the Sales part matters for the role: reopen her
-- assessment so the Sales part can be taken, and leave the rest of her
-- answers exactly as they are. Only once the page shows the Sales part again
-- (N14) — reopening before that puts her back in front of the same page.
--
-- READ BEFORE RUNNING:
--   * Nothing emails her. She has to be told, by a person, that there is one
--     more part to do — otherwise she will not know to come back.
--   * Her verdict goes back to in_progress until she sends it again.
--   * The Sales part's clock starts when she opens it (051), not now.
--
-- To run: delete the /* and */ lines, run it, put them back.

/*
update public.application_assessment s
   set submitted_at = null,
       verdict      = 'in_progress',
       part_opened  = s.part_opened - 'sales',
       part_done    = s.part_done - 'sales'
  from public.applications a
 where a.id = s.application_id
   and s.track = 'Sales & Marketing'
   and s.sales_answers is null
   and s.submitted_at is not null
   and a.status = 'assessment';
*/

-- ==========================================================================
-- AFTERWARDS
-- ==========================================================================
--
-- Step 1 again. After option A it returns the same people with track
-- 'Customer Service' no longer matching, so it should come back empty; after
-- option B, the same people with sent = null until they finish.
