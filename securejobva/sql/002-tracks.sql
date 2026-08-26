-- 002 — the tracks column
--
-- Run after: 001
-- Safe to re-run: yes
--
-- The careers form began sending `tracks` (an array — an applicant can pick
-- more than one) in place of `track`. Until this column exists, PostgREST
-- rejects every application with PGRST204 and the applicant sees only "that
-- did not send". Run it BEFORE deploying the page that sends it.

-- --------------------------------------------------------------------------
-- Migrations for tables that already exist
-- --------------------------------------------------------------------------
--
-- `create table if not exists` above does nothing to a table that is already
-- there, so a column added to this file after the first run has to be added
-- again here. Both statements are idempotent — run the file as often as you
-- like.
--
-- This one matters: the careers form began sending `tracks` (an array, because
-- an applicant can pick more than one) in place of `track`. Until the column
-- exists, PostgREST rejects every application with PGRST204 and the applicant
-- sees only "that did not send". Run this BEFORE deploying the page that sends
-- it, not after.

alter table public.applications add column if not exists tracks text[];

