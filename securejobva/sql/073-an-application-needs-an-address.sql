-- 073 — an application, and a seat request, need an address somebody can reply to
--
-- Run after: 072
-- Safe to re-run: yes
-- Also needed: nothing in the dashboard.
--
-- Found by walking the paying half end to end for the first time and, on the
-- way past, asking the public key what it would accept. It accepts this:
--
--   curl -X POST .../rest/v1/applications \
--        -H "apikey: <the key in the page source>" \
--        -d '{"name":"a person","country":"PH"}'
--
-- No email. 201 Created. The same is true of seat_requests, and of an email
-- that is the empty string, and of the word "banana".
--
-- No browser can do it. Both forms have carried the same rule for months —
-- careers.html and index.html each test the address against
-- /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/ before they will submit — so every row ever
-- written by a person is fine, and the four applications and three seat
-- requests in the table today all pass that rule. This is not a broken form.
--
-- It is that the rule lives only in the form, and the form is not the fence.
-- The key is in the page source and anon holds INSERT by design; 001 says so
-- in as many words, and its constraints are explicitly caps rather than
-- validity — "Nothing here is trusted. Caps stop a bot writing megabytes into
-- the table." Length is checked. Whether the one column the entire system
-- reaches a person through has anything in it is not.
--
-- ==========================================================================
-- WHAT A ROW WITH NO ADDRESS DOES
-- ==========================================================================
--
-- Nothing loud. That is the argument for the constraint rather than against
-- it — every consequence is a silence somewhere else:
--
--   notify_decision returns early on a blank address (035, and it is right to
--   — there is nowhere to send it), so the applicant is moved from stage to
--   stage and never told once. Nothing warns anybody that the mail was
--   skipped rather than sent.
--
--   /status finds them by address, so they can never open their own page.
--
--   Nobody can reply. They sit in the queue looking exactly like somebody who
--   is waiting on us, because they are, and there is no way to reach them.
--
-- And one that is not silent, for the empty string in particular:
--
--   027's one_application_per_person matches on lower(a.email) = lower(new
--   .email). NULL never equals NULL, so a missing address collides with
--   nothing; '' equals '' perfectly well. So the FIRST empty-string
--   application blocks every later one, and blocks it by raising "You already
--   have an application with us. Sign in on the Your application page to see
--   where it has got to." — advice that cannot be followed, given to somebody
--   who is not that person, about an account that cannot be signed in to.
--
-- That last one needs no separate fix. 027 keys on an address, and after this
-- file there is no such thing as a row without one, on any path — a check
-- constraint is not a policy and the service role does not bypass it either.
--
-- ==========================================================================
-- THE SAME RULE, WRITTEN WHERE IT BINDS
-- ==========================================================================
--
-- Deliberately the form's regular expression and not a better one. There is
-- no such thing as validating an email address, and this is not trying to:
-- the point is that the database agrees with the two forms in front of it
-- rather than holding a rule of its own that a real applicant could fail.
-- Anything careers.html will submit, this accepts. Anything it refuses, this
-- refuses. If that rule is ever wrong it is wrong in one place.
--
-- btrim, because the forms test the trimmed value and send what was typed. An
-- address with a trailing space is a person who is fine and a row that is
-- fine; it should not become a 400 nobody can read.

alter table public.applications drop constraint if exists applications_email_present;
alter table public.applications add constraint applications_email_present
  check (btrim(coalesce(email, '')) ~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$');

alter table public.seat_requests drop constraint if exists seat_requests_email_present;
alter table public.seat_requests add constraint seat_requests_email_present
  check (btrim(coalesce(email, '')) ~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$');

-- 001's caps stay exactly as they are. They answer a different question — how
-- much — and this one answers whether there is anything there at all. Two
-- constraints on one column is not duplication when they are about different
-- things, and a single merged check would report "sane" for both, which tells
-- whoever hits it nothing about which half they broke.

-- ==========================================================================
-- Check it worked
-- ==========================================================================
--
-- Both constraints present, and every existing row already satisfying them.
-- ADD CONSTRAINT validates what is already in the table, so if this file ran
-- at all the second query is a formality — it is here so that the answer is
-- on screen rather than assumed.

select conrelid::regclass as "table", conname
from pg_constraint
where conname in ('applications_email_present', 'seat_requests_email_present')
order by 1;

select 'applications' as "table",
       count(*)                                                          as rows,
       count(*) filter (where btrim(coalesce(email, '')) = '')           as no_address
from public.applications
union all
select 'seat_requests',
       count(*),
       count(*) filter (where btrim(coalesce(email, '')) = '')
from public.seat_requests;

-- And the thing this file is actually about. Both of these must now fail,
-- and the second is the one that used to be accepted quietly:
--
--   insert into public.applications (name, country) values ('probe', 'PH');
--   insert into public.applications (name, email, country) values ('probe', '', 'PH');

insert into public.schema_migrations (n) values (73) on conflict (n) do nothing;
