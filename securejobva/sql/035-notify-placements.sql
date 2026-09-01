-- DO NOT RE-RUN THIS FILE ON ITS OWN
--
-- The header above says this file is safe to re-run, and on its own it is:
-- every statement in it is written to be repeatable. What it is not safe to
-- do is run it AFTER the files that come later, because it defines functions
-- they have since replaced — and `create or replace` does exactly what it
-- says. Re-running this puts its own versions back.
--
-- Nothing warns you when that happens. Columns are added with `if not
-- exists` so they survive; only the logic goes backwards. The schema looks
-- perfect and the behaviour is months old.
--
-- What this file would take back, and what to run afterwards to undo it:
--
--   notify_decision
--     -> re-run 037-fix-notify-record-fields.sql to restore
--
-- So if you ever run this file again, run every later file it names above,
-- in number order, straight afterwards. tools/check.mjs keeps this list
-- honest: a new file that supersedes something here fails the build until
-- this block names it.
-- 035 — tell an assistant she has a client
--
-- Run after: 034
-- Safe to re-run: yes
-- Also needed: nothing in the dashboard.
--
-- 032 gave an assistant a client and a card in her portal saying so. Nothing
-- told her. She finds out by opening /hub and noticing, which is the failure
-- 031 was written to end and is worth ending everywhere rather than once.
--
-- Three moments, and they are not the same message:
--
--   matched   we have picked somebody for you, and there is a meeting coming.
--             Nothing is settled. This is the one that stops the silence while
--             we arrange it.
--   trial     they said yes. Here is your first day, your hours, and how long
--             the trial runs.
--   ongoing   they want to keep you. Short, and worth sending — being kept on
--             is the thing she has been waiting to hear.
--
-- Nothing sends when a placement ends. That is a conversation with a person,
-- in their own words, and an automated email would arrive before it.
--
-- notify_decision() is replaced rather than 031 edited: a migration that has
-- run is never changed, and CREATE OR REPLACE in a later file is how this
-- codebase moves a function.

do $$
begin
  if '__WEBHOOK_SECRET__' like ('\_\_WEBHOOK' || '\_SECRET\_\_') then
    raise exception
      'This is the repo copy, with the placeholder still in it. Paste the filled-in copy instead — the one with the real WEBHOOK_SECRET, from the scratchpad or from Vercel.';
  end if;
end $$;

create or replace function public.notify_decision()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  who     record;
  ev      text;
  total   numeric := 0;
  daysx   text    := '';
  cname   text;
  payload jsonb;
begin
  if tg_table_name = 'applications' then
    who := new;
  else
    select a.name, a.email into who
    from public.applications a
    where a.id = new.application_id;
  end if;

  if who is null or coalesce(btrim(who.email), '') = '' then
    return new;
  end if;

  if tg_table_name = 'applications' then
    ev := case when new.status in ('assessment', 'interview', 'approved', 'hired', 'declined')
               then 'decided' else null end;
  elsif tg_table_name = 'placements' then
    -- 'ended' is absent on purpose. Losing a placement is not something to
    -- hear from a robot.
    ev := case when new.status in ('matched', 'trial', 'ongoing') then 'decided' else null end;
  elsif tg_table_name = 'timesheets' then
    ev := case when new.status = 'submitted' then 'arrived'
               when new.status in ('approved', 'returned') then 'decided'
               else null end;
  else
    ev := case when tg_op = 'INSERT' then 'arrived'
               when new.status in ('approved', 'declined') then 'decided'
               else null end;
  end if;

  if ev is null then
    return new;
  end if;

  if tg_table_name = 'timesheets' then
    select coalesce(sum(d.hours), 0),
           coalesce(string_agg(
             to_char(d.worked_on, 'Dy') || ' ' || trim(to_char(d.hours, 'FM990.99')),
             ' · ' order by d.worked_on) filter (where d.hours > 0), '')
      into total, daysx
      from public.timesheet_days d
     where d.timesheet_id = new.id;
  end if;

  if tg_table_name = 'placements' then
    select c.name into cname from public.clients c where c.id = new.client_id;
  end if;

  payload := jsonb_build_object(
    'type',  'STATUS',
    'event', ev,
    'table', tg_table_name,
    'person', jsonb_build_object('name', who.name, 'email', who.email),
    'record', case tg_table_name
      when 'applications' then jsonb_build_object(
        'id',     new.id,
        'status', new.status,
        'name',   new.name,
        'again',  (coalesce(new.status_changed_at, new.created_at)
                    + interval '3 months')::date)
      when 'placements' then jsonb_build_object(
        'id',             new.id,
        'status',         new.status,
        'client',         cname,
        'started_on',     new.started_on,
        'hours_per_week', new.hours_per_week,
        'trial_weeks',    new.trial_weeks)
      when 'timesheets' then jsonb_build_object(
        'id',             new.id,
        'status',         new.status,
        'week_starts_on', new.week_starts_on,
        'note',           new.note,
        'decided_by',     new.decided_by,
        'hours',          total,
        'days',           daysx)
      else jsonb_build_object(
        'id',         new.id,
        'status',     new.status,
        'starts_on',  new.starts_on,
        'ends_on',    new.ends_on,
        'reason',     new.reason,
        'decided_by', new.decided_by)
      end
  );

  begin
    perform net.http_post(
      url     := 'https://www.securejobva.com/api/notify',
      body    := payload,
      headers := jsonb_build_object(
        'Content-Type',    'application/json',
        'x-webhook-secret', '__WEBHOOK_SECRET__'),
      timeout_milliseconds := 10000
    );
  exception when others then
    raise warning 'notify_decision could not post for % %: %', tg_table_name, new.id, sqlerrm;
  end;

  return new;
end;
$fn$;

-- ==========================================================================
-- WHERE IT FIRES
-- ==========================================================================
--
-- A placement is created as 'matched', so the insert is the first message. The
-- update trigger carries the two after it.

drop trigger if exists "notify-placement-made" on public.placements;
create trigger "notify-placement-made"
  after insert on public.placements
  for each row
  execute function public.notify_decision();

drop trigger if exists "notify-placement-status" on public.placements;
create trigger "notify-placement-status"
  after update of status on public.placements
  for each row
  when (old.status is distinct from new.status)
  execute function public.notify_decision();

-- ==========================================================================
-- Check it worked
-- ==========================================================================
--
-- Nine rows now: the three original webhooks, 031's four, and these two.

select c.relname as table_name, t.tgname as trigger_name, p.proname as runs
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_proc p on p.oid = t.tgfoid
where not t.tgisinternal and t.tgname like 'notify-%'
order by c.relname, t.tgname;

-- Should match the fingerprint the other webhooks carry.
select md5(substring(prosrc from 'x-webhook-secret'',\s*''([^'']+)')) as secret_md5
from pg_proc where proname = 'notify_decision';
