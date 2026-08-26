-- 014 — stop asking to post, and add an administrator
--
-- Run after: 013
-- Safe to re-run: yes
-- Also needed: nothing in the dashboard.

-- ==========================================================================
-- WE DO NOT POST TO APPLICANTS' ACCOUNTS
-- ==========================================================================
--
-- The application asked for permission to publish on somebody's behalf, and
-- that is no longer something we do. The consent box is gone from the form,
-- the wording is gone from the Terms, and this takes away the ability to
-- record one at all.
--
-- Order matters, and it is the reason this is a migration rather than a
-- dashboard click. A column-level grant refuses the ENTIRE statement over one
-- column, not just that field -- which is what 011 existed to fix. So the
-- pages had to stop selecting posting_consent BEFORE the grant went, or
-- /status and /admin would have gone blank behind a 42501 nobody could read.
-- That shipped first; this is the second half.

revoke insert (posting_consent, posting_consent_at, posting_consent_text)
  on public.applications from anon;
revoke update (posting_consent, posting_consent_at, posting_consent_text)
  on public.applications from authenticated;
revoke select (posting_consent, posting_consent_at, posting_consent_text)
  on public.applications from authenticated;

-- The trigger that preserved the history of a withdrawal has nothing left to
-- preserve.
drop trigger if exists applications_consent_history on public.applications;
drop function if exists public.keep_consent_history();

-- The columns themselves stay. Any consent recorded while the feature existed
-- is a record of something a real person agreed to, and deleting it would
-- destroy the only evidence of what we were permitted to do at the time.
-- Nothing can write to them and nothing can read them through the API; they
-- are visible in the SQL editor, which is where a question about them would be
-- answered anyway.

-- social_tokens is likewise left in place and still unreachable: no grants, no
-- policies, no rows. If publishing ever comes back it will be for a client's
-- own accounts, under a fresh agreement, and that is a decision to make
-- deliberately rather than by finding a table already sitting there.

-- ==========================================================================
-- ADMINISTRATOR
-- ==========================================================================
--
-- Granting the admin role, which 004 defines as holding every permission --
-- including any added later, because that grant selects over the permissions
-- table rather than naming them.
--
-- This is what it carries today: see every application, move applicants
-- between stages, read and write private notes, see connected social
-- accounts, view analytics, and grant or revoke roles for other accounts.
--
-- Keyed by email because that is what Google and the sign-in form both give
-- us, and because it can be granted before the person has ever signed in --
-- the account id does not exist until first login, the address does.

insert into public.user_roles (user_email, role_key) values
  ('bryant.coronado@laverne.edu', 'admin')
on conflict do nothing;

-- Carried into the older table too, so anything still reading it agrees.
insert into public.admins (user_email) values
  ('bryant.coronado@laverne.edu')
on conflict do nothing;

-- ==========================================================================
-- Check it worked
-- ==========================================================================
--
-- Nobody should be able to write a consent any more. This must return no rows.

select grantee, privilege_type, column_name
from information_schema.column_privileges
where table_name = 'applications'
  and column_name like 'posting_consent%'
  and grantee in ('anon', 'authenticated');

-- The new administrator, and everything the role can do.
select ur.user_email,
       string_agg(distinct rp.permission_key, ', ' order by rp.permission_key) as can
from public.user_roles ur
join public.role_permissions rp on rp.role_key = ur.role_key
where ur.user_email = 'bryant.coronado@laverne.edu'
group by ur.user_email;

-- Every administrator, so you can see who holds it.
select user_email, granted_at
from public.user_roles
where role_key = 'admin'
order by granted_at;
