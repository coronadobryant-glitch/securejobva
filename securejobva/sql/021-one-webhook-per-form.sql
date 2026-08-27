-- 021 — one poke per form, all carrying the same secret
--
-- Run after: 019
-- Safe to re-run: yes
-- Also needed: nothing in the dashboard.
--
-- 019 added webhooks to seat_requests and contact_messages on the belief that
-- neither had one. Both already did — notify-seats and notify-contact, made by
-- hand in the dashboard, in no file, by nobody either of us can name. So each of
-- those two tables now fires twice.
--
-- Whether the older pair works is unknown and does not need to be known. Two
-- seat requests reached the database with nobody told, which says they do not,
-- but rather than prove it, this file makes the question moot: all four go, and
-- two are made again from the secret we know is right.
--
-- notify-applications is left exactly as it is. It is proven — it sent a live
-- test — and the rule about not fixing what works applies most to the one
-- notification that has never failed. It stays a dashboard webhook in no file,
-- which is a real gap, and the day it needs recreating is the day to close it.

-- ==========================================================================
-- THE GUARD
-- ==========================================================================
--
-- 019 went in from the repo copy with the placeholder still in it, and Postgres
-- reported success, because a trigger carrying a wrong secret is a perfectly
-- valid trigger. It fires, collects a 401 from api/notify.js, and sends nothing.
-- Nothing about that is visible from the outside — it looks exactly like no
-- webhook at all, which is the failure this whole thread has been chasing.
--
-- So this file refuses to run as the repo copy. Paste the filled-in version or
-- get an error; there is no third outcome where you believe it worked.
--
-- The comparison is written in halves so that filling the file in cannot
-- accidentally rewrite the pattern it is being compared against.

do $$
begin
  if '__WEBHOOK_SECRET__' like ('\_\_WEBHOOK' || '\_SECRET\_\_') then
    raise exception
      'This is the repo copy, with the placeholder still in it. Paste the filled-in copy instead — the one with the real WEBHOOK_SECRET, from the scratchpad or from Vercel.';
  end if;
end $$;

-- ==========================================================================
-- OUT WITH ALL FOUR
-- ==========================================================================
--
-- Named individually rather than by a loop over pg_trigger. A loop would also
-- catch a webhook somebody adds next month for a reason this file knows nothing
-- about, and silently removing another person's work is worse than leaving a
-- stray one to be found.

drop trigger if exists "notify-seats"            on public.seat_requests;
drop trigger if exists "notify-seat-requests"    on public.seat_requests;
drop trigger if exists "notify-contact"          on public.contact_messages;
drop trigger if exists "notify-contact-messages" on public.contact_messages;

-- ==========================================================================
-- IN WITH TWO
-- ==========================================================================
--
-- Insert only. An update or a delete is somebody working the queue in /admin,
-- and mailing you about your own click is how a notification becomes noise
-- people filter.

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

-- ==========================================================================
-- Check it worked
-- ==========================================================================
--
-- Three rows, one per form. All three fingerprints must match each other — that
-- is the whole test, and it needs no secret on screen to make it. The
-- applications row is the reference: that webhook is known to work, so any row
-- whose fingerprint differs from it is a webhook that does not.

select c.relname as table_name,
       t.tgname as webhook,
       md5(substring(pg_get_triggerdef(t.oid) from 'x-webhook-secret":"([^"]+)')) as secret_md5
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
where not t.tgisinternal
  and t.tgname like '%notify%'
  and c.relname in ('applications', 'seat_requests', 'contact_messages')
order by c.relname;
