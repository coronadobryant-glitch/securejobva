-- 056 — the clock somebody reads
--
-- Run after: 055
-- Safe to re-run: yes
-- Also needed: nothing in the dashboard.
--
-- ==========================================================================
-- THE BUSINESS RUNS ON CENTRAL. THE PEOPLE DO NOT.
-- ==========================================================================
--
-- Two clocks already exist in this product and both are right:
--
--   The company clock. todayCentral() in /admin asks for America/Chicago by
--   name, because ended_on decides which weeks a placement covers and a
--   contractor stamping it from Manila would date it a day ahead. The business
--   is in Houston, so that date is Houston's.
--
--   The reader's clock. when() renders a timestamptz with the browser's own
--   zone, because an instant should be shown in the time of whoever is
--   looking at it.
--
-- What is missing is the case where those two disagree with the person. An
-- assistant in Manila working American hours does not think in Manila time —
-- she thinks in the hours she is on. An applicant told their interview is at
-- "Sep 8, 9:00 AM" reads it in whatever zone their laptop happens to be set
-- to, which after a flight is not the zone they are in.
--
-- The browser's guess is a good default and a bad decision. This is the row
-- that lets somebody overrule it.
--
-- ==========================================================================
-- ONE ROW PER PERSON, AND THEY OWN IT
-- ==========================================================================
--
-- Keyed on the user rather than the application, because all three kinds of
-- person here need it and only one of them has an application. A client
-- contact has a clients row, an assistant has an application, an applicant has
-- an application they may still be editing — the one thing all three have is
-- an account.
--
-- Nobody but the owner may read it. It is a preference, not a fact about them,
-- and staff have no screen that needs it: /admin already asks for Central by
-- name wherever a date matters, which is the behaviour this must not disturb.

create table if not exists public.user_settings (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  -- Null is a real answer and the default one: "use whatever this browser
  -- says". Storing the browser's guess at first sign-in would freeze a guess
  -- into a decision, and the guess is right often enough that most people
  -- should never have to think about this at all.
  time_zone  text,
  updated_at timestamptz not null default now(),

  constraint user_settings_tz_sane
    check (time_zone is null or length(btrim(time_zone)) between 1 and 64)
);

-- ==========================================================================
-- A ZONE THAT DOES NOT EXIST IS NOT A ZONE
-- ==========================================================================
--
-- The length check above stops something absurd and lets "Mars/Olympus"
-- straight through. A check constraint cannot ask the catalogue — no
-- subqueries — so the question is asked here, by trying it.
--
-- This matters more than a tidy column. The page hands this string to
-- Intl.DateTimeFormat, which THROWS on a name it does not know; a bad value
-- stored here would render every date on that person's portal as an error
-- rather than as a date. Refusing it at the door is the difference between one
-- rejected form and a portal that does not draw.

create or replace function public.check_time_zone()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if new.time_zone is not null then
    new.time_zone := btrim(new.time_zone);
    if new.time_zone = '' then
      new.time_zone := null;
    else
      begin
        perform now() at time zone new.time_zone;
      exception when others then
        raise exception 'there is no time zone called %', new.time_zone;
      end;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$fn$;

drop trigger if exists user_settings_check_tz on public.user_settings;
create trigger user_settings_check_tz
  before insert or update on public.user_settings
  for each row execute function public.check_time_zone();

-- ==========================================================================
-- THE ZONES WORTH OFFERING
-- ==========================================================================
--
-- pg_timezone_names holds about six hundred entries, most of which are
-- historical aliases nobody should be shown in a dropdown. This returns the
-- ones with a region in them, with their current offset, so the page can label
-- an option "Asia/Manila — UTC+08" without shipping a table of offsets that
-- goes stale twice a year.
--
-- Readable by anyone signed in: it is a list of the world's time zones, and
-- there is nothing in it about anybody.
--
-- SECURITY INVOKER, unlike almost everything else in this schema. The two
-- functions above it are DEFINER because they have to reach past the caller's
-- own row; this one reads a catalogue every role can already read, so
-- borrowing the owner's rights would buy nothing and hand out a function that
-- runs as the owner and never asks who is calling. tools/check.mjs enforces
-- exactly that rule and was right to refuse the first draft of this.

create or replace function public.time_zones()
returns table (name text, abbrev text, utc_offset interval)
language sql
stable
security invoker
set search_path = public, pg_temp
as $fn$
  select t.name, t.abbrev, t.utc_offset
  from pg_timezone_names t
  where t.name like '%/%'
    and t.name not like 'posix/%'
    and t.name not like 'Etc/%'
  order by t.utc_offset, t.name;
$fn$;

revoke all on function public.time_zones() from public, anon;
grant execute on function public.time_zones() to authenticated;

-- ==========================================================================
-- WHO MAY SEE AND DO WHAT
-- ==========================================================================

alter table public.user_settings enable row level security;

revoke all on public.user_settings from anon;

grant select on public.user_settings to authenticated;
-- updated_at is in no grant. The trigger writes it, so "when did they last
-- change this" stays an answer rather than a field the page fills in.
grant insert (user_id, time_zone) on public.user_settings to authenticated;
grant update (time_zone)          on public.user_settings to authenticated;

-- auth.uid() throughout, and no has_permission anywhere. This is the one table
-- in the schema that nobody but its owner reads — not staff, not an
-- administrator. There is no screen that needs it and no question it answers
-- about somebody else.

drop policy if exists "a person reads their own settings" on public.user_settings;
create policy "a person reads their own settings"
  on public.user_settings for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "a person makes their own settings" on public.user_settings;
create policy "a person makes their own settings"
  on public.user_settings for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "a person changes their own settings" on public.user_settings;
create policy "a person changes their own settings"
  on public.user_settings for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ==========================================================================
-- Check it worked
-- ==========================================================================

-- The one rule. Empty is the pass.
select privilege_type
from information_schema.role_table_grants
where table_name = 'user_settings' and grantee = 'anon';

-- updated_at may be read and not written. Empty is the pass.
select column_name, privilege_type
from information_schema.column_privileges
where table_name = 'user_settings'
  and grantee in ('anon', 'authenticated')
  and privilege_type in ('INSERT', 'UPDATE')
  and column_name = 'updated_at';

-- A name that does not exist is refused. This should raise, and the raise is
-- the pass — comment it out once you have watched it fail.
-- insert into public.user_settings (user_id, time_zone)
-- values (auth.uid(), 'Mars/Olympus');

-- The dropdown the page will draw, first and last twenty. If this returns
-- nothing, the function is not readable and the settings card will fall back
-- to a plain text field rather than break.
select name, abbrev, utc_offset from public.time_zones() limit 20;

-- Who has overruled the browser, if anyone.
select time_zone, count(*)
from public.user_settings
where time_zone is not null
group by time_zone
order by count(*) desc;

insert into public.schema_migrations (n) values (56) on conflict (n) do nothing;
