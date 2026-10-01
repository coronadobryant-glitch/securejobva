-- 094 — one place for the webhook secret
--
-- Run after: 093
-- Safe to re-run: yes
-- Also needed: nothing in the dashboard, and NOTHING PASTED IN. This is the
--   first file since 019 that carries no placeholder: paste it exactly as it
--   is committed. It copies the secret out of the database itself.
--
-- ==========================================================================
-- NINE COPIES OF ONE PASSWORD (F52)
-- ==========================================================================
--
-- The database asks the website to send email by posting to /api/notify (and
-- /api/invite) with a header, x-webhook-secret, that the website compares
-- against WEBHOOK_SECRET in Vercel. Every sender carries its own copy of that
-- value, typed into its own body when its file was pasted:
--
--   notify_decision         031, 035, 037   applications, placements,
--                                           timesheets, leave
--   notify_swap             036             a client asks for somebody else
--   invite_the_client       040             the client's way in
--   post_interview_note     058             every interview email
--   notify_payment_receipt  093             the receipt
--   notify-applications     028             a Supabase http_request trigger,
--   notify-seat-requests    021               with the secret inside the
--   notify-contact-messages 021               trigger definition itself
--
-- Change the secret in Vercel and every one of those starts collecting 401s.
-- Miss one when putting the new value back and that one kind of email stops,
-- with nothing anywhere saying so: a refused post looks exactly like no post
-- (021 and 028 say so at length). And each of those files had to be copied,
-- filled in by hand, pasted and deleted, which is how 019 went in with the
-- placeholder still in it.
--
-- ==========================================================================
-- ONE ROW, READ BY THE DATABASE ONLY
-- ==========================================================================
--
-- The secret now lives in one row of one table, private.webhook_secret, in a
-- schema of its own that PostgREST does not serve and that anon and
-- authenticated may not even look inside. One function, private.webhook_secret(),
-- reads it, and it is executable only by the database's own definer functions
-- (the senders run as their owner, which is what can call it). No page, no
-- signed-in user and no RPC can reach it.
--
-- Not Supabase Vault. Vault would encrypt the row at rest, but the key that
-- decrypts it is held by the same owner role that would read it here, so it
-- protects against a stolen disk and nothing a page can do; and it is an
-- extension that is on by default on some projects and not others. A private
-- table works on every Postgres this has ever run on.
--
-- 096 rewrites every sender to read the secret from here. This file only fills
-- the row and creates the reader; until 096 runs nothing reads it, and nothing
-- about how email goes out has changed.
--
-- ==========================================================================
-- FILLED WITHOUT ANYBODY TYPING IT
-- ==========================================================================
--
-- The value is copied out of notify_decision's own body — the same expression
-- 037's check has always used to fingerprint it — at the moment this file is
-- pasted. Nobody types it, so it cannot be mistyped, and it never sits in a
-- file on anybody's disk.
--
-- notify_decision is the source because it is the sender that has been
-- proven: every stage change in /admin since 037 has mailed through it. If it
-- still holds the placeholder, the database has never had a working secret in
-- that function and there is nothing honest to copy, so this file REFUSES with
-- a message saying what to do, rather than storing a placeholder that every
-- sender would then faithfully use.
--
-- A re-run finds the row already filled and leaves it alone, which is also why
-- re-running this after 096 is safe: by then notify_decision no longer holds a
-- secret to copy, and it does not need to.
--
-- ==========================================================================
-- CHANGING THE SECRET LATER
-- ==========================================================================
--
-- Two places, in either order, and nothing else:
--
--   1. In the SQL editor:
--        update private.webhook_secret set value = '<the new one>', set_at = now();
--   2. In Vercel: WEBHOOK_SECRET, then redeploy.
--
-- Between the two, posts are refused with 401, and 095's outbox tries each of
-- them again with backoff, so a few minutes between the steps loses nothing.

do $pre$
begin
  if to_regprocedure('public.notify_decision()') is null then
    raise exception 'sql/031 has not been run on this database. notify_decision is where this file copies the secret from.';
  end if;
end
$pre$;

create schema if not exists private;

-- The schema itself is closed. Supabase grants usage on new schemas to nobody
-- by default, but saying so costs one line and survives somebody's later
-- "grant usage on all schemas".
revoke all on schema private from public, anon, authenticated;

create table if not exists private.webhook_secret (
  -- One row, ever. The primary key is a boolean that may only be true.
  only_row   boolean primary key default true,
  value      text not null,
  -- Where the value was copied from, so a later reader knows it was not typed.
  copied_from text,
  set_at     timestamptz not null default now(),

  constraint webhook_secret_one_row check (only_row),
  constraint webhook_secret_sane check (length(btrim(value)) between 8 and 500)
);

alter table private.webhook_secret enable row level security;
revoke all on private.webhook_secret from public, anon, authenticated;

-- ── fill it, once ────────────────────────────────────────────────────────────

