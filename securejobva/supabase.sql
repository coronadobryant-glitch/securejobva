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

-- ==========================================================================
-- ROLES, PERMISSIONS, AND THE APPLICANT'S OWN ACCOUNT
-- ==========================================================================
--
-- The section above shipped with a single yes/no question: is_admin(). That is
-- fine for two kinds of person and starts to rot at three, because every new
-- capability becomes another column or another hardcoded check.
--
-- What follows is the ordinary four-table arrangement -- roles, permissions,
-- role_permissions, user_roles -- so a capability is granted by inserting a
-- row rather than by editing a policy. is_admin() survives as a thin wrapper
-- over it, which means every policy already written keeps working.
--
-- Roles are held against the EMAIL rather than the auth user id, for one
-- practical reason: it lets you grant somebody a role before they have ever
-- signed in. The id does not exist until first login; the address does.

-- --------------------------------------------------------------------------
-- The three tables that describe who may do what
-- --------------------------------------------------------------------------

create table if not exists public.roles (
  key   text primary key,
  label text not null
);

create table if not exists public.permissions (
  key   text primary key,
  label text not null
);

create table if not exists public.role_permissions (
  role_key       text not null references public.roles (key)       on delete cascade,
  permission_key text not null references public.permissions (key) on delete cascade,
  primary key (role_key, permission_key)
);

create table if not exists public.user_roles (
  user_email text not null,
  role_key   text not null references public.roles (key) on delete cascade,
  granted_at timestamptz not null default now(),
  primary key (user_email, role_key)
);

-- --------------------------------------------------------------------------
-- The vocabulary
-- --------------------------------------------------------------------------
--
-- Adding a permission here does nothing on its own. It has to be named by a
-- policy or by a page before it means anything, which is deliberate: an
-- unused permission is inert rather than quietly granting something.

insert into public.roles (key, label) values
  ('admin',     'Administrator'),
  ('staff',     'Staff'),
  ('applicant', 'Applicant')
on conflict (key) do update set label = excluded.label;

insert into public.permissions (key, label) values
  ('applications.view_all', 'See every application'),
  ('applications.edit',     'Change an application''s stage'),
  ('applications.note',     'Read and write private notes'),
  ('social.view',           'See connected social accounts'),
  ('social.post',           'Publish to a connected account'),
  ('analytics.view',        'See analytics'),
  ('accounts.manage',       'Grant and revoke roles')
on conflict (key) do update set label = excluded.label;

-- Admin gets everything, including anything added later: the select is over
-- the permissions table rather than a list, so this line does not go stale.
insert into public.role_permissions (role_key, permission_key)
  select 'admin', key from public.permissions
on conflict do nothing;

-- Staff handle applicants but do not hand out roles, and do not post as
-- somebody else. Both of those are the kind of thing one person should own.
insert into public.role_permissions (role_key, permission_key) values
  ('staff', 'applications.view_all'),
  ('staff', 'applications.edit'),
  ('staff', 'applications.note'),
  ('staff', 'social.view')
on conflict do nothing;

-- The applicant role holds no permissions at all. What an applicant may see is
-- their own row, and that is decided by the policies further down matching
-- their verified identity -- not by a permission that could be granted to
-- somebody else by mistake.

-- --------------------------------------------------------------------------
-- Carry the existing admins across
-- --------------------------------------------------------------------------
--
-- public.admins shipped first and may already have rows in it. Move them in
-- rather than asking anyone to retype them. The table is left in place, unused,
-- so this file can be re-run against a database in either state.

insert into public.user_roles (user_email, role_key)
  select lower(user_email), 'admin' from public.admins
on conflict do nothing;

-- --------------------------------------------------------------------------
-- Lock the four tables
-- --------------------------------------------------------------------------
--
-- No policies. As with public.admins, RLS on with no policy denies everything
-- through the API. Who may do what is not a public list, and it is edited here
-- in the SQL editor, which bypasses RLS.

alter table public.roles            enable row level security;
alter table public.permissions      enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_roles       enable row level security;

