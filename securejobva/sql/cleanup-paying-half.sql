-- Clearing a business off the paying half, so a stray one can be removed
--
-- Not numbered, and deliberately: this is not a migration. It changes data
-- rather than shape, it must never run on a fresh database, and running it
-- twice is meant to find nothing the second time. cleanup-test-data.sql and
-- verify.sql sit outside the numbering for the same reason, and
-- tools/check.mjs reads none of them.
--
-- cleanup-test-data.sql resets a test APPLICANT. This is its opposite number
-- for the other half: a test CLIENT, and everything billed through them.
--
-- ==========================================================================
-- WHEN YOU NEED THIS, AND WHEN YOU DO NOT
-- ==========================================================================
--
-- tools/walk-paying.mjs --sweep is the first thing to reach for. It removes
-- what a killed run left behind, by the ids that run wrote down, and it is
-- exact. This file is for the case it cannot cover: rows with no ledger
-- behind them, because whatever made them was not that tool or was an older
-- version of it.
--
-- That case is real. Between 7 and 11 September 2026 a business called
-- "Northwind Test Co" sat here with a placement still ongoing, two approved
-- weeks and $306.13 recorded against it, and nothing knew it was there.
--
-- ==========================================================================
-- HOW FAR THIS HAS BEEN CHECKED — read before trusting it
-- ==========================================================================
--
-- It has been executed once — 14 September 2026, armed on a throwaway client
-- with no children, by way of sql/rehearse-cleanup.sql. That is one pass and
-- not a proof; what it settled and what it left untouched is at the end of
-- this section, and the rehearsal file carries the long version.
--
-- It cannot be run from the machine it was written on. There is no psql
-- there, PostgREST does not run arbitrary SQL, and the service role key is a
-- REST key rather than a database password. It runs where you paste it, in
-- the Supabase SQL editor, which is where that pass happened.
--
-- What was done instead. `node tools/check-cleanup.mjs` does all of it that
-- can be repeated, in one run and without touching the database:
--
--   Parsed with the real Postgres grammar (libpg-query, the server's own
--   parser). Well formed as it ships — 3 statements, all SELECT.
--
--   And, on 12 September, the removal block compiled as plpgsql, which the
--   first pass could not do. To the outer SQL grammar a plpgsql body is one
--   quoted string, so `end if` left off, a keyword misspelt, or a RAISE with
--   more % than arguments all parse clean through it. libpg-query 18 exposes
--   the server's own plpgsql compiler — the thing that would reject this at
--   the moment you pasted it — and the block passes. Five deliberately broken
--   copies go through the same call on every run, because a checker that
--   cannot fail says "ok" about a file it never read.
--
--   Every statement the block runs (11 of them) and every expression between
--   them (8) pulled back out of the compiled tree and parsed as SQL. plpgsql
--   holds both as text until they first execute, so nothing else reads them
--   before the day somebody arms this.
--
--   Every table and column it names asked of the live database on
--   11 September and confirmed present: clients, client_private, placements,
--   placement_billing, placement_pay, timesheets, timesheet_days,
--   client_payments, client_payment_weeks, deletion_log, applications. A
--   wrong column is the realistic failure for SQL nobody has run, and it is
--   the one thing above that no parser can see.
--
--   The delete order mirrors teardown() in tools/walk-paying.mjs, which HAS
--   run end to end against this database — most recently 11 September, when
--   it created a client, placed somebody, worked two weeks, took a payment
--   and removed all eleven rows again. With one difference: teardown() also
--   removes placement_billing and placement_pay by hand, and step 2 lets them
--   cascade. Both are `on delete cascade` (032-clients-and-placements.sql:154
--   and :160), so step 2 is right — it is just the one place this file leans
--   on a cascade after telling you not to.
--
-- What none of that proved was that it RUNS. An identifier that exists
-- nowhere is still left for the SQL engine to resolve at execution — `if
-- no_such_var is null` compiles happily — and until 14 September no trigger,
-- permission or foreign key had been exercised by any of it.
--
-- One pass has now closed part of that gap. Armed on a bare client and run in
-- the SQL editor: the by_id guard passed, the `who` lookup resolved, all
-- seven deletes executed against real tables, and 060's before-delete trigger
-- fired. Rehearsal clients went 1 to 0, and deletion_log gained the matching
-- row.
--
-- Two things that pass did NOT touch, and a green reading must not be taken
-- for them:
--
--   The delete ORDER. Six of the seven deletes matched zero rows, so nothing
--   exercised the one constraint the order exists for — 033's plain reference
--   on timesheets.placement_id, which raises rather than half-working.
--   sql/rehearse-delete-order.sql exists to close this, by building a
--   placement with a week on it and deleting it both ways round inside a
--   transaction that ends by raising. As of this writing that file has been
--   compiled but not run, so the order is still argued rather than proved.
--
--   The RLS policies. 060 grants the delete to authenticated behind "staff
--   remove a client", and the SQL editor runs as a role that bypasses
--   row-level security. removed_by = 'somebody' on that log row is the tell.
--
-- So it still goes on a row you can afford to be wrong about first, and you
-- still read step 3 rather than assuming.
--
-- ==========================================================================
-- TELLING A SCRIPT'S ROWS FROM A PERSON'S
-- ==========================================================================
--
-- Two columns answer this, and step 1 selects both.
--
--   client_payments.recorded_by   stamped by 055
--   deletion_log.removed_by       stamped by 060
--
-- Both are coalesce(auth.jwt() ->> 'email', 'somebody'). Every page sends the
-- signed-in person's token, which carries their address, so anything done by
-- hand is stamped with who did it. 'somebody' is the fallback for a token
-- with no email claim at all — the service role key, which means a script.
--
-- So a payment recorded by 'somebody' was written by a tool, and one recorded
-- by an address was typed by that person in /admin. That is how Northwind was
-- identified after the fact, and it is the first thing to look at here.
--
-- ==========================================================================
-- 1. WHAT IS ACTUALLY IN THERE — read-only, changes nothing
-- ==========================================================================
--
-- Run this first, alone. Copy the id of the business you mean out of the
-- result; the block below takes an id, not a name. A cleanup that starts by
-- guessing the key is a cleanup that cannot tell success from a typo, which
-- is the mistake cleanup-test-data.sql opens by warning about.

