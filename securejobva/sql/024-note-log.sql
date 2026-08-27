-- 024 — notes become a log
--
-- Run after: 022
-- Safe to re-run: yes
-- Also needed: nothing in the dashboard.
--
-- RENUMBERED FROM 020 IN THE MERGE, and it is worth knowing why before running
-- it. /admin went down with `Could not find the table public.application_note_log`
-- while this file was sitting unpushed on the other machine, so 022 was written
-- from the deployed page's queries to get the portal back. The two designs are
-- the same design: same table, same trigger name, same permission gate, arrived
-- at separately. This one is the better of the two — it stamps created_at and
-- it carries the old notes across, neither of which 022 does — so this is the
-- one that stands, and it runs cleanly over what 022 already made.
--
-- application_notes holds one row per application, keyed on application_id, so
-- every save overwrote the last one. Two people working the same applicant
-- silently erased each other, and there was no way to see what a note said
-- last week or who wrote it.

-- ==========================================================================
-- APPEND, NEVER OVERWRITE
-- ==========================================================================
--
-- Each note is its own row. Nothing updates one, so there is no way for a
-- second person to lose the first person's words by opening the same page.

create table if not exists public.application_note_log (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  note           text not null,
  author         text,
  created_at     timestamptz not null default now(),

  constraint application_note_log_sane check (
    length(btrim(note)) between 1 and 4000 and
    coalesce(length(author), 0) <= 320
  )
);

alter table public.application_note_log enable row level security;
revoke all on public.application_note_log from anon, authenticated;
grant select, insert on public.application_note_log to authenticated;

-- Deliberately no update and no delete. A note is a record of what somebody
-- thought at the time, and a log you can quietly edit is not a log. If one is
-- wrong the answer is another note saying so, which is also the honest thing
-- for anybody reading it later.

-- 022 made the same two policies under different names. Postgres ORs permissive
-- policies together, so leaving them would not widen anything — they test the
-- identical permission — but four policies where two are meant is the kind of
-- thing that reads as a mistake to whoever finds it next. Added in the merge.
drop policy if exists "note-keepers read the log" on public.application_note_log;
drop policy if exists "note-keepers append to the log" on public.application_note_log;

drop policy if exists "staff read the note log" on public.application_note_log;
create policy "staff read the note log"
  on public.application_note_log for select to authenticated
  using (public.has_permission('applications.note'));

drop policy if exists "staff add notes" on public.application_note_log;
create policy "staff add notes"
  on public.application_note_log for insert to authenticated
  with check (public.has_permission('applications.note'));

-- --------------------------------------------------------------------------
-- Who wrote it is not the page's to say
-- --------------------------------------------------------------------------
--
-- Same reasoning as scored_by in 008. The browser knows which address is
-- signed in, but a value the page sends is a value the page can get wrong, and
-- on a log the author is the part that has to be true. The database takes it
-- from the verified token and overwrites whatever arrived.

create or replace function public.stamp_note_author()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  new.author := coalesce(auth.jwt() ->> 'email', 'unknown');
  new.created_at := now();
  return new;
end;
$fn$;

drop trigger if exists application_note_log_author on public.application_note_log;
create trigger application_note_log_author
  before insert on public.application_note_log
  for each row execute function public.stamp_note_author();

-- --------------------------------------------------------------------------
-- Carry the existing notes in
-- --------------------------------------------------------------------------
--
-- Whatever is in the old table becomes the first entry of each log, so nothing
-- written before today disappears. The author is unknown because the old table
-- never recorded one — which is the point of this file.
--
-- The trigger would stamp author and created_at over these, so it is disabled
-- for the copy: a note from last week should not claim to have been written
-- just now by whoever ran the migration.

alter table public.application_note_log disable trigger application_note_log_author;

insert into public.application_note_log (application_id, note, author, created_at)
  select n.application_id,
         n.note,
         'imported — author not recorded',
         coalesce(n.updated_at, now())
  from public.application_notes n
  where coalesce(btrim(n.note), '') <> ''
    and not exists (
      select 1 from public.application_note_log l
      where l.application_id = n.application_id
        and l.author = 'imported — author not recorded'
    );

alter table public.application_note_log enable trigger application_note_log_author;

-- public.application_notes is left in place and stops being written. It is the
-- only copy of the pre-import state if the import ever needs checking.

create index if not exists application_note_log_app_idx
  on public.application_note_log (application_id, created_at desc);

-- ==========================================================================
-- Check it worked
-- ==========================================================================
--
-- Two policies, select and insert, and no update or delete. If update ever
-- appears here, the log can be rewritten and stops being evidence.

select coalesce(string_agg(distinct p.polcmd::text, ','), 'none') as commands
from pg_class c
left join pg_policy p on p.polrelid = c.oid
where c.relname = 'application_note_log';

select grantee, string_agg(distinct privilege_type, ',' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_name = 'application_note_log' and grantee in ('anon', 'authenticated')
group by grantee;

-- What came across, and what has been written since.
select author, count(*) as notes
from public.application_note_log
group by author
order by count(*) desc;
