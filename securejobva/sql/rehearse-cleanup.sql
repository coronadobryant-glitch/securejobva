-- Running the removal block once, on something nobody will miss
--
-- Not numbered, for the same reason its sibling is not: this is not a
-- migration. It changes data rather than shape, and tools/check.mjs reads
-- neither of them.
--
-- ==========================================================================
-- WHAT THIS IS FOR
-- ==========================================================================
--
-- sql/cleanup-paying-half.sql holds a block that removes a business and
-- everything billed through it. As of 13 September 2026 it has been parsed
-- with the server's own SQL grammar, compiled with the server's own plpgsql
-- compiler, and had all eleven of its statements and eight of its expressions
-- pulled back out of the tree and parsed — and it has still never been run.
--
-- Those are different things. An identifier that exists nowhere compiles
-- happily, because plpgsql leaves unknown names for the SQL engine to resolve
-- at execution; `if no_such_var is null` passes every check in
-- tools/check-cleanup.mjs. No trigger, permission or foreign key has been
-- exercised by any of it.
--
-- It cannot be run from the machine it was written on: no psql there,
-- PostgREST does not run arbitrary SQL, and the service role key is a REST key
-- rather than a database password. It runs where you paste it, in the Supabase
-- SQL editor, and this file is the cheapest safe way to paste it once.
--
-- ==========================================================================
-- WHY A BARE CLIENT, AND NOT A REAL WALK
-- ==========================================================================
--
-- The obvious rehearsal is tools/walk-paying.mjs --go, which builds a client,
-- a placement, two weeks and a payment. It is the wrong instinct twice.
--
-- It sends about five real emails. notify_decision (035) fires when a
-- placement moves to matched, trial or ongoing, and again when a week arrives
-- or is decided, and the walk does not suppress its own mail on purpose —
-- the only witness that any of it reads right is an inbox somebody opens.
--
-- And it removes every row it made in a finally, so there would be nothing
-- left to arm against. Keeping the rows means killing the run, which strands a
-- client with a LIVE placement, and placements_one_live_idx is unique on
-- application_id — so the borrowed assistant cannot be placed for real behind
-- it. That is exactly what went wrong with "Northwind Test Co" between 7 and
-- 11 September, deliberately this time.
--
-- A client with no children costs none of that. No placement means no notify
-- trigger, so it reaches nobody's inbox. And clients_log_deletion (060) is a
-- before-delete trigger on clients, so removing it still writes the
-- deletion_log row.
--
-- Name ONLY, and nothing else. public.clients is id, name, created_at — that
-- is the whole table. 032 created it with contact_name, contact_email,
-- billing_cycle and notes as well, and 039 moved all four into
-- client_private and dropped them from clients, so that an assistant-facing
-- view could not reach a client's contact details. Reading the create table
-- in 032 and stopping there gives you four columns that have not existed
-- since 039.
--
-- This is not a hypothetical. The first run of step A, on 14 September 2026,
-- named notes and came back
--
--   ERROR:  42703: column "notes" of relation "clients" does not exist
--
-- which is the failure its sibling file predicts in as many words: a wrong
-- column is the realistic failure for SQL nobody has run, and it is the one
-- thing no parser can see. The rehearsal caught it on the rehearsal, which
-- is what a rehearsal is for. Nothing was written by that attempt.
--
-- ==========================================================================
-- WHAT ONE PASS PROVES, AND WHAT IT DOES NOT
-- ==========================================================================
--
-- Proves, and nothing else could:
--
--   the block RUNS rather than merely compiling — the by_id guard, the
--   `who` lookup, all seven deletes executing against real tables, the
--   raise notice formatting its four arguments, and the deletion_log
--   trigger firing.
--
-- Does not prove, and a green pass must not be read as though it did:
--
--   The delete ORDER. Six of the seven deletes match zero rows here, so
--   nothing exercises the one constraint the order exists for: 033 gave
--   timesheets.placement_id a plain reference with no cascade and no set
--   null, so a placement with a week still pointing at it cannot be
--   deleted at all. Getting that wrong raises rather than half-working —
--   which is the good case, and it is still untested. Testing it needs
--   children, and children need a placement, and a placement sends mail.
--
--   The RLS policies. 060 grants delete on clients and placements to
--   authenticated behind "staff remove a client", but the SQL editor runs
--   as a role that bypasses row-level security. removed_by = 'somebody' in
--   step C is the tell: that is the fallback for a token with no email
--   claim, which is what the editor gives you.
--
-- ==========================================================================
-- A. MAKE THE THROWAWAY — commented out; delete the /* and */ to arm it
-- ==========================================================================
--
-- Off by default because running a whole file at once is the natural thing to
-- do in the SQL editor, and so this file changes nothing when you do. Its
-- sibling ships the same way and for the same reason.
--
-- Copy the id out of the result. Step B takes an id, not a name.

/*
insert into public.clients (name)
values ('REHEARSAL — safe to delete')
returning id, name;
*/

-- ==========================================================================
-- B. ARM THE REAL BLOCK — in the other file, NOT copied into this one
-- ==========================================================================
--
-- Open sql/cleanup-paying-half.sql and make two edits to its step 2:
--
--   delete the `/*` line just above `do $do$`, and the `*/` just below
--   `$do$;`                                          (lines 147 and 210)
--
--   set the declaration that reads
--     by_id constant uuid := null;                   (line 151)
--   to the id step A returned.
--
-- Then run that block, and put the two comment markers back afterwards.
--
-- Line numbers are as of this commit and will drift; the text will not.
--
-- The block is deliberately NOT reproduced here. A second copy is a copy that
-- drifts, and tools/check-cleanup.mjs reads only the original — so a rehearsal
-- against a stale duplicate would be a rehearsal of the wrong thing, which is
-- worse than none. There is one block, and this file points at it.
--
-- Expect, on success:
--
--   NOTICE:  Removed REHEARSAL — safe to delete — 0 placement(s),
--            0 week(s), 0 payment(s). No email sent.

-- ==========================================================================
-- C. READ IT BACK — "it did not error" is not "it did the thing"
-- ==========================================================================
--
-- Read-only, and live as this file ships. Safe to run before A as a baseline.
--
-- No rehearsal client should survive. If one does, step B did not run, and
-- the row is still sitting in clients where step A put it.

select count(*) as rehearsal_clients_left
from public.clients
where name = 'REHEARSAL — safe to delete';

-- The newest row here should be the removal you just ran: kind 'client', and
-- subject_id equal to the id step A returned. 'somebody' against it means the
-- SQL editor's role, which is expected and is the RLS caveat above.

select kind, subject_id, removed_by, removed_at
from public.deletion_log
where kind = 'client'
order by removed_at desc
limit 5;
