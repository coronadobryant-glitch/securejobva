-- DO NOT RE-RUN THIS FILE ON ITS OWN
--
-- The header above says this file is safe to re-run, and on its own it is:
-- every statement in it is written to be repeatable. What it is not safe to
-- do is run it AFTER the files that come later, because it defines functions
-- they have since replaced — and `create or replace` does exactly what it
-- says. Re-running this puts its own versions back.
--
-- Nothing warns you when that happens. Columns are added with `if not
-- exists` so they survive; only the logic goes backwards. The schema looks
-- perfect and the behaviour is months old.
--
-- What this file would take back, and what to run afterwards to undo it:
--
--   request_account_type
--     -> re-run 029-no-staff-requests.sql to restore
--
-- So if you ever run this file again, run every later file it names above,
-- in number order, straight afterwards. tools/check.mjs keeps this list
-- honest: a new file that supersedes something here fails the build until
-- this block names it.
-- 017 — let somebody ask to be staff
--
-- Run after: 016
-- Safe to re-run: yes
-- Also needed: nothing in the dashboard.
--
-- The sign-up chooser offered two answers, "I am looking for work" and "I am
-- hiring", and somebody joining the team had to pick one of them and be wrong.
-- It now offers three.

-- ==========================================================================
-- ASKING IS STILL NOT GETTING
-- ==========================================================================
--
-- 009 refused to let staff be requested at all, and said so plainly: not
-- "requestable but usually declined", not in the list. That was the right
-- instinct aimed at the wrong target.
--
-- What makes a self-declared role dangerous is a self-declared role being
-- GRANTED. A request is a row in a queue that does nothing until an
-- administrator approves it, and that approval is the same single line in
-- decide_account_request() it has always been, behind accounts.manage. Someone
-- asking to be staff has exactly as much access as someone asking to be an
-- applicant: none, until a person agrees.
--
-- Leaving staff out did not make anything safer. It made a new colleague pick
-- the wrong box, and then somebody had to fix it by hand -- which meant the
-- workaround was an administrator granting a role from a Slack message, which
-- is worse than a queue that shows who asked and when.
--
-- admin stays out, and that is not symmetry for its own sake. Admin can grant
-- roles, so an admin approving an admin request is the one loop where a
-- mistake compounds. It is granted by editing this folder, deliberately, which
-- is a slower path on purpose.

alter table public.role_requests drop constraint if exists role_requests_askable;
alter table public.role_requests add constraint role_requests_askable
  check (requested_role in ('business', 'applicant', 'staff'));

create or replace function public.request_account_type(role_key text, note text default null)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  me text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if me = '' then
    raise exception 'sign in first';
  end if;

  -- admin is absent on purpose. See the note above.
  if role_key not in ('business', 'applicant', 'staff') then
    raise exception 'that account type cannot be requested';
  end if;

  if exists (select 1 from public.user_roles ur
              where ur.user_email = me and ur.role_key = request_account_type.role_key) then
    return 'already';
  end if;

  insert into public.role_requests (user_email, requested_role, note)
  values (me, request_account_type.role_key, left(coalesce(note, ''), 1000))
  on conflict (user_email, requested_role) do update
    set note = excluded.note,
        requested_at = now(),
        state = case when public.role_requests.state = 'approved' then 'approved' else 'pending' end;

  return 'pending';
end;
$fn$;

revoke all on function public.request_account_type(text, text) from public, anon;
grant execute on function public.request_account_type(text, text) to authenticated;

-- decide_account_request() is untouched. It already refuses anyone without
-- accounts.manage and is still the only place in this schema that writes to
-- user_roles, so widening what may be asked has not widened what may be given.

-- ==========================================================================
-- Check it worked
-- ==========================================================================
--
-- Three askable roles, and admin must not be among them.

select pg_get_constraintdef(oid) as askable
from pg_constraint
where conname = 'role_requests_askable';

-- Still exactly one path from a request to a role.
select count(*) as places_that_write_user_roles
from pg_proc
where pronamespace = 'public'::regnamespace
  and prosrc ilike '%insert into public.user_roles%';

select requested_role, state, count(*)
from public.role_requests
group by requested_role, state
order by requested_role, state;
