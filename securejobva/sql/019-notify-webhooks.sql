-- 019 — the other two notify webhooks
--
-- Run after: 010
-- Safe to re-run: yes
--
-- api/notify.js already knows how to describe all three tables — applications,
-- seat_requests and contact_messages. Only applications ever had a webhook
-- pointed at it, created by hand in the dashboard, so a seat request or a
-- contact message landed with nobody told. That is the exact failure the notify
-- function was written to end, still happening on two of the three forms.
--
-- A Supabase Database Webhook is a trigger calling supabase_functions.http_request.
-- Writing them here rather than clicking them means they are reviewable, they
-- survive somebody rebuilding the database, and the two of you can see what the
-- other one wired up.
--
-- BEFORE PASTING: replace both __WEBHOOK_SECRET__ below with the real value.
-- That is WEBHOOK_SECRET from .env.local, the same one the applications webhook
-- already carries. It deliberately does not live in this file. api/notify.js
-- refuses anything whose x-webhook-secret header does not match, so a paste with
-- the placeholder still in it leaves you with triggers that fire, collect a 401,
-- and send nothing — which looks exactly like no webhook at all.

-- Database Webhooks have to be switched on once for a project, which installs
-- this function. The applications webhook means it is already there; this only
-- fails loudly rather than leaving half a migration behind if it is not.
do $$
begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'supabase_functions' and p.proname = 'http_request'
  ) then
    raise exception 'supabase_functions.http_request is missing — turn on Database Webhooks once under Integrations, then run this file';
  end if;
end $$;

-- Insert only. An update or a delete is somebody working the queue in /admin,
-- and mailing you about your own click is how a notification becomes noise
-- people filter.
drop trigger if exists "notify-seat-requests" on public.seat_requests;
create trigger "notify-seat-requests"
  after insert on public.seat_requests
  for each row
  execute function supabase_functions.http_request(
    'https://www.securejobva.com/api/notify',
    'POST',
    '{"Content-Type":"application/json","x-webhook-secret":"__WEBHOOK_SECRET__"}',
    '{}',
    '10000'
  );

drop trigger if exists "notify-contact-messages" on public.contact_messages;
create trigger "notify-contact-messages"
  after insert on public.contact_messages
  for each row
  execute function supabase_functions.http_request(
    'https://www.securejobva.com/api/notify',
    'POST',
    '{"Content-Type":"application/json","x-webhook-secret":"__WEBHOOK_SECRET__"}',
    '{}',
    '10000'
  );

-- What you should see afterwards: Integrations -> Database Webhooks lists three,
-- not one. A row landing in either table now sends the same email applications
-- already send, to the same two addresses.
