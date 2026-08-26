-- 017 — grant SELECT on applications at table level, and stop chasing columns
--
-- Run after: 016
-- Safe to re-run: yes
-- Also needed: nothing in the dashboard.
--
-- This replaces the column-by-column approach, which has now failed three
-- times in a row with the same unreadable error:
--
--   42501: permission denied for table applications
--   hint: GRANT SELECT ON public.applications TO authenticated
--
-- 011 added posting_consent. 016 added user_id. Both were run. Every one of
-- the 29 columns is named in a grant, and /admin still cannot load.
--
-- The reason column grants keep losing here is that nothing in this system
-- asks for a column list. The admin page reads application_queue with
-- `select=*`, and PATCHes a stage without `Prefer: return=minimal` so
-- PostgREST returns the row. Both mean "every column", and a column-level
-- grant refuses the WHOLE statement over any single omission rather than
-- returning the rest. So the failure is all-or-nothing, gives an error naming
-- the table rather than the column, and comes back the moment anyone adds a
-- column anywhere. It is a lock that only ever locks us out.
--
-- WHAT THIS DOES NOT GIVE AWAY
--
-- Nothing that the column list was protecting, because it was protecting
-- nothing. Row-level security is what keeps applicants apart, and it is
-- untouched: the policy from 003 still says a signed-in person reads the rows
-- carrying their own verified address, or every row if they hold a role.
-- Table-level SELECT widens WHICH COLUMNS of a row they may read; it does not
-- widen WHICH ROWS, and the rows were always the thing that mattered.
--
-- And the genuinely private material was never in this table. 005 put the
-- internal pipeline, contact history and interview scores in
-- application_tracking precisely so that a column-level grant would not be the
-- thing holding them back -- "a separate table with its own policy cannot leak
-- by someone forgetting to update a list". That reasoning is exactly why this
-- is safe, and it is also the reason the list was never worth maintaining.
--
-- anon is untouched and still holds one privilege on this table: INSERT.

grant select on public.applications to authenticated;

-- --------------------------------------------------------------------------
-- Check it worked
-- --------------------------------------------------------------------------
--
-- anon must show INSERT and nothing else. authenticated should show INSERT,
-- SELECT and UPDATE. If anon shows SELECT, stop and revoke it.

select grantee,
       string_agg(distinct privilege_type, ',' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_name = 'applications' and grantee in ('anon', 'authenticated')
group by grantee;

-- The rows a person can see are still decided here, not by the grant above.
select polname as policy, polcmd as command
from pg_policy
where polrelid = 'public.applications'::regclass
order by polcmd, polname;
