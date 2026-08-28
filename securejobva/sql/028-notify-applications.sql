-- 028 — bring the applications webhook into the folder
--
-- Run after: 021
-- Safe to re-run: yes
-- Also needed: nothing in the dashboard.
--
-- 021 deliberately left notify-applications alone. It was made by hand in the
-- dashboard, it was the one notification proven to work, and the rule about not
-- fixing what works applies most to the thing that has never failed. It also
-- said, in as many words, that being in no file was a real gap and that the day
-- it needed recreating was the day to close it.
--
-- That day is today. Rotating WEBHOOK_SECRET moves the endpoint, and every
-- trigger carrying the old value starts collecting 401s — quietly, because a
-- refused webhook looks exactly like no webhook. 021 could move two of the
-- three. This moves the third, and afterwards all three live here.
--
-- The failure this prevents is the worst of the set. Seat requests and contact
-- messages are business waiting on a reply; an application is a person who has
-- just spent twenty minutes on a form and is now watching their inbox.

do $$
begin
  if '__WEBHOOK_SECRET__' like ('\_\_WEBHOOK' || '\_SECRET\_\_') then
    raise exception
      'This is the repo copy, with the placeholder still in it. Paste the filled-in copy instead — the one with the real WEBHOOK_SECRET, from the scratchpad or from Vercel.';
  end if;
end $$;

drop trigger if exists "notify-applications" on public.applications;

create trigger "notify-applications"
  after insert on public.applications
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
-- Three rows, three matching fingerprints, and none of them the old one. Run
-- this after 021 as well — the two files together own all three webhooks, and
-- a fingerprint that differs from the other two is a form nobody is being told
-- about.

select c.relname as table_name,
       t.tgname as webhook,
       md5(substring(pg_get_triggerdef(t.oid) from 'x-webhook-secret":"([^"]+)')) as secret_md5
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
where not t.tgisinternal
  and t.tgname like '%notify%'
  and c.relname in ('applications', 'seat_requests', 'contact_messages')
order by c.relname;
