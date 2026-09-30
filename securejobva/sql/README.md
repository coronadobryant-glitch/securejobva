# SQL

Shared between David and Bryant. Everything the database needs lives here, and
the only thing you ever do with it is copy a file and paste it into the Supabase
SQL editor.

**SQL editor:** https://supabase.com/dashboard/project/hmgravlkatfmerzbozct/sql/new

## Running them

Numbered, and run in order, each one once.

**When you are unsure whether a file has run, ask the database — do not re-run
it.** `node tools/status.mjs` reads `schema_migrations` and says which numbers
have landed; from the SQL editor it is

```sql
select n, landed_at from public.schema_migrations order by n desc limit 10;
```

This used to say the opposite — "when you are unsure, run it" — on the grounds
that every file is idempotent. Each file is, on its own. What none of them is,
is safe to run AFTER a later file that replaced something it defines:
`create or replace` puts the older body straight back, the columns survive
(they are `if not exists`), and only the logic goes backwards. Re-running 045
after 063 hands the assessment back to the 045 scorer and advances people on
typing they reported themselves; re-running the repo copy of 058 puts the
`__WEBHOOK_SECRET__` placeholder back into every interview email, which then
get a 401 and are never sent, silently. 020 exists because a re-run of 001 took
grants with it. So the rule is:

- **Never re-run a file numbered below the highest one that has landed.** If an
  old file really must run again, run every later file it names in its
  `DO NOT RE-RUN THIS FILE ON ITS OWN` block straight afterwards, in order —
  and when a file has no such block, every later file that touches the same
  tables.
- **A file that failed partway may be run again** — that is what idempotent is
  for — as long as nothing numbered after it has run since.

| File | What it does |
| --- | --- |
| `001-forms.sql` | The two tables, RLS, and the insert-only lockdown |
| `002-tracks.sql` | The `tracks` column, once the form began sending an array |
| `003-portal.sql` | Google sign-in, applicant stages, the admin view |
| `004-roles.sql` | Roles and permissions, `user_id` on applications, posting consent, social handles |
| `005-ats.sql` | Internal pipeline, contact history, skill levels, and the queue view |
| `006-applicant-edit.sql` | Lets an applicant correct their own answers, and keeps consent history |
| `007-manage-roles.sql` | Grant and revoke roles from the admin page |
| `008-interview-scores.sql` | Interviewer scores, 1-10, on the staff-only side |
| `009-account-types.sql` | Account types asked for at sign-up and granted by a person |
| `010-contact.sql` | The contact form table — public writes, staff read |
| `011-consent-select.sql` | Lets an applicant read back the consent they gave |
| `012-seat-status.sql` | Where a seat request has got to, and the business portal that reads it |
| `013-documents.sql` | CV uploads: a private bucket, and who may read what |
| `014-admin.sql` | Adds an administrator |
| `015-client-logos.sql` | The sliding client strip: a public logo bucket, staff-only uploads |
| `016-grant-user-id.sql` | Superseded by 018; harmless to run |
| `017-staff-requests.sql` | Lets somebody ask to be staff; approval is unchanged |
| `018-select-applications.sql` | Table-level SELECT on applications — ends the column-by-column chase |
| `019-notify-webhooks.sql` | Webhooks for seat requests and contact messages — needs the secret pasted in |
| `020-restore-status-grants.sql` | Puts back the staff UPDATE grants that a re-run of 001 revoked |
| `021-one-webhook-per-form.sql` | Removes the duplicate pokes; one per form, all on the real secret |
| `022-note-log.sql` | Made the note log in a hurry when /admin went down. Superseded by 024 |
| `023-interview-times.sql` | When the interview is, and the Interviews tab that reads it |
| `024-note-log.sql` | Notes stop overwriting each other — a row per note, with who and when |
| `025-disc.sql` | The DISC questionnaire and its scorer. GENERATED — edit `tools/disc-items.mjs` |
| `026-hired-and-the-hub.sql` | The hired stage, the payout preference, leave requests and the notice board |
| `027-one-application.sql` | One application per person, and three months after a decline |
| `028-notify-applications.sql` | The third webhook, moved out of the dashboard — needs the secret pasted in |
| `029-no-staff-requests.sql` | Staff can no longer be asked for — it is granted under Accounts |
| … | 030–073: see each file's header, and `schema_migrations` for what has landed |
| `074-only-staff-move-an-application.sql` | An applicant can no longer set her own stage; the stage date is the server's |
| `075-one-answer-for-every-address.sql` | The duplicate-application refusal no longer says who applied or when they were declined |
| `076-the-address-a-caller-cannot-type.sql` | The throttle counts by `cf-connecting-ip`, not a header the caller writes |
| `077-an-upload-belongs-to-its-moment.sql` | Anon uploads only in the hour after applying; the typing screenshot gets its row |
| `078-a-part-closes-when-its-time-is-up.sql` | Answers cannot change after a part closes or runs out (and are refused before it opens); `server_time()` |
| `079-the-track-she-applied-for.sql` | The assessment's track is taken from the application, not the browser |
| `080-a-time-zone-saved-in-one-request.sql` | The time-zone Save works: `user_id` defaults to the caller |
| `081-a-link-is-a-web-address.sql` | Every stored link is http(s), without quotes or spaces |
| `082-a-time-that-has-passed.sql` | An interview time that has passed cannot be picked |
| `083-who-did-it-is-not-typed.sql` | handled_by, created_by, added_by come from the token |
| `084-an-application-says-what-she-agreed-to.sql` | Consent and 18+ columns on applications (nullable, not yet required) |
| `085-a-trial-is-counted-in-days.sql` | `timesheet_charges` and `client_balances()`: trial and placement dates by the day |
| `086-a-day-outside-the-placement.sql` | Hours outside the placement's dates are refused |
| `087-a-draft-is-not-the-clients-yet.sql` | A client no longer sees a week still in draft |
| `088-billed-weeks-outlive-an-erasure.sql` | An application with approved or paid weeks cannot be deleted from a page |
| `089-removing-a-placement-that-has-weeks.sql` | Removing a placement lets go of its unbilled weeks, refuses billed ones |
| `090-who-an-interview-is-waiting-on.sql` | `interview_state` stops saying "declined" after new times are offered |
| `091-a-track-is-one-of-three.sql` | A new application's tracks are the three on the form |
| `092-a-message-needs-an-address.sql` | A contact message needs a real address — deploy contact.html first |
| `093-a-receipt-for-a-payment.sql` | A receipt email when a payment is recorded — needs the secret pasted in |
| `rescore-sales-without-a-sales-part.sql` | Not a migration. One-off, by hand: Sales applicants never shown the Sales part |
| `verify.sql` | Read-only. Prints what is actually in place. Changes nothing. |

