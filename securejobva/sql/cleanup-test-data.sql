-- Resetting a test applicant, so the run can be walked again by hand
--
-- Not numbered, and deliberately: this is not a migration. It changes data
-- rather than shape, it must never run on a fresh database, and running it
-- twice is meant to find nothing the second time. `verify.sql` sits outside
-- the numbering for the same reason, and tools/check.mjs reads neither.
--
-- ==========================================================================
-- READ THIS BEFORE THE REST
-- ==========================================================================
--
-- An earlier version of this file matched on a name and an address typed in
-- by hand, and the confirmation at the end counted how many rows matched
-- THOSE. It returned zero, which was read as "removed" when what it actually
-- meant was "never matched anything" — and the application it was supposed to
-- clear was still sitting at hired the whole time.
--
-- So step 1 no longer asks about one person. It lists every application there
-- is, and you pick the id out of it. A cleanup that starts by guessing the
-- key is a cleanup that cannot tell success from a typo.

-- ==========================================================================
-- 1. WHAT IS ACTUALLY IN THERE — read-only, changes nothing
-- ==========================================================================
--
-- Run this first, alone. Copy the id of the row you mean out of the result;
-- both options below take an id, not a name.

select a.id,
       a.name,
       a.email,
       a.status,
       a.created_at::date                                                          as applied,
       (select count(*) from public.timesheets  t where t.application_id = a.id)   as weeks,
       (select count(*) from public.placements  p where p.application_id = a.id)   as placements,
       (select count(*) from public.application_documents d
         where d.application_id = a.id)                                            as documents
from public.applications a
order by a.created_at desc;

-- ==========================================================================
-- OPTION A — REWIND, keeping the person and their sign-in
-- ==========================================================================
--
-- Puts the application back to `applied` and clears everything the stages
-- built on top of it, so the whole journey can be walked again from the
-- queue. Use this when you want to test the DESK: moving somebody through
-- the stages, matching, placing.
--
-- WHAT THIS SENDS: nothing. A status change normally fires
-- "notify-application-status" and emails the applicant — rewinding hired to
-- applied would tell them their application had gone backwards, which is
-- both alarming and untrue. The trigger is switched off around the update
-- and switched back on immediately after, inside one transaction, so a
-- failure cannot leave it off.
--
-- ARMING IT: this block is commented out. Fill in by_id or by_email below,
-- then delete the `/*` line just under here and the `*/` line at the end of
-- the block. Off by default because running a whole file at once is the
-- natural thing to do in the SQL editor, and a file that deletes a person
-- when you do that is a badly built file.

/*
do $do$
declare
  -- Named ONCE, the same way Option B does it. It used to be four copies of
  -- the same id down the block, which is a worse trap than it looks: fill in
  -- three and miss the fourth and the weeks, placements and tracking all
  -- clear while the status quietly stays at hired — a half-done reset that
  -- reports nothing and looks like a bug in the portal a day later.
  by_id    constant uuid := null;
  by_email constant text := null;   -- e.g. 'someone@example.com'

  who   record;
  hits  integer;
begin
  if (by_id is null) = (by_email is null) then
    raise exception
      'Fill in exactly one of by_id or by_email — not both, not neither.'
      using hint = 'Run step 1 first if you do not know which row you mean.';
  end if;

  select count(*) into hits
    from public.applications a
   where (by_id    is not null and a.id = by_id)
      or (by_email is not null and lower(a.email) = lower(by_email));

  if hits = 0 then
    raise exception 'Nothing matches that. Run step 1 — the row you mean is in its results.';
  end if;
  if hits > 1 then
    raise exception '% applications match that address. Use by_id instead.', hits;
  end if;

  select a.id, a.name, a.email, a.status into who
    from public.applications a
   where (by_id    is not null and a.id = by_id)
      or (by_email is not null and lower(a.email) = lower(by_email));

  -- Off around the update, on again below. Inside one DO block, so it is one
  -- statement to Postgres: if anything here raises, the whole thing rolls
  -- back and the trigger comes back with it. It cannot be left switched off.
  alter table public.applications disable trigger "notify-application-status";

  -- The trail the stages left. Placements go first: their rates, the start
  -- confirmation and any swap requests cascade with them.
  delete from public.placements          where application_id = who.id;
  delete from public.timesheets          where application_id = who.id;
  delete from public.application_tracking where application_id = who.id;

  update public.applications
     set status = 'applied',
         status_changed_at = now()
   where id = who.id;

  alter table public.applications enable trigger "notify-application-status";

  raise notice 'Rewound % <%> from % back to applied. No email sent.',
    who.name, who.email, who.status;
end
$do$;
*/

