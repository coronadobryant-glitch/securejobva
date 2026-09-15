-- Proving the delete ORDER, without sending anybody an email
--
-- Not numbered, for the same reason its two siblings are not: this is not a
-- migration. It changes no shape, and by construction it leaves no data
-- either. tools/check.mjs reads none of them.
--
-- ==========================================================================
-- THE KNOT THIS UNTIES
-- ==========================================================================
--
-- sql/cleanup-paying-half.sql deletes in a particular order, and says why:
-- 033 gave timesheets.placement_id a plain reference with no cascade and no
-- set null, so a placement with a week still pointing at it cannot be deleted
-- at all. Get the order wrong and it raises rather than half-working.
--
-- That claim has never been tested. sql/rehearse-cleanup.sql ran the block on
-- 14 September 2026 against a bare client, which proved the block RUNS — and
-- six of its seven deletes matched zero rows, so the one constraint the order
-- exists for went untouched. Both files say the same thing about why:
--
--   Testing it needs children, and children need a placement, and a
--   placement sends mail.
--
-- That reasoning is wrong, and this file is the argument that it is wrong.
--
-- A placement does not send mail. notify_decision (035, after insert on
-- placements) calls net.http_post, and pg_net QUEUES rather than sends —
-- 031 says so in as many words, at the point where it explains why the call
-- is wrapped in its own begin/exception. Queueing is an insert into a table
-- in the net schema. It is transactional like any other insert. A background
-- worker reads that table afterwards, and under MVCC it cannot see a row
-- that has not committed.
--
-- So: do the whole thing inside one transaction, and end the transaction by
-- rolling it back. The placement is created, the trigger fires, the queue row
-- is written, the foreign key is exercised for real — and then all of it is
-- undone, the queue row with it, and the worker never sees anything to send.
--
-- ==========================================================================
-- WHY IT RAISES INSTEAD OF ROLLING BACK
-- ==========================================================================
--
-- The obvious shape is `begin; ... rollback;`. Two things spoil it, and both
-- were learned the hard way in the editor this runs in.
--
-- The Supabase SQL editor shows you the result of the last statement. End
-- with `rollback` and you are shown nothing, so the findings would have to
-- come back through a NOTICE — and the editor discards NOTICE output
-- entirely. That is the trap rehearse-cleanup.sql documents: the one line the
-- block writes for a human to read is the line the only place it can run will
-- not show.
--
-- And `begin` is a promise the file cannot keep on the reader's behalf. If
-- the editor swallows it, or the reader runs a selection rather than the
-- file, the inserts commit and a client is left holding a LIVE placement.
-- placements_one_live_idx is unique on application_id, so that assistant is
-- then blocked from a real placement. That is the Northwind failure, and this
-- file must not be able to cause it even when used carelessly.
--
-- So step 2 is one DO block that always ends by RAISING. A DO block is atomic:
-- the exception rolls the whole thing back whether or not anybody wrote
-- `begin`, and the editor displays the message because it is an error. There
-- is no path through this file that leaves a row behind, including the paths
-- where the reader does something unintended.
--
-- Which means SUCCESS LOOKS LIKE AN ERROR. The result you want is a red box
-- reading `ORDER PROVED`. An actual failure is a different message, listed at
-- the end of step 2. Read the text, not the colour.
--
-- ==========================================================================
-- WHAT IT WOULD PROVE, AND WHAT IT STILL WOULD NOT
-- ==========================================================================
--
-- Would prove:
--
--   that the delete order in cleanup-paying-half.sql is NECESSARY, not just
--   sufficient — by deleting in the wrong order first and requiring Postgres
--   to refuse, with SQLSTATE 23503 against timesheets_placement_id_fkey;
--
--   that the order is sufficient — the same seven deletes, run the right way
--   round, against a placement that really does have a week hanging off it;
--
--   that 033's trigger fills timesheets.placement_id, since a week that never
--   got attached to the placement would make the whole test vacuous. Step 2
--   checks that before it tries anything, and gives up if it is null.
--
-- Would NOT prove, and this is the same gap the last rehearsal left:
--
--   the RLS policies. 060 grants these deletes to authenticated behind "staff
--   remove a client", and the SQL editor runs as a role that bypasses
--   row-level security. Nothing here tests who is allowed to do it, only that
--   the order is right when somebody does.
--
--   that no mail was sent. It proves the queue row was rolled back, which is
--   the mechanism. The witness would be an inbox, and a quiet inbox is also
--   what a broken notify path looks like, so absence proves little either
--   way. The reasoning above is the argument; the queue count is the check.
--
-- ==========================================================================
-- 1. THE ROLLBACK PROBE — live, harmless, and the gate for step 2
-- ==========================================================================
--
-- Everything above rests on the editor honouring transaction control. Find
-- that out with a row that costs nothing, before finding it out with a
-- placement.
--
-- public.clients has no notify trigger — that is the whole reason the last
-- rehearsal used a bare client — so this reaches nobody's inbox even if it
-- does commit.
--
-- Run these four statements together. The count at the end must be 0.
--
--   0  rollback works here. Step 2 is safe to arm.
--   1  IT DID NOT. Do not arm step 2. Delete the probe row by hand:
--        delete from public.clients where name = 'ROLLBACK PROBE — must not survive';
--      and then step 2 needs a different home: psql, or a branch database.

begin;
insert into public.clients (name) values ('ROLLBACK PROBE — must not survive');
rollback;

select count(*) as probe_rows_left
from public.clients
where name = 'ROLLBACK PROBE — must not survive';

