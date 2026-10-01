-- 112 — a contact message can name itself, so a resend is not a second message
--
-- Run after: 111
-- Safe to re-run: yes
-- Also needed: nothing at once. contact.html may then send its own id with
--   each message and treat 409 as "already delivered" (CONTRACT.md, F48).
--   NEVER the other way round: a page that sends an id before this grant is
--   in is refused on every message, and the form falls back to email for all.
--
-- ==========================================================================
-- THE SAME MESSAGE, TWICE (F48)
-- ==========================================================================
--
-- The contact form keeps what was typed and offers "send again" when it did
-- not hear back. When the first try DID land and only its answer was lost —
-- a dropped connection, a phone going to sleep — the resend is a second row,
-- and staff read the same message twice and may answer it twice.
--
-- 010 lets anon write six columns and not id, so the database picks the id
-- and the page cannot say "this is the one I already sent". Granting id lets
-- the page make the id itself, once per message, and send the same one on
-- every try. A second try with an id already stored is refused by the primary
-- key (409), which the page reads as delivered.
--
-- Nothing else changes. anon still cannot read a single row, so knowing or
-- guessing an id reveals nothing: the only thing an id that is already taken
-- does is refuse that insert.

do $pre$
begin
  if to_regclass('public.contact_messages') is null then
    raise exception 'sql/010 has not been run on this database.';
  end if;
end
$pre$;

grant insert (id) on public.contact_messages to anon;

insert into public.schema_migrations (n) values (112) on conflict (n) do nothing;

-- ==========================================================================
-- Check it worked
-- ==========================================================================
--
-- The columns anon may write on contact_messages. Expect seven, id among
-- them, and no other privilege: a SELECT here would publish every message.

select grantee, privilege_type, string_agg(column_name, ', ' order by column_name) as columns
from information_schema.column_privileges
where table_schema = 'public' and table_name = 'contact_messages' and grantee = 'anon'
group by grantee, privilege_type
order by privilege_type;
