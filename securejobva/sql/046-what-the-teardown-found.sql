-- 046 — the eight things a pre-launch teardown found
--
-- Run after: 045
-- Safe to re-run: yes
-- Also needed: nothing in the dashboard, but see THE ONE THING THIS CANNOT FIX
-- at the bottom of this file. It is the most important line in it.
--
-- Every item here is a rule that was written down correctly somewhere and
-- enforced somewhere else, or not at all. None of them announce themselves:
-- each one leaves every screen rendering perfectly.
--
--   1  a client's reason for sending a week back was thrown away
--   2  the notice board was readable by anybody who could sign in
--   3  anon could insert an application with any status it liked
--   4  weeks worked before a placement existed were adopted only one way in
--   5  a week could be filed against any Monday in history
--   6  the quote shown and the quote stored were different numbers
--   7  who resolved a swap was a claim the browser made
--   8  who made contact was the same

-- ==========================================================================
-- 1. THE REASON A WEEK CAME BACK
-- ==========================================================================
--
-- 030 gave `note` to staff alone, and it was right to at the time: an
-- assistant holds UPDATE(note) on their own open week, staff and assistants
-- are both `authenticated`, so no grant and no policy can separate them. A
-- trigger was the only place the old row and the new one are both visible, and
-- it put the note back for anyone without applications.edit.
--
-- Then 033 gave the client the same two buttons and nobody revisited it. A
-- client is not staff, so their reason was reverted to old.note — which is
-- normally null — before it was ever stored.
--
-- What that cost, in order: /seats REQUIRES the reason before it will send
-- ("Say what needs fixing — that is the whole message"), so the client always
-- writes one. 031 then builds the notification payload from new.note, which
-- the trigger has already blanked, so api/notify sends the assistant
-- "your hours need a change" with no reason attached — the exact silence that
-- endpoint's own comment says it exists to prevent. /hub then renders an empty
-- note. The client sees a success and a returned week and believes they were
-- heard. Nobody anywhere learns that the message did not exist.
--
-- The rule was never "only staff may write this". It was "the person whose
-- week it is may not rewrite the reason it came back". A client returning a
-- week is the other party saying why, which is the same act staff perform.
--
-- Written as two nots rather than one positive so the shape 030 established
-- survives being read: the first condition is still the staff test, and the
-- second names the one other person entitled to speak.

create or replace function public.timesheet_stamp()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  -- Not staff, and not the client sending this week back? The reason stays
  -- exactly as it was found. The assistant whose week it is fails both tests,
  -- which is the whole point.
  if not public.has_permission('applications.edit')
     and not (new.status = 'returned'
              and new.placement_id is not null
              and public.is_placement_client(new.placement_id)) then
    new.note := old.note;
  end if;

  if new.status is distinct from old.status then
    if new.status = 'submitted' then
      new.submitted_at := now();
      -- Sending again after a send-back clears the old decision, so the row
      -- never shows "declined by David" against a week now waiting on him.
      new.decided_at := null;
      new.decided_by := null;
    elsif new.status in ('approved', 'returned') then
      new.decided_at := now();
      new.decided_by := coalesce(auth.jwt() ->> 'email', 'somebody');
    end if;
  else
    -- Nothing about the state changed, so nothing about the record of it may.
    new.submitted_at := old.submitted_at;
    new.decided_at   := old.decided_at;
    new.decided_by   := old.decided_by;
  end if;

  return new;
end;
$fn$;

drop trigger if exists timesheets_stamp on public.timesheets;
create trigger timesheets_stamp
  before update on public.timesheets
  for each row execute function public.timesheet_stamp();

-- ==========================================================================
-- 2. THE NOTICE BOARD
-- ==========================================================================
--
-- 026's policy is named "the hired read published notices" and its predicate
-- never asks whether anybody was hired:
--
--   using ((published_at is not null and published_at <= now())
--          or has_permission('applications.view_all'))
--
-- So every published notice was readable by any `authenticated` session at
-- all — an applicant who was declined, a client, anyone with a Google account
-- and thirty seconds. /hub checks `status !== 'hired'` and closes the page,
-- but that is a page closing itself; the row was always one request away.
--
-- This is the only SELECT policy in sql/ that was missing its ownership arm.
-- The name was right and the predicate was short by one clause.

