-- 108 — the client can say they are keeping her on
--
-- Run after: 107
-- Safe to re-run: yes
-- Also needed: a button on /seats calling keep_placement_on() (CONTRACT.md),
--   and api/notify.js taught DECIDE.placements.arrived for the staff alert.
--   The assistant's own email already exists (035's 'ongoing').
--
-- ==========================================================================
-- THE CLIENT DECIDES, AND STAFF HAVE TO TYPE IT (F26)
-- ==========================================================================
--
-- After the trial a placement either carries on or it does not, and whether
-- it does is the client's decision. The client has no way to say so: they tell
-- staff, by email or on a call, and staff switch the placement from Trial to
-- Kept on in /admin — only then does she get 035's "they would like to keep
-- you on". Her best news of the month waits on somebody else's inbox.
--
-- keep_placement_on(placement) lets the client say it themselves:
--
--   - only the client contact of that placement (is_placement_client), or
--     staff — not the assistant
--   - only from 'trial', and only once she has started (started_on on or
--     before today): you cannot keep on somebody who has not begun
--   - sets status 'ongoing', which is exactly what /admin's dropdown does, so
--     035's trigger sends her the same "you are staying on" email it always
--     has, through the outbox (096)
--   - and, when it is the client doing it, tells staff — a decision about
--     billing made without us is one we hear about at once, not at the next
--     statement
--
-- Before the trial is over is allowed: a client who knows in week one has
-- decided, and making them wait for a date to press a button helps nobody.
--
-- The staff alert:
--
--   { type: 'STATUS', table: 'placements', event: 'arrived',
--     person: { name: <client contact>, email: <client address> },
--     record: { id, moment: 'kept_on', business, assistant, started_on,
--               trial_weeks } }
--
-- 032's rule stands: a client holds no UPDATE policy on placements (the grant
-- covers hours and trial length, and a policy cannot separate columns). This
-- is a definer function that changes status and nothing else.

do $pre$
begin
  if to_regprocedure('public.notify_send(jsonb, text, text)') is null then
    raise exception 'sql/095 has not been run on this database.';
  end if;
end
$pre$;

create or replace function public.keep_placement_on(placement uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  pl     public.placements;
  info   record;
  client_did boolean;
  -- Central, as 109 counts days: the database's own date is UTC, and on a
  -- Central evening that is already tomorrow — the evening before her first
  -- day would otherwise count as her first day.
  today  date := (now() at time zone 'America/Chicago')::date;
begin
  if auth.uid() is null then
    raise exception 'sign in first';
  end if;

  select * into pl from public.placements p where p.id = placement;
  if pl.id is null then
    raise exception 'no such placement';
  end if;

  client_did := public.is_placement_client(pl.id);
  if not (client_did or public.has_permission('applications.edit')) then
    raise exception 'that is not your placement';
  end if;

  if pl.status = 'ongoing' then
    -- Pressing it twice is pressing it once.
    return 'ongoing';
  end if;

  if pl.status <> 'trial' then
    raise exception 'Only a placement in its trial can be kept on — this one is %.', pl.status
      using hint = 'sjva-keep-not-trial';
  end if;

  if pl.started_on is null or pl.started_on > today then
    raise exception 'She has not started yet, so there is nothing to keep on. You can say so once her first day has come.'
      using hint = 'sjva-keep-not-started';
  end if;

  update public.placements set status = 'ongoing' where id = pl.id;

  if client_did then
    select c.name as business, cp.contact_name, cp.contact_email, a.name as assistant
      into info
      from public.clients c
      left join public.client_private cp on cp.client_id = c.id
      join public.applications a on a.id = pl.application_id
     where c.id = pl.client_id;

    perform public.notify_send(
      jsonb_build_object(
        'type',   'STATUS',
        'event',  'arrived',
        'table',  'placements',
        'person', jsonb_build_object('name', info.contact_name, 'email', info.contact_email),
        'record', jsonb_build_object(
          'id',          pl.id,
          'moment',      'kept_on',
          'business',    info.business,
          'assistant',   info.assistant,
          'started_on',  pl.started_on,
          'trial_weeks', pl.trial_weeks)),
      'https://www.securejobva.com/api/notify',
      'keep_placement_on');
  end if;

  return 'ongoing';
end;
$fn$;

revoke all on function public.keep_placement_on(uuid) from public, anon;
grant execute on function public.keep_placement_on(uuid) to authenticated;

insert into public.schema_migrations (n) values (108) on conflict (n) do nothing;

-- ==========================================================================
-- Check it worked
-- ==========================================================================
--
-- Placements in their trial — the ones whose client now has the button — and
-- when the trial ends by the dates. 'trial over' rows are the ones most
-- likely to be decided already and simply not recorded. Empty is fine.

select coalesce(c.name, 'a client') as client,
       a.name as assistant,
       p.started_on,
       p.trial_weeks,
       case when p.started_on is null then 'not started'
            when p.trial_weeks is null then 'no trial length set'
            when (now() at time zone 'America/Chicago')::date > p.started_on + p.trial_weeks * 7 - 1 then 'trial over'
            else 'in trial until ' || to_char(p.started_on + p.trial_weeks * 7 - 1, 'DD Mon') end as where_it_is
from public.placements p
join public.applications a on a.id = p.application_id
left join public.clients c on c.id = p.client_id
where p.status = 'trial'
order by p.started_on;
