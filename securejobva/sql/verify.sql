-- verify — read-only. Paste this any time; it changes nothing.
--
-- Rewritten after the 29 September checkup (N49). The version before described
-- the database as it was around 012: it expected anon to hold INSERT on the
-- whole applications table (046 made that a column list), authenticated to
-- hold INSERT on it (it never has), leave_requests to grant decided_at and
-- decided_by (050 revoked both), and it listed every trigger on three tables
-- under "the webhooks", so the one row that mattered sat among a dozen that
-- passed trivially. Output that never matches its own expectations teaches
-- whoever runs it to stop reading it. Each section below says what it should
-- print today, and what a different answer means.
--
-- What has landed is a different question, answered by schema_migrations:
--
--   select n, landed_at from public.schema_migrations order by n desc limit 5;
--
-- If the top number is below 074, the "status guard" section below will
-- report the guard missing, and that is the finding it is there for.

-- --------------------------------------------------------------------------
-- 1. Row level security is on everywhere
-- --------------------------------------------------------------------------
--
-- Every table in public. EMPTY is the pass. A table here is readable and
-- writable by anybody the grants allow, with no policy asked at all.

select c.relname as table_without_rls
from pg_class c
where c.relnamespace = 'public'::regnamespace
  and c.relkind = 'r'
  and not c.relrowsecurity
order by c.relname;

-- --------------------------------------------------------------------------
-- 2. What anon holds on whole tables
-- --------------------------------------------------------------------------
--
-- anon is the key in the page source. Expect exactly two rows:
--
--   application_socials  INSERT      004 — the apply form's social handles
--   seat_requests        INSERT      001 — the booking form
--
-- Everything else anon may do is column by column (section 3). A SELECT,
-- UPDATE, DELETE or TRUNCATE here is the applicant list, or the money, open to
-- the internet. Fix it before doing anything else.

select table_name, string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where grantee = 'anon' and table_schema = 'public'
group by table_name
order by table_name;

