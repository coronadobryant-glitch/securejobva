-- 092 — a message needs an address
--
-- Run after: 091
-- Safe to re-run: yes
-- Also needed: contact.html and es/contact.html must be deployed FIRST, with
-- the same address rule in the page and the refusal handled — see the
-- contract. Pasted before them, a visitor who types "juan.perez@gmail" is
-- refused by this file and the page, which does not yet recognise the
-- refusal, reports a failure instead of telling her what to fix.
--
-- ==========================================================================
-- THE ADDRESS DECIDES WHETHER STAFF ARE TOLD AT ALL
-- ==========================================================================
--
-- 073 gave applications and seat_requests one address rule, the same
-- character for character in the page and in the constraint. contact_messages
-- was left with only 010's length cap, and anon inserts it directly. Two
-- things read that column afterwards:
--
--   api/notify    uses it as reply_to on the staff alert. Resend validates
--                 reply_to, refuses the whole send on a malformed one (422),
--                 and nothing retries (N53) — so "x" or "juan.perez@gmail" in
--                 the email box means staff never hear about the message.
--                 Anybody can do that on purpose to silence the inbox alert.
--   /admin        builds Reply as mailto:<address>?subject=… from it, so
--                 an address carrying its own ?bcc=… adds a recipient to
--                 staff's reply (N12; the page fix is to encode it, and this
--                 rule refuses the second @ such a value needs).
--
-- The rule is 073's, unchanged:
--
--   btrim(email) ~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$'
--
-- ==========================================================================
-- ON INSERT, BY TRIGGER — NOT A CHECK
-- ==========================================================================
--
-- A CHECK is tested again on every update of a row, and staff update every
-- message when they mark it handled. An old message with a bad address would
-- then refuse "Mark answered" for good. No page edits the address
-- afterwards — /admin only marks a message handled or open — so the insert is
-- the door that matters. From a page only; the SQL editor is left alone.
--
-- It carries an sjva- hint and a sentence written for the person typing, the
-- way 027 and 047 do, so a page that recognises the prefix shows it to her.

create or replace function public.contact_address_is_an_address()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $fn$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  new.email := btrim(coalesce(new.email, ''));
  if new.email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' then
    raise exception 'That email address does not look complete. Check it and send again.'
      using hint = 'sjva-address';
  end if;

  return new;
end;
$fn$;

revoke all on function public.contact_address_is_an_address() from public, anon, authenticated;

drop trigger if exists contact_messages_address_is_an_address on public.contact_messages;
create trigger contact_messages_address_is_an_address
  before insert on public.contact_messages
  for each row execute function public.contact_address_is_an_address();

-- ==========================================================================
-- Check it worked
-- ==========================================================================

select tgname, tgenabled
from pg_trigger
where tgname = 'contact_messages_address_is_an_address';

-- Messages already stored with an address this would refuse. For each, the
-- staff alert may never have been sent; read them in /admin.
select id, created_at, email
from public.contact_messages
where btrim(coalesce(email, '')) !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$'
order by created_at desc;

insert into public.schema_migrations (n) values (92) on conflict (n) do nothing;