create or replace function public.is_hired()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1 from public.applications a
    where a.status = 'hired'
      and (a.user_id = auth.uid()
           or lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', '__nobody__')))
  );
$fn$;

revoke all on function public.is_hired() from public, anon;
grant execute on function public.is_hired() to authenticated;

drop policy if exists "the hired read published notices" on public.notices;
create policy "the hired read published notices"
  on public.notices for select to authenticated
  using (
    (published_at is not null and published_at <= now() and public.is_hired())
    or public.has_permission('applications.view_all')
  );

-- ==========================================================================
-- 3. WHAT ANON MAY PUT IN AN APPLICATION
-- ==========================================================================
--
-- 001 wrote `grant insert on public.applications to anon` — the whole table,
-- because at the time the table was the form and nothing else. Every column
-- added since has been granted to anonymous writers by that one line, without
-- anybody choosing it: `status` in 003, `user_id` in 004.
--
-- So an anonymous POST could file an application already marked 'hired'. The
-- status constraint permits the value, the policy is `with check (true)`, and
-- nothing else looks. Combined with item 2 that was a way into the notice
-- board; on its own it is a stranger appearing in the pipeline at the last
-- rung.
--
-- The fix is the rule the rest of this database already follows: a grant names
-- its columns. The list below is exactly what careers.html sends — if you add
-- a field to that form, add it here in the same commit, the same way you would
-- add the column.

revoke insert on public.applications from anon;

grant insert (
  id, tracks, track, experience, shifts, speed, kit,
  name, country, email, phone, cv, note, page,
  region, availability, has_equipment,
  skill_english, skill_customer, skill_data_entry, skill_social, skill_bookkeeping
) on public.applications to anon;

-- ==========================================================================
-- 4. WEEKS WORKED BEFORE A PLACEMENT EXISTED
-- ==========================================================================
--
-- 043 adopts orphan weeks when a placement leaves `matched`, and only then:
-- the trigger is AFTER UPDATE OF status. That covers the path /admin actually
-- takes today, because the match form hard-codes status 'matched' on create.
--
-- It does not cover a placement inserted straight into 'trial' or 'ongoing'.
-- 032 grants INSERT(status), so that row is legal, and the weeks the assistant
-- recorded while nobody had placed her would keep placement_id null for good —
-- never billable, never on a statement, and no screen saying so. That is the
-- same hole 043 was written to close, reached from the side it did not cover.
--
-- Same function, second trigger. It only ever touches weeks with no placement,
-- so 034's promise — a week is stamped once, because money already billed must
-- not move — is untouched.

drop trigger if exists placement_adopts_on_insert on public.placements;
create trigger placement_adopts_on_insert
  after insert on public.placements
  for each row
  when (new.status in ('trial', 'ongoing'))
  execute function public.adopt_orphan_weeks();

-- ==========================================================================
-- 5. WHICH MONDAY A WEEK MAY BE FILED AGAINST
-- ==========================================================================
--
-- 030 requires week_starts_on to be a Monday and asks nothing else of it. The
-- only thing stopping an assistant filing hours against a Monday in 2019 or
-- one six months out is that /hub disables the arrows — and the week it is
-- showing comes from a data-week attribute, which is a thing in a browser.
--
-- Not a CHECK, for the reason 042 gives: a CHECK may not read the clock. So it
-- is a trigger, and a generous one. Twenty-six weeks back covers somebody
-- catching up on a long backlog; one week forward covers a Sunday-night entry
-- landing in a timezone that has already turned over.
--
-- A separate trigger rather than folded into timesheet_placement(), so each
-- one keeps saying one thing.

create or replace function public.timesheet_week_in_range()
returns trigger
language plpgsql
as $fn$
begin
  if new.week_starts_on < (current_date - interval '26 weeks')
  or new.week_starts_on > (current_date + interval '1 week') then
    raise exception
      'that week (%) is outside the range hours may be recorded for', new.week_starts_on;
  end if;
  return new;
