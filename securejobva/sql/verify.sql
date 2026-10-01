-- verify — read-only. Paste this any time; it changes nothing.
--
-- ONE RESULT, ONE ROW PER THING CHECKED (rewritten 1 October, with 094–111).
-- The Supabase SQL editor shows only the last statement's result, and this
-- file used to be eleven separate queries — so pasting it showed section 8
-- and nothing else, and the section that matters most (will anything be
-- emailed) was never on screen. It is now one query. Every row says:
--
--   section   which of the checks below it belongs to
--   item      the table, trigger, function or job it is about
--   state     ok, or PROBLEM, or note (worth knowing, not a fault)
--   detail    what was found, and for a PROBLEM what it means
--
-- Sorted with every PROBLEM first. A clean database is a screen of 'ok'.
--
-- Parts that need a later migration (the secret store from 094, the outbox
-- from 095, pg_cron) say 'PROBLEM — not run yet' rather than failing the
-- whole paste, so this works on a database at any point in the sequence. The
-- secret itself is never printed.
--
-- Rewritten once before, after the 29 September checkup (N49): the version
-- before that described the database as it was around 012, and output that
-- never matches its own expectations teaches whoever runs it to stop reading
-- it. Each section below says what it expects and why.
--
-- What has landed is a different question, answered by schema_migrations:
--
--   select n, landed_at from public.schema_migrations order by n desc limit 5;
--
-- ==========================================================================
-- THE SECTIONS
-- ==========================================================================
--
-- 1. Row level security is on everywhere. Every table in public. A table
--    without it is readable and writable by anybody the grants allow, with no
--    policy asked at all.
--
-- 2. What anon holds on whole tables. anon is the key in the page source.
--    Exactly two: INSERT on application_socials (004, the apply form's social
--    handles) and INSERT on seat_requests (001, the booking form). Anything
--    else — above all SELECT, UPDATE, DELETE, TRUNCATE — is the applicant
--    list, or the money, open to the internet. Fix it before anything else.
--
-- 3. What anon holds column by column. Expected:
--      applications          INSERT  the apply form's fields (046), plus
--                                    adult_confirmed and privacy_consent_text
--                                    (084) — and NOT status, user_id,
--                                    privacy_consent_at
--      application_disc      INSERT  answers, application_id          (025)
--      application_documents INSERT  application_id, bytes, content_type,
--                                    filename, path                   (013)
--      contact_messages      INSERT  email, id, message, name, page, phone,
--                                    reason                   (010, id 112)
--      client_logos          SELECT  id, image_url, link, name, sort_order,
--                                    visible           (015, declared public)
--      schema_migrations     SELECT  n                 (044, declared public)
--    (A table-level grant also appears column by column in Postgres's
--    catalogue; the two tables in section 2 are left out here for that
--    reason.)
--
-- 4. The status guard (074). authenticated holds UPDATE on
--    applications.status (020) because staff are authenticated too — and so
--    is every applicant. The trigger tells them apart. Two triggers, neither
--    security definer (it reads current_user, which a definer replaces with
--    its owner). And the columns a signed-in session may UPDATE on
--    applications must not include email, user_id, name or tracks.
--
-- 5. Will anything actually be emailed. The section that matters most.
--      - the webhook secret is stored once (094), and nothing a page can run
--        can read it
--      - no function body and no trigger still carries its own copy of the
--        secret, or the placeholder (096 moved them all onto the store; a
--        copy left behind is the "changed the secret, missed one" failure
--        F52 is about)
--      - every trigger that sends an email exists. A missing one is a message
--        that has quietly stopped being sent.
--      - the outbox's job runs every minute (095), and nothing in the outbox
--        has been given up on in the last 30 days. A given-up row is an email
--        that did not go after ten tries; /admin can resend it.
--
-- 6. The hub tables, column by column. Expected:
--      leave_requests  INSERT  application_id, ends_on, reason, starts_on
--      leave_requests  UPDATE  status         (050 took decided_at/_by: the
--                                              trigger stamps them)
--      notices         INSERT  body, created_by, pinned, published_at, title
--                              (created_by is overwritten from the token, 083)
--      notices         UPDATE  body, pinned, published_at, title
--    and anon nowhere on either.
--
-- 7. The six stages. One CHECK constraint on applications.status (038's).
--    Two means an old constraint survived beside it and is vetoing something
--    nobody is looking at.
--
-- 8. Views run as the caller. Every view in public must say
--    security_invoker=true; a view without it runs as its owner and ignores
--    every policy underneath it.
--
-- 9. The daily job that ends placements on their last day (109).

with
-- ── 1 ───────────────────────────────────────────────────────────────────────
s1 as (
  select '1 rls' as section, c.relname::text as item, 'PROBLEM' as state,
         'row level security is OFF — anybody the grants allow reads and writes it' as detail
  from pg_class c
  where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and not c.relrowsecurity
  union all
  select '1 rls', 'every public table', 'ok', 'row level security on'
  where not exists (select 1 from pg_class c
                    where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
                      and not c.relrowsecurity)
),
-- ── 2 ───────────────────────────────────────────────────────────────────────
anon_tables as (
  select table_name::text as t, string_agg(privilege_type, ', ' order by privilege_type) as privs
  from information_schema.role_table_grants
  where grantee = 'anon' and table_schema = 'public'
  group by table_name
),
s2 as (
  select '2 anon tables' as section, t as item,
         case when (t, privs) in (('application_socials', 'INSERT'), ('seat_requests', 'INSERT'))
              then 'ok' else 'PROBLEM' end as state,
         'anon holds ' || privs ||
           case when (t, privs) in (('application_socials', 'INSERT'), ('seat_requests', 'INSERT'))
                then '' else ' — only INSERT on application_socials and seat_requests is expected' end
  from anon_tables
),
-- ── 3 ───────────────────────────────────────────────────────────────────────
anon_cols as (
  select cp.table_name::text as t, cp.privilege_type::text as p,
         string_agg(cp.column_name::text, ', ' order by cp.column_name) as cols
  from information_schema.column_privileges cp
  where cp.grantee = 'anon' and cp.table_schema = 'public'
    and not exists (select 1 from information_schema.role_table_grants g
                     where g.grantee = 'anon' and g.table_schema = 'public'
                       and g.table_name = cp.table_name and g.privilege_type = cp.privilege_type)
  group by cp.table_name, cp.privilege_type
),
expected_cols (t, p, cols) as (values
  ('application_disc',      'INSERT', 'answers, application_id'),
  ('application_documents', 'INSERT', 'application_id, bytes, content_type, filename, path'),
  ('contact_messages',      'INSERT', 'email, id, message, name, page, phone, reason'),
  ('client_logos',          'SELECT', 'id, image_url, link, name, sort_order, visible'),
  ('schema_migrations',     'SELECT', 'n')
),
s3 as (
  select '3 anon columns' as section, a.t || ' ' || a.p as item,
         case
           when a.t = 'applications' and a.p = 'INSERT' then
             case when a.cols ~ '(^|, )(status|user_id|privacy_consent_at)(,|$)' then 'PROBLEM'
                  else 'ok' end
           -- Before 112: correct, only without the id that stops a resend
           -- being stored twice. Not a hole, so not a PROBLEM.
           when a.t = 'contact_messages' and a.p = 'INSERT'
                and a.cols = 'email, message, name, page, phone, reason' then 'ok'
           when e.t is null then 'PROBLEM'
           when e.cols = a.cols then 'ok'
           else 'PROBLEM'
         end as state,
         case
           when a.t = 'applications' and a.p = 'INSERT'
                and a.cols ~ '(^|, )(status|user_id|privacy_consent_at)(,|$)'
             then 'anon may set status, user_id or privacy_consent_at — somebody can file themselves as hired, or backdate a consent: ' || a.cols
           when a.t = 'applications' and a.p = 'INSERT'
                and a.cols !~ '(^|, )adult_confirmed(,|$)'
             then 'the apply form''s fields, but not adult_confirmed / privacy_consent_text yet (084 not run?)'
           when a.t = 'applications' and a.p = 'INSERT' then 'the apply form''s fields, consent included'
           when a.t = 'contact_messages' and a.p = 'INSERT'
                and a.cols = 'email, message, name, page, phone, reason'
             then a.cols || ' (112 not run: a resent message is stored twice)'
           when e.t is null then 'not expected at all: ' || a.cols
           when e.cols = a.cols then a.cols
           else 'expected ' || e.cols || ' — found ' || a.cols
         end
  from anon_cols a
  left join expected_cols e on e.t = a.t and e.p = a.p
),
-- ── 4 ───────────────────────────────────────────────────────────────────────
s4 as (
  select '4 status guard' as section, g.name as item,
         case when t.tgname is null then 'PROBLEM'
              when p.prosecdef then 'PROBLEM'
              else 'ok' end as state,
         case when t.tgname is null then 'missing — a signed-in applicant can set her own stage'
              when p.prosecdef then 'is security definer — the guard lets everybody through'
              else 'in place, runs as the caller' end
  from (values ('applications_status_is_staffs'), ('seat_requests_status_is_staffs')) as g(name)
  left join pg_trigger t on t.tgname = g.name
  left join pg_proc p on p.oid = t.tgfoid
  union all
  select '4 status guard', 'applications UPDATE by a signed-in session',
         case when x.cols ~ '(^|, )(email|user_id|name|tracks)(,|$)' then 'PROBLEM' else 'ok' end,
         case when x.cols ~ '(^|, )(email|user_id|name|tracks)(,|$)'
              then 'email, user_id, name or tracks is writable: ' || x.cols
              else x.cols end
  from (select string_agg(column_name::text, ', ' order by column_name) as cols
          from information_schema.column_privileges
         where table_schema = 'public' and table_name = 'applications'
           and grantee = 'authenticated' and privilege_type = 'UPDATE') x
),
-- ── 5 ───────────────────────────────────────────────────────────────────────
senders as (
  select p.proname::text as item, p.prosrc as def, 'function' as kind
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and (p.prosrc like '%http\_post%' or p.prosrc like '%x-webhook-secret%')
  union all
  select c.relname || '.' || t.tgname, pg_get_triggerdef(t.oid), 'trigger'
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  where not t.tgisinternal and pg_get_triggerdef(t.oid) like '%http\_request%'
),
expected_triggers (tbl, name) as (values
  ('applications',           'notify-applications'),
  ('applications',           'notify-application-status'),
  ('seat_requests',          'notify-seat-requests'),
  ('seat_requests',          'notify-seat-stage'),
  ('contact_messages',       'notify-contact-messages'),
  ('timesheets',             'notify-timesheet-status'),
  ('timesheets',             'notify-client-week'),
  ('leave_requests',         'notify-leave-asked'),
  ('leave_requests',         'notify-leave-decided'),
  ('placements',             'notify-placement-made'),
  ('placements',             'notify-placement-status'),
  ('placements',             'notify-placement-ended'),
  ('placements',             'placement_invites_the_client'),
  ('swap_requests',          'notify-swap-asked'),
  ('swap_requests',          'notify-swap-client-asked'),
  ('swap_requests',          'notify-swap-client-resolved'),
  ('interview_slots',        'notify-interview'),
  ('client_payments',        'notify-payment-receipt'),
  ('application_assessment', 'notify-assessment-sent')
),
s5 as (
  -- the store
  select '5 email' as section, 'private.webhook_secret' as item,
         case when to_regclass('private.webhook_secret') is null then 'PROBLEM'
              when (xpath('/row/n/text()', query_to_xml(
                     'select count(*) as n from private.webhook_secret
                       where length(btrim(value)) >= 8
                         and value <> ''__WEBHOOK'' || ''_SECRET__''', false, true, '')))[1]::text = '1'
              then 'ok' else 'PROBLEM' end as state,
         case when to_regclass('private.webhook_secret') is null
              then 'not run yet — 094 stores the secret every sender reads'
              when (xpath('/row/n/text()', query_to_xml(
                     'select count(*) as n from private.webhook_secret
                       where length(btrim(value)) >= 8
                         and value <> ''__WEBHOOK'' || ''_SECRET__''', false, true, '')))[1]::text = '1'
              then 'stored once (the value is not shown)'
              else 'EMPTY or the placeholder — every email is refused with 401' end
  union all
  select '5 email', 'private.webhook_secret()',
         case when to_regprocedure('private.webhook_secret()') is null then 'PROBLEM'
              when has_function_privilege('anon', 'private.webhook_secret()', 'EXECUTE')
                or has_function_privilege('authenticated', 'private.webhook_secret()', 'EXECUTE')
              then 'PROBLEM' else 'ok' end,
         case when to_regprocedure('private.webhook_secret()') is null then 'not run yet — 094'
              when has_function_privilege('anon', 'private.webhook_secret()', 'EXECUTE')
                or has_function_privilege('authenticated', 'private.webhook_secret()', 'EXECUTE')
              then 'a page can call it and read the secret — revoke it'
              else 'readable by the owner only' end
  -- every place that still holds its own copy
  union all
  select '5 email', s.item,
         case when s.kind = 'trigger' then 'PROBLEM'
              when s.def ~ 'x-webhook-secret(''\s*,\s*''[^'']|"\s*:\s*"[^"])' then 'PROBLEM'
              else 'ok' end,
         case when s.kind = 'trigger' and s.def like '%\_\_WEBHOOK\_SECRET\_\_%'
              then 'a dashboard webhook still on the PLACEHOLDER — refused with 401, nothing sent (run 096)'
              when s.kind = 'trigger'
              then 'a dashboard webhook with its own copy of the secret — run 096'
              when s.def like '%\_\_WEBHOOK\_SECRET\_\_%'
              then 'still on the PLACEHOLDER — refused with 401, nothing sent (run 096)'
              when s.def ~ 'x-webhook-secret(''\s*,\s*''[^'']|"\s*:\s*"[^"])'
              then 'its own copy of the secret — run 096 so it reads the one store'
              else 'reads the stored secret' end
  from senders s
  -- every trigger that should be there
  union all
  select '5 email', e.tbl || '.' || e.name,
         case when t.oid is null then 'PROBLEM' else 'ok' end,
         case when t.oid is null then 'MISSING — this email has quietly stopped being sent (or its migration has not run)'
              else 'in place' end
  from expected_triggers e
  left join pg_trigger t
    on t.tgname = e.name and not t.tgisinternal
   and t.tgrelid = to_regclass('public.' || e.tbl)
  -- the retry job and what it has given up on
  union all
  select '5 email', 'cron: sjva-notify-outbox',
         case when to_regclass('cron.job') is null then 'PROBLEM'
              when (xpath('/row/n/text()', query_to_xml(
                     'select count(*) as n from cron.job where jobname = ''sjva-notify-outbox'' and active',
                     false, true, '')))[1]::text = '1'
              then 'ok' else 'PROBLEM' end,
         case when to_regclass('cron.job') is null then 'pg_cron is not on — 095 switches it on'
              when (xpath('/row/n/text()', query_to_xml(
                     'select count(*) as n from cron.job where jobname = ''sjva-notify-outbox'' and active',
                     false, true, '')))[1]::text = '1'
              then 'every minute — a failed email is tried again'
              else 'missing or paused — nothing retries a failed email (run 095)' end
  union all
  select '5 email', 'notify_outbox',
         case when to_regclass('public.notify_outbox') is null then 'PROBLEM'
              when (xpath('/row/n/text()', query_to_xml(
                     'select count(*) as n from public.notify_outbox
                       where gave_up_at > now() - interval ''30 days''', false, true, '')))[1]::text <> '0'
              then 'PROBLEM' else 'ok' end,
         case when to_regclass('public.notify_outbox') is null then 'not run yet — 095'
              else (xpath('/row/n/text()', query_to_xml(
                     'select count(*) as n from public.notify_outbox
                       where gave_up_at > now() - interval ''30 days''', false, true, '')))[1]::text
                   || ' given up on in 30 days, '
                   || (xpath('/row/n/text()', query_to_xml(
                     'select count(*) as n from public.notify_outbox
                       where delivered_at is null and gave_up_at is null', false, true, '')))[1]::text
                   || ' still being tried'
                   || ' — given-up rows are emails that never went: select id, source, last_status, last_error from public.notify_outbox where gave_up_at is not null order by id desc'
         end
),
-- ── 6 ───────────────────────────────────────────────────────────────────────
hub_cols as (
  select table_name::text as t, grantee::text as g, privilege_type::text as p,
         string_agg(column_name::text, ', ' order by column_name) as cols
  from information_schema.column_privileges
  where table_schema = 'public' and table_name in ('leave_requests', 'notices')
    and grantee in ('anon', 'authenticated')
    and privilege_type in ('INSERT', 'UPDATE')
  group by table_name, grantee, privilege_type
),
expected_hub (t, g, p, cols) as (values
  ('leave_requests', 'authenticated', 'INSERT', 'application_id, ends_on, reason, starts_on'),
  ('leave_requests', 'authenticated', 'UPDATE', 'status'),
  ('notices',        'authenticated', 'INSERT', 'body, created_by, pinned, published_at, title'),
  ('notices',        'authenticated', 'UPDATE', 'body, pinned, published_at, title')
),
s6 as (
  select '6 hub' as section, coalesce(h.t, e.t) || ' ' || coalesce(h.g, e.g) || ' ' || coalesce(h.p, e.p) as item,
         case when h.g = 'anon' then 'PROBLEM'
              when e.t is null or h.t is null or e.cols <> h.cols then 'PROBLEM'
              else 'ok' end as state,
         case when h.g = 'anon' then 'anon can write the hub: ' || h.cols
              when h.t is null then 'expected ' || e.cols || ' — found nothing'
              when e.t is null then 'not expected: ' || h.cols
              when e.cols <> h.cols then 'expected ' || e.cols || ' — found ' || h.cols
              else h.cols end
  from hub_cols h
  full join expected_hub e on e.t = h.t and e.g = h.g and e.p = h.p
),
-- ── 7 ───────────────────────────────────────────────────────────────────────
s7 as (
  select '7 stages' as section, 'applications.status' as item,
         case when count(*) = 1 then 'ok' else 'PROBLEM' end as state,
         case when count(*) = 1 then max(pg_get_constraintdef(oid))
              else count(*) || ' status constraints — every one must agree, and only the narrowest wins: '
                   || string_agg(conname::text, ', ') end
  from pg_constraint
  where conrelid = 'public.applications'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%status%'
    and pg_get_constraintdef(oid) not like '%payout%'
),
-- ── 8 ───────────────────────────────────────────────────────────────────────
s8 as (
  select '8 views' as section, c.relname::text as item, 'PROBLEM' as state,
         'runs as its owner and ignores the RLS underneath — add security_invoker = true' as detail
  from pg_class c
  where c.relnamespace = 'public'::regnamespace and c.relkind = 'v'
    and not coalesce(c.reloptions::text[] @> array['security_invoker=true'], false)
  union all
  select '8 views', 'every view', 'ok', 'runs as the caller'
  where not exists (select 1 from pg_class c
                    where c.relnamespace = 'public'::regnamespace and c.relkind = 'v'
                      and not coalesce(c.reloptions::text[] @> array['security_invoker=true'], false))
),
-- ── 9 ───────────────────────────────────────────────────────────────────────
s9 as (
  select '9 jobs' as section, 'cron: sjva-end-placements' as item,
         case when to_regclass('cron.job') is not null
               and (xpath('/row/n/text()', query_to_xml(
                     'select count(*) as n from cron.job where jobname = ''sjva-end-placements'' and active',
                     false, true, '')))[1]::text = '1'
              then 'ok' else 'PROBLEM' end as state,
         case when to_regclass('cron.job') is not null
               and (xpath('/row/n/text()', query_to_xml(
                     'select count(*) as n from cron.job where jobname = ''sjva-end-placements'' and active',
                     false, true, '')))[1]::text = '1'
              then 'daily — a placement with a last day set ends the morning after it'
              else 'missing — a placement given a future last day never ends (run 109)' end
)
select * from (
  select * from s1 union all select * from s2 union all select * from s3
  union all select * from s4 union all select * from s5 union all select * from s6
  union all select * from s7 union all select * from s8 union all select * from s9
) everything
order by state <> 'PROBLEM', section, item;
