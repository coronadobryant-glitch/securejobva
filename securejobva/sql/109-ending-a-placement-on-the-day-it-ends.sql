-- 109 — ending a placement on the day it actually ends
--
-- Run after: 108, and 095 (pg_cron, which this schedules a daily job on)
-- Safe to re-run: yes
-- Also needed: /admin's End control asking for the last day and calling
--   end_placement() (CONTRACT.md), and api/notify.js taught
--   DECIDE.placements.ended for the client's email. Until the template lands
--   the post answers 200 "skipped".
--
-- ==========================================================================
-- THE END DATE IS THE DAY SOMEBODY CLICKED (F28)
-- ==========================================================================
--
-- /admin ends a placement by setting status 'ended' and ended_on to today,
-- Central. There is no other date it can write. Two things follow:
--
--   - a placement with a notice period cannot be ended ahead of time; staff
--     have to remember to come back on the day
--   - an ending recorded a few days late leaves the days in between inside
--     the placement, so she can still log hours against a client she stopped
--     working for (086 refuses hours after ended_on, not after the day she
--     actually stopped)
--
-- end_placement(placement, last_day) takes the date:
--
--   last_day today or earlier   ended now: status 'ended', ended_on last_day
--   last_day in the future      ended_on is set and the placement stays live
--                               until then; a daily job (below) ends it the
--                               morning after its last day. Hours can be
--                               logged up to and including that day, and
--                               none after it.
--   last_day null               takes back a future end not yet reached
--   last_day before her first   it never began: status 'ended', no ended_on,
--     day, no hours logged      returns 'ended before starting'. The client
--                               decided against her, or it fell through,
--                               before her start date.
--
-- Bounded:
--
--   - not before she started (032's constraint, said in words here first),
--     unless it never began at all — above
--   - not more than 120 days out — the same window 042 allows for a start
--   - never before a day already APPROVED by the client. Moving the end
--     before an approved day would turn hours the client has agreed to pay
--     into hours nobody is charged for (085 counts a day after ended_on as
--     outside the placement), changing a bill after it was agreed. Hours in
--     weeks not yet approved simply stop counting, which is the point.
--   - an ended placement's date can still be corrected, the same way, for
--     the ending recorded late
--
-- ==========================================================================
-- AND NOBODY IS TOLD (F27)
-- ==========================================================================
--
-- When a placement ends, nobody is emailed, by design (035): ending is a
-- conversation with a person, not a robot's job. That stays true for the
-- ASSISTANT — somebody still tells her, in their own words.
--
-- The client is different: the end is usually theirs, the bill stays on
-- /seats after the card disappears, and nothing tells them the ending was
-- recorded or which day it took effect. So the client contact now gets one
-- email when the placement's status becomes 'ended', from whatever path:
-- end_placement, the daily job, or /admin's dropdown.
--
--   { type: 'STATUS', table: 'placements', event: 'ended',
--     person: { name: <client contact>, email: <client address> },
--     record: { id, business, assistant, ended_on, never_started } }
--
-- never_started is true when there is no ended_on: the placement was called
-- off before her first day, and the email says it will not go ahead instead
-- of naming a last day.

do $pre$
begin
  if to_regprocedure('public.notify_send(jsonb, text, text)') is null then
    raise exception 'sql/095 has not been run on this database.';
  end if;
  if to_regclass('cron.job') is null then
    raise exception 'pg_cron is not on. sql/095 switches it on; run that first.';
  end if;
end
$pre$;

-- ── ending one ──────────────────────────────────────────────────────────────

create or replace function public.end_placement(placement uuid, last_day date)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  pl       public.placements;
  approved date;
  today    date := (now() at time zone 'America/Chicago')::date;
begin
  if auth.uid() is null then
    raise exception 'sign in first';
  end if;
  if not public.has_permission('applications.edit') then
    raise exception 'only SecureJobVA staff can end a placement';
  end if;

  select * into pl from public.placements p where p.id = placement for update;
  if pl.id is null then
    raise exception 'no such placement';
  end if;

  -- Taking back an end that has not happened yet.
  if last_day is null then
    if pl.status = 'ended' then
      raise exception 'This placement has already ended. Set the day it ended instead.'
        using hint = 'sjva-end-already';
    end if;
    update public.placements set ended_on = null where id = pl.id;
    return 'no end date';
  end if;

  -- Ended before it began. A client who decides against her after the
  -- interview, or a deal that falls through before her first day, is an end
  -- with no last day at all — there was no day she worked. Any last day
  -- before her first is how /admin says so. Writing her start day as the last
  -- day instead would keep the placement live through a day she never works,
  -- let her log hours on it, keep her from being placed anywhere else until
  -- then, and tell the client it ended on a day that never happened.
  --
  -- So: ended, with no ended_on (032's placements_dates_sane allows a null),
  -- and any empty weeks already hung on it let go, so nothing can be billed
  -- to a placement that never ran (the timesheet trigger below keeps new
  -- weeks off it too). Only while not one hour has been logged on it: hours
  -- mean she did start, whatever the date says, and the refusal that follows
  -- is the right answer — correct the start date first.
  if pl.started_on is not null and last_day < pl.started_on
     and not exists (select 1
                       from public.timesheets t
                       join public.timesheet_days d on d.timesheet_id = t.id
                      where t.placement_id = pl.id
                        and coalesce(d.hours, 0) > 0) then
    update public.timesheets
       set placement_id = null, trial_week = false
     where placement_id = pl.id;

    update public.placements
       set status = 'ended', ended_on = null
     where id = pl.id;
    return 'ended before starting';
  end if;

  if pl.started_on is not null and last_day < pl.started_on then
    raise exception 'Her last day cannot be before her first (%): she already has hours logged on this placement. If she started earlier, correct her start date first.', to_char(pl.started_on, 'FMDD Mon YYYY')
      using hint = 'sjva-end-before-start';
  end if;

  if last_day > today + 120 then
    raise exception 'That is more than four months away.'
      using hint = 'sjva-end-too-far';
  end if;

  select max(d.worked_on) into approved
    from public.timesheets t
    join public.timesheet_days d on d.timesheet_id = t.id
   where t.placement_id = pl.id
     and t.status = 'approved'
     and coalesce(d.hours, 0) > 0;

  if approved is not null and last_day < approved then
    raise exception 'The client has already approved hours on %, so the last day cannot be before it. Ending earlier would leave approved hours unbilled.',
      to_char(approved, 'FMDay FMDD Mon')
      using hint = 'sjva-end-before-approved';
  end if;

  if last_day <= today then
    update public.placements
       set status = 'ended', ended_on = last_day
     where id = pl.id;
    return 'ended';
  end if;

  -- Still working her notice. The daily job ends it after last_day.
  if pl.status = 'ended' then
    raise exception 'This placement has already ended, so its last day cannot be in the future.'
      using hint = 'sjva-end-already';
  end if;

  update public.placements set ended_on = last_day where id = pl.id;
  return 'ends after ' || to_char(last_day, 'YYYY-MM-DD');
end;
$fn$;

revoke all on function public.end_placement(uuid, date) from public, anon;
grant execute on function public.end_placement(uuid, date) to authenticated;

-- ── the daily job ───────────────────────────────────────────────────────────
--
-- Ends every live placement whose last day has gone by, in Central, where the
-- clients are. Run at 06:10 UTC, which is just after midnight Central in
-- summer and just after 1 AM in winter — after the last day, either way.

create or replace function public.end_placements_due()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  n integer;
begin
  update public.placements
     set status = 'ended'
   where status in ('matched', 'trial', 'ongoing')
     and ended_on is not null
     and ended_on < (now() at time zone 'America/Chicago')::date;
  get diagnostics n = row_count;
  return n;
end;
$fn$;

revoke all on function public.end_placements_due() from public, anon, authenticated;

do $job$
begin
  perform cron.unschedule(j.jobname) from cron.job j where j.jobname = 'sjva-end-placements';
  perform cron.schedule('sjva-end-placements', '10 6 * * *', 'select public.end_placements_due()');
end
$job$;

-- ── a placement that never began takes no weeks ────────────────────────────
--
-- 034's timesheet_placement hangs a new week on the placement it falls inside,
-- and counts an ended one, so that weeks worked before an end still land on
-- it. An ended placement with no ended_on has no inside: it never ran. Read by
-- 034 it would cover every week from its start date on, forever, and the
-- first hours she logged for somebody else — or for nobody yet — would be
-- billed to a client who said no.
--
-- A second trigger rather than a new 034, so 034 stays the one file that
-- defines that function. Same event, named to sort after timesheets_placement
-- (Postgres fires them in name order), so it sees 034's answer and corrects
-- it only when that answer is a placement that never began. The search is
-- 034's own, repeated with that one exclusion, and so is the trial arithmetic
-- — repeated rather than shared, as 043 does, so each reads on its own.

create or replace function public.timesheet_skips_unstarted()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  p record;
begin
  if new.placement_id is null
     or not exists (select 1 from public.placements x
                     where x.id = new.placement_id
                       and x.status = 'ended' and x.ended_on is null) then
    return new;
  end if;

  select pl.id, pl.started_on, pl.trial_weeks into p
  from public.placements pl
  where pl.application_id = new.application_id
    and pl.status in ('trial', 'ongoing', 'ended')
    and not (pl.status = 'ended' and pl.ended_on is null)
    and (pl.started_on is null or pl.started_on <= new.week_starts_on + 6)
    and (pl.ended_on is null or pl.ended_on >= new.week_starts_on)
  order by pl.started_on desc nulls last
  limit 1;

  new.placement_id := p.id;
  new.trial_week := (
    p.id is not null
    and p.trial_weeks is not null
    and p.started_on is not null
    and new.week_starts_on <= p.started_on + (p.trial_weeks * 7) - 1
  );

  return new;
end;
$fn$;

revoke all on function public.timesheet_skips_unstarted() from public, anon, authenticated;

drop trigger if exists timesheets_placement_skips_unstarted on public.timesheets;
create trigger timesheets_placement_skips_unstarted
  before insert on public.timesheets
  for each row execute function public.timesheet_skips_unstarted();

-- ── telling the client ──────────────────────────────────────────────────────

create or replace function public.notify_placement_ended()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  info record;
begin
  if new.status <> 'ended' or old.status = 'ended' then
    return new;
  end if;

  select c.name as business, cp.contact_name, cp.contact_email, a.name as assistant
    into info
    from public.clients c
    left join public.client_private cp on cp.client_id = c.id
    join public.applications a on a.id = new.application_id
   where c.id = new.client_id;

  if coalesce(btrim(info.contact_email), '') = '' then
    return new;
  end if;

  perform public.notify_send(
    jsonb_build_object(
      'type',   'STATUS',
      'event',  'ended',
      'table',  'placements',
      'person', jsonb_build_object('name', info.contact_name, 'email', info.contact_email),
      'record', jsonb_build_object(
        'id',        new.id,
        'business',  info.business,
        'assistant', info.assistant,
        'ended_on',  new.ended_on,
        -- No last day means it never began (end_placement's 'ended before
        -- starting'). The template says it will not go ahead rather than
        -- printing an empty date.
        'never_started', new.ended_on is null)),
    'https://www.securejobva.com/api/notify',
    'notify_placement_ended');

  return new;
end;
$fn$;

revoke all on function public.notify_placement_ended() from public, anon, authenticated;

drop trigger if exists "notify-placement-ended" on public.placements;
create trigger "notify-placement-ended"
  after update of status on public.placements
  for each row
  when (old.status is distinct from new.status)
  execute function public.notify_placement_ended();

insert into public.schema_migrations (n) values (109) on conflict (n) do nothing;

-- ==========================================================================
-- Check it worked
-- ==========================================================================
--
-- The daily job, and every live placement that already has a last day set —
-- the ones it will end. Expect the job row to say 'daily, active'.

select 'job' as what, 'sjva-end-placements' as which,
       coalesce((select case when j.active then 'daily, active' else 'PAUSED' end
                   from cron.job j where j.jobname = 'sjva-end-placements'),
                'MISSING') as detail
union all
select 'ends soon', coalesce(c.name, 'a client') || ' — ' || a.name,
       'last day ' || to_char(p.ended_on, 'YYYY-MM-DD')
from public.placements p
join public.applications a on a.id = p.application_id
left join public.clients c on c.id = p.client_id
where p.status in ('matched', 'trial', 'ongoing') and p.ended_on is not null
order by 1 desc, 2;
