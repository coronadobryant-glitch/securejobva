-- 001 — the two forms, and the rule that keeps applicants private
--
-- Run first. Safe to re-run: yes.
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

