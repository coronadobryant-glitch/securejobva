-- 007 — let an administrator grant and revoke roles from the admin page
--
-- Run after: 006
-- Safe to re-run: yes
-- Also needed: nothing in the dashboard.
--
-- 1.3 says an admin can manage the permission toggles for other accounts.
-- Until now roles were granted only by pasting SQL, which is fine for the
-- first admin and hopeless for the tenth staff member.

-- ==========================================================================
-- WHY THIS IS NOT SIMPLY A POLICY ON user_roles
-- ==========================================================================
--
-- 004 put RLS on roles, permissions, role_permissions and user_roles with no
-- policy at all, so nothing through the API could read or write them. That is
-- still the right default, and it stays: opening user_roles to `authenticated`
-- means a bug in one policy exposes who has what.
--
-- Instead the whole capability goes through three functions that run as
-- definer and check accounts.manage themselves. The grant tables stay sealed;
-- the only way in is a door that asks who you are first.

-- --------------------------------------------------------------------------
-- Reading the list
-- --------------------------------------------------------------------------

create or replace function public.list_role_grants()
returns table (user_email text, roles text[])
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select ur.user_email,
         array_agg(ur.role_key order by ur.role_key)::text[]
  from public.user_roles ur
  where public.has_permission('accounts.manage')
  group by ur.user_email
  order by ur.user_email;
$fn$;

revoke all on function public.list_role_grants() from public, anon;
grant execute on function public.list_role_grants() to authenticated;

-- What roles exist, and what each one can do. Only useful to someone who may
-- hand them out, so it asks the same question.
create or replace function public.list_roles()
returns table (key text, label text, permissions text[])
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select r.key,
         r.label,
         coalesce(
           (select array_agg(rp.permission_key order by rp.permission_key)
              from public.role_permissions rp
             where rp.role_key = r.key),
           array[]::text[]
         )::text[]
  from public.roles r
  where public.has_permission('accounts.manage')
  order by r.key;
$fn$;

revoke all on function public.list_roles() from public, anon;
grant execute on function public.list_roles() to authenticated;

-- --------------------------------------------------------------------------
-- Changing it
-- --------------------------------------------------------------------------
--
-- One function for both directions, because the two guards below have to be
-- identical and splitting them is how they drift apart.
--
-- Two things it refuses, both of them the same mistake seen from different
-- sides:
--
--   You cannot remove your own admin role. Not because it is catastrophic --
--   another admin can restore it -- but because the person most likely to do
--   it is the only admin, and then nobody can undo anything.
--
--   You cannot remove the last admin, whoever asks. A table with roles and
--   permissions in it and nobody able to edit them is a database restore.

create or replace function public.set_role(target_email text, role_key text, grant_it boolean)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  me      text := lower(coalesce(auth.jwt() ->> 'email', ''));
  target  text := lower(coalesce(target_email, ''));
  admins  integer;
begin
  if not public.has_permission('accounts.manage') then
    raise exception 'not allowed';
  end if;
  if target = '' or target not like '%@%' then
    raise exception 'that does not look like an email address';
  end if;
  if not exists (select 1 from public.roles r where r.key = set_role.role_key) then
    raise exception 'no such role: %', set_role.role_key;
  end if;

  if grant_it then
    insert into public.user_roles (user_email, role_key)
    values (target, set_role.role_key)
    on conflict do nothing;
    return 'granted';
  end if;

  if set_role.role_key = 'admin' then
    if target = me then
      raise exception 'you cannot remove your own admin role';
    end if;
    select count(*) into admins from public.user_roles where role_key = 'admin';
    if admins <= 1 then
      raise exception 'that is the last administrator';
    end if;
  end if;

  delete from public.user_roles ur
   where ur.user_email = target and ur.role_key = set_role.role_key;
  return 'revoked';
end;
$fn$;

revoke all on function public.set_role(text, text, boolean) from public, anon;
grant execute on function public.set_role(text, text, boolean) to authenticated;

-- ==========================================================================
-- Check it worked
-- ==========================================================================
--
-- The four grant tables must still show rls_enabled = true and 'none' under
-- policies. If any of them grows a policy, this file has been misunderstood:
-- the functions above are the only intended way in.

select c.relname as table_name,
       c.relrowsecurity as rls_enabled,
       coalesce(string_agg(p.polcmd::text, ','), 'none') as policies
from pg_class c
left join pg_policy p on p.polrelid = c.oid
where c.relname in ('roles', 'permissions', 'role_permissions', 'user_roles')
group by c.relname, c.relrowsecurity
order by c.relname;

-- There must be at least one administrator. If this returns 0, add yourself
-- with the insert in 004 before doing anything else.
select count(*) as administrators
from public.user_roles
where role_key = 'admin';
