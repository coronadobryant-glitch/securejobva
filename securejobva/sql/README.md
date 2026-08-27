# SQL

Shared between David and Bryant. Everything the database needs lives here, and
the only thing you ever do with it is copy a file and paste it into the Supabase
SQL editor.

**SQL editor:** https://supabase.com/dashboard/project/hmgravlkatfmerzbozct/sql/new

## Running them

Numbered, and run in order. Every file is idempotent — running it twice does
nothing the second time — so when you are unsure whether a file has been run,
run it. That is always safer than guessing.

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
| `verify.sql` | Read-only. Prints what is actually in place. Changes nothing. |

On a fresh database: 001 through 021 in order, then `verify.sql` to confirm.

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
not exists`, `drop policy if exists` before `create policy`. Neither of you will
remember what has been run on which database, and with these you do not have to.

**Never edit a file that has already been run.** The database has no memory of
what a file used to say. Add the next number instead.

## The one rule

`anon` is the key sitting in the page source, where anyone can read it. These
tables hold applicants' names, emails, phone numbers and CV links. `anon` may
INSERT and do nothing else — no select, no update, no delete.

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
allows. Usually a status that is not one of the five, or a field over its length
cap.

## Reading the data

In the Supabase dashboard, which uses the `service_role` key and bypasses RLS.
That key must never appear in a page, an env var on a public site, or this repo.