select c.id,
       c.name,
       c.created_at::date                                                        as added,
       (select count(*) from public.placements p
         where p.client_id = c.id)                                               as placements,
       (select count(*) from public.placements p
         where p.client_id = c.id and p.status <> 'ended')                        as live,
       (select count(*) from public.timesheets t
         where t.placement_id in (select id from public.placements
                                   where client_id = c.id))                       as weeks,
       (select coalesce(sum(y.amount_cents), 0) / 100.0
          from public.client_payments y where y.client_id = c.id)                 as paid,
       -- 'somebody' here means a script wrote it. An address means a person did.
       (select string_agg(distinct y.recorded_by, ', ')
          from public.client_payments y where y.client_id = c.id)                 as recorded_by
from public.clients c
order by c.created_at desc;

-- ==========================================================================
-- 2. REMOVING ONE — fill in the id, then arm it
-- ==========================================================================
--
-- WHAT THIS SENDS: nothing. The notify triggers on placements (035) and
-- timesheets (031) fire "after insert" and "after update of status" only,
-- so a delete reaches nobody's inbox. Removing a stray business does not
-- email the assistant who was placed against it.
--
-- WHAT THIS LEAVES: a record. 060 puts a before-delete trigger on placements
-- and on clients, so each removal writes a deletion_log row saying what went
-- and who took it. Step 3 reads it back. Nothing here is silent.
--
-- WHAT IT WILL NOT TOUCH: a person. The assistant's application, their
-- status and their sign-in are left exactly as they are — removing the
-- business they were placed with is not a decision about them. Their weeks
-- go, because those weeks were billed through this placement, but the
-- weeks they worked before any placement existed (043) point at no
-- placement and are not matched by anything below.
--
-- ARMING IT: this block is commented out. Fill in by_id, then delete the
-- `/*` line just under here and the `*/` at the end of the block. Off by
-- default because running a whole file at once is the natural thing to do in
-- the SQL editor, and a file that deletes a business when you do that is a
-- badly built file.

/*
do $do$
declare
  -- Named ONCE. Step 1 is where this comes from.
  by_id constant uuid := null;

  who     record;
  n_weeks integer;
  n_place integer;
  n_pay   integer;
begin
  if by_id is null then
    raise exception 'Fill in by_id first.'
      using hint = 'Run step 1 — the business you mean is in its results.';
  end if;

  select c.id, c.name into who
    from public.clients c
   where c.id = by_id;

  if who.id is null then
    raise exception 'No client with that id. Run step 1 again.';
  end if;

  select count(*) into n_place from public.placements where client_id = by_id;
  select count(*) into n_weeks from public.timesheets
   where placement_id in (select id from public.placements where client_id = by_id);
  select count(*) into n_pay   from public.client_payments where client_id = by_id;

  -- Children before parents. Most of this would cascade, and it is written
  -- out anyway: a delete that relies on a cascade is a delete that stops
  -- working the day somebody adds a restrict.

  -- The money. client_payment_weeks cascades from client_payments (055).
  delete from public.client_payment_weeks
   where payment_id in (select id from public.client_payments where client_id = by_id);
  delete from public.client_payments
   where client_id = by_id;

  -- The weeks, days first. These MUST go before the placements: 033 gave
  -- timesheets.placement_id a plain reference with no cascade and no set
  -- null, so a placement with a week still pointing at it cannot be deleted
  -- at all. Deleting in the wrong order here does not half-work — it raises.
  delete from public.timesheet_days
   where timesheet_id in (select id from public.timesheets
                           where placement_id in (select id from public.placements
                                                   where client_id = by_id));
  delete from public.timesheets
   where placement_id in (select id from public.placements where client_id = by_id);

  -- The placements. Their rates (032), swap requests (032), start
  -- confirmation (042) and handshake (057) all cascade with them.
  delete from public.placements
   where client_id = by_id;

  -- The business. client_private cascades from it (039).
  delete from public.client_private where client_id = by_id;
  delete from public.clients        where id = by_id;

  raise notice 'Removed % — % placement(s), % week(s), % payment(s). No email sent.',
    who.name, n_place, n_weeks, n_pay;
end
$do$;
*/

-- ==========================================================================
-- 3. READING IT BACK — "I ran the deletes" is not "there is nothing there"
-- ==========================================================================

select (select count(*) from public.clients)         as clients_left,
       (select count(*) from public.placements)      as placements_left,
       (select count(*) from public.timesheets)      as weeks_left,
       (select count(*) from public.client_payments) as payments_left;

-- What went, and who took it. The most recent rows should be the removal you
-- just ran; 'somebody' against them means you ran it with the service key
-- rather than signed in, which is normal for the SQL editor.

select kind, subject_id, removed_by, removed_at
from public.deletion_log
order by removed_at desc
limit 10;

-- And the person is still there, untouched. Fill in the same assistant you
-- expect to see; they should still be hired, now with no live placement.
--
--   select id, name, email, status from public.applications where id = '…';
