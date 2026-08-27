-- 020 — put back the two column grants that let staff move a stage
--
-- Run after: 012
-- Safe to re-run: yes
-- Also needed: nothing in the dashboard.
--
-- 003 granted UPDATE on (status, status_changed_at) so the admin page could
-- move an applicant along. That grant is not there any more:
--
--   select string_agg(column_name, ', ' order by column_name)
--   from information_schema.column_privileges
--   where table_name = 'applications' and grantee = 'authenticated'
--     and privilege_type = 'UPDATE';
--
-- came back with the fourteen columns 006 granted an applicant, and neither of
-- the two 003 granted staff. So every stage change in /admin has been failing
-- with `permission denied for table applications` — a red flash beside Save,
-- and nothing written.
--
-- HOW IT WENT MISSING, because it will happen again otherwise. 001 opens with
--
--   revoke all on public.applications from anon, authenticated;
--
-- which is right for 001 — it is the file that locks the table down. But it
-- revokes everything, including grants made by files that come after it. 001 is
-- marked safe to re-run and the README tells you to re-run a file when you are
-- unsure whether it has been run, so somebody did, at some point after 003 and
-- before 006. 006's grants survived because 006 was pasted afterwards; 003's
-- did not.
--
-- Re-running any file is still the right instinct. It is 001 specifically that
-- takes grants with it, so this file exists to be re-run after it.

-- ==========================================================================
-- WHAT STAFF MAY CHANGE
-- ==========================================================================
--
-- Two columns, by name, exactly as 003 had it. Not `grant update on table`.
--
-- The difference matters more here than anywhere else in the schema. The
-- applicant's own UPDATE policy from 006 checks which ROW is being written:
--
--   with check (user_id = auth.uid() or lower(email) = lower(...))
--
-- and says nothing about which COLUMNS. So the column list is the only thing
-- standing between a signed-in applicant and `status = 'approved'` on their own
-- row. Grant the table and that protection is gone, whatever the policies say.
--
-- Postgres will suggest exactly that when a write is refused:
--
--   permission denied for table applications
--   Grant the required privileges with: GRANT UPDATE ON public.applications TO authenticated;
--
-- Do not. That hint does not know this table holds applicants. tools/check.mjs
-- now fails the build if it is ever pasted in.

grant update (status, status_changed_at) on public.applications to authenticated;

-- Which rows a staff member may write is still decided by the policy from 004,
-- and which rows an applicant may write by the policy from 006. Neither is
-- touched here. This restores only the permission to name the column at all.

-- ==========================================================================
-- THE SAME TWO ON SEAT REQUESTS
-- ==========================================================================
--
-- 012 granted the identical pair on seat_requests, after the same 001 revoke,
-- so it is exposed to the same accident. Re-granting is free when it is already
-- in place, and saves finding out the hard way that the seats board is dead
-- too — that one is a business waiting on a quote, which is worse than an
-- applicant waiting on a stage.

grant update (status, status_changed_at) on public.seat_requests to authenticated;

-- ==========================================================================
-- Check it worked
-- ==========================================================================
--
-- Both rows must include status and status_changed_at. The applications row
-- should also still carry the fourteen an applicant may edit — if those have
-- vanished too, 006 needs re-running as well.

select table_name,
       string_agg(column_name, ', ' order by column_name) as authenticated_can_update
from information_schema.column_privileges
where table_name in ('applications', 'seat_requests')
  and grantee = 'authenticated'
  and privilege_type = 'UPDATE'
group by table_name
order by table_name;
