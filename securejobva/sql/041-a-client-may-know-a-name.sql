-- 041 — a client may know who is working for them
--
-- Run after: 040
-- Safe to re-run: yes
-- Also needed: nothing in the dashboard.
--
-- On /seats, a client looking at the person working for them saw
--
--   your assistant · with you since Aug 24, 2026 · 40 hours a week
--
-- where a name should be. The exact mirror of 039, in the other direction,
-- found the same way — by signing in as the person and looking.
--
-- ==========================================================================
-- WHY NOT SIMPLY A POLICY
-- ==========================================================================
--
-- /seats asks for the placement with the assistant nested in:
--
--   placements?select=id,status,...,applications(name)
--
-- A client is neither the owner of that application nor staff, so the embed
-- comes back null and the page falls through to its default string.
--
-- 039 fixed the same shape by adding a policy — but it could only do that
-- after moving the private columns out of clients first, because
--
--   grant select on public.applications to authenticated     -- 018
--
-- is table-wide, exactly as it was on clients. A policy letting a client read
-- an application row hands them the email, the phone number, the CV link, the
-- region, the payout method and every skill rating with it. Column grants
-- cannot separate them: an assistant and a client are both `authenticated`,
-- and a grant separates roles, not people.
--
-- The 039 move — split the table — is not available here. applications is the
-- core table of this system; /status, /admin and /hub all read it, and cutting
-- it in half to expose one field would be a large change made for a small
-- reason.
--
-- So the smallest honest thing instead: one projection holding the single
-- field a client is entitled to, kept in step by trigger so it cannot drift.
-- Nothing else about that person is reachable, and nothing anywhere else has
-- to move.

create table if not exists public.application_public (
  application_id uuid primary key
    references public.applications (id) on delete cascade,
  name           text not null default ''
);

-- ==========================================================================
-- KEPT IN STEP, NOT COPIED ONCE
-- ==========================================================================
--
-- A copy taken at match time is a name that goes stale the first time somebody
-- corrects a spelling, and 032 already rejected exactly that shape when it
-- refused to write a client's name onto each placement. So this is maintained
-- rather than duplicated: the applications row stays the only place a name is
-- edited, and this follows it.

create or replace function public.mirror_application_name()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  insert into public.application_public (application_id, name)
  values (new.id, coalesce(new.name, ''))
  on conflict (application_id) do update
    set name = excluded.name;
  return new;
end;
$fn$;

revoke all on function public.mirror_application_name() from public, anon, authenticated;

drop trigger if exists application_mirrors_its_name on public.applications;
create trigger application_mirrors_its_name
  after insert or update of name on public.applications
  for each row
  execute function public.mirror_application_name();

-- Everybody already here. Idempotent, so a re-run simply refreshes it.
insert into public.application_public (application_id, name)
select a.id, coalesce(a.name, '') from public.applications a
on conflict (application_id) do update set name = excluded.name;

-- ==========================================================================
-- WHO MAY READ IT
-- ==========================================================================
--
-- The mirror of is_client_assistant from 039, asked from the other side: is
-- this person working for a business I am the contact for.
--
-- Ended placements count, for the same reason they do in 039. A client
-- reading last quarter's approved week should see whose week it was rather
-- than a blank where the name used to be.

create or replace function public.is_application_client(app uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1 from public.placements pl
    where pl.application_id = app and public.is_client_contact(pl.client_id)
  );
$fn$;

revoke all on function public.is_application_client(uuid) from public, anon;
grant execute on function public.is_application_client(uuid) to authenticated;

alter table public.application_public enable row level security;

revoke all on public.application_public from anon, authenticated;
grant select on public.application_public to authenticated;

-- No insert or update grant to anybody. The trigger above is the only writer,
-- and it is security definer, so it does not need one. A name nobody can edit
-- here cannot disagree with the name on the application.

drop policy if exists "a name is readable by the two people it concerns" on public.application_public;
create policy "a name is readable by the two people it concerns"
  on public.application_public for select to authenticated
  using (
    public.owns_application(application_id)
    or public.is_application_client(application_id)
    or public.has_permission('applications.view_all')
  );

-- ==========================================================================
-- Check it worked
-- ==========================================================================
--
-- One row per application, and every name matching its source.

select
  (select count(*) from public.applications)        as applications,
  (select count(*) from public.application_public)  as mirrored,
  (select count(*) from public.applications a
     join public.application_public p on p.application_id = a.id
    where coalesce(a.name, '') is distinct from p.name) as disagreeing;

-- The trigger is on, and on name only — an update to a status or a phone
-- number has no business rewriting this.

select tgname, pg_get_triggerdef(oid) as definition
from pg_trigger
where tgrelid = 'public.applications'::regclass
  and not tgisinternal
  and tgname = 'application_mirrors_its_name';

-- Nobody but the trigger can write it.

select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'application_public'
order by grantee, privilege_type;
