-- SecureJobVA — form storage.
-- Paste the whole file into the Supabase SQL editor and run it once.
--
-- READ THIS BEFORE CHANGING ANYTHING BELOW.
--
-- The anon key sits in the page source where anyone can read it. That is how
-- Supabase is designed to work, and it is only safe because Row Level Security
-- decides what that key may do. These tables hold names, emails, phone numbers
-- and CV links belonging to real applicants. The policies below let the public
-- INSERT and nothing else — no select, no update, no delete. Add a SELECT
-- policy for anon and you publish your applicant list to the internet.
--
-- You read the rows in the Supabase dashboard, which uses the service_role key
-- and bypasses RLS. That key must never appear in a page.

-- --------------------------------------------------------------------------
-- Businesses asking for a seat  (index.html)
-- --------------------------------------------------------------------------

create table if not exists public.seat_requests (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),

  -- Column names match the JSON keys the dialog sends exactly. PostgREST
  -- rejects the whole insert if a key has no column, so if you add a field to
  -- the form, add it here in the same commit.
  seats       text[],
  hours       integer,
  weekly      integer,
  blocks      text[],
  timezone    text,
  name        text,
  company     text,
  email       text,
  phone       text,
  notes       text,
  page        text,

  -- Nothing here is trusted. Caps stop a bot writing megabytes into the table.
  constraint seat_requests_sane check (
    coalesce(length(name), 0)    <= 200 and
    coalesce(length(company), 0) <= 200 and
    coalesce(length(email), 0)   <= 320 and
    coalesce(length(phone), 0)   <= 60  and
    coalesce(length(notes), 0)   <= 4000 and
    coalesce(length(page), 0)    <= 500 and
    coalesce(hours, 0) between 0 and 168
  )
);

-- --------------------------------------------------------------------------
-- People applying for a seat  (careers.html)
-- --------------------------------------------------------------------------

create table if not exists public.applications (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),

  -- `tracks` is plural and an array: the form lets an applicant pick more than
  -- one. `track` is the singular column it replaced, kept so the rows written
  -- before that change still read. Nothing writes to it any more.
  tracks      text[],
  track       text,
  experience  text,
  shifts      text[],
  speed       text,
  kit         text[],
  name        text,
  country     text,
  email       text,
  phone       text,
  cv          text,
  note        text,
  page        text,

  constraint applications_sane check (
    coalesce(length(name), 0)    <= 200 and
    coalesce(length(country), 0) <= 100 and
    coalesce(length(email), 0)   <= 320 and
    coalesce(length(phone), 0)   <= 60  and
    coalesce(length(cv), 0)      <= 1000 and
    coalesce(length(note), 0)    <= 4000 and
    coalesce(length(page), 0)    <= 500
  )
);

-- --------------------------------------------------------------------------
-- Migrations for tables that already exist
-- --------------------------------------------------------------------------
--
-- `create table if not exists` above does nothing to a table that is already
-- there, so a column added to this file after the first run has to be added
-- again here. Both statements are idempotent — run the file as often as you
-- like.
--
-- This one matters: the careers form began sending `tracks` (an array, because
-- an applicant can pick more than one) in place of `track`. Until the column
-- exists, PostgREST rejects every application with PGRST204 and the applicant
-- sees only "that did not send". Run this BEFORE deploying the page that sends
-- it, not after.

alter table public.applications add column if not exists tracks text[];

-- --------------------------------------------------------------------------
-- Lock both tables down
-- --------------------------------------------------------------------------

alter table public.seat_requests enable row level security;
alter table public.applications  enable row level security;

-- Supabase grants the public roles broad table privileges by default. Take
-- them back and hand out only the one thing a visitor needs.
revoke all on public.seat_requests from anon, authenticated;
revoke all on public.applications  from anon, authenticated;

grant insert on public.seat_requests to anon;
grant insert on public.applications  to anon;

-- Insert only. There is deliberately no select, update or delete policy: with
-- RLS on, anything without a policy is denied.
--
-- Note this pairs with "Prefer: return=minimal" in the page. Ask PostgREST to
-- return the inserted row instead and it needs SELECT, which would defeat the
-- whole arrangement.

drop policy if exists "public can request a seat" on public.seat_requests;
create policy "public can request a seat"
  on public.seat_requests for insert to anon with check (true);

drop policy if exists "public can apply" on public.applications;
create policy "public can apply"
  on public.applications for insert to anon with check (true);

-- Newest first is the only way you will ever read these.
create index if not exists seat_requests_created_at_idx
  on public.seat_requests (created_at desc);
create index if not exists applications_created_at_idx
  on public.applications (created_at desc);

-- --------------------------------------------------------------------------
-- Check it worked
-- --------------------------------------------------------------------------
-- Both rows must say rls_enabled = true and list exactly one INSERT policy.

select c.relname as table,
       c.relrowsecurity as rls_enabled,
       coalesce(string_agg(p.polcmd::text, ','), 'none') as policies
from pg_class c
left join pg_policy p on p.polrelid = c.oid
where c.relname in ('seat_requests', 'applications')
group by c.relname, c.relrowsecurity;

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

-- --------------------------------------------------------------------------
-- Check it worked
-- --------------------------------------------------------------------------
--
-- applications should show rls_enabled = true with three policies: the
-- original public INSERT, the owner-or-admin SELECT and the admin UPDATE.
-- admins must show rls_enabled = true and NO policies at all.

select c.relname as table_name,
       c.relrowsecurity as rls_enabled,
       coalesce(string_agg(p.polcmd::text, ',' order by p.polcmd::text), 'none') as policies
from pg_class c
left join pg_policy p on p.polrelid = c.oid
where c.relname in ('seat_requests', 'applications', 'admins', 'application_notes')
group by c.relname, c.relrowsecurity
order by c.relname;

-- anon must still be able to do exactly one thing to applications: insert.
select grantee, string_agg(privilege_type, ',' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_name = 'applications' and grantee in ('anon', 'authenticated')
group by grantee;
