-- 106 — the client hears that hours are waiting for them
--
-- Run after: 105
-- Safe to re-run: yes
-- Also needed: api/notify.js taught DECIDE.timesheets.waiting (CONTRACT.md).
--   Until it is, the post answers 200 "skipped" and nothing is sent.
--
-- ==========================================================================
-- THE ONE PERSON WHO HAS TO ACT IS THE ONE NOT TOLD (F20)
-- ==========================================================================
--
-- An assistant sends her week. 031 emails staff ("Timesheet sent") and nobody
-- else. The week is now waiting on the client — 033's policy lets the client
-- approve or return it, and nobody else should unless the client cannot be
-- reached — and the client is not told. Unless they happen to sign in, the
-- hours sit there until staff chase them or approve it themselves, which is
-- the step the whole approval exists to keep in the client's hands.
--
-- So sending a week now also emails the client contact of the placement the
-- week belongs to (033's timesheet_placement decides which, from the dates):
-- whose week, which week, how many hours on which days, and where to approve
-- it. Staff still get theirs from notify_decision; this is a second post, to
-- a different person, with a different job.
--
-- Not sent when the week belongs to no placement (somebody hired and not yet
-- placed records hours too, 034 says — there is nobody to approve them), or
-- the client has no contact address (104 is how one is added).
--
-- Every time a week is sent, including a week sent again after the client
-- returned it: that is precisely when the client is waiting to look again.
--
-- ==========================================================================
-- THE PAYLOAD
-- ==========================================================================
--
--   { type: 'STATUS', table: 'timesheets', event: 'waiting',
--     person: { name: <client contact>, email: <client address> },
--     record: { id, week_starts_on, hours, days, assistant, business,
--               trial_week, again } }
--
-- hours and days are worked out exactly as notify_decision does for staff, so
-- the two emails about one week always show the same numbers. `again` is true
-- when this week had been returned before.

do $pre$
begin
  if to_regprocedure('public.notify_send(jsonb, text, text)') is null then
    raise exception 'sql/095 has not been run on this database.';
  end if;
end
$pre$;

create or replace function public.notify_client_week()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  info  record;
  total numeric := 0;
  daysx text    := '';
begin
  if new.status <> 'submitted' or new.status is not distinct from old.status then
    return new;
  end if;

  if new.placement_id is null then
    return new;
  end if;

  select c.name as business, cp.contact_name, cp.contact_email, a.name as assistant
    into info
    from public.placements p
    join public.applications a on a.id = p.application_id
    join public.clients c on c.id = p.client_id
    left join public.client_private cp on cp.client_id = c.id
   where p.id = new.placement_id;

  if coalesce(btrim(info.contact_email), '') = '' then
    return new;
  end if;

  select coalesce(sum(d.hours), 0),
         coalesce(string_agg(
           to_char(d.worked_on, 'Dy') || ' ' || trim(to_char(d.hours, 'FM990.99')),
           ' · ' order by d.worked_on) filter (where d.hours > 0), '')
    into total, daysx
    from public.timesheet_days d
   where d.timesheet_id = new.id;

  perform public.notify_send(
    jsonb_build_object(
      'type',   'STATUS',
      'event',  'waiting',
      'table',  'timesheets',
      'person', jsonb_build_object('name', info.contact_name, 'email', info.contact_email),
      'record', jsonb_build_object(
        'id',             new.id,
        'week_starts_on', new.week_starts_on,
        'hours',          total,
        'days',           daysx,
        'assistant',      info.assistant,
        'business',       info.business,
        'trial_week',     new.trial_week,
        'again',          old.status = 'returned')),
    'https://www.securejobva.com/api/notify',
    'notify_client_week');

  return new;
end;
$fn$;

revoke all on function public.notify_client_week() from public, anon, authenticated;

drop trigger if exists "notify-client-week" on public.timesheets;
create trigger "notify-client-week"
  after update of status on public.timesheets
  for each row
  when (old.status is distinct from new.status)
  execute function public.notify_client_week();

insert into public.schema_migrations (n) values (106) on conflict (n) do nothing;

-- ==========================================================================
-- Check it worked
-- ==========================================================================
--
-- Weeks waiting on a client right now, and whether that client could be told.
-- These were sent before this file and their client was never emailed — the
-- list to chase today. 'nobody to tell' is a week with no placement or a
-- client with no address. Empty is fine.

select coalesce(c.name, '— no placement —') as client,
       a.name as assistant,
       t.week_starts_on,
       t.submitted_at,
       case when t.placement_id is null then 'nobody to tell: no placement'
            when coalesce(btrim(cp.contact_email), '') = '' then 'nobody to tell: no address'
            else 'will be told next time a week is sent' end as client_told
from public.timesheets t
join public.applications a on a.id = t.application_id
left join public.placements p on p.id = t.placement_id
left join public.clients c on c.id = p.client_id
left join public.client_private cp on cp.client_id = c.id
where t.status = 'submitted'
order by t.submitted_at;