do $fill$
declare
  -- Written in halves so that nothing that searches for the placeholder (verify.sql,
  -- the fingerprint checks in 021/028/037) mistakes this file for a sender
  -- still carrying it.
  placeholder text := '__WEBHOOK' || '_SECRET__';
  found_it    text;
begin
  if exists (select 1 from private.webhook_secret
             where btrim(value) <> '' and value <> placeholder) then
    -- Already filled — a re-run, or a secret changed by hand since. Either way
    -- this file has nothing to add.
    return;
  end if;

  select substring(p.prosrc from 'x-webhook-secret'',\s*''([^'']+)')
    into found_it
  from pg_proc p
  where p.proname = 'notify_decision'
    and p.pronamespace = 'public'::regnamespace;

  if found_it is null or found_it = placeholder or btrim(found_it) = '' then
    raise exception
      'notify_decision does not hold a real webhook secret (it has %), so there is nothing to copy. Paste the filled-in copy of sql/037 first (the one with WEBHOOK_SECRET from Vercel in place of the placeholder), check that moving an applicant in /admin sends her email, then run this file again.',
      case when found_it is null then 'none at all' else 'the placeholder' end;
  end if;

  insert into private.webhook_secret (only_row, value, copied_from)
  values (true, found_it, 'notify_decision, by sql/094')
  on conflict (only_row) do update
    set value = excluded.value, copied_from = excluded.copied_from, set_at = now();
end
$fill$;

-- ── the one reader ───────────────────────────────────────────────────────────
--
-- Definer, so that it reads the row as its owner. Executable by nobody but
-- that owner: the senders that call it are definer functions owned by the same
-- role, so they can, and a request from a page cannot. Lives in private so
-- PostgREST never offers it as an RPC.

create or replace function private.webhook_secret()
returns text
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $fn$
  select s.value from private.webhook_secret s where s.only_row;
$fn$;

revoke all on function private.webhook_secret() from public, anon, authenticated;

insert into public.schema_migrations (n) values (94) on conflict (n) do nothing;

-- ==========================================================================
-- Check it worked
-- ==========================================================================
--
-- One row per place the secret has ever been written, and whether it agrees
-- with the stored one. The secret itself is never printed — only whether two
-- fingerprints match.
--
--   stored            the row above. Must say 'filled'.
--   agrees            this copy is the same value. Good.
--   DIFFERS           this copy is NOT the stored value — that kind of email
--                     has been going nowhere since the last change. 096 fixes
--                     it by making every sender read the stored one.
--   placeholder       this copy never got a secret at all. Same: 096 fixes it.
--   reads the store   096 has run, and this sender has no copy of its own: it
--                     posts through notify_send, which reads the row above.
--   (no row)          that sender does not exist on this database.
--
-- And nobody but the owner may call the reader: 'anon can call' or
-- 'authenticated can call' anywhere in the last column is a leak.

with stored as (
  select md5(value) as fp from private.webhook_secret where only_row
),
fn_copies as (
  select p.proname::text as copy_in,
         'function' as kind,
         substring(p.prosrc from 'x-webhook-secret'',\s*''([^'']+)') as found_it,
         -- After 096 a sender hands its post to public.notify_send() (095), and
         -- that is what reads the store; the sender's own body never names it.
         (p.prosrc like '%private.webhook_secret()%'
          or p.prosrc like '%public.notify\_send(%') as reads_store
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and p.proname in ('notify_decision', 'notify_swap', 'invite_the_client',
                      'post_interview_note', 'notify_payment_receipt')
),
trigger_copies as (
  select c.relname || '.' || t.tgname as copy_in,
         'trigger' as kind,
         substring(pg_get_triggerdef(t.oid) from 'x-webhook-secret":"([^"]+)') as found_it,
         pg_get_triggerdef(t.oid) not like '%http_request%' as reads_store
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  where not t.tgisinternal
    and t.tgname in ('notify-applications', 'notify-seat-requests', 'notify-contact-messages')
),
copies as (
  select * from fn_copies union all select * from trigger_copies
)
select * from (
select 'private.webhook_secret' as copy_in,
       'the store' as kind,
       case when (select fp from stored) is null then 'EMPTY — this file did not finish'
            else 'filled' end as state,
       case when has_function_privilege('anon', 'private.webhook_secret()', 'EXECUTE')
            then 'anon can call — LEAK'
            when has_function_privilege('authenticated', 'private.webhook_secret()', 'EXECUTE')
            then 'authenticated can call — LEAK'
            else 'owner only' end as who_can_read
union all
select c.copy_in, c.kind,
       case when c.reads_store and c.found_it is null then 'reads the store'
            when c.found_it is null then 'no secret found'
            when c.found_it = '__WEBHOOK' || '_SECRET__' then 'placeholder'
            when md5(c.found_it) = (select fp from stored) then 'agrees'
            else 'DIFFERS' end,
       ''
from copies c
) report
order by kind <> 'the store', kind, copy_in;