On a fresh database: 001 through the highest number in order, then `verify.sql`
to confirm. The table above stops at 029 and the folder does not — for what has
actually landed, ask the database rather than this list: `node tools/status.mjs`
reads it out of `schema_migrations`.

## Adding one

Make a new file, next number, describing what it does rather than when you wrote
it — `004-interview-slots.sql`, not `004-update.sql`. Then commit and push, and
the other person has it.

Every file starts with a header saying what it needs before it and whether it is
safe to re-run:

```sql
-- 004 — interview slots
--
-- Run after: 003
-- Safe to re-run: yes
--
-- One paragraph on what this is for and why.
```

Two habits that keep this working:

**Write it so it can run twice.** `create table if not exists`, `add column if
not exists`, `drop policy if exists` before `create policy`. A paste that fails
halfway then only needs pasting again. That is what idempotent buys — a safe
retry of the file you just ran — and not a licence to re-run an older one (see
Running them).

**Replacing a function an older file defines?** Add the `DO NOT RE-RUN THIS FILE
ON ITS OWN` block to the older file, naming yours. `node tools/check.mjs` fails
until you do.

**Never edit a file that has already been run.** The database has no memory of
what a file used to say. Add the next number instead.

**Stamp it.** The last statement of every file from 044 on records its own
number, so that something can answer whether it ran:

```sql
insert into public.schema_migrations (n) values (45) on conflict (n) do nothing;
```

`node tools/check.mjs` fails the build without it, because forgetting the line
is silent in the worst way — the file runs, the schema changes, and the one
report that says what has landed simply never mentions it. Before 044 nothing
could see a migration that only added a trigger function or a column granted to
nobody, which is why 034, 040 and 043 each had to say in as many words that they
could not be checked. 044 backfills those by detecting what they built; from
there on the file says so itself.

## The one rule

`anon` is the key sitting in the page source, where anyone can read it. These
tables hold applicants' names, emails, phone numbers and CV links. `anon` may
INSERT and do nothing else — no select, no update, no delete.

Two declared exceptions, both readable and neither writable: `client_logos`
(015 — the marketing strip, shown to visitors who are not signed in) and
`schema_migrations(n)` (044 — migration numbers only, so `tools/status.mjs` can
work on the publishable key). Each is named in `MAY_BE_PUBLIC` in
`tools/check.mjs` and declared with an `-- ANON MAY READ` line in its file;
nothing else may be.

Reading is for `authenticated`: a session Supabase issues only after Google has
vouched for an email, and every read is still fenced by a policy. An applicant
sees their own row and no one else's. Everything wider requires being listed in
`public.admins`.

So: **grant to `authenticated`, never to `anon`.** If you find yourself typing
`grant select ... to anon`, stop — that publishes the applicant list to the
internet.

`node tools/check.mjs` enforces this on every build and refuses to deploy a tree
that breaks it. It catches a plain grant, a column-level grant, and a select
policy aimed at `anon`. It is not a substitute for reading what you wrote, but it
has caught a real one already.

## If a paste fails

**`PGRST204 — could not find the 'x' column`** — the form is sending a field the
table does not have. Add the column here, run it, then deploy. The page and the
schema have to move together.

**`42501 — permission denied`** — RLS is doing its job. Check whether you meant
to grant that, and to whom.

**`23514 — violates check constraint`** — the value is outside what the column
allows. Usually a status that is not one of the six, or a field over its length
cap.

**A message with a hint starting `sjva-`** — a rule this database enforces on
purpose, written for the person to read (027's one application, 047's throttle,
074's "only SecureJobVA can move an application", and the ones from 077 on).
Pages show the message rather than treating it as a failure.

## Reading the data

In the Supabase dashboard, which uses the `service_role` key and bypasses RLS.
That key must never appear in a page, an env var on a public site, or this repo.
