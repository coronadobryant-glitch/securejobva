-- verify — read-only. Paste this any time; it changes nothing.
--
-- What you want to see:
--   seat_requests      rls_enabled = true,  policies = a
--   applications       rls_enabled = true,  policies = a,r,w
--   admins             rls_enabled = true,  policies = none
--   application_notes  rls_enabled = true,  policies = a,r,w
--
--   anon           INSERT           <- exactly this, nothing more
--   authenticated  INSERT,SELECT,UPDATE
--
-- anon showing anything beyond INSERT means the applicant list is readable.
-- Fix it before doing anything else.

-- --------------------------------------------------------------------------
-- Check it worked
-- --------------------------------------------------------------------------
-- Both rows must say rls_enabled = true and list exactly one INSERT policy.

select c.relname as table,
       c.relrowsecurity as rls_enabled,
       coalesce(string_agg(p.polcmd::text, ','), 'none') as policies
from pg_class c
left join pg_policy p on p.polrelid = c.oid
where c.relname in ('seat_requests', 'applications')
group by c.relname, c.relrowsecurity;


-- --------------------------------------------------------------------------
-- Check it worked
-- --------------------------------------------------------------------------
--
-- applications should show rls_enabled = true with three policies: the
-- original public INSERT, the owner-or-admin SELECT and the admin UPDATE.
-- admins must show rls_enabled = true and NO policies at all.

select c.relname as table_name,
       c.relrowsecurity as rls_enabled,
       coalesce(string_agg(p.polcmd::text, ',' order by p.polcmd::text), 'none') as policies
from pg_class c
left join pg_policy p on p.polrelid = c.oid
where c.relname in ('seat_requests', 'applications', 'admins', 'application_notes')
group by c.relname, c.relrowsecurity
order by c.relname;

-- anon must still be able to do exactly one thing to applications: insert.
select grantee, string_agg(privilege_type, ',' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_name = 'applications' and grantee in ('anon', 'authenticated')
group by grantee;
