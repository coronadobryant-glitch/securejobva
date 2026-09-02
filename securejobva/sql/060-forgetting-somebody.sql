-- 060 — forgetting somebody
--
-- Run after: 059
-- Safe to re-run: yes
-- Also needed: nothing in the dashboard.
--
-- ==========================================================================
-- THE PRODUCT CAN HIRE SOMEBODY AND CANNOT FORGET THEM
-- ==========================================================================
--
-- Every delete control in the portal is for a client logo (015) or a payment
-- (055). An application, a placement, a client and a contact message can only
-- be removed from the Supabase dashboard — so a person who asks to be
-- forgotten is honoured by hand, in SQL, by whoever is willing to write a
-- guarded DO block against the right id.
--
-- That was tolerable while the only rows were test rows. It stopped being
-- tolerable the moment there were four real applicants in the queue, because
-- the orphan-CV panel in /admin exists precisely to make that request
-- answerable and the rows it points at could not be answered at all.
--
-- ==========================================================================
-- WHAT THIS DOES NOT GRANT
-- ==========================================================================
--
-- interview_slots gets nothing. 057 gives that table SELECT and nothing else
-- on purpose, and does every write through one of five functions, because two
-- people write different columns of the same row and a column grant goes to
-- everybody signed in rather than to a person. withdraw_interview_slot()
-- already removes an offered time. A delete grant here would be a way around
-- all of that for no gain.
--
-- timesheets and placement_billing get nothing either. They cascade from the
-- placement, and a week that can be deleted on its own is a bill that can be
-- quietly reduced after it was agreed.
--
-- The permission is applications.edit, not applications.view_all. Reading the
-- queue and emptying it are not the same right, and 055 already draws that
-- line for money.

-- ==========================================================================
-- 1. A RECORD THAT IT HAPPENED, CARRYING NOTHING ABOUT WHO
-- ==========================================================================
--
-- Delete somebody completely and you also delete the evidence that you
-- honoured their request. This is the row that survives it: what kind of thing
-- went, when, and which signed-in account did it.
--
-- No name, no address, no message body, no content of any kind. The subject_id
-- is the primary key of a row that no longer exists, kept because a log you
-- cannot correlate with anything is a log nobody can act on. It is the one
-- field with a tradeoff in it, and if you would rather not keep even that,
-- drop the column — nothing below reads it.

create table if not exists public.deletion_log (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null,
  subject_id uuid,
  removed_by text not null,
  removed_at timestamptz not null default now(),

  constraint deletion_log_kind_check check (
    kind in ('application', 'placement', 'client', 'contact_message')
  )
);

create index if not exists deletion_log_when_idx
  on public.deletion_log (removed_at desc);

comment on table public.deletion_log is
  'One row per deletion made through the product. Deliberately carries no name, address or content — only what kind of thing went, when, and who did it.';

-- ==========================================================================
-- 2. WRITTEN BY THE DATABASE, NOT BY THE PAGE
-- ==========================================================================
--
-- A trigger rather than a second call from /admin, and the difference matters:
-- a page that writes its own audit row is a page that can be changed to stop
-- writing it, and a delete that half-fails leaves the log disagreeing with the
-- table. This fires inside the same statement, so the row and its tombstone
-- are one transaction or neither.
--
-- security definer, so the log is written by the owner. No role holds INSERT
-- on deletion_log at all, which is what makes "never written by a page" true
-- rather than merely intended — the same arrangement 055 uses for recorded_by.
--
-- A cascade fires its own triggers, so removing an applicant who had a
-- placement logs both the application and the placement. That is not double
-- counting: both rows really were removed, and a log that quietly omits the
-- second one would misreport what the product did.

create or replace function public.log_deletion()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  insert into public.deletion_log (kind, subject_id, removed_by)
  values (tg_argv[0], old.id, coalesce(auth.jwt() ->> 'email', 'somebody'));
  return old;
end
$fn$;

revoke all on function public.log_deletion() from public, anon, authenticated;

drop trigger if exists applications_log_deletion on public.applications;
create trigger applications_log_deletion
  before delete on public.applications
  for each row execute function public.log_deletion('application');

drop trigger if exists placements_log_deletion on public.placements;
create trigger placements_log_deletion
  before delete on public.placements
  for each row execute function public.log_deletion('placement');

drop trigger if exists clients_log_deletion on public.clients;
create trigger clients_log_deletion
  before delete on public.clients
  for each row execute function public.log_deletion('client');

drop trigger if exists contact_messages_log_deletion on public.contact_messages;
create trigger contact_messages_log_deletion
  before delete on public.contact_messages
  for each row execute function public.log_deletion('contact_message');

-- ==========================================================================
-- 3. THE GRANT NOBODY ASKED FOR, TAKEN OFF FIRST
-- ==========================================================================
--
-- 059 is in this repo because 055, 056 and 057 revoked from anon only, and
-- Supabase grants every privilege on a new public table to BOTH roles. Row
-- level security caught almost all of it and does not cover TRUNCATE, which
-- never visits a row and so is checked against the table privilege alone.
--
-- So: both roles, before anything is given back. tools/check.mjs reads this
-- folder and fails the build on any table that is not revoked from both.

