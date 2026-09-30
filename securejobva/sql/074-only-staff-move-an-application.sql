-- 074 — only staff move an application
--
-- Run after: 073
-- Safe to re-run: yes
-- Also needed: nothing in the dashboard.
--
-- ==========================================================================
-- WHAT 020 BELIEVED, AND WHAT IS ACTUALLY TRUE
-- ==========================================================================
--
-- 020 put back the staff grant on (status, status_changed_at) and explained,
-- at length, that "the column list is the only thing standing between a
-- signed-in applicant and status = 'approved' on their own row".
--
-- The column list cannot do that job, because it is not the applicant's column
-- list. A grant goes to a ROLE, and staff and applicants are the same role:
-- both sign in, both are `authenticated`, and what makes somebody staff is a
-- row in user_roles, which no grant can see. So 020's grant reached every
-- applicant as well. Then 006's own-row UPDATE policy — which checks that the
-- row is hers and says nothing about which columns — let her use it.
--
-- The result, with her own token and no console tricks beyond one request:
--
--   PATCH /rest/v1/applications?id=eq.<her id>   {"status":"hired"}
--
-- passes the 006 policy (it is her row) and the 020 grant (the column is
-- granted to authenticated). /hub opens, because hub.html gates on
-- a.status === "hired"; the notice board opens, because is_hired() in 046
-- reads the same column; 031's trigger sees a status change and api/notify
-- mails her the hired email. Or she skips the assessment by moving herself to
-- interview, or turns 'declined' back into 'applied'. And because
-- status_changed_at is on the same grant, she can backdate it and shorten
-- 027's three-month wait after a decline to nothing.
--
-- ==========================================================================
-- WHY A TRIGGER, AND NOT A REVOKE
-- ==========================================================================
--
-- The obvious fix — revoke update (status, status_changed_at) from
-- authenticated — takes the column away from staff too, for the same reason
-- the grant reached applicants: they are one role. Every stage change in
-- /admin would start failing with 42501, which is exactly the outage 020 was
-- written to end. 064 met the identical problem on the assessment figures and
-- reached the same answer: the distinction wanted is a permission, not a role,
-- and only a trigger can ask for a permission.
--
-- So the grant stays, the policies stay, and a BEFORE UPDATE trigger refuses
-- the write when the caller cannot pass has_permission('applications.edit') —
-- the same test 004's "staff move an application along" policy already uses.
--
-- ==========================================================================
-- current_user, NOT auth.uid(), DECIDES WHO IS ASKING
-- ==========================================================================
--
-- This is the part that has to be right, because two legitimate writers of
-- this column are NOT staff:
--
--   advance_on_assessment()   063. Fires when an applicant's own submitted
--                             assessment passes and moves HER to interview.
--   the SQL editor            cleanup-test-data.sql rewinds stages by hand.
--
-- In the first, auth.uid() and auth.jwt() are still the applicant's — the
-- claims belong to the request, and a SECURITY DEFINER function does not
-- change the request. Asking has_permission() there would say no, and every
-- passing assessment would fail to advance. What a definer function DOES
-- change is current_user: inside advance_on_assessment it is the function's
-- owner (postgres), not `authenticated`.
--
-- So this function is deliberately SECURITY INVOKER (the default — it is
-- written out below so nobody "fixes" it to match its neighbours). Invoker
-- means current_user inside it is whoever ran the UPDATE:
--
--   'authenticated' or 'anon'   a request from a page, straight at the table.
--                                Held to the permission.
--   anything else               a definer function (owner), the SQL editor
--                                (postgres), the service role. Let through, as
--                                every one of those is already a deliberate,
--                                checked path.
--
-- tools/check.mjs has no opinion on invoker trigger functions, and this one
-- is granted to nobody — a trigger does not need EXECUTE to fire.
--
-- ==========================================================================
-- THE STAMP MOVES INTO THE DATABASE TOO
-- ==========================================================================
--
-- status_changed_at is what /status shows as the date an application last
-- moved and what 031's decline email uses to work out when she may apply
-- again. Until now it came from the browser's clock in /admin, so a staff
-- laptop set a day wrong moved somebody's re-apply date by a day, in an email.
--
-- For a request from a page, the trigger now writes it: now() when the status
-- actually changes, and the old value otherwise — whatever the page sent.
-- /admin can keep sending it (tools/check.mjs still asks it to, and nothing
-- breaks); it is simply no longer believed. The SQL editor and definer
-- functions keep writing their own, because the rewind in
-- cleanup-test-data.sql sets a deliberate past date and must keep working.
--
-- seat_requests carries the identical grant pair from 012/020 and gets the
-- identical guard. Nobody but staff has an UPDATE policy there today, so this
-- is the stamp half more than the guard half — but the day a client policy is
-- added, it will not also hand them the status column.

