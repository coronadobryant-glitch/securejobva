-- 086 — a day outside the placement
--
-- Run after: 085
-- Safe to re-run: yes
-- Also needed: nothing in the dashboard.
--
-- ==========================================================================
-- WHAT 085 COUNTS, AND WHAT THIS STOPS
-- ==========================================================================
--
-- 085 keeps a day outside its placement's dates off the bill. That is the
-- right answer for weeks already written, and it is only half an answer for
-- the next one: hours she records on a day the placement does not cover are
-- hours that end up billed to nobody, silently, with a week that looks
-- complete. The case that makes it concrete is N93's: a placement with A ends
-- on Wednesday, one with B starts on Thursday, and her Monday-to-Friday sheet
-- is attached to B. Monday to Wednesday were worked for A, and there is no
-- way to put them on A's bill from a week that belongs to B.
--
-- So the write is refused, where she can see it and say so, instead of
-- accepted and lost. /hub saves one day at a time, and on a refusal it puts
-- the box back to what the database holds and shows the message — the day
-- does not disappear, it simply is not saved as this client's.
--
-- WHAT IS REFUSED. Only hours, only more than zero, only on a week that is
-- attached to a placement, only for a date before that placement's
-- started_on or after its ended_on. A week nobody is placed on yet is left
-- completely alone — 043 adopts those weeks later, and 085 counts their days
-- by date when it does. Zero hours are never refused, because /hub's day rows
-- save zeros and a zero is not a claim about anybody's bill.
--
-- WHO IT APPLIES TO. A request from a page that is not staff with
-- applications.edit. Staff are let through: when a straddled week has to be
-- sorted out by hand, they are the ones doing it. The SQL editor is let
-- through for the same reason. Read from the token, because this function is
-- SECURITY DEFINER (it reads the placement whatever the caller's policies
-- are) and inside it current_user is the owner.
--
-- WHAT THIS DOES NOT DO. It does not split a straddled week between two
-- placements. That needs a week per placement rather than a week per person
-- (030's timesheets_one_per_week), which is a change to /hub and to every
-- bill, not to a trigger. Until then the refusal tells her to tell us, and
-- staff record those days where they belong.

do $pre$
begin
  if to_regclass('public.timesheet_days') is null or to_regclass('public.placements') is null then
    raise exception
      'sql/030 and sql/032 have to be run first. This reads timesheet_days, timesheets and placements.';
  end if;
end
$pre$;

create or replace function public.day_is_inside_the_placement()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  pl record;
begin
  if coalesce(auth.jwt() ->> 'role', '') not in ('anon', 'authenticated') then
    return new;
  end if;
  if coalesce(new.hours, 0) <= 0 then
    return new;
  end if;
  -- Only when something about the day's claim changed. A note added to a day
  -- saved before this file ran is not a new claim.
  if tg_op = 'UPDATE'
     and new.hours is not distinct from old.hours
     and new.worked_on is not distinct from old.worked_on then
    return new;
  end if;
  if public.has_permission('applications.edit') then
    return new;
  end if;

  select p.started_on, p.ended_on into pl
  from public.timesheets t
  join public.placements p on p.id = t.placement_id
  where t.id = new.timesheet_id;

  if not found then
    return new;
  end if;

  if pl.started_on is not null and new.worked_on < pl.started_on then
    raise exception
      'Hours on % cannot go on this week: your placement with this client starts on %. If you worked that day, tell us about it.',
      to_char(new.worked_on, 'FMDay FMDD FMMonth'), to_char(pl.started_on, 'FMDay FMDD FMMonth')
      using hint = 'sjva-outside-placement';
  end if;

  if pl.ended_on is not null and new.worked_on > pl.ended_on then
    raise exception
      'Hours on % cannot go on this week: your placement with this client ended on %. If you worked that day, tell us about it.',
      to_char(new.worked_on, 'FMDay FMDD FMMonth'), to_char(pl.ended_on, 'FMDay FMDD FMMonth')
      using hint = 'sjva-outside-placement';
  end if;

  return new;
end;
$fn$;

revoke all on function public.day_is_inside_the_placement() from public, anon, authenticated;

-- Beside 030's timesheet_days_in_week, which asks the other half of the same
-- question: a day has to be inside its week, and now inside its placement.
drop trigger if exists timesheet_days_in_placement on public.timesheet_days;
create trigger timesheet_days_in_placement
  before insert or update on public.timesheet_days
  for each row execute function public.day_is_inside_the_placement();

-- ==========================================================================
-- Check it worked
-- ==========================================================================

select tgname, tgenabled
from pg_trigger
where tgname in ('timesheet_days_in_week', 'timesheet_days_in_placement')
order by tgname;

-- Placements that end and another that starts for the same person inside one
-- week: the straddled weeks this file exists for. Each is worth checking by
-- hand against what was billed.
select a.name, p1.ended_on as first_ends, p2.started_on as next_starts
from public.placements p1
join public.placements p2
  on p2.application_id = p1.application_id and p2.id <> p1.id
join public.applications a on a.id = p1.application_id
where p1.ended_on is not null
  and p2.started_on is not null
  and p2.started_on > p1.ended_on
  and date_trunc('week', p2.started_on) = date_trunc('week', p1.ended_on)
order by p1.ended_on desc;

insert into public.schema_migrations (n) values (86) on conflict (n) do nothing;
