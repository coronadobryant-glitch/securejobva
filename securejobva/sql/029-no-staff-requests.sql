-- 029 — staff is granted, not requested
--
-- Run after: 017
-- Safe to re-run: yes
-- Also needed: nothing in the dashboard.
--
-- /status offered "I work at SecureJobVA — a staff account" to anybody signed
-- in, which put a tickbox in front of every applicant inviting them to ask for
-- the internal desk. It never granted anything: it made a request somebody then
-- had to read and refuse. That is work created by a control that should not
-- have existed.
--
-- The tickbox is gone from the page. This is the other half, and it is the half
-- that matters — the page is a suggestion and the function is the rule. Anyone
-- can call an RPC directly with the public key; the form is not the only way in.
--
-- 017's list was ('business', 'applicant', 'staff') with a note explaining that
-- admin was left out on purpose. staff now joins admin on that list, for the
-- same reason: the accounts that can see other people's applications are given
-- by a person, in /admin, under Accounts.

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

  -- admin and staff are both absent on purpose: anything that can read other
  -- people's applications is granted by an administrator, never asked for.
  if role_key not in ('business', 'applicant') then
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

-- Requests already made are left alone. Somebody who asked before today is
-- still in the list waiting on an answer, and deleting their row would be
-- deciding it for them without saying so.

-- ==========================================================================
-- Check it worked
-- ==========================================================================
--
-- Should raise: that account type cannot be requested.

do $$
begin
  begin
    perform public.request_account_type('staff', 'should be refused');
    raise notice 'PROBLEM: a staff request was accepted';
  exception
    when others then
      if sqlerrm like '%cannot be requested%' then
        raise notice 'ok: staff is refused — %', sqlerrm;
      else
        raise notice 'refused for a different reason: %', sqlerrm;
      end if;
  end;
end $$;

-- Anything still waiting, which this does not touch.
select requested_role, state, count(*) as rows
from public.role_requests
group by requested_role, state
order by requested_role, state;