end;
$fn$;

drop trigger if exists timesheets_week_in_range on public.timesheets;
create trigger timesheets_week_in_range
  before insert on public.timesheets
  for each row execute function public.timesheet_week_in_range();

-- ==========================================================================
-- 6. THE QUOTE SHOWN AND THE QUOTE STORED
-- ==========================================================================
--
-- `weekly` is an integer, and 30 hours at $7.75 is 232.5. index.html rounds on
-- the way in so PostgREST does not refuse the row — which is correct, and was
-- never the whole story. The visitor is shown $232.50. The row holds 233. And
-- /seats later renders that row back to the same person under the word
-- "Quoted", so the client is shown two different prices for one agreement,
-- fifty cents apart, in writing.
--
-- On a site whose entire argument is "the number you were quoted on the first
-- call, no surprises", that is the promise breaking in the product.
--
-- Cents, in a second integer column, rather than changing `weekly` to numeric.
-- Two reasons. A type change rewrites a column the pages already read, and
-- tools/check.mjs learns column types from `create table` and `add column`
-- only — it would go on believing `weekly` were an integer and go on demanding
-- the rounding that caused this. An added column is seen correctly by both.
--
-- `weekly` keeps being written, rounded, so nothing that reads it today
-- changes underneath. Everything that DISPLAYS a quote reads weekly_cents and
-- falls back only for rows written before this file ran.

alter table public.seat_requests
  add column if not exists weekly_cents integer;

alter table public.seat_requests drop constraint if exists seat_requests_weekly_cents_sane;
alter table public.seat_requests add constraint seat_requests_weekly_cents_sane
  check (weekly_cents is null or weekly_cents between 0 and 100000000);

-- The rows that already exist were written before this column did. Filled in
-- from the only thing those rows can still tell us, which is the rounded
-- figure — knowingly, because inventing the cents back would be worse.
update public.seat_requests
   set weekly_cents = weekly * 100
 where weekly_cents is null and weekly is not null;

-- The SELECT grant on this table is a column list, and 012 says in as many
-- words that anything added from then on has to be added to it in the same
-- file. Adding a column and not this line would not have been a missing
-- number: PostgREST refuses the WHOLE query with 42501 when one selected
-- column is ungranted, so /seats and /admin would both have gone blank the
-- moment they asked for it. That is the trap 016 was written about.
--
-- Re-granted in full rather than added to, which is 012's convention: this
-- file shows the complete set a signed-in client can see, so the next person
-- to add a column copies this list rather than a fragment.

grant select (
  id, created_at, seats, hours, weekly, weekly_cents, blocks, timezone,
  name, company, email, phone, notes,
  status, status_changed_at
) on public.seat_requests to authenticated;

-- ==========================================================================
-- 7 AND 8. WHO DID IT
-- ==========================================================================
--
-- Every "who did this" field in this database is stamped from the verified
-- token, because a field the browser fills is a field the browser can choose:
-- 030 does it for decided_by, 042 for confirmed_by, 028 for a note's author,
-- 008 for scored_by. Two were missed, and both are written by /admin from a
-- variable the page holds.
--
-- Staff-only either way, so nothing is exposed. They are fixed because a
-- record of who agreed something is worth exactly what it cannot be talked
-- into saying, and because four fields following a rule and two not is how the
-- rule stops being one.

-- ── 7. resolving a swap ───────────────────────────────────────────────────
--
-- The grant goes first: with resolved_by writable, the trigger would be
-- overwriting a value the page was still entitled to send, which works and
-- teaches the next reader the wrong thing.

revoke update (resolved_at, resolved_by) on public.swap_requests from authenticated;

create or replace function public.stamp_swap_resolver()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if new.status is distinct from old.status and new.status <> 'open' then
    new.resolved_at := now();
    new.resolved_by := coalesce(auth.jwt() ->> 'email', 'somebody');
  else
    new.resolved_at := old.resolved_at;
    new.resolved_by := old.resolved_by;
  end if;
  return new;
