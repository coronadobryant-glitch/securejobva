-- 077 — an upload belongs to its moment
--
-- Run after: 076
-- Safe to re-run: yes
-- Also needed: nothing in the dashboard.
--
-- Two findings about the same folder, one from each side of signing in.
--
-- ==========================================================================
-- 1. ANON COULD STILL WRITE INTO ANYBODY'S FOLDER
-- ==========================================================================
--
-- 013 let anon upload into any folder shaped like a UUID. 047 narrowed that to
-- a folder that is a real application, with at most five files in it. What is
-- left is this: anon can upload into EVERY real application's folder, for as
-- long as that application exists, as long as the id is known. Ids are v4 and
-- not guessable, but they are not secret either — they travel in links, in
-- /admin, in exports — and a file dropped into somebody's folder months after
-- she applied sits in her document list as though she sent it.
--
-- The page never needs that. careers.html uploads the CV straight after the
-- row it belongs to has been written, in the same visit, with the publishable
-- key; after that she is signed in, and 013's "owners add to their own folder"
-- is the path for anything she adds later. So anon's window is now the hour
-- after the application was created. An hour, not a minute, because a queued
-- application (careers.html parks rows that fail and re-sends them later)
-- writes its row whenever the queue drains, and the upload follows that write
-- rather than the first attempt — created_at is stamped by the insert that
-- actually landed, so the hour starts then.
--
-- ANON, BY THE TOKEN. The trigger has to be SECURITY DEFINER to read
-- applications, which makes current_user its owner for everybody, so the
-- caller's role is read from the token instead. Storage sets the same
-- request.jwt.claims that PostgREST does — 013's own policies read auth.uid()
-- through it — and the publishable key's token says role: anon. A dashboard
-- upload carries no token at all and is not held to the window.
--
-- A trigger beside 047's rather than a new body for 047's function, so 047
-- keeps its own job (the folder is real, five files) and this one has one job
-- (anon, only while the form is warm).

do $pre$
begin
  if to_regclass('public.application_documents') is null then
    raise exception
      'sql/013 has not been run on this database. It creates application_documents.';
  end if;
  if to_regprocedure('public.owns_application(uuid)') is null then
    raise exception
      'sql/026 has not been run on this database. It defines owns_application().';
  end if;
end
$pre$;

create or replace function public.anon_upload_while_the_form_is_open()
returns trigger
language plpgsql
security definer
set search_path = public, storage, pg_temp
as $fn$
declare
  folder  text;
  created timestamptz;
begin
  if new.bucket_id is distinct from 'applicant-docs' then
    return new;
  end if;

  -- Signed in, staff, or the dashboard: not this trigger's question.
  if coalesce(auth.jwt() ->> 'role', '') <> 'anon' then
    return new;
  end if;

  folder := (storage.foldername(new.name))[1];

  -- 047's trigger refuses a folder that is not an application, so a folder
  -- that fails to parse here has already been refused there. Checked again
  -- only so this function never casts garbage to a uuid.
  if folder is null
     or folder !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'that is not a document folder';
  end if;

  select a.created_at into created
  from public.applications a where a.id = folder::uuid;

  if created is null or created < now() - interval '1 hour' then
    raise exception 'sign in to add a document to an application'
      using hint = 'sjva-sign-in-to-upload';
  end if;

  return new;
end;
$fn$;

revoke all on function public.anon_upload_while_the_form_is_open()
  from public, anon, authenticated;

drop trigger if exists applicant_upload_while_the_form_is_open on storage.objects;
create trigger applicant_upload_while_the_form_is_open
  before insert on storage.objects
  for each row execute function public.anon_upload_while_the_form_is_open();

-- ==========================================================================
-- 2. HER TYPING SCREENSHOT WAS NEVER WRITTEN DOWN
-- ==========================================================================
--
-- 013 granted INSERT on application_documents to anon only — correct in 013,
-- when the only upload was the CV on the application form. status.html has
-- since uploaded the typing screenshot as HER, signed in, and then POSTs the
-- row that records it. authenticated holds no INSERT, so that POST has been
-- refused every time; the page swallows the error on purpose (the file is in
-- the bucket and the path is on the assessment row, so the proof still
-- opens). What the missing row costs:
--
--   /status   the screenshot is not in her own document list
--   /admin    "Remove entirely" builds its list of files to delete from this
--             table, so the screenshot survives an erasure request
--
-- So she may record her own upload, into her own application, and nothing
-- else. The policy asks owns_application() — both arms, user_id and verified
-- address, the rule every "is this hers" in this schema uses.

grant insert (application_id, path, filename, content_type, bytes)
  on public.application_documents to authenticated;

drop policy if exists "she records her own upload" on public.application_documents;
create policy "she records her own upload"
  on public.application_documents for insert to authenticated
  with check (public.owns_application(application_id));

-- ==========================================================================
-- 3. AND THE ROW HAS TO POINT AT ITS OWN FOLDER
-- ==========================================================================
--
-- 013's anon policy is `with check (true)`: a row could name any application
-- and any path, including a file in somebody else's folder, which /admin would
-- then list — and delete — as hers. The row is now held to the same shape
-- both pages already send:
--
--   applicant-docs/<application_id>/<file>
--
-- with no `..` in it, and anon is held to the same hour as the upload above.
-- Both pages send exactly this today (careers.html and status.html both write
-- "applicant-docs/" + id + "/" + name), so nothing that works stops working.

create or replace function public.document_row_points_home()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  created timestamptz;
begin
  if new.path is null
     or new.path not like 'applicant-docs/' || new.application_id::text || '/%'
     or position('..' in new.path) > 0 then
    raise exception 'that file is not in this application''s folder'
      using hint = 'sjva-document-path';
  end if;

  if coalesce(auth.jwt() ->> 'role', '') = 'anon' then
    select a.created_at into created
    from public.applications a where a.id = new.application_id;
    if created is null or created < now() - interval '1 hour' then
      raise exception 'sign in to add a document to an application'
        using hint = 'sjva-sign-in-to-upload';
    end if;
  end if;

  return new;
end;
$fn$;

revoke all on function public.document_row_points_home() from public, anon, authenticated;

drop trigger if exists application_documents_point_home on public.application_documents;
create trigger application_documents_point_home
  before insert on public.application_documents
  for each row execute function public.document_row_points_home();

-- ==========================================================================
-- Check it worked
-- ==========================================================================

-- Both triggers are on.
select c.relname as table_name, t.tgname, t.tgenabled
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
where t.tgname in ('applicant_upload_while_the_form_is_open', 'application_documents_point_home');

-- authenticated may now INSERT these five columns and no others; anon keeps
-- its five from 013.
select grantee, string_agg(column_name, ', ' order by column_name) as may_insert
from information_schema.column_privileges
where table_name = 'application_documents'
  and privilege_type = 'INSERT'
  and grantee in ('anon', 'authenticated')
group by grantee;

-- Typing screenshots already in the bucket with no row. These are the ones
-- the refused POST left behind; each is safe to record by hand, or to leave
-- for the orphan panel in /admin — they are not orphans, their application
-- exists, they are simply unlisted.
select o.name, o.created_at
from storage.objects o
where o.bucket_id = 'applicant-docs'
  and o.name ~ '/typing-[0-9]+\.(png|jpg)$'
  and not exists (
    select 1 from public.application_documents d
    where d.path = 'applicant-docs/' || o.name
  )
order by o.created_at desc;

insert into public.schema_migrations (n) values (77) on conflict (n) do nothing;
