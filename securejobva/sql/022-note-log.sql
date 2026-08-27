-- 022 — the notes log the deployed /admin has been asking for
--
-- Run after: 004
-- Safe to re-run: yes
-- Also needed: nothing in the dashboard.
--
-- /admin is failing to load with
--
--   PGRST205 — Could not find the table 'public.application_note_log'
--   Perhaps you meant the table 'public.application_notes'
--
-- and PostgREST is right that they are nearly the same name and wrong that they
-- are the same idea. application_notes from 003 holds ONE note per application,
-- upserted in place, with no author and no history. What the page is asking for
-- is a log: many notes per application, each stamped with who wrote it and
-- when, appended and never rewritten.
--
-- READ THIS BEFORE PASTING, because the table is the smaller half of the
-- problem. The page asking for it is not in either repo. It is not in main and
-- it is not in origin/main — it exists only as a file somebody deployed to
-- production by hand. So production has been running code that no branch
-- contains, which is why a table nobody wrote a migration for is being queried
-- by a page nobody can diff.
--
-- This file makes /admin work again. It does not fix that, and the next honest
-- deploy from main will take the notes log away again, because main has no such
-- feature. Getting that source back into git is the real repair.
--
-- The shape below is read off the deployed page's own queries rather than
-- guessed:
--
--   POST   { application_id, note }
--   SELECT id, application_id, note, author, created_at
--          order by created_at desc
--
-- so id, author and created_at are all things the database has to supply.

create table if not exists public.application_note_log (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null
    references public.applications (id) on delete cascade,
  note           text not null,
  author         text not null default '',
  created_at     timestamptz not null default now(),
  constraint application_note_log_sane check (length(note) between 1 and 4000)
);

create index if not exists application_note_log_app_idx
  on public.application_note_log (application_id, created_at desc);

-- ==========================================================================
-- WHO WROTE IT IS NOT THE PAGE'S TO SAY
-- ==========================================================================
--
-- The page sends application_id and note, and nothing else — the comment beside
-- its own fetch says the row needs "the author and the timestamp the database
-- chose, not the ones this page would invent". That is the right instinct, and
-- a default alone would not hold it: INSERT is granted on the table, so a
-- signed-in staff member could simply send an author of somebody else's and
-- sign a note in their name.
--
-- A trigger overwrites it either way, so what arrives is ignored rather than
-- trusted. Same shape as keep_consent_history in 006: the rule lives next to
-- the data, not in the page.

create or replace function public.stamp_note_author()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  new.author := coalesce(auth.jwt() ->> 'email', '');
  return new;
end;
$fn$;

drop trigger if exists application_note_log_author on public.application_note_log;
create trigger application_note_log_author
  before insert on public.application_note_log
  for each row execute function public.stamp_note_author();

-- ==========================================================================
-- WHO MAY READ AND WRITE IT
-- ==========================================================================
--
-- These are private staff notes about named applicants — the most sensitive
-- text in the database after the CVs, and the one thing in /admin an applicant
-- must never see about themselves.
--
-- Gated on the applications.note permission from 004 rather than on is_admin(),
-- for two reasons. It is the permission that exists for exactly this — "Read
-- and write private notes" — and it is what the deployed page already checks
-- before it asks: can("applications.note"). Gating the table on anything else
-- means a staff member sees the box and gets nothing back from it.
--
-- No UPDATE and no DELETE, to anybody. A log that can be edited afterwards is
-- not a log, and if a note is wrong the correction is another note.

alter table public.application_note_log enable row level security;
revoke all on public.application_note_log from anon, authenticated;
grant select, insert on public.application_note_log to authenticated;

drop policy if exists "note-keepers read the log" on public.application_note_log;
create policy "note-keepers read the log"
  on public.application_note_log for select to authenticated
  using (public.has_permission('applications.note'));

drop policy if exists "note-keepers append to the log" on public.application_note_log;
create policy "note-keepers append to the log"
  on public.application_note_log for insert to authenticated
  with check (public.has_permission('applications.note'));

-- ==========================================================================
-- Check it worked
-- ==========================================================================
--
-- One row: rls_enabled true, two policies, and exactly SELECT and INSERT
-- granted to authenticated. anon must not appear at all.

select c.relname as table_name,
       c.relrowsecurity as rls_enabled,
       coalesce(string_agg(distinct p.polname, ' | '), 'none') as policies
from pg_class c
left join pg_policy p on p.polrelid = c.oid
where c.relname = 'application_note_log'
group by c.relname, c.relrowsecurity;

select grantee, string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_name = 'application_note_log' and grantee in ('anon', 'authenticated')
group by grantee;
