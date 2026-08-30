-- 044 — what has landed
--
-- Run after: 043
-- Safe to re-run: yes
-- Also needed: nothing in the dashboard.
--
-- ==========================================================================
-- A CHECK THAT GOES QUIET AS THE SCHEMA GROWS
-- ==========================================================================
--
-- `node tools/status.mjs` answers "has this migration actually landed?" by
-- asking PostgREST with the publishable key: a table that exists but refuses
-- anon has landed, a 404 has not. That works for a migration that adds a table
-- or an RPC-callable function, and for nothing else.
--
-- Three migrations are invisible to it, and the file said so honestly each
-- time rather than faking a probe:
--
--   034  adds one column, trial_week, granted to nobody — and PostgREST hides
--        a column the asking role holds no privilege on
--   040  adds a trigger function, which PostgREST does not expose at all
--   043  the same
--
-- So the newest schema change is the one nothing can check, which is the wrong
-- way round. 043 was confirmed by pasting its verification query into the
-- dashboard by hand and reading the result — fine once, not a guard. And the
-- gap widens: every migration of those two shapes from here on is another one
-- status.mjs cannot see.
--
-- ==========================================================================
-- THE MIGRATION SAYS SO ITSELF
-- ==========================================================================
--
-- A row per migration, written by the migration, as its last statement:
--
--   insert into public.schema_migrations (n) values (44) on conflict do nothing;
--
-- One probe then answers for all of them, whatever shape the migration was,
-- because the evidence no longer has to be something PostgREST can see. It is
-- a number the file itself put there.
--
-- `on conflict do nothing` because the first landing is the truth: re-running a
-- file must not move its date, and every file here is meant to be run twice.
--
-- ==========================================================================
-- THE BACKFILL, AND WHAT ITS SILENCE MEANS
-- ==========================================================================
--
-- 001 through 043 cannot go back and stamp themselves — editing a file that
-- has already been run is the one thing sql/README.md forbids. So this file
-- detects them instead, which it can do and status.mjs cannot: pasted into the
-- SQL editor it runs as the owner and sees the whole catalogue — trigger
-- functions, ungranted columns and all.
--
-- It detects by the artifact each migration actually creates. Where a
-- migration has no distinguishing artifact — a file that only adds grants,
-- rewrites a policy, tightens a constraint or inserts a row — there is no
-- detector for it and it gets no stamp.
--
-- THAT SILENCE MEANS "NO SIGNAL", NEVER "DID NOT RUN", and status.mjs prints
-- it as such. Reporting those as missing would light up a dozen permanent red
-- lines nobody can ever clear, and a check that cries wolf gets switched off —
-- which is the failure 043's verdict was fixed for two commits ago, and the
-- reason 034 and 040 were left without a probe rather than given a fake one.
--
-- `evidence` records which of the two it was, so the distinction survives:
-- 'stamped' is the file's own word, 'detected' is this file's inference.

-- --------------------------------------------------------------------------
-- The table
-- --------------------------------------------------------------------------

create table if not exists public.schema_migrations (
  n         integer primary key,
  landed_at timestamptz not null default now(),
  evidence  text        not null default 'stamped',

  constraint schema_migrations_evidence
    check (evidence in ('stamped', 'detected')),
  constraint schema_migrations_n_sane
    check (n between 1 and 999)
);

comment on table public.schema_migrations is
  'One row per migration that has landed, written by the migration itself. '
  'No row means no signal, not that it did not run — see 044.';

alter table public.schema_migrations enable row level security;

-- ANON MAY READ schema_migrations — migration numbers, nothing else. No name,
-- no description, no personal data: the column grant below is `n` alone, so
-- the public key reads a set of integers and cannot reach even the dates.
--
-- This is the second table ever opened to anon, and the first since 015. It is
-- deliberate and it is narrow: tools/status.mjs runs on the publishable key by
-- design — no tool in this repo touches the service role key, and the point of
-- that is that the tool which tells you whether things are running cannot
-- itself become the thing that leaks them. Reading it needs a name here AND a
-- name in MAY_BE_PUBLIC in tools/check.mjs, which is the two-place decision
-- that guard was rewritten to require.

revoke all on public.schema_migrations from anon, authenticated;

