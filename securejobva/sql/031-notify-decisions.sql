-- 031 — tell people when a decision is made
--
-- Run after: 030
-- Safe to re-run: yes
-- Also needed: nothing in the dashboard. pg_net must be available, which it is
--   wherever Supabase Database Webhooks work — 019, 021 and 028 all run on it.
--
-- Mail goes out when something arrives from the public: an application, a seat
-- request, a contact message. Nothing goes out when a decision comes back. So
-- somebody sends a week of hours, it is sent back with "Thursday looks like a
-- double entry", and they are told nothing at all — they find out only if they
-- happen to open /hub. Leave has been the same since 026.
--
-- That is the failure this codebase keeps meeting from the other side: the
-- thing worked, and the reporting of it did not.
--
-- ==========================================================================
-- WHY THIS DOES NOT USE A DATABASE WEBHOOK
-- ==========================================================================
--
-- The three webhooks in 019/021/028 use supabase_functions.http_request, which
-- posts the row and only the row. That is enough for applications, because an
-- application carries the applicant's own email.
--
-- A timesheet does not. It carries an application_id, deliberately — the name
-- and address live on the application, and copying them here would be two
-- places to be wrong. So a plain webhook would reach /api/notify with a
-- decision and nobody to send it to.
--
-- The tempting fix is to let the endpoint look the person up. That needs the
-- service-role key, and api/notify.js says plainly why it does not have one:
-- it is a URL on the public internet, and the most dangerous credential in the
-- project stays out of it. Adding that key to send a nicer email is a bad
-- trade at any price.
--
-- So the message is composed here instead, where reading the application is
-- ordinary rather than privileged, and posted with the address already in it.
-- The endpoint gains a second shape to render and still holds no database
-- credential, still looks nothing up.

do $$
begin
  if '__WEBHOOK_SECRET__' like ('\_\_WEBHOOK' || '\_SECRET\_\_') then
    raise exception
      'This is the repo copy, with the placeholder still in it. Paste the filled-in copy instead — the one with the real WEBHOOK_SECRET, from the scratchpad or from Vercel.';
  end if;
end $$;

-- ==========================================================================
-- THE ONE FUNCTION
-- ==========================================================================
--
-- Both tables, both directions. Which message it is comes from the status,
-- and the endpoint is told plainly rather than left to work it out:
--
--   arrived   a week was sent, or leave was asked for   -> staff are told
--   decided   approved, sent back, or declined          -> the person is told
--
-- security definer because it reads applications, which the person setting the
-- status may well not be able to read in full. It takes no argument and is
-- reachable only as a trigger, so there is nothing here for a caller to aim.

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
  payload jsonb;
begin
  select a.name, a.email into who
  from public.applications a
  where a.id = new.application_id;

  -- No address, nothing to send, and nothing worth failing an approval over.
  if who is null or coalesce(btrim(who.email), '') = '' then
    return new;
  end if;

  if tg_table_name = 'timesheets' then
    ev := case when new.status = 'submitted' then 'arrived'
               when new.status in ('approved', 'returned') then 'decided'
               else null end;
  else
    ev := case when tg_op = 'INSERT' then 'arrived'
               when new.status in ('approved', 'declined') then 'decided'
               else null end;
  end if;

  -- A status nobody needs to hear about — a week going back to draft, say.
  -- Silence is the correct answer, not an email saying nothing happened.
  if ev is null then
    return new;
  end if;

  if tg_table_name = 'timesheets' then
    -- The total is what the email is about, so it is counted here rather than
    -- trusted to whatever the page last had on screen.
    select coalesce(sum(d.hours), 0),
           coalesce(string_agg(
             to_char(d.worked_on, 'Dy') || ' ' || trim(to_char(d.hours, 'FM990.99')),
             ' · ' order by d.worked_on) filter (where d.hours > 0), '')
      into total, daysx
      from public.timesheet_days d
     where d.timesheet_id = new.id;
  end if;

  payload := jsonb_build_object(
    'type',  'STATUS',
    'event', ev,
    'table', tg_table_name,
    'person', jsonb_build_object('name', who.name, 'email', who.email),
    'record', case tg_table_name
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

  -- Wrapped, because the alternative is worse than a missing email. pg_net
  -- queues rather than waits, so this does not hold the transaction open — but
  -- if the extension is absent or the call raises for any other reason, an
  -- unhandled exception here would roll back the UPDATE and make approving a
  -- timesheet impossible. A warning lands in the Postgres logs; the decision
  -- still stands.
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

-- Nobody calls this directly. A trigger function needs no EXECUTE grant to the
-- role running the statement, so there is nothing to hand out here.
revoke all on function public.notify_decision() from public, anon, authenticated;

-- ==========================================================================
-- WHERE IT FIRES
-- ==========================================================================
--
-- `of status` and the WHEN together mean a note being corrected, or a day's
-- hours being edited, is not an email. Only the state changing is.

drop trigger if exists "notify-timesheet-status" on public.timesheets;
create trigger "notify-timesheet-status"
  after update of status on public.timesheets
  for each row
  when (old.status is distinct from new.status)
  execute function public.notify_decision();

drop trigger if exists "notify-leave-asked" on public.leave_requests;
create trigger "notify-leave-asked"
  after insert on public.leave_requests
  for each row
  execute function public.notify_decision();

drop trigger if exists "notify-leave-decided" on public.leave_requests;
create trigger "notify-leave-decided"
  after update of status on public.leave_requests
  for each row
  when (old.status is distinct from new.status)
  execute function public.notify_decision();

-- ==========================================================================
-- Check it worked
-- ==========================================================================
--
-- Three triggers, all pointing at notify_decision, and the secret in the
-- function body matching the one the other three webhooks carry. A
-- fingerprint that differs is a message nobody is receiving.

select c.relname as table_name, t.tgname as trigger_name,
       p.proname as runs
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_proc p on p.oid = t.tgfoid
where not t.tgisinternal
  and t.tgname like 'notify-%'
order by c.relname, t.tgname;

select md5(substring(prosrc from 'x-webhook-secret'',\s*''([^'']+)')) as secret_md5
from pg_proc where proname = 'notify_decision';

-- pg_net must be there. If this returns no row, nothing above will send and
-- the warning in the log is the only sign.
select extname, extversion from pg_extension where extname = 'pg_net';
