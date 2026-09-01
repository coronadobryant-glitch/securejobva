-- 053 — a CV goes with its application
--
-- Run after: 052
-- Safe to re-run: yes
-- Also needed: nothing in the dashboard.
--
-- ==========================================================================
-- DELETING SOMEBODY DOES NOT DELETE THEIR CV
-- ==========================================================================
--
-- application_documents.application_id cascades, so deleting an application
-- takes the row that records the file. The file itself is in storage and
-- nothing touches it. It stays in the bucket, for ever, with nothing pointing
-- at it.
--
-- This is not theoretical: the check at the end of 047 found one on the first
-- run, 128 KB in a folder whose application no longer existed. A test
-- applicant had been cleared out months earlier and their CV was still there.
--
-- /privacy says somebody may ask us to delete their information. Honouring
-- that today removes the RECORD of a CV and leaves the CV.
--
-- ==========================================================================
-- WHY THIS IS NOT A TRIGGER
-- ==========================================================================
--
-- The obvious build is a trigger on applications that deletes the matching
-- rows from storage.objects. It would run, it would report success, and it
-- would be worse than doing nothing.
--
-- storage.objects is the metadata, not the file. Supabase removes the object
-- itself when the delete comes through the storage API; a plain SQL delete of
-- the row leaves the bytes in the bucket and takes away the only handle
-- anybody had on them. The file would become unreachable AND unremovable, and
-- the folder would stop showing up in the very query that found the last one.
-- A cleanup that hides its own failures is not a cleanup.
--
-- So the database's job here is only to answer the question. Deleting goes
-- through the storage API, from /admin, using the session of the person
-- looking at it — 013 already grants staff DELETE on this bucket, so there is
-- no new credential anywhere in this.
--
-- ==========================================================================
-- THE QUESTION, ASKED PROPERLY
-- ==========================================================================
--
-- A file is orphaned when the folder it sits in is not an application any
-- more. That covers every way one can happen: an application deleted from the
-- dashboard, cleared by sql/cleanup-test-data.sql, or a file uploaded by the
-- bug careers.html carried until this week, which wrote the row against the
-- wrong id and left the file with nothing pointing at it.
--
-- Asked here rather than in the page because storage.objects is in another
-- schema and PostgREST does not serve it. Definer, and it checks the caller
-- before it answers — the paths are of no use to anybody else, but a function
-- that lists a bucket should still say who may ask.

create or replace function public.orphan_document_paths()
returns table (path text, bytes bigint, uploaded timestamptz)
language sql
stable
security definer
set search_path = public, storage, pg_temp
as $fn$
  select o.name,
         nullif(o.metadata ->> 'size', '')::bigint,
         o.created_at
  from storage.objects o
  where public.has_permission('applications.view_all')
    and o.bucket_id = 'applicant-docs'
    and (storage.foldername(o.name))[1] ~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and not exists (
      select 1 from public.applications a
      where a.id::text = (storage.foldername(o.name))[1]
    )
  order by o.created_at;
$fn$;

revoke all on function public.orphan_document_paths() from public, anon;
grant execute on function public.orphan_document_paths() to authenticated;

-- ==========================================================================
-- Check it worked
-- ==========================================================================

-- What is sitting in the bucket with nothing pointing at it. Run this from the
-- SQL editor and it answers as the table owner, so it lists everything; run it
-- from /admin and the permission check decides. Empty is the answer you want.
select * from public.orphan_document_paths();

-- And the total, which is what /admin puts on the button.
select count(*) as orphans,
       coalesce(sum(bytes), 0) as bytes
from public.orphan_document_paths();

insert into public.schema_migrations (n) values (53) on conflict (n) do nothing;