grant select (n) on public.schema_migrations to anon;
grant select     on public.schema_migrations to authenticated;

-- Nobody is granted insert, update or delete — not even staff. The rows are
-- written by the migrations, which run as the table's owner in the SQL editor
-- and are not subject to these grants. There is no reason for a page, a
-- session or an endpoint to write here, so nothing may.

drop policy if exists "anyone may read which migrations landed" on public.schema_migrations;
create policy "anyone may read which migrations landed"
  on public.schema_migrations for select to anon
  using (true);

drop policy if exists "signed in may read which migrations landed" on public.schema_migrations;
create policy "signed in may read which migrations landed"
  on public.schema_migrations for select to authenticated
  using (true);

-- --------------------------------------------------------------------------
-- The backfill
-- --------------------------------------------------------------------------
--
-- The list below is data — a number and the name of the thing that migration
-- creates — and the WHERE does the looking. Written that way round so the
-- catalogue queries are three, read once each, rather than twenty-five
-- subqueries to be got right one at a time.
--
-- A function is looked up in pg_proc by name rather than through to_regproc,
-- which raises on an overloaded name: is_admin has two signatures and would
-- have thrown the whole paste rather than answering the question.

insert into public.schema_migrations (n, evidence)
select v.n, 'detected'
from (values
  (  1, 'table',  'seat_requests',              null::text),
  (  2, 'column', 'applications',               'tracks'),
  (  3, 'table',  'admins',                     null),
  (  4, 'table',  'user_roles',                 null),
  (  5, 'table',  'application_tracking',       null),
  (  9, 'fn',     'request_account_type',       null),
  ( 10, 'table',  'contact_messages',           null),
  ( 13, 'table',  'application_documents',      null),
  ( 15, 'table',  'client_logos',               null),
  -- 022 made the note log, not 024. 024 superseded the file, not the table, so
  -- this artifact is 022's and is attributed to it.
  ( 22, 'table',  'application_note_log',       null),
  ( 23, 'column', 'application_tracking',       'interview_at'),
  ( 25, 'table',  'application_disc',           null),
  ( 26, 'table',  'leave_requests',             null),
  ( 27, 'fn',     'one_application_per_person', null),
  ( 30, 'table',  'timesheets',                 null),
  ( 31, 'fn',     'notify_decision',            null),
  ( 32, 'table',  'placements',                 null),
  ( 33, 'fn',     'timesheet_is_clients',       null),
  -- 034, 040 and 043 are the three nothing could check. They are the reason
  -- this file exists, and they are ordinary lines here.
  ( 34, 'column', 'timesheets',                 'trial_week'),
  ( 36, 'fn',     'notify_swap',                null),
  ( 39, 'table',  'client_private',             null),
  ( 40, 'fn',     'invite_the_client',          null),
  ( 41, 'table',  'application_public',         null),
  ( 42, 'table',  'placement_starts',           null),
  ( 43, 'fn',     'adopt_orphan_weeks',         null)
) as v(n, kind, obj, col)
where case v.kind
        when 'table' then
          to_regclass('public.' || v.obj) is not null
        when 'fn' then
          exists (
            select 1
            from pg_proc p
            join pg_namespace ns on ns.oid = p.pronamespace
            where ns.nspname = 'public'
              and p.proname = v.obj
          )
        when 'column' then
          exists (
            select 1
            from information_schema.columns c
            where c.table_schema = 'public'
              and c.table_name   = v.obj
              and c.column_name  = v.col
          )
      end
on conflict (n) do nothing;

-- --------------------------------------------------------------------------
-- And this file stamps itself, the way every file after it will
-- --------------------------------------------------------------------------

insert into public.schema_migrations (n) values (44) on conflict (n) do nothing;

-- ==========================================================================
-- VERIFICATION — read-only, changes nothing
-- ==========================================================================
--
-- What landed, newest first, and how it is known. 'stamped' is the file's own
-- word; 'detected' is this file recognising an artifact. A migration missing
-- from this list is one with no detector, which says nothing about whether it
-- ran — tools/status.mjs is the place that reads it that way.

select n,
       evidence,
       landed_at::date as landed
from public.schema_migrations
order by n desc;
