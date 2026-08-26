-- 003 — applicant sign-in, stage tracking and the admin view
--
-- Run after: 002
-- Safe to re-run: yes
-- Also needed: enable Google in Supabase → Authentication → Providers,
--              and add yourselves to public.admins (see below).
--
-- Adds /status (an applicant sees their own application) and /admin (an
-- administrator moves people between stages). Nothing here grants anon a
-- single new privilege — reading requires a signed-in session.

-- ==========================================================================
-- APPLICANT SIGN-IN AND STAGE TRACKING
-- ==========================================================================
--
-- Everything above this line predates sign-in: the public inserts and cannot
-- read. That stays exactly as it is. What follows adds a second, narrower door
-- for people who have proved who they are.
--
-- The link between a person and their application is the VERIFIED email on
-- their Google account. An applicant never chooses it and cannot type it: it
-- arrives in the JWT Supabase issues after Google vouches for it. So "show me
-- my application" means "show the rows whose email column equals the address
-- Google confirmed", and there is no way to phrase it to mean anyone else's.
--
-- Note what is NOT here: no select policy for anon. The warning at the top of
-- this file still holds. Reading requires a signed-in session.

-- --------------------------------------------------------------------------
-- The four stages, matching the ones the careers page already promises
-- --------------------------------------------------------------------------

alter table public.applications
  add column if not exists status text not null default 'applied';

alter table public.applications
  add column if not exists status_changed_at timestamptz not null default now();

-- A typo here would strand an applicant on a stage the page cannot render, so
-- the database refuses anything outside the set.
alter table public.applications drop constraint if exists applications_status_valid;
alter table public.applications add constraint applications_status_valid
  check (status in ('applied', 'assessment', 'interview', 'approved', 'declined'));

-- --------------------------------------------------------------------------
-- Who is an administrator
-- --------------------------------------------------------------------------
--
-- Keyed by email because that is what Google gives us. Add yourself with:
--
--   insert into public.admins (user_email) values ('you@example.com')
--   on conflict do nothing;
--
-- Run that in the SQL editor, which bypasses RLS. Nothing in any page can
-- write to this table.

create table if not exists public.admins (
  user_email text primary key,
  added_at   timestamptz not null default now()
);

alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;

-- Deliberately no policy at all. With RLS on and no policy every request
-- through the API is denied, including reading the list of who is an admin --
-- which is not a list worth publishing.

-- --------------------------------------------------------------------------
-- is_admin()
-- --------------------------------------------------------------------------
--
-- SECURITY DEFINER so it can read public.admins while the caller cannot. That
-- is the whole point: the answer is trustworthy without the question exposing
-- the table. search_path is pinned because a definer function that resolves
-- names against the caller's path is a way in.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1 from public.admins
    where user_email = lower(coalesce(auth.jwt() ->> 'email', '__nobody__'))
  );
$fn$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- --------------------------------------------------------------------------
-- What a signed-in person may read
-- --------------------------------------------------------------------------
--
-- A column list, not `grant select on table`. An applicant reads their own
-- row, so every column named here is one they are allowed to see. A column
-- added later is invisible until it is added here too, which is the safe
-- direction for that mistake to fail in.

grant select (
  id, created_at, tracks, track, experience, shifts, speed, kit,
  name, country, email, phone, cv, note, page, status, status_changed_at
) on public.applications to authenticated;

drop policy if exists "read your own application" on public.applications;
create policy "read your own application"
  on public.applications for select to authenticated
  using (
    lower(email) = lower(coalesce(auth.jwt() ->> 'email', '__nobody__'))
    or public.is_admin()
  );

-- --------------------------------------------------------------------------
-- What an administrator may change
-- --------------------------------------------------------------------------
--
-- Two columns and no others. An admin moving someone to the next stage has no
-- reason to rewrite their name, email or CV link, and a UI bug that tried to
-- is refused by the database rather than quietly succeeding.

grant update (status, status_changed_at) on public.applications to authenticated;

drop policy if exists "admins move an application along" on public.applications;
create policy "admins move an application along"
  on public.applications for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- --------------------------------------------------------------------------
-- Private notes
-- --------------------------------------------------------------------------
--
-- A separate table rather than a column on applications, because the applicant
-- can read their own row and a column-level grant is a fragile way to hold one
-- field back. Nothing an applicant can select touches this table at all.

create table if not exists public.application_notes (
  application_id uuid primary key
    references public.applications (id) on delete cascade,
  note           text,
  updated_at     timestamptz not null default now(),
  constraint application_notes_sane check (coalesce(length(note), 0) <= 4000)
);

alter table public.application_notes enable row level security;
revoke all on public.application_notes from anon, authenticated;
grant select, insert, update on public.application_notes to authenticated;

drop policy if exists "admins read notes" on public.application_notes;
create policy "admins read notes"
  on public.application_notes for select to authenticated
  using (public.is_admin());

drop policy if exists "admins write notes" on public.application_notes;
create policy "admins write notes"
  on public.application_notes for insert to authenticated
  with check (public.is_admin());

drop policy if exists "admins edit notes" on public.application_notes;
create policy "admins edit notes"
  on public.application_notes for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create index if not exists applications_email_idx
  on public.applications (lower(email));
create index if not exists applications_status_idx
  on public.applications (status, created_at desc);