revoke all on public.roles            from anon, authenticated;
revoke all on public.permissions      from anon, authenticated;
revoke all on public.role_permissions from anon, authenticated;
revoke all on public.user_roles       from anon, authenticated;

-- --------------------------------------------------------------------------
-- has_permission()
-- --------------------------------------------------------------------------
--
-- The one function every policy and every page asks. SECURITY DEFINER for the
-- same reason is_admin() was: it reads tables the caller cannot, so the answer
-- is trustworthy without the question exposing the grant tables.

create or replace function public.has_permission(perm text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role_key = ur.role_key
    where ur.user_email = lower(coalesce(auth.jwt() ->> 'email', '__nobody__'))
      and rp.permission_key = perm
  );
$fn$;

revoke all on function public.has_permission(text) from public, anon;
grant execute on function public.has_permission(text) to authenticated;

-- Every policy written before this section calls is_admin(). Rather than
-- rewrite them, is_admin() becomes a question about permissions -- so the
-- policies keep working and there is still only one place that decides.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select public.has_permission('applications.view_all');
$fn$;

-- What roles am I? Used by the pages to decide what to render. It answers only
-- about the caller, so it cannot be used to enumerate anybody else.
create or replace function public.my_permissions()
returns setof text
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select distinct rp.permission_key
  from public.user_roles ur
  join public.role_permissions rp on rp.role_key = ur.role_key
  where ur.user_email = lower(coalesce(auth.jwt() ->> 'email', '__nobody__'));
$fn$;

revoke all on function public.my_permissions() from public, anon;
grant execute on function public.my_permissions() to authenticated;

-- --------------------------------------------------------------------------
-- Tie an application to the account, not just the address
-- --------------------------------------------------------------------------
--
-- Applying still needs no account, so a new row has no user_id: it is written
-- by anon, who is nobody. The column is filled in the first time the person
-- signs in, by claim_my_applications() below.
--
-- The read policy accepts either the id or the verified address, so rows
-- written before this existed keep working and nobody has to re-apply.

alter table public.applications
  add column if not exists user_id uuid references auth.users (id) on delete set null;

create index if not exists applications_user_id_idx on public.applications (user_id);

-- Link every application whose address matches a real account. Safe to re-run,
-- and worth running once now to catch everyone who applied before sign-in
-- existed.
update public.applications a
   set user_id = u.id
  from auth.users u
 where a.user_id is null
   and lower(a.email) = lower(u.email);

-- Called by the portal after sign-in. A person can only ever claim rows that
-- carry their own verified address, so this cannot be used to take someone
-- else's application.
create or replace function public.claim_my_applications()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  claimed integer;
  who     text := lower(coalesce(auth.jwt() ->> 'email', ''));
  uid     uuid := auth.uid();
begin
  if who = '' or uid is null then
    return 0;
  end if;
  update public.applications
     set user_id = uid
   where user_id is null
     and lower(email) = who;
  get diagnostics claimed = row_count;
  return claimed;
end;
$fn$;

revoke all on function public.claim_my_applications() from public, anon;
grant execute on function public.claim_my_applications() to authenticated;

drop policy if exists "read your own application" on public.applications;
create policy "read your own application"
  on public.applications for select to authenticated
  using (
    user_id = auth.uid()
    or lower(email) = lower(coalesce(auth.jwt() ->> 'email', '__nobody__'))
    or public.has_permission('applications.view_all')
  );

drop policy if exists "admins move an application along" on public.applications;
create policy "staff move an application along"
  on public.applications for update to authenticated
  using (public.has_permission('applications.edit'))
  with check (public.has_permission('applications.edit'));

-- --------------------------------------------------------------------------
-- Consent to post on someone's behalf
-- --------------------------------------------------------------------------
--
-- Three columns, not one. The boolean says they agreed and the timestamp says
-- when, but the third is the one that matters if it is ever disputed: the exact
-- wording they were shown. Consent wording gets edited, and "they ticked a box"
-- is worth very little without a record of which box.

alter table public.applications
  add column if not exists posting_consent      boolean not null default false;
