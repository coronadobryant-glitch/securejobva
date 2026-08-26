-- 015 — logos of businesses we have staffed
--
-- Run after: 014
-- Safe to re-run: yes
-- Also needed: nothing in the dashboard. The bucket is created here.
--
-- A strip of client logos on the home page, managed from /admin rather than by
-- editing HTML, so adding one does not need a deploy.

-- ==========================================================================
-- THIS BUCKET IS PUBLIC, AND THAT IS THE POINT
-- ==========================================================================
--
-- 013 went to some length to keep applicant-docs private: every read there is
-- a signed URL good for sixty seconds, because those files are people's CVs.
--
-- This is the opposite case and needs the opposite setting. A logo on a public
-- marketing page is served to anonymous visitors by an <img> tag; signing it
-- would mean the strip breaks for everyone who is not logged in, which is
-- everyone it is for.
--
-- So the two buckets are deliberately different, and the difference is written
-- down here so nobody later "fixes" the inconsistency in the wrong direction.
-- The guard in tools/guard-rls.mjs asserts applicant-docs is NOT public; it
-- does not assert that of this one.
--
-- What keeps this safe is that nothing private is ever put in it. It holds
-- logos. Uploading is staff-only.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'client-logos',
  'client-logos',
  true,
  2097152,                    -- 2 MB. A logo that does not fit is a photograph.
  array['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp']
)
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Anyone may read, which is what public means. Only staff may put something
-- there, and only staff may take it away.
drop policy if exists "anyone can see client logos" on storage.objects;
create policy "anyone can see client logos"
  on storage.objects for select
  using (bucket_id = 'client-logos');

drop policy if exists "staff upload client logos" on storage.objects;
create policy "staff upload client logos"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'client-logos'
    and public.has_permission('applications.view_all')
  );

drop policy if exists "staff replace client logos" on storage.objects;
create policy "staff replace client logos"
  on storage.objects for update to authenticated
  using (bucket_id = 'client-logos' and public.has_permission('applications.view_all'))
  with check (bucket_id = 'client-logos' and public.has_permission('applications.view_all'));

drop policy if exists "staff remove client logos" on storage.objects;
create policy "staff remove client logos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'client-logos' and public.has_permission('applications.view_all'));

-- --------------------------------------------------------------------------
-- The list
-- --------------------------------------------------------------------------
--
-- Read by the home page with the publishable key, so anon does get SELECT here
-- -- the first table in this schema where that is true. It is safe because of
-- what the table contains: a company name, a logo URL and a sort order. There
-- is no person in it. Do not add a column that changes that.

create table if not exists public.client_logos (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  image_url  text not null,
  link       text,
  sort_order integer not null default 0,
  visible    boolean not null default true,
  added_at   timestamptz not null default now(),
  added_by   text,

  constraint client_logos_sane check (
    length(name) between 1 and 120 and
    length(image_url) between 1 and 500 and
    coalesce(length(link), 0) <= 500 and
    coalesce(length(added_by), 0) <= 320
  )
);

alter table public.client_logos enable row level security;
revoke all on public.client_logos from anon, authenticated;

-- The public reads only what is marked visible, so a logo can be prepared or
-- pulled without deleting it.
grant select (id, name, image_url, link, sort_order, visible) on public.client_logos to anon;
grant select on public.client_logos to authenticated;
grant insert, update, delete on public.client_logos to authenticated;

drop policy if exists "anyone can read visible logos" on public.client_logos;
create policy "anyone can read visible logos"
  on public.client_logos for select to anon
  using (visible);

drop policy if exists "staff read all logos" on public.client_logos;
create policy "staff read all logos"
  on public.client_logos for select to authenticated
  using (public.has_permission('applications.view_all'));

drop policy if exists "staff add logos" on public.client_logos;
create policy "staff add logos"
  on public.client_logos for insert to authenticated
  with check (public.has_permission('applications.view_all'));

drop policy if exists "staff edit logos" on public.client_logos;
create policy "staff edit logos"
  on public.client_logos for update to authenticated
  using (public.has_permission('applications.view_all'))
  with check (public.has_permission('applications.view_all'));

drop policy if exists "staff delete logos" on public.client_logos;
create policy "staff delete logos"
  on public.client_logos for delete to authenticated
  using (public.has_permission('applications.view_all'));

create index if not exists client_logos_order_idx
  on public.client_logos (visible, sort_order, added_at);

-- ==========================================================================
-- Check it worked
-- ==========================================================================
--
-- anon should hold SELECT here and nowhere else. If this shows INSERT or
-- UPDATE, anyone with the page source can edit the client list.

select grantee, string_agg(distinct privilege_type, ',' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_name = 'client_logos' and grantee in ('anon', 'authenticated')
group by grantee;

-- Both buckets, side by side. applicant-docs must be false, client-logos true.
-- If they ever match, one of them is wrong.
select id, public as is_public, file_size_limit
from storage.buckets
where id in ('applicant-docs', 'client-logos')
order by id;
