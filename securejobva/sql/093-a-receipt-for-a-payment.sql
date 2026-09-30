-- 093 — a receipt for a payment
--
-- Run after: 092
-- Safe to re-run: yes
-- Also needed: the webhook secret pasted into a COPY of this file (see THE
-- SECRET at the bottom), and api/notify.js taught the 'client_payments'
-- template in the contract. Either order is safe: until api/notify knows the
-- template it answers this post with 200 "skipped" and sends nothing, and
-- until the secret is pasted it answers 401 and sends nothing.
--
-- ==========================================================================
-- A PAYMENT NOBODY WAS TOLD ABOUT
-- ==========================================================================
--
-- 055 made "somebody paid" a record: /admin writes a client_payments row, and
-- /pay lists the client's payments in the page (P12). Nothing tells the client
-- it was received. A business that sent a transfer on Monday finds out we have
-- it only by signing in and looking — and a business that never signs in does
-- not find out at all, which is the one that will ask.
--
-- So recording a payment now sends the client a receipt: which business, how
-- much, the day it was paid, how, and their own reference, so it can be
-- matched against their bank statement. Nothing about hours, rates or the
-- assistant: this is a receipt for money, and the statement on /pay is where
-- the rest lives.
--
-- ==========================================================================
-- WHO GETS IT
-- ==========================================================================
--
-- The client contact on client_private (039 moved it there), the same address
-- 035 and 058 mail. No contact address, no receipt — and no error, because
-- recording the payment is the thing that must not fail. Same rule as every
-- notify trigger here: an email that does not go is a warning, never an
-- exception that undoes the row.
--
-- On INSERT only. A correction to a payment already recorded is staff
-- tidying their own ledger, and a second receipt for the same money is how a
-- client comes to believe they paid twice. A deleted payment sends nothing.
--
-- NOTE FOR tools/walk-paying.mjs: its --go run records a payment against a
-- throwaway client whose contact is a real address (N85). Once this is live
-- and api/notify has the template, that run sends a receipt to that address
-- too. Worth knowing before the next walk.
--
-- ==========================================================================
-- THE PAYLOAD
-- ==========================================================================
--
-- The same STATUS shape 031, 035 and 058 post, so api/notify routes it through
-- decision() like every other message that goes to one person:
--
--   { type: 'STATUS', table: 'client_payments', event: 'recorded',
--     person: { name: <contact name>, email: <contact email> },
--     record: { id, business, amount_cents, paid_on, method, reference } }
--
-- decision() mails person.email once, and answers 200 whether or not it
-- landed, so a dead address never turns into a retry loop.

do $pre$
begin
  if to_regclass('public.client_payments') is null then
    raise exception 'sql/055 has not been run on this database. It creates client_payments.';
  end if;
  if to_regclass('public.client_private') is null then
    raise exception 'sql/039 has not been run on this database. It creates client_private.';
  end if;
  if to_regclass('net.http_post') is null and
     not exists (select 1 from pg_proc where proname = 'http_post') then
    raise exception
      'pg_net is not enabled. Database → Extensions → pg_net, then run this again.';
  end if;
end
$pre$;

create or replace function public.notify_payment_receipt()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  info    record;
  payload jsonb;
begin
  select c.name as business, cp.contact_name, cp.contact_email
    into info
  from public.clients c
  left join public.client_private cp on cp.client_id = c.id
  where c.id = new.client_id;

  if coalesce(btrim(info.contact_email), '') = '' then
    return new;
  end if;

  payload := jsonb_build_object(
    'type',   'STATUS',
    'event',  'recorded',
    'table',  'client_payments',
    'person', jsonb_build_object('name', info.contact_name, 'email', info.contact_email),
    'record', jsonb_build_object(
      'id',           new.id,
      'business',     info.business,
      'amount_cents', new.amount_cents,
      'paid_on',      new.paid_on,
      'method',       new.method,
      'reference',    new.reference)
  );

  begin
    perform net.http_post(
      url     := 'https://www.securejobva.com/api/notify',
      body    := payload,
      headers := jsonb_build_object(
        'Content-Type',     'application/json',
        'x-webhook-secret', '__WEBHOOK_SECRET__'),
      timeout_milliseconds := 10000
    );
  exception when others then
    -- A warning, never an exception. A receipt that does not go must not
    -- undo the record that the money arrived.
    raise warning 'notify_payment_receipt could not post for %: %', new.id, sqlerrm;
  end;

  return new;
end;
$fn$;

revoke all on function public.notify_payment_receipt() from public, anon, authenticated;

drop trigger if exists "notify-payment-receipt" on public.client_payments;
create trigger "notify-payment-receipt"
  after insert on public.client_payments
  for each row execute function public.notify_payment_receipt();

-- ==========================================================================
-- THE SECRET
-- ==========================================================================
--
-- __WEBHOOK_SECRET__ above is a placeholder and this file will post nothing
-- that api/notify accepts until it is replaced. Do NOT commit the real one:
-- copy this file, paste the secret into the copy, run the copy, throw it away.
--
--   cp sql/093-a-receipt-for-a-payment.sql sql/093-PASTE-THIS.local.sql
--   # in the copy, replace the QUOTED placeholder on the x-webhook-secret
--   # line — that one and no other:
--   #
--   #     'x-webhook-secret', '__WEBHOOK_SECRET__'
--
-- Replacing every occurrence also rewrites the LIKE pattern in the check
-- below, which then reports "nothing will be emailed" on a copy that emails
-- perfectly well — the trap 058 describes.
--
-- .gitignore keeps *.local.sql out of the repo and .vercelignore keeps it out
-- of a deploy. Still delete the copy once it has run: both of those only stop
-- it leaving this machine, and the secret has no reason to sit on disk.

-- ==========================================================================
-- Check it worked
-- ==========================================================================

-- The placeholder is still in place, which means nothing will be sent. This
-- returning a row is the reminder, not a failure — unless you meant to paste
-- the real secret, in which case it is exactly the failure you want to see.
select 'the placeholder is still here — no receipt will be emailed' as warning
where exists (
  select 1 from pg_proc
  where proname = 'notify_payment_receipt'
    and prosrc like '%\_\_WEBHOOK\_SECRET\_\_%'
);

-- Nobody signed in can call it. Empty is the pass.
select r.rolname
from pg_proc p
cross join lateral (values ('anon'), ('authenticated')) as r(rolname)
where p.proname = 'notify_payment_receipt'
  and has_function_privilege(r.rolname, p.oid, 'EXECUTE');

-- Clients a receipt cannot reach, because nobody is on file to send it to.
select c.name
from public.clients c
left join public.client_private cp on cp.client_id = c.id
where coalesce(btrim(cp.contact_email), '') = ''
order by c.name;

insert into public.schema_migrations (n) values (93) on conflict (n) do nothing;