alter table public.applications
  add column if not exists posting_consent_at   timestamptz;
alter table public.applications
  add column if not exists posting_consent_text text;

-- --------------------------------------------------------------------------
-- Connected social accounts
-- --------------------------------------------------------------------------
--
-- Manual today: the applicant types a handle or a link and a person reads it.
-- The three columns after the divider are for the OAuth version and stay null
-- until each platform approves the app, so that step is an insert and not a
-- migration.
--
-- Note what is NOT in this table: no access token, no refresh token. Those
-- belong to a server the browser cannot reach, and putting them beside data an
-- applicant can select would be how they leak. See social_tokens below.

create table if not exists public.application_socials (
  application_id uuid not null references public.applications (id) on delete cascade,
  platform       text not null,
  handle         text,
  url            text,
  added_at       timestamptz not null default now(),

  -- OAuth, later.
  external_id    text,
  connected_at   timestamptz,
  scopes         text[],

  primary key (application_id, platform),
  constraint application_socials_platform_known check (
    platform in ('facebook', 'instagram', 'tiktok', 'linkedin', 'x', 'youtube')
  ),
  constraint application_socials_sane check (
    coalesce(length(handle), 0) <= 200 and coalesce(length(url), 0) <= 500
  )
);

alter table public.application_socials enable row level security;
revoke all on public.application_socials from anon, authenticated;

-- The applicant fills this in as part of applying, before they have an account,
-- so anon may insert -- exactly as it may insert an application.
grant insert on public.application_socials to anon;
grant select (application_id, platform, handle, url, added_at, external_id, connected_at, scopes)
  on public.application_socials to authenticated;

drop policy if exists "public can attach socials" on public.application_socials;
create policy "public can attach socials"
  on public.application_socials for insert to anon with check (true);

drop policy if exists "see socials you may see" on public.application_socials;
create policy "see socials you may see"
  on public.application_socials for select to authenticated
  using (
    public.has_permission('social.view')
    or exists (
      select 1 from public.applications a
      where a.id = application_id
        and (a.user_id = auth.uid()
             or lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', '__nobody__')))
    )
  );

-- --------------------------------------------------------------------------
-- Where publishing tokens will live
-- --------------------------------------------------------------------------
--
-- Created now and deliberately unreachable: no grants, no policies, so neither
-- anon nor a signed-in user can touch it through the API at all. Only a server
-- holding the service_role key will ever read it.
--
-- It exists at this stage so that the boundary is drawn before there is
-- anything valuable to put on the wrong side of it.

create table if not exists public.social_tokens (
  application_id uuid not null references public.applications (id) on delete cascade,
  platform       text not null,
  access_token   text,
  refresh_token  text,
  expires_at     timestamptz,
  updated_at     timestamptz not null default now(),
  primary key (application_id, platform)
);

alter table public.social_tokens enable row level security;
revoke all on public.social_tokens from anon, authenticated;

-- --------------------------------------------------------------------------
-- Check it worked
-- --------------------------------------------------------------------------
--
-- Every table below must say rls_enabled = true. The grant tables and
-- social_tokens must say 'none' under policies -- that is what makes them
-- unreachable rather than merely unlisted.

select c.relname as table_name,
       c.relrowsecurity as rls_enabled,
       coalesce(string_agg(distinct p.polcmd::text, ','), 'none') as policies
from pg_class c
left join pg_policy p on p.polrelid = c.oid
where c.relname in ('applications', 'application_socials', 'social_tokens',
                    'roles', 'permissions', 'role_permissions', 'user_roles')
group by c.relname, c.relrowsecurity
order by c.relname;

-- Who currently holds which role.
select ur.user_email, string_agg(ur.role_key, ', ' order by ur.role_key) as roles
from public.user_roles ur
group by ur.user_email
order by ur.user_email;

-- And what each role can do.
select rp.role_key, string_agg(rp.permission_key, ', ' order by rp.permission_key) as allowed
from public.role_permissions rp
group by rp.role_key
order by rp.role_key;
