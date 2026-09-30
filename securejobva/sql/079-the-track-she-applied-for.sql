-- 079 — the track she applied for
--
-- Run after: 078
-- Safe to re-run: yes
-- Also needed: nothing in the dashboard.
--
-- ==========================================================================
-- THE PAGE CHOSE THE AXES SHE IS GRADED ON
-- ==========================================================================
--
-- 063's scorer reads the axes from the assessment row's own `track`:
--
--   Admin Tasks          english + detail
--   Sales & Marketing    english + sales + customer
--   anything else        english + customer
--
-- and that `track` comes from the browser. 045 grants INSERT (application_id,
-- track), the policy checks only that the application is hers, and
-- status.html sends `(a.tracks && a.tracks[0]) || a.track || "Customer
-- Service"`. The comment above that line says a browser that lies about its
-- track is scored on the same rules either way. It is not: the rules are
-- picked BY the track. A Sales & Marketing applicant who creates her row from
-- the console with track 'Admin Tasks', or with any string at all, is graded
-- on axes she did not apply for and never on sales.
--
-- ==========================================================================
-- THE DATABASE PICKS IT, THE SAME WAY THE PAGE MEANT TO
-- ==========================================================================
--
-- The first of the tracks she ticked on the application, in the order the
-- form lists them — which is exactly what the page already sends for every
-- honest applicant, so nobody's result moves. Then 002's single `track` for a
-- row old enough to have one, then Customer Service, the page's own default.
--
-- Whatever the request carried is overwritten, not refused. The page sends
-- the right value today and will go on sending it until it is changed; a
-- refusal here would break the Start button for everybody the day this runs,
-- and there is nothing to learn from a disagreement that the overwrite does
-- not already settle.
--
-- ONLY FOR A PAGE. Read from the token, not current_user: this function is
-- SECURITY DEFINER so it can read the application whatever policy the caller
-- is under, and inside a definer function current_user is the owner. A row
-- made by hand in the SQL editor (a re-sit, set up deliberately) carries no
-- token and keeps the track it was given.
--
-- The half this does not do is the page's: status.html decides whether to
-- SHOW the Sales part from applications.track, which nothing has written since
-- tracks[] replaced it, so the part is hidden from everybody while the row is
-- graded on it. That is N14, fixed in the page by reading the track off the
-- assessment row this trigger wrote. The one-off file
-- rescore-sales-without-a-sales-part.sql is for the people it already hit.

do $pre$
begin
  if to_regclass('public.application_assessment') is null then
    raise exception
      'sql/045 has not been run on this database. It creates application_assessment.';
  end if;
end
$pre$;

create or replace function public.assessment_track_is_hers()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  picked text;
begin
  if coalesce(auth.jwt() ->> 'role', '') not in ('anon', 'authenticated') then
    return new;
  end if;

  select coalesce(nullif(btrim(a.tracks[1]), ''), nullif(btrim(a.track), ''), 'Customer Service')
    into picked
  from public.applications a
  where a.id = new.application_id;

  new.track := coalesce(picked, 'Customer Service');
  return new;
end;
$fn$;

revoke all on function public.assessment_track_is_hers() from public, anon, authenticated;

drop trigger if exists assessment_track_is_hers on public.application_assessment;
create trigger assessment_track_is_hers
  before insert on public.application_assessment
  for each row execute function public.assessment_track_is_hers();

-- ==========================================================================
-- Check it worked
-- ==========================================================================

select tgname, tgenabled
from pg_trigger
where tgname = 'assessment_track_is_hers';

-- Rows already written whose track is not the first one she ticked. Each is
-- somebody graded on a track the page chose rather than the one she led with;
-- the usual cause is an application with no tracks at all (old rows), which
-- is harmless. Anything else is worth a look before it is worth a re-score.
select a.name, s.track as graded_on, a.tracks as she_ticked, s.verdict, s.submitted_at::date
from public.application_assessment s
join public.applications a on a.id = s.application_id
where a.tracks is not null
  and cardinality(a.tracks) > 0
  and s.track is distinct from a.tracks[1]
order by s.started_at desc;

insert into public.schema_migrations (n) values (79) on conflict (n) do nothing;