-- Notes and the note log are deliberately left alone: they are what you
-- wrote about the person, not a stage the system set, and a reset run is
-- usually easier to follow with them still there. To clear them too:
--
--   delete from public.application_notes    where application_id = '…';
--   delete from public.application_note_log where application_id = '…';

-- ==========================================================================
-- OPTION B — REMOVE, so the address can apply again from the form
-- ==========================================================================
--
-- Use this when you want to test the INTAKE: the careers form, the receipt,
-- the one-application rule. 027 blocks a second application from an address
-- that already has one, so while any row survives the form keeps refusing.
--
-- Every child cascades, so one delete takes the whole person:
--
--   application_tracking     the pipeline, interview times, scores
--   application_notes        and application_note_log
--   application_socials      and social_tokens
--   application_disc         the questionnaire and its scoring
--   application_documents    the ROW for the CV — see the note at the bottom
--   application_public       the name a matched client is allowed to read
--   leave_requests
--   timesheets               and timesheet_days under them
--   placements               and under those, placement_billing,
--                            placement_pay, placement_starts, swap_requests
--
-- Nothing here touches public.admins or user_roles: those key off the email
-- address rather than the application, so an account that is also staff keeps
-- its role. And nothing touches auth.users — signing in with the address
-- again still works, which is exactly what re-applying needs.
--
-- ARMING IT: commented out, like Option A. Fill in by_id or by_email below,
-- then delete the `/*` line under here and the `*/` after the block.

/*
do $do$
declare
  -- Name the person ONCE, either way. Fill in exactly one and leave the other
  -- null: an id if you copied one out of step 1, an address if you already
  -- know it. Both are checked against what is really there before anything
  -- goes, so neither can quietly match nothing.
  by_id    constant uuid := null;
  by_email constant text := null;   -- e.g. 'someone@example.com'

  who   record;
  hits  integer;
begin
  if (by_id is null) = (by_email is null) then
    raise exception
      'Fill in exactly one of by_id or by_email — not both, not neither.'
      using hint = 'Run step 1 first if you do not know which row you mean.';
  end if;

  select count(*) into hits
    from public.applications a
   where (by_id    is not null and a.id = by_id)
      or (by_email is not null and lower(a.email) = lower(by_email));

  -- The failure this file was rewritten for. Zero matches is not success and
  -- must never read like it: a delete that hits nothing leaves the row you
  -- meant to clear exactly where it was.
  if hits = 0 then
    raise exception 'Nothing matches that. Run step 1 — the row you mean is in its results.';
  end if;

  if hits > 1 then
    raise exception '% applications match that address. Use by_id instead.', hits;
  end if;

  select a.id, a.name, a.email, a.status,
         (select count(*) from public.timesheets t where t.application_id = a.id) as weeks,
         (select count(*) from public.placements p where p.application_id = a.id) as placements
    into who
    from public.applications a
   where (by_id    is not null and a.id = by_id)
      or (by_email is not null and lower(a.email) = lower(by_email));

  raise notice 'Removing % <%> — currently %, with % week(s) and % placement(s).',
    who.name, who.email, who.status, who.weeks, who.placements;

  delete from public.applications where id = who.id;

  raise notice 'Gone, along with everything that hung off it. % may now apply again.', who.email;
end
$do$;
*/

-- ==========================================================================
-- 3. CONFIRM — read-only
-- ==========================================================================
--
-- After OPTION A: one row, status `applied`, and zero weeks and placements.
-- After OPTION B: no rows at all.
--
-- Deliberately the same list step 1 prints, rather than a count of the value
-- you typed in. A confirmation that asks about your own guess agrees with you
-- whether or not anything happened — which is precisely how a hired
-- application survived a cleanup that reported success.

select a.id,
       a.name,
       a.email,
       a.status,
       (select count(*) from public.timesheets t where t.application_id = a.id) as weeks,
       (select count(*) from public.placements p where p.application_id = a.id) as placements
