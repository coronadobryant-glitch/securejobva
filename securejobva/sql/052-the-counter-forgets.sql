-- 052 — the counter forgets
--
-- Run after: 051
-- Safe to re-run: yes
-- Also needed: nothing in the dashboard.
--
-- ==========================================================================
-- A COMMENT THAT WAS NOT TRUE
-- ==========================================================================
--
-- 047 built the rate limit, and its own comment says this:
--
--   "Old windows are of no interest to anybody. Cleared opportunistically
--    rather than on a schedule, because a cron job for a table that holds a
--    few hundred rows is a moving part that has to be maintained forever."
--
-- Then it cleared them with a single DELETE in the body of the migration.
-- That is not opportunistic, it is once — the moment somebody pastes the file
-- — and never again. Nothing else in 047 ever deletes a row.
--
-- So public.intake_throttle grows forever, one row per address per form, and
-- what it grows is a list of the IP addresses of everybody who has ever filled
-- in a form on the site.
--
-- ==========================================================================
-- WHY THAT MATTERS MORE THAN THE DISK
-- ==========================================================================
--
-- The table is tiny and would stay tiny for years, so the size is not the
-- point. An IP address is personal data, /privacy says information is kept
-- "as long as we need it to provide the service or to meet a legal
-- obligation", and what a rate limiter needs is one hour. Keeping it for ever
-- because a DELETE was in the wrong place is not a decision anybody made.
--
-- The address is still worth recording for the hour it is counting, and that
-- is an ordinary thing to do to stop somebody flooding a form. It is the
-- keeping that had no reason behind it.
--
-- ==========================================================================
-- WHERE THE DELETE ACTUALLY GOES
-- ==========================================================================
--
-- Inside the trigger, at the one moment that is already doing work about
-- expiry: when a caller comes back and their window has run out. That happens
-- rarely — once per caller per hour at most — so it costs nothing, and it
-- sweeps the whole table rather than just that row, which means addresses
-- belonging to people who never came back are cleared by the next person who
-- does.
--
-- No cron, no scheduled function, no moving part to maintain. 047 wanted this;
-- it just put the line outside the function.

do $pre$
begin
  if to_regclass('public.intake_throttle') is null then
    raise exception
      'sql/047 has not been run on this database. It creates the counter this file changes. Run sql/047 first.';
  end if;
end
$pre$;

create or replace function public.throttle_intake()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  ip     text := public.caller_ip();
  lim    integer;
  key    text;
  cur    public.intake_throttle%rowtype;
begin
  -- No address, no counting. caller_ip() returns null when the request headers
  -- are not readable, and this waves everything through rather than refusing
  -- it: losing a real lead is a far worse failure than admitting a bot.
  if ip is null then
    return new;
  end if;

  lim := case tg_table_name
           when 'applications'     then 5
           when 'seat_requests'    then 10
           when 'contact_messages' then 10
           else 20
         end;

  key := ip || ':' || tg_table_name;

  insert into public.intake_throttle (bucket, window_start, n)
  values (key, now(), 0)
  on conflict (bucket) do nothing;

  select * into cur from public.intake_throttle where bucket = key for update;

  -- A window older than an hour is a window that is over.
  if cur.window_start < now() - interval '1 hour' then
    update public.intake_throttle
       set window_start = now(), n = 1
     where bucket = key;

    -- The line 047 meant to write. Somebody's window expiring is the moment
    -- this table is already thinking about time, so it is the moment to drop
    -- everything nobody is counting any more. Two days rather than one hour
    -- because a little slack costs nothing and makes the table readable when
    -- somebody is trying to work out whether the limit is doing anything.
    delete from public.intake_throttle
     where window_start < now() - interval '2 days';

    return new;
  end if;

  if cur.n >= lim then
    raise exception
      'That is more submissions than we accept from one place in an hour. Write to support@securejobva.com and a person will pick it up.'
      using hint = 'sjva-throttled';
  end if;

  update public.intake_throttle set n = cur.n + 1 where bucket = key;
  return new;
end;
$fn$;

revoke all on function public.throttle_intake() from public, anon, authenticated;

-- The triggers already point at this function by name, so replacing the
-- function is the whole change. Recreated anyway, so a database where 047 was
-- pasted without them ends up in the same place as one where it was not.

drop trigger if exists throttle_applications on public.applications;
create trigger throttle_applications
  before insert on public.applications
  for each row execute function public.throttle_intake();

drop trigger if exists throttle_seat_requests on public.seat_requests;
create trigger throttle_seat_requests
  before insert on public.seat_requests
  for each row execute function public.throttle_intake();

drop trigger if exists throttle_contact_messages on public.contact_messages;
create trigger throttle_contact_messages
  before insert on public.contact_messages
  for each row execute function public.throttle_intake();

-- And clear what has already built up, which on a database that has been
-- taking submissions for a while is every address it has ever seen.
delete from public.intake_throttle
 where window_start < now() - interval '2 days';

-- ==========================================================================
-- Check it worked
-- ==========================================================================

-- The function now contains its own delete. Without this the table still
-- never forgets and this file changed nothing.
select pg_get_functiondef(oid) ~ 'delete from public.intake_throttle'
         as the_counter_forgets
from pg_proc
where proname = 'throttle_intake' and pronamespace = 'public'::regnamespace;

-- What it is holding right now, and how old the oldest of it is. Anything
-- older than two days after a form has been submitted means the sweep is not
-- running.
select count(*) as rows_held,
       min(window_start) as oldest,
       round(extract(epoch from (now() - min(window_start))) / 3600, 1) as oldest_hours
from public.intake_throttle;

insert into public.schema_migrations (n) values (52) on conflict (n) do nothing;
