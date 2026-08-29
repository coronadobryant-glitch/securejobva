-- 038 — one constraint on status, not two
--
-- Run after: 037
-- Safe to re-run: yes
-- Also needed: nothing in the dashboard.
--
-- Marking somebody Hired in /admin failed with
--
--   new row for relation "applications" violates check constraint
--   "applications_status_valid"
--
-- and the stage did not save.
--
-- ==========================================================================
-- TWO CONSTRAINTS, ONE RULE
-- ==========================================================================
--
-- 003 wrote the list of stages a status may hold:
--
--   applications_status_valid
--     check (status in ('applied','assessment','interview','approved','declined'))
--
-- 026 added `hired` as the fifth rung — and did it by creating a SECOND
-- constraint under a different name rather than replacing the first:
--
--   applications_status_check
--     check (status in ('applied','assessment','interview','approved','hired','declined'))
--
-- Both are live, and a row must satisfy every check constraint on its table.
-- So the wider one permits 'hired', the older one refuses it, and the older
-- one wins the way a veto always does. Hired has been unreachable since 026,
-- and looked fine the whole time because nobody had tried to use it: the KPI
-- on /admin has been reading `0 hired` and telling the exact truth.
--
-- The stale one goes. Nothing is lost — its list is a subset of the one that
-- remains, so every row it would have permitted is still permitted, and the
-- rule it was written to enforce is enforced by applications_status_check.
--
-- Worth naming the shape of this, because it is the second thing found today
-- by clicking rather than testing: a constraint replaced by a differently
-- named one is not replaced. It is doubled, and the older half becomes a veto
-- nobody is looking at.

alter table public.applications
  drop constraint if exists applications_status_valid;

-- Re-asserted rather than assumed. If 026 has not run in some copy of this
-- database, dropping the old one would leave nothing guarding status at all —
-- which is worse than the bug being fixed.
alter table public.applications
  drop constraint if exists applications_status_check;

alter table public.applications
  add constraint applications_status_check
  check (status in ('applied', 'assessment', 'interview', 'approved', 'hired', 'declined'));

-- ==========================================================================
-- Check it worked
-- ==========================================================================
--
-- One row, holding six stages. Two rows means the veto is still there.

select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.applications'::regclass
  and contype = 'c'
  and pg_get_constraintdef(oid) like '%status%'
order by conname;

-- And the count that has been quietly stuck at zero.
select status, count(*)
from public.applications
group by status
order by status;