from public.applications a
order by a.created_at desc;

-- ==========================================================================
-- THE ONE THING SQL DOES NOT REACH
-- ==========================================================================
--
-- The CV itself. Deleting application_documents removes the row that points
-- at the file; the object stays in the applicant-docs bucket, because storage
-- is not the database and no foreign key crosses between them.
--
-- It is not readable by the public key — tools/guard-rls.mjs checks that on
-- every run — so leaving it is not a leak. But it is still that person's CV.
-- Read the paths BEFORE removing the rows, while they still say which files
-- were theirs:
--
--   select d.path, d.filename, d.uploaded_at::date
--   from public.application_documents d
--   where d.application_id = '…';
--
-- Then delete those objects under Storage -> applicant-docs in the dashboard.
-- Doing it from SQL means writing to storage.objects directly, which is a
-- sharper tool than this job needs.

-- ==========================================================================
-- OPTION C — THE CLIENT SIDE, ADDED AFTER 055 AND 057
-- ==========================================================================
--
-- Everything above this line was written when an application, its weeks and
-- its placement were the whole of a test run. Since then a walkthrough also
-- leaves a client, the interview times the two of them exchanged, and any
-- payment written down against them. None of those is reachable from /admin:
-- the only delete controls in the product are for a client logo and a
-- payment, so a test client and a test placement can only go from here.
--
-- Order matters and is enforced rather than remembered. client_payments
-- references clients ON DELETE RESTRICT, so a client who has paid cannot be
-- removed until the payment is — which is the right refusal for real money
-- and an obstacle only for a test.
--
-- interview_slots needs no line of its own: it references placements ON
-- DELETE CASCADE, so the times go when the placement does.

-- 1. Read first. Copy the client id out of this.
select c.id,
       c.name,
       cp.contact_email,
       (select count(*) from public.placements      p where p.client_id = c.id) as placements,
       (select count(*) from public.client_payments q where q.client_id = c.id) as payments,
       (select count(*) from public.interview_slots s
          join public.placements p2 on p2.id = s.placement_id
         where p2.client_id = c.id)                                             as interview_times
from public.clients c
left join public.client_private cp on cp.client_id = c.id
order by c.created_at desc;

-- 2. Then this, with the id pasted in both places. Wrapped so that a client
--    who is not a test client cannot be taken out by a mistyped id: it
--    refuses rather than deleting the wrong business.
do $cleanup$
declare
  target uuid := '00000000-0000-0000-0000-000000000000';  -- <- paste the id
  nm     text;
  live   integer;
begin
  select c.name into nm from public.clients c where c.id = target;
  if nm is null then
    raise exception 'no client with that id — read step 1 again';
  end if;

  -- The guard. A real client has weeks behind them; a test one, walked
  -- through in an afternoon, does not. If this fires on something you meant
  -- to remove, remove it by hand and know exactly what you are doing.
  select count(*) into live
  from public.timesheets t
  join public.placements p on p.id = t.placement_id
  where p.client_id = target and t.status = 'approved';

  if live > 0 then
    raise exception
      '% has % approved week(s) behind it. That is not a test client.', nm, live;
  end if;

  delete from public.client_payments where client_id = target;
  delete from public.placements      where client_id = target;   -- takes interview_slots
  delete from public.client_private  where client_id = target;
  delete from public.clients         where id = target;

  raise notice 'removed the client %, its placements and its interview times', nm;
end
$cleanup$;

-- 3. Confirm. Both counts should be zero.
select (select count(*) from public.clients)         as clients_left,
       (select count(*) from public.interview_slots) as interview_times_left,
       (select count(*) from public.client_payments) as payments_left;

-- ==========================================================================
-- AND ONE ROW NOTHING IN THE PRODUCT CAN DELETE
-- ==========================================================================
--
-- A contact message. sql/010 grants staff SELECT and UPDATE on
-- contact_messages and nothing else, so /admin offers Reply and Mark answered
-- and there is no third button. That is fine for real correspondence and
-- wrong for a test row — and it is also the reason somebody who asks to be
-- forgotten cannot be honoured from inside the product.
--
-- Until that is decided one way or the other, a test message goes from here:
--
--   select id, name, email, reason, created_at::date
--   from public.contact_messages order by created_at desc;
--
--   delete from public.contact_messages where id = '…';
