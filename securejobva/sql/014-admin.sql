-- 014 — add an administrator
--
-- Run after: 013
-- Safe to re-run: yes
-- Also needed: nothing in the dashboard.
--
-- Granting the admin role, which 004 defines as holding every permission --
-- including any added later, because that grant selects over the permissions
-- table rather than naming them one at a time.
--
-- What it carries today: see every application, move applicants between
-- stages, read and write private notes, see connected social accounts, read
-- the contact inbox and the seat requests, view analytics, and grant or revoke
-- roles for other accounts.
--
-- Keyed by email, because that is what Google and the sign-in form both give
-- us, and because a role can then be granted before the person has ever signed
-- in: the account id does not exist until first login, the address does.

insert into public.user_roles (user_email, role_key) values
  ('bryant.coronado@laverne.edu', 'admin')
on conflict do nothing;

-- Carried into the older table too, so anything still reading it agrees with
-- the new one.
insert into public.admins (user_email) values
  ('bryant.coronado@laverne.edu')
on conflict do nothing;

-- ==========================================================================
-- Check it worked
-- ==========================================================================

select ur.user_email,
       string_agg(distinct rp.permission_key, ', ' order by rp.permission_key) as can
from public.user_roles ur
join public.role_permissions rp on rp.role_key = ur.role_key
where ur.user_email = 'bryant.coronado@laverne.edu'
group by ur.user_email;

-- Everyone who currently administers this site.
select user_email, granted_at
from public.user_roles
where role_key = 'admin'
order by granted_at;