revoke all on public.deletion_log from anon, authenticated;

alter table public.deletion_log enable row level security;

grant select on public.deletion_log to authenticated;

drop policy if exists "staff read the deletion log" on public.deletion_log;
create policy "staff read the deletion log"
  on public.deletion_log for select to authenticated
  using (public.has_permission('applications.view_all'));

-- Deliberately no INSERT, UPDATE or DELETE policy and no grant of any of them.
-- The log is written by the trigger above and is not editable by anybody
-- signed in, including whoever wrote the row.

-- ==========================================================================
-- 4. THE DELETES THEMSELVES
-- ==========================================================================
--
-- Each of these is the shape 055 already uses for a payment: a table grant,
-- and a policy naming the permission. The rows that hang off them are already
-- `on delete cascade` from the migration that created them, so one delete
-- takes the whole thing and there is nothing to tidy up by hand.

-- The person. Cascades to application_tracking, application_notes and the note
-- log, application_socials, application_disc, application_assessment,
-- application_documents, application_public, leave_requests, timesheets and
-- their days, and placements with their billing, pay, starts and swaps.
--
-- NOT auth.users and NOT user_roles: those key off the address rather than the
-- application, so an account that is also staff keeps its role, and the same
-- address can apply again — which is what 027's one-application rule needs in
-- order to ever let anybody back.
grant delete on public.applications to authenticated;

drop policy if exists "staff remove an application" on public.applications;
create policy "staff remove an application"
  on public.applications for delete to authenticated
  using (public.has_permission('applications.edit'));

-- A match that never happened. Takes its rates, the start confirmation, any
-- swap requests, and the interview times offered on it.
grant delete on public.placements to authenticated;

drop policy if exists "staff remove a placement" on public.placements;
create policy "staff remove a placement"
  on public.placements for delete to authenticated
  using (public.has_permission('applications.edit'));

-- A business that never began. client_payments references clients ON DELETE
-- RESTRICT, so a client who has paid us cannot be removed until the payment
-- is — the right refusal for real money, and 055 already gives you the control
-- to remove a payment deliberately.
grant delete on public.clients to authenticated;

drop policy if exists "staff remove a client" on public.clients;
create policy "staff remove a client"
  on public.clients for delete to authenticated
  using (public.has_permission('applications.edit'));

-- client_private gets nothing. 039 makes it ON DELETE CASCADE against the
-- client, so it goes on its own — and a grant that is never the thing doing
-- the work is a grant somebody can use for something else. 059 is in this
-- repo because of privileges nobody asked for.

-- A message from somebody who asked. 010 grants staff select and update and
-- nothing else, which is why /admin has Reply and Mark answered and no third
-- button — and why the same gap applied to a real message from somebody
-- asking to be forgotten.
grant delete on public.contact_messages to authenticated;

drop policy if exists "staff remove a contact message" on public.contact_messages;
create policy "staff remove a contact message"
  on public.contact_messages for delete to authenticated
  using (public.has_permission('applications.edit'));

-- ==========================================================================
-- THE ONE THING SQL STILL DOES NOT REACH
-- ==========================================================================
--
-- The CV itself. Deleting application_documents removes the row that points at
-- the file; the object stays in the applicant-docs bucket, because storage is
-- not the database and no foreign key crosses between them.
--
-- 013 already gives staff DELETE on storage.objects in that bucket, so the
-- rights are there. What was missing was anything that used them at the same
-- moment as the row — and a deletion needing a second, separate, forgettable
-- step in another tab is a deletion somebody will believe they made. /admin
-- now reads the paths BEFORE removing the application, deletes the objects
-- after, and reports the two outcomes separately rather than showing one tick
-- that means half of it.

-- ==========================================================================
-- Check it worked
-- ==========================================================================

-- anon must hold nothing on the new table. Empty is the pass.
select privilege_type
from information_schema.role_table_grants
where table_name = 'deletion_log' and grantee = 'anon';

-- And nobody signed in may write it. SELECT is the only row that should come
-- back here — an INSERT would mean a page could forge a tombstone, and an
-- UPDATE or DELETE would mean it could remove one.
select grantee, privilege_type
from information_schema.role_table_grants
where table_name = 'deletion_log'
  and grantee in ('anon', 'authenticated')
order by grantee, privilege_type;

-- The four deletes, and who may use them. Each must show exactly one policy.
select c.relname as table_name, p.polname as policy
from pg_policy p
join pg_class c on c.oid = p.polrelid
where p.polcmd = 'd'
  and c.relname in ('applications', 'placements', 'clients', 'contact_messages')
order by c.relname;

-- The tombstone triggers. Four rows.
select c.relname as table_name, t.tgname as trigger_name
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
where t.tgname like '%\_log\_deletion' and not t.tgisinternal
order by c.relname;

-- Nothing has been deleted yet, so this is empty on the first run. After the
-- first removal it is the record that it happened.
select kind, subject_id, removed_by, removed_at
from public.deletion_log
order by removed_at desc
limit 20;

insert into public.schema_migrations (n) values (60) on conflict (n) do nothing;