do $pre$
begin
  if to_regprocedure('public.has_permission(text)') is null then
    raise exception
      'sql/004 has not been run on this database. It defines has_permission(), which this file asks.';
  end if;
end
$pre$;

-- ==========================================================================
-- THE GUARD
-- ==========================================================================

create or replace function public.status_is_staffs_to_set()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $fn$
begin
  -- Not a request from a page: a definer function, the SQL editor, the
  -- service role. See the header for why this is current_user and not the
  -- token.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if new.status is distinct from old.status then
    -- Raises rather than quietly putting the old value back, for the reason
    -- 064 gives: a refusal that pretends to succeed teaches whoever is probing
    -- that nothing is watching. Staff never see this — the policy already
    -- required the same permission of them.
    if not public.has_permission('applications.edit') then
      raise exception 'only SecureJobVA can move an application to another stage'
        using hint = 'sjva-status-is-staffs';
    end if;
    new.status_changed_at := now();
  else
    -- No stage change, so no reason for the date to move. This is also what
    -- stops a backdated status_changed_at on its own.
    new.status_changed_at := old.status_changed_at;
  end if;

  return new;
end;
$fn$;

revoke all on function public.status_is_staffs_to_set() from public, anon, authenticated;

-- Named so it is obvious in a trigger list what it is for. BEFORE UPDATE
-- triggers fire in name order; this one does not care where it lands, because
-- a raise unwinds every other trigger in the statement whatever order they ran
-- in, and the stamp it writes is read by 031's AFTER trigger, which always
-- runs later.
drop trigger if exists applications_status_is_staffs on public.applications;
create trigger applications_status_is_staffs
  before update on public.applications
  for each row execute function public.status_is_staffs_to_set();

drop trigger if exists seat_requests_status_is_staffs on public.seat_requests;
create trigger seat_requests_status_is_staffs
  before update on public.seat_requests
  for each row execute function public.status_is_staffs_to_set();

-- ==========================================================================
-- Check it worked
-- ==========================================================================

-- Two rows: one trigger on each table, both BEFORE UPDATE.
select c.relname as table_name, t.tgname as trigger_name,
       case when (t.tgtype::int & 2) = 2 then 'before' else 'after' end as timing
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
where not t.tgisinternal
  and t.tgname in ('applications_status_is_staffs', 'seat_requests_status_is_staffs')
order by c.relname;

-- The function must be SECURITY INVOKER. If this says true, somebody made it a
-- definer, current_user became the owner for every caller, and the guard now
-- lets everybody through. Must be false.
select prosecdef as is_security_definer
from pg_proc
where proname = 'status_is_staffs_to_set' and pronamespace = 'public'::regnamespace;

-- The grant is unchanged on purpose — this lists status and status_changed_at
-- beside the applicant's own columns, and that is now the expected answer.
-- What changed is what happens when a non-staff session writes one:
--
--   -- as a signed-in applicant, on her own row, through the API:
--   PATCH /rest/v1/applications?id=eq.<hers>   {"status":"hired"}
--   -- 400, message: only SecureJobVA can move an application to another stage
--   --      hint:    sjva-status-is-staffs
--
--   -- as staff, from /admin: unchanged, still works, and the date is now()
--   -- whatever the page sent.
--
--   -- a passing assessment, through advance_on_assessment(): unchanged.
select string_agg(column_name, ', ' order by column_name) as authenticated_can_update
from information_schema.column_privileges
where table_name = 'applications'
  and grantee = 'authenticated'
  and privilege_type = 'UPDATE';

-- Anybody whose stage moved without a staff member doing it would have left
-- no mark this file can find after the fact — status_changed_at was hers to
-- write. What can be looked at: every hired applicant who has no placement and
-- was never at interview in the note log. Read the names; a real hire will be
-- obvious to you, a self-promoted one will not have a placement or a note.
select a.id, a.name, a.status, a.status_changed_at,
       exists (select 1 from public.placements p where p.application_id = a.id) as has_placement
from public.applications a
where a.status in ('interview', 'approved', 'hired')
order by a.status_changed_at desc nulls last
limit 50;

insert into public.schema_migrations (n) values (74) on conflict (n) do nothing;
