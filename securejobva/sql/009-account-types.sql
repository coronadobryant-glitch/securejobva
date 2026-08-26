-- 009 — account types: asked for at sign-up, granted by a person
--
-- Run after: 008
-- Safe to re-run: yes
-- Also needed: nothing in the dashboard.
--
-- Someone signing in for the first time has no role, so every page they can
-- reach is empty and none of them says why. This lets them say what they are
-- there for.

-- ==========================================================================
-- ASKING IS NOT GETTING
-- ==========================================================================
--
-- The whole point of this file is the gap between those two things.
--
-- What a person types about themselves at sign-up is a claim. If choosing
-- "Business" from a dropdown granted the business role, then choosing it is
-- the only security there is, and the dropdown is a list of things anyone may
-- have for the asking. So a request goes in a queue and a human moves it.
--
-- Two roles can be requested: business and applicant. admin and staff are
-- deliberately not requestable at all -- not "requestable but usually
-- declined", not in the list. The only way to become staff is for somebody
-- who already is to grant it, which is 007.

insert into public.roles (key, label) values
  ('business', 'Business')
on conflict (key) do update set label = excluded.label;

-- A business sees the seats they have asked for. They get nothing on the
-- applicant side: a client browsing applications is not a feature, it is a
-- data breach with a login page in front of it.
insert into public.permissions (key, label) values
  ('seats.view', 'See your own seat requests')
on conflict (key) do update set label = excluded.label;

insert into public.role_permissions (role_key, permission_key) values
  ('business', 'seats.view')
on conflict do nothing;

-- Admin already holds every permission by the select-over-permissions insert
-- in 004, but that ran before seats.view existed, so it is re-run here.
insert into public.role_permissions (role_key, permission_key)
  select 'admin', key from public.permissions
on conflict do nothing;

-- --------------------------------------------------------------------------
-- The queue
-- --------------------------------------------------------------------------

create table if not exists public.role_requests (
  user_email     text not null,
  requested_role text not null references public.roles (key) on delete cascade,
  note           text,
  requested_at   timestamptz not null default now(),
  state          text not null default 'pending',
  decided_by     text,
  decided_at     timestamptz,

  primary key (user_email, requested_role),
  constraint role_requests_state_valid check (state in ('pending', 'approved', 'declined')),
  constraint role_requests_sane check (coalesce(length(note), 0) <= 1000),
  -- Nothing outside this pair may even be asked for.
  constraint role_requests_askable check (requested_role in ('business', 'applicant'))
);

alter table public.role_requests enable row level security;
revoke all on public.role_requests from anon, authenticated;

-- No policy, as with every other grant table. The three functions below are
-- the only way in, and each asks who is calling before it does anything.

-- --------------------------------------------------------------------------
-- Asking
-- --------------------------------------------------------------------------
--
-- The caller can only ever file a request for themselves: the email comes out
-- of the verified token, and there is no parameter for whose request it is.

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
  if role_key not in ('business', 'applicant') then
    raise exception 'that account type cannot be requested';
  end if;

  -- Already holds it. Say so plainly rather than filing a request that a
  -- person then has to read and dismiss.
  if exists (select 1 from public.user_roles ur
              where ur.user_email = me and ur.role_key = request_account_type.role_key) then
    return 'already';
  end if;

  insert into public.role_requests (user_email, requested_role, note)
  values (me, request_account_type.role_key, left(coalesce(note, ''), 1000))
  on conflict (user_email, requested_role) do update
    set note = excluded.note,
        requested_at = now(),
        -- A declined request may be made again; that is what appealing is.
        state = case when public.role_requests.state = 'approved' then 'approved' else 'pending' end;

  return 'pending';
end;
$fn$;

revoke all on function public.request_account_type(text, text) from public, anon;
grant execute on function public.request_account_type(text, text) to authenticated;

