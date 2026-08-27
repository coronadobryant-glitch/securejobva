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


-- --------------------------------------------------------------------------
-- The notify webhooks
-- --------------------------------------------------------------------------
--
-- Three rows, one per form. secret_filled must be true on all three: a trigger
-- still carrying the __WEBHOOK_SECRET__ placeholder fires, collects a 401 from
-- api/notify.js, and sends nothing — which from the outside is indistinguishable
-- from having no webhook at all. The secret itself is never printed.

select c.relname as table_name,
       t.tgname as webhook,
       pg_get_triggerdef(t.oid) not like '%\_\_WEBHOOK\_SECRET\_\_%' as secret_filled,
       pg_get_triggerdef(t.oid) like '%api/notify%' as points_at_notify
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
where not t.tgisinternal
  and c.relname in ('applications', 'seat_requests', 'contact_messages')
order by c.relname;
