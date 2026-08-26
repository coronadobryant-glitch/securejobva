-- 016 — grant the one column that was missed
--
-- Run after: 015
-- Safe to re-run: yes
-- Also needed: nothing in the dashboard.
--
-- /admin failed with
--
--   42501: permission denied for table applications
--   hint: GRANT SELECT ON public.applications TO authenticated
--
-- 29 columns exist on applications. 28 were granted. `user_id` -- added by 004
-- to tie an application to the account that owns it -- never was.
--
-- It went unnoticed because nothing selects it by name. What reaches it is
-- `select=*`: the admin page PATCHes a stage without asking for
-- `Prefer: return=minimal`, so PostgREST returns the updated row, and returning
-- a row means reading every column in it. One ungranted column refuses the
-- whole statement, so moving somebody to the next stage failed with an error
-- about SELECT on an UPDATE the operator did not make.
--
-- There is nothing to protect here. user_id is the applicant's own auth id on
-- their own row -- the read policy already matches on it, so anybody who can
-- read the row knows it. Withholding it bought nothing and cost the page.

grant select (user_id) on public.applications to authenticated;

-- --------------------------------------------------------------------------
-- Check it worked
-- --------------------------------------------------------------------------
--
-- Should print 29. Anything less means a column exists that authenticated
-- cannot read, and the next `select=*` against it will fail the same way.

select count(*) as granted_columns
from information_schema.column_privileges
where table_schema = 'public'
  and table_name = 'applications'
  and grantee = 'authenticated'
  and privilege_type = 'SELECT';

-- And the gap itself, which should come back empty.
select c.column_name as ungranted
from information_schema.columns c
where c.table_schema = 'public' and c.table_name = 'applications'
  and not exists (
    select 1 from information_schema.column_privileges p
    where p.table_schema = 'public' and p.table_name = 'applications'
      and p.column_name = c.column_name
      and p.grantee = 'authenticated' and p.privilege_type = 'SELECT'
  )
order by c.column_name;