-- --------------------------------------------------------------------------
-- 3. What anon holds column by column
-- --------------------------------------------------------------------------
--
-- Expect these, and no others:
--
--   applications          INSERT  the apply form's fields (046), plus
--                                 adult_confirmed and privacy_consent_text (084)
--                                 — and NOT status, user_id, privacy_consent_at
--   application_disc      INSERT  application_id, answers                (025)
--   application_documents INSERT  application_id, bytes, content_type,
--                                 filename, path                         (013)
--   contact_messages      INSERT  email, message, name, page, phone, reason (010)
--   client_logos          SELECT  id, image_url, link, name, sort_order,
--                                 visible             (015, declared public)
--   schema_migrations     SELECT  n                   (044, declared public)
--
-- A SELECT on any other table is a publication. status or user_id on the
-- applications INSERT is somebody filing themselves as hired (046's finding).

select table_name, privilege_type,
       string_agg(column_name, ', ' order by column_name) as columns
from information_schema.column_privileges
where grantee = 'anon' and table_schema = 'public'
group by table_name, privilege_type
order by table_name, privilege_type;

-- --------------------------------------------------------------------------
-- 4. The status guard (074)
-- --------------------------------------------------------------------------
--
-- authenticated holds UPDATE on applications.status and status_changed_at
-- (020), because staff are authenticated too — and so is every applicant.
-- The column grant cannot tell them apart; the trigger does. Expect two rows,
-- is_security_definer = false on both. No rows means an applicant can set her
-- own stage to hired. true means the guard lets everybody through (it reads
-- current_user, which a definer function replaces with its owner).

select c.relname as table_name, t.tgname, p.prosecdef as is_security_definer
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_proc p on p.oid = t.tgfoid
where t.tgname in ('applications_status_is_staffs', 'seat_requests_status_is_staffs')
order by c.relname;

-- The columns a signed-in session may UPDATE on applications. Expect status
-- and status_changed_at (staff, fenced by the trigger above), payout_method
-- (026), and the fourteen from 006: availability, cv, has_equipment, note,
-- phone, posting_consent, posting_consent_at, posting_consent_text, region,
-- skill_bookkeeping, skill_customer, skill_data_entry, skill_english,
-- skill_social. email, user_id, name and tracks must NOT appear.

select string_agg(column_name, ', ' order by column_name) as authenticated_can_update
from information_schema.column_privileges
where table_name = 'applications'
  and grantee = 'authenticated'
  and privilege_type = 'UPDATE';

-- --------------------------------------------------------------------------
-- 5. Will anything actually be emailed
-- --------------------------------------------------------------------------
--
-- The one check here that matters most, on its own so it cannot be missed.
-- Email leaves this database two ways, and each carries the webhook secret:
--
--   a trigger calling supabase_functions.http_request   019/021/028 — the
--       secret is in the trigger definition
--   a function calling net.http_post                    031, 035, 036, 037,
--       040, 058, 066–070, 093 — the secret is in the function body
--
-- EMPTY is the pass for both queries. A row means that trigger or function
-- still carries the __WEBHOOK_SECRET__ placeholder: it fires, api/notify (or
-- api/invite) answers 401, and nothing is sent — which from outside looks
-- exactly like having no webhook at all. The secret itself is never printed.

select c.relname as table_name, t.tgname as webhook_still_on_placeholder
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
where not t.tgisinternal
  and pg_get_triggerdef(t.oid) like '%http_request%'
  and pg_get_triggerdef(t.oid) like '%\_\_WEBHOOK\_SECRET\_\_%'
order by c.relname;

select p.proname as function_still_on_placeholder
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.prosrc like '%http_post%'
  and p.prosrc like '%\_\_WEBHOOK\_SECRET\_\_%'
order by p.proname;

-- And that the webhooks exist at all: one row per trigger that posts. Expect
-- thirteen — notify-applications and notify-application-status on
-- applications, notify-seat-requests, notify-contact-messages,
-- notify-timesheet-status, notify-leave-asked and notify-leave-decided,
-- notify-placement-made, notify-placement-status and placement_invites_the_client
-- on placements, notify-swap-asked, notify-interview, and (from 093)
-- notify-payment-receipt on client_payments. A missing one is a message that
-- has quietly stopped being sent.

select c.relname as table_name, t.tgname as trigger_name
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
where not t.tgisinternal
  and (t.tgname like 'notify%' or t.tgname = 'placement_invites_the_client')
order by c.relname, t.tgname;

-- --------------------------------------------------------------------------
-- 6. The hub tables, column by column
-- --------------------------------------------------------------------------
--
-- role_table_grants shows only SELECT on these and looks bare; the writes are
-- column grants. Expect:
--
--   leave_requests  INSERT  application_id, ends_on, reason, starts_on
--   leave_requests  UPDATE  status          (050 took decided_at/decided_by:
--                                            the trigger stamps them)
--   notices         INSERT  body, created_by, pinned, published_at, title
--                           (created_by is overwritten from the token — 083)
--   notices         UPDATE  body, pinned, published_at, title
--
-- anon must not appear at all.

select table_name, grantee, privilege_type,
       string_agg(column_name, ', ' order by column_name) as columns
from information_schema.column_privileges
where table_name in ('leave_requests', 'notices')
  and grantee in ('anon', 'authenticated')
group by table_name, grantee, privilege_type
order by table_name, privilege_type;

-- --------------------------------------------------------------------------
-- 7. The six stages
-- --------------------------------------------------------------------------
--
-- One constraint, 038's, listing applied, assessment, interview, approved,
-- hired, declined. Two rows here means an old constraint survived beside it
-- and is vetoing something nobody is looking at.

select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.applications'::regclass
  and pg_get_constraintdef(oid) like '%status%'
  and contype = 'c';

-- --------------------------------------------------------------------------
-- 8. Views run as the caller
-- --------------------------------------------------------------------------
--
-- Every view in public must say security_invoker=true. A view without it runs
-- as its owner and ignores every policy underneath it. EMPTY is the pass.

select c.relname as view_running_as_owner
from pg_class c
where c.relnamespace = 'public'::regnamespace
  and c.relkind = 'v'
  and not coalesce(c.reloptions::text[] @> array['security_invoker=true'], false)
order by c.relname;
