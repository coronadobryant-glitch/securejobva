-- catch-up — passes that 063 left at Assessment
--
-- NOT A MIGRATION. Not numbered, not stamped, and not part of the paste-in-
-- order sequence. Run by hand, once, AFTER 097 and AFTER reading what step 1
-- returns.
--
-- Step 1 changes nothing. Step 2 is commented out on purpose: it moves real
-- applicants to Interview, and every one of them is emailed.
--
-- ==========================================================================
-- WHO THEY ARE
-- ==========================================================================
--
-- 063 made the verdict automatic and the move to Interview not: a pass waited
-- for somebody to check her typing. But advance_on_assessment only acted on
-- the update where the verdict TURNED 'passed', which happens when she sends
-- the assessment — before anybody has checked anything. When staff later
-- filled in the checked figures, the verdict was already 'passed' and nothing
-- moved her. 097 fixes the trigger for everybody from now on. It does not
-- touch the people already stranded, because moving them emails them, and
-- some may have been left at Assessment on purpose.
--
-- ==========================================================================
-- STEP 1 — WHO (read-only)
-- ==========================================================================
--
-- Everybody passed, typing checked by a person, still at Assessment.
-- days_since_checked is how long they have been waiting for an email that
-- never came. Anybody checked a long time ago may have applied elsewhere, been
-- spoken to by hand, or be a duplicate — that is for a person to decide, not
-- this file. Anybody who should NOT be invited: decline or move them in
-- /admin first. Step 2 only moves people still at Assessment.

select a.id   as application_id,
       a.name,
       a.email,
       a.status,
       s.submitted_at::date       as sent,
       s.typing_verified_at::date as typing_checked,
       (current_date - s.typing_verified_at::date) as days_since_checked,
       case when s.typing_verified_at < now() - interval '60 days'
            then 'OLD — decide by hand before step 2'
            else 'recent' end    as note
from public.application_assessment s
join public.applications a on a.id = s.application_id
where a.status = 'assessment'
  and s.verdict = 'passed'
  and (s.typing_verified_wpm is not null or s.typing_verified_accuracy is not null)
order by s.typing_verified_at;

-- ==========================================================================
-- STEP 2 — MOVE THEM (this emails each one)
-- ==========================================================================
--
-- Remove the comment markers from the three statements below and run the
-- file again. Each person still on step 1's list is moved to Interview, which
-- fires 031's notify_decision and emails her "Your application — interview
-- next" — exactly the email she would have had the day her typing was
-- checked. A note goes on each one's record first saying why, so the move is
-- explained in /admin rather than looking like something nobody did.
--
-- A second run finds nobody: everybody it moved is no longer at Assessment.
-- The last statement lists who it moved; anybody shown NOT at interview was
-- refused, and the status column says where they are instead.
--
-- insert into public.application_note_log (application_id, note)
-- select s.application_id,
--        'catch-up: moved to Interview by hand-run SQL. She passed and her typing had been checked, '
--        || 'but 063''s advance never fired for a pass checked after it was sent, so she had '
--        || 'been left at Assessment. She was emailed the interview invitation now.'
-- from public.application_assessment s
-- join public.applications a on a.id = s.application_id
-- where a.status = 'assessment'
--   and s.verdict = 'passed'
--   and (s.typing_verified_wpm is not null or s.typing_verified_accuracy is not null);
--
-- update public.applications a
--    set status = 'interview',
--        status_changed_at = now()
--   from public.application_assessment s
--  where s.application_id = a.id
--    and a.status = 'assessment'
--    and s.verdict = 'passed'
--    and (s.typing_verified_wpm is not null or s.typing_verified_accuracy is not null);
--
-- select a.name, a.status, n.created_at
-- from public.application_note_log n
-- join public.applications a on a.id = n.application_id
-- where n.note like 'catch-up: moved to Interview%'
-- order by n.created_at;