-- ==========================================================================
-- 2. THE ORDER TEST — commented out; delete the /* and */ to arm it
-- ==========================================================================
--
-- Off by default, like both its siblings, so that running this whole file
-- does only step 1.
--
-- Takes no arguments and needs nothing from step 1. It builds its own client,
-- its own application and its own placement, uses them, and unwinds.
--
-- Expect, on success, an ERROR whose message begins `ORDER PROVED`. See the
-- section above for why success is red.

/*
do $do$
declare
  c_id     uuid;
  a_id     uuid;
  p_id     uuid;
  t_id     uuid;
  t_place  uuid;
  q_before bigint := -1;
  q_after  bigint := -1;
  wrong    text   := 'NOT REACHED';
  monday   date   := date_trunc('week', current_date)::date;
  left_ts  bigint;
  left_pl  bigint;
begin
  -- How many notifications are sitting in pg_net's queue before we start.
  -- Wrapped because the net schema may not be readable by every role, and a
  -- missing count must not fail the test it is only annotating.
  begin
    execute 'select count(*) from net.http_request_queue' into q_before;
  exception when others then
    q_before := -1;
  end;

  -- ---- build the smallest graph that can get the order wrong ----

  insert into public.clients (name)
  values ('ORDER TEST — rolled back')
  returning id into c_id;

  -- An application is required: placements.application_id is not null. 073
  -- requires a deliverable-looking address on every one, so it gets one that
  -- is syntactically valid and belongs to nobody.
  insert into public.applications (name, email)
  values ('ORDER TEST — rolled back', 'order-test@example.invalid')
  returning id into a_id;

  -- 'trial' rather than 'matched', because 033's trigger only attaches a week
  -- to a placement that is trial, ongoing or ended. This insert fires
  -- notify_decision; the post it queues dies with this transaction.
  insert into public.placements (application_id, client_id, status, started_on, hours_per_week)
  values (a_id, c_id, 'trial', monday, 40)
  returning id into p_id;

  insert into public.timesheets (application_id, week_starts_on, status)
  values (a_id, monday, 'draft')
  returning id, placement_id into t_id, t_place;

  insert into public.timesheet_days (timesheet_id, worked_on, hours)
  values (t_id, monday, 8);

  -- If the week did not attach itself to the placement, there is no reference
  -- to violate and everything below would pass while proving nothing.
  if t_place is null then
    raise exception 'TEST VACUOUS: 033 did not fill timesheets.placement_id, so the placement has no week pointing at it and the order is not under test. Nothing was kept.';
  end if;

  if t_place <> p_id then
    raise exception 'TEST VACUOUS: the week attached to placement % rather than the one just made (%). Nothing was kept.', t_place, p_id;
  end if;

  -- ---- the wrong way round: Postgres must refuse ----

  begin
    delete from public.placements where client_id = c_id;
    wrong := 'ALLOWED — the delete succeeded with a week still pointing at it';
  exception
    when foreign_key_violation then
      wrong := 'refused, 23503: ' || sqlerrm;
    when others then
      wrong := 'refused, ' || sqlstate || ': ' || sqlerrm;
  end;

  -- ---- the right way round: the order cleanup-paying-half.sql uses ----

  delete from public.client_payment_weeks
   where payment_id in (select id from public.client_payments where client_id = c_id);
  delete from public.client_payments
   where client_id = c_id;

  delete from public.timesheet_days
   where timesheet_id in (select id from public.timesheets
                           where placement_id in (select id from public.placements
                                                   where client_id = c_id));
  delete from public.timesheets
   where placement_id in (select id from public.placements where client_id = c_id);

  delete from public.placements
   where client_id = c_id;

  delete from public.client_private where client_id = c_id;
  delete from public.clients        where id = c_id;

  -- The application is not the cleanup block's business — it deliberately
  -- leaves the person alone — so it is removed here rather than there.
  delete from public.applications where id = a_id;

  select count(*) into left_ts from public.timesheets  where id = t_id;
  select count(*) into left_pl from public.placements  where id = p_id;

  begin
    execute 'select count(*) from net.http_request_queue' into q_after;
  exception when others then
    q_after := -1;
  end;

  if wrong like 'ALLOWED%' then
    raise exception 'ORDER NOT PROVED: deleting the placement first was %. The comment in cleanup-paying-half.sql about 033 is wrong, or the reference gained a cascade. Nothing was kept.', wrong;
  end if;

  if left_ts <> 0 or left_pl <> 0 then
    raise exception 'ORDER NOT PROVED: the right order left % timesheet(s) and % placement(s) behind. Nothing was kept.', left_ts, left_pl;
  end if;

  raise exception
    'ORDER PROVED. Wrong way round: %. Right way round: removed the week, then the placement, then the client, leaving 0 of each. pg_net queue % -> % (-1 means not readable from this role; either way this transaction is being rolled back now, and the queued post with it). Nothing was kept.',
    wrong, q_before, q_after;
end
$do$;
*/

-- ==========================================================================
-- 3. NOTHING SURVIVED — read-only, and live as this file ships
-- ==========================================================================
--
-- Step 2 cannot leave rows behind, and this is how you stop taking that on
-- trust. Every count must be 0. Any other number means the DO block committed
-- despite ending in a raise, which should be impossible — stop, and remove
-- what is named here by hand before running anything else.

select
  (select count(*) from public.clients
    where name in ('ORDER TEST — rolled back', 'ROLLBACK PROBE — must not survive'))
    as stray_clients,
  (select count(*) from public.applications
    where email = 'order-test@example.invalid')
    as stray_applications,
  (select count(*) from public.placements p
    join public.clients c on c.id = p.client_id
   where c.name = 'ORDER TEST — rolled back')
    as stray_placements;