-- What have I asked for, and where has it got to. Only ever about the caller.
create or replace function public.my_account_requests()
returns table (requested_role text, state text, requested_at timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select r.requested_role, r.state, r.requested_at
  from public.role_requests r
  where r.user_email = lower(coalesce(auth.jwt() ->> 'email', '__nobody__'))
  order by r.requested_at desc;
$fn$;

revoke all on function public.my_account_requests() from public, anon;
grant execute on function public.my_account_requests() to authenticated;

-- --------------------------------------------------------------------------
-- Deciding
-- --------------------------------------------------------------------------

create or replace function public.list_account_requests()
returns table (user_email text, requested_role text, note text,
               requested_at timestamptz, state text)
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select r.user_email, r.requested_role, r.note, r.requested_at, r.state
  from public.role_requests r
  where public.has_permission('accounts.manage')
    and r.state = 'pending'
  order by r.requested_at asc;
$fn$;

revoke all on function public.list_account_requests() from public, anon;
grant execute on function public.list_account_requests() to authenticated;

-- Approving is what actually grants the role. Nothing else in this file
-- writes to user_roles, so there is one line in the system where a person
-- becomes something, and it is guarded by accounts.manage.
create or replace function public.decide_account_request(
  target_email text, role_key text, approve boolean
) returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  me     text := lower(coalesce(auth.jwt() ->> 'email', ''));
  target text := lower(coalesce(target_email, ''));
begin
  if not public.has_permission('accounts.manage') then
    raise exception 'not allowed';
  end if;
  if not exists (select 1 from public.role_requests r
                  where r.user_email = target
                    and r.requested_role = decide_account_request.role_key) then
    raise exception 'no such request';
  end if;

  update public.role_requests r
     set state = case when approve then 'approved' else 'declined' end,
         decided_by = me,
         decided_at = now()
   where r.user_email = target
     and r.requested_role = decide_account_request.role_key;

  if approve then
    insert into public.user_roles (user_email, role_key)
    values (target, decide_account_request.role_key)
    on conflict do nothing;
    return 'approved';
  end if;

  return 'declined';
end;
$fn$;

revoke all on function public.decide_account_request(text, text, boolean) from public, anon;
grant execute on function public.decide_account_request(text, text, boolean) to authenticated;

-- --------------------------------------------------------------------------
-- What a business may see
-- --------------------------------------------------------------------------
--
-- Their own seat requests, matched on the verified email, exactly as an
-- applicant reads their own application. seat_requests has had no select
-- policy at all until now; this adds one that can only ever return rows
-- carrying the caller's own address.

grant select (id, created_at, seats, hours, weekly, blocks, timezone,
              name, company, email, phone, notes)
  on public.seat_requests to authenticated;

drop policy if exists "read your own seat requests" on public.seat_requests;
create policy "read your own seat requests"
  on public.seat_requests for select to authenticated
  using (
    lower(email) = lower(coalesce(auth.jwt() ->> 'email', '__nobody__'))
    or public.has_permission('applications.view_all')
  );

-- ==========================================================================
-- Check it worked
-- ==========================================================================
--
-- role_requests must be rls_enabled with no policies: the functions are the
-- only door. seat_requests should now show INSERT and SELECT and nothing more.

select c.relname as table_name,
       c.relrowsecurity as rls_enabled,
       coalesce(string_agg(distinct p.polcmd::text, ','), 'none') as policies
from pg_class c
left join pg_policy p on p.polrelid = c.oid
where c.relname in ('role_requests', 'seat_requests')
group by c.relname, c.relrowsecurity
order by c.relname;

-- anon must still hold insert and nothing else on seat_requests.
select grantee, string_agg(distinct privilege_type, ',' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_name = 'seat_requests' and grantee in ('anon', 'authenticated')
group by grantee;

-- Nobody should be able to request their way to admin or staff: this is
-- enforced by a check constraint, so the list is fixed rather than filtered.
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conname = 'role_requests_askable';
