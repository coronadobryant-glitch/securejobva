-- 037 — stop notify_decision reaching for fields the row does not have
--
-- Run after: 036
-- Safe to re-run: yes
-- Also needed: nothing in the dashboard. PASTE THIS ONE FIRST — until it runs,
--   no application can be moved through a stage at all.
--
-- Moving an applicant from Applied to Assessment failed with
--
--   record "new" has no field "started_on"
--
-- and the status did not save. Every stage change in /admin was refused.
--
-- ==========================================================================
-- WHAT WENT WRONG
-- ==========================================================================
--
-- 031 built the payload as one CASE expression with a branch per table, and
-- 035 added a placements branch to it holding new.started_on:
--
--   'record', case tg_table_name
--     when 'applications' then jsonb_build_object(..., new.status_changed_at, ...)
--     when 'placements'   then jsonb_build_object(..., new.started_on, ...)
--     when 'timesheets'   then jsonb_build_object(..., new.week_starts_on, ...)
--     else                     jsonb_build_object(..., new.starts_on, ...)
--   end
--
-- That reads as though only one branch is ever evaluated, and in ordinary SQL
-- that is true of the RESULT. But PL/pgSQL prepares the whole expression as a
-- single statement, and every field reference in it has to resolve against the
-- actual record type of NEW. When NEW is an applications row there is no
-- started_on, and the statement fails before any branch is chosen.
--
-- So one CASE covering four table shapes cannot work, however carefully the
-- branches are written. It was wrong in 031 as well; nobody had moved an
-- application since that file ran, so nothing had proved it.
--
-- ==========================================================================
-- THE FIX
-- ==========================================================================
--
-- Separate IF branches instead of one expression. PL/pgSQL prepares each
-- statement the first time it is reached, so a branch that is not taken is
-- never prepared and its field references are never resolved. Each block then
-- only ever names columns that exist on the table it is for.
--
-- Nothing else changes: same payload, same triggers, same secret.

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
  rec     jsonb;
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

  -- status exists on all four tables, so this one expression is safe.
  if tg_table_name = 'applications' then
    ev := case when new.status in ('assessment', 'interview', 'approved', 'hired', 'declined')
               then 'decided' else null end;
  elsif tg_table_name = 'placements' then
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

  -- One block per table. Each names only columns that table has, and a block
  -- that is not reached is never prepared.
  if tg_table_name = 'applications' then
    rec := jsonb_build_object(
      'id',     new.id,
      'status', new.status,
      'name',   new.name,
      'again',  (coalesce(new.status_changed_at, new.created_at) + interval '3 months')::date);

  elsif tg_table_name = 'placements' then
    select c.name into cname from public.clients c where c.id = new.client_id;
    rec := jsonb_build_object(
      'id',             new.id,
      'status',         new.status,
      'client',         cname,
      'started_on',     new.started_on,
      'hours_per_week', new.hours_per_week,
      'trial_weeks',    new.trial_weeks);

  elsif tg_table_name = 'timesheets' then
    select coalesce(sum(d.hours), 0),
           coalesce(string_agg(
             to_char(d.worked_on, 'Dy') || ' ' || trim(to_char(d.hours, 'FM990.99')),
             ' · ' order by d.worked_on) filter (where d.hours > 0), '')
      into total, daysx
      from public.timesheet_days d
     where d.timesheet_id = new.id;

    rec := jsonb_build_object(
      'id',             new.id,
      'status',         new.status,
      'week_starts_on', new.week_starts_on,
      'note',           new.note,
      'decided_by',     new.decided_by,
      'hours',          total,
      'days',           daysx);

  else
    rec := jsonb_build_object(
      'id',         new.id,
      'status',     new.status,
      'starts_on',  new.starts_on,
      'ends_on',    new.ends_on,
      'reason',     new.reason,
      'decided_by', new.decided_by);
  end if;

  payload := jsonb_build_object(
    'type',   'STATUS',
    'event',  ev,
    'table',  tg_table_name,
    'person', jsonb_build_object('name', who.name, 'email', who.email),
    'record', rec
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
-- Check it worked
-- ==========================================================================
--
-- The real test is /admin: move somebody a stage and it saves. These confirm
-- the function is there and still carries the same secret as the others.

select proname,
       md5(substring(prosrc from 'x-webhook-secret'',\s*''([^'']+)')) as secret_md5
from pg_proc
where proname in ('notify_decision', 'notify_swap')
order by proname;

-- No CASE across table shapes should remain in the body.
select position('when ''placements'' then' in prosrc) as leftover_case
from pg_proc where proname = 'notify_decision';