end;
$fn$;

drop trigger if exists swap_requests_stamp on public.swap_requests;
create trigger swap_requests_stamp
  before update on public.swap_requests
  for each row execute function public.stamp_swap_resolver();

-- ── 8. marking somebody contacted ─────────────────────────────────────────
--
-- application_tracking carries a whole-table UPDATE grant and is fenced by a
-- staff-only policy, so the grant is not the lever here and narrowing it would
-- mean listing thirty columns to change one. The trigger is enough, and it is
-- the same shape 008 already uses on this table.
--
-- Both operations, because the page upserts: the first save on an application
-- is an INSERT and every one after it an UPDATE, and a rule that only holds
-- for the second is a rule with a hole the shape of the first contact.

create or replace function public.stamp_contacter()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if tg_op = 'INSERT' then
    if new.last_contacted_at is not null then
      new.contacted_by := coalesce(auth.jwt() ->> 'email', new.contacted_by);
    end if;
    return new;
  end if;

  if new.last_contacted_at is distinct from old.last_contacted_at
     and new.last_contacted_at is not null then
    new.contacted_by := coalesce(auth.jwt() ->> 'email', new.contacted_by);
  else
    new.contacted_by := old.contacted_by;
  end if;
  return new;
end;
$fn$;

drop trigger if exists application_tracking_stamp_contacter on public.application_tracking;
create trigger application_tracking_stamp_contacter
  before insert or update on public.application_tracking
  for each row execute function public.stamp_contacter();

-- ==========================================================================
-- THE ONE THING THIS CANNOT FIX
-- ==========================================================================
--
-- Read this even if you skip everything above.
--
-- Identity in this database is an email address. has_permission() resolves a
-- role by `auth.jwt() ->> 'email'`, owns_application() and is_client_contact()
-- do the same for applicants and clients. That is a sound design and it rests
-- entirely on one assumption: that a session carrying an address can only be
-- obtained by somebody who can read mail at it.
--
-- Google sign-in guarantees that. So does a magic link. Email-and-password
-- sign-up guarantees it ONLY IF the Supabase project requires confirmation
-- before it issues a session — and that is a checkbox in a dashboard, not a
-- line in this repo. /status and /seats both offer "Create one" to the public,
-- and the administrator's own address is written in sql/014.
--
-- If that checkbox is ever off, anybody may type the admin address into the
-- sign-up form on /status, receive a session, and open /admin — the pages
-- share one origin and one stored session, so /admin offering only a Google
-- button changes nothing.
--
-- Supabase → Authentication → Providers → Email → Confirm email. It must be on.
--
-- tools/guard-rls.mjs now asserts this on every run, for the same reason it
-- asserts everything else: this is one toggle away from being untrue and
-- nothing in this repo would change when it happened.

-- ==========================================================================
-- Check it worked
-- ==========================================================================

-- The notice board now asks who is reading. Both arms should be present.
select polname, pg_get_expr(polqual, polrelid) as using_clause
from pg_policy
where polrelid = 'public.notices'::regclass and polcmd = 'r';

-- anon may write the form's own fields and nothing else. `status` and
-- `user_id` must NOT appear.
select column_name
from information_schema.column_privileges
where table_name = 'applications' and grantee = 'anon' and privilege_type = 'INSERT'
order by column_name;

-- Two triggers adopt weeks now, one per way a placement goes live.
select tgname, pg_get_triggerdef(oid) as definition
from pg_trigger
where tgrelid = 'public.placements'::regclass and not tgisinternal
order by tgname;

-- Nobody may write either stamp on a swap.
select column_name, privilege_type
from information_schema.column_privileges
where table_name = 'swap_requests' and grantee = 'authenticated'
order by privilege_type, column_name;

-- How many quotes carry exact cents, and how many were filled in from the
-- rounded figure by this file.
select count(*) filter (where weekly_cents is not null) as with_cents,
       count(*) filter (where weekly_cents = weekly * 100) as from_the_rounded_one,
       count(*) as total
from public.seat_requests;

insert into public.schema_migrations (n) values (46) on conflict (n) do nothing;
