-- 013 — let an applicant upload a CV instead of pasting a link
--
-- Run after: 012
-- Safe to re-run: yes
-- Also needed: nothing in the dashboard. The bucket is created below rather
--              than by hand, so this file is the whole story.
--
-- `cv` has been a URL since 001, which asks somebody applying for a job to
-- first own a Google Drive and know how to share a link from it. A file input
-- is the thing they expected in the first place. The link field stays for
-- anyone who prefers it.

-- ==========================================================================
-- THE PATH IS THE SECURITY
-- ==========================================================================
--
-- Uploading happens before there is an account: somebody applies, and only
-- later signs in to check on it. So `anon` must be able to write, and the only
-- thing standing between one applicant and another's CV is where the file is
-- allowed to go.
--
-- Files live at  <application_id>/<filename>.
--
-- The id is a v4 UUID minted in the browser and sent with the application, so
-- it is unguessable — you cannot enumerate a folder you cannot name. The
-- policy below pins the first path segment to that shape, so anon can write
-- into a UUID folder and nowhere else: not the bucket root, not a folder named
-- after somebody's email, not `../`.
--
-- Reading is the opposite. anon has no read policy at all. A signed-in
-- applicant may read a file only when the folder name matches an application
-- carrying their own verified address, which is the same rule that governs the
-- row itself.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'applicant-docs',
  'applicant-docs',
  false,                      -- never public. Every read is a signed URL.
  10485760,                   -- 10 MB. A CV that does not fit is a scan, not a CV.
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/png',
    'image/jpeg'
  ]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- --------------------------------------------------------------------------
-- Writing
-- --------------------------------------------------------------------------
--
-- The regex is doing real work. Without it `anon` could write anywhere in the
-- bucket, including over somebody else's file if it ever guessed a name.

drop policy if exists "applicants upload into their own folder" on storage.objects;
create policy "applicants upload into their own folder"
  on storage.objects for insert to anon
  with check (
    bucket_id = 'applicant-docs'
    and (storage.foldername(name))[1] ~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and array_length(storage.foldername(name), 1) = 1
  );

-- A signed-in applicant may add to their own folder later — a certificate, a
-- better CV — without going through the form again.
drop policy if exists "owners add to their own folder" on storage.objects;
create policy "owners add to their own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'applicant-docs'
    and exists (
      select 1 from public.applications a
      where a.id::text = (storage.foldername(name))[1]
        and (a.user_id = auth.uid()
             or lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', '__nobody__')))
    )
  );

-- --------------------------------------------------------------------------
-- Reading
-- --------------------------------------------------------------------------
--
-- No policy for anon, deliberately. Uploading a file does not entitle the
-- uploader to read it back without signing in, and a bucket anon can read is
-- a bucket anyone can read.

drop policy if exists "read your own documents" on storage.objects;
create policy "read your own documents"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'applicant-docs'
    and (
      public.has_permission('applications.view_all')
      or exists (
        select 1 from public.applications a
        where a.id::text = (storage.foldername(name))[1]
          and (a.user_id = auth.uid()
               or lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', '__nobody__')))
      )
    )
  );

-- Deleting is staff only. An applicant who could delete could also delete the
-- CV we assessed them on after the fact; if they want something removed they
-- ask, which is section 8 of the privacy policy.
drop policy if exists "staff remove documents" on storage.objects;
create policy "staff remove documents"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'applicant-docs'
    and public.has_permission('applications.view_all')
  );

-- --------------------------------------------------------------------------
-- What was uploaded, in a table we can read
-- --------------------------------------------------------------------------
--
-- storage.objects is listable by path, but the admin page wants the original
-- filename and who it belongs to without walking a bucket. This is written by
-- the same POST that writes the application.

create table if not exists public.application_documents (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  path           text not null,
  filename       text,
  content_type   text,
  bytes          integer,
  uploaded_at    timestamptz not null default now(),

  constraint application_documents_sane check (
    coalesce(length(path), 0) <= 400 and
    coalesce(length(filename), 0) <= 260 and
    coalesce(bytes, 0) between 0 and 10485760
  )
);

alter table public.application_documents enable row level security;
revoke all on public.application_documents from anon, authenticated;

grant insert (application_id, path, filename, content_type, bytes)
  on public.application_documents to anon;
grant select (id, application_id, path, filename, content_type, bytes, uploaded_at)
  on public.application_documents to authenticated;

drop policy if exists "public can record an upload" on public.application_documents;
create policy "public can record an upload"
  on public.application_documents for insert to anon with check (true);

drop policy if exists "see documents you may see" on public.application_documents;
create policy "see documents you may see"
  on public.application_documents for select to authenticated
  using (
    public.has_permission('applications.view_all')
    or exists (
      select 1 from public.applications a
      where a.id = application_id
        and (a.user_id = auth.uid()
             or lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', '__nobody__')))
    )
  );

create index if not exists application_documents_app_idx
  on public.application_documents (application_id, uploaded_at desc);

-- ==========================================================================
-- Check it worked
-- ==========================================================================
--
-- The bucket must be private. A public bucket serves every CV to anyone with
-- the URL and no token at all, which is the one mistake this whole file is
-- arranged to prevent.

select id, public as is_public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'applicant-docs';

-- Four policies on storage.objects for this bucket: two insert, one select,
-- one delete. There must be no select policy naming `anon`.
select polname,
       polcmd as command,
       pg_get_expr(polqual, polrelid) is not null as has_using,
       pg_get_expr(polwithcheck, polrelid) is not null as has_check
from pg_policy
where polrelid = 'storage.objects'::regclass
  and polname in (
    'applicants upload into their own folder',
    'owners add to their own folder',
    'read your own documents',
    'staff remove documents'
  )
order by polname;

select grantee, string_agg(distinct privilege_type, ',' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_name = 'application_documents' and grantee in ('anon', 'authenticated')
group by grantee;
