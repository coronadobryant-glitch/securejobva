-- 080 — a time zone saved in one request
--
-- Run after: 079
-- Safe to re-run: yes
-- Also needed: nothing in the dashboard.
--
-- ==========================================================================
-- WHY SAVE HAS BEEN FAILING ON EVERY PAGE THAT HAS THE CARD
-- ==========================================================================
--
-- /status, /hub, /seats, /pay and /admin all save the setting the same way:
--
--   POST /rest/v1/user_settings
--   Prefer: resolution=merge-duplicates
--   { "user_id": "<me>", "time_zone": "Asia/Manila" }
--
-- PostgREST turns that into an upsert whose DO UPDATE sets EVERY column in the
-- body — user_id included:
--
--   insert ... on conflict (user_id) do update
--     set user_id = excluded.user_id, time_zone = excluded.time_zone
--
-- Postgres wants UPDATE privilege on each column in that SET list, and asks
-- for it before it knows whether there will be a conflict at all. 056 (and
-- 059 after it) granted update (time_zone) only, so every save — first or
-- fiftieth — comes back 42501, permission denied for table user_settings.
-- tools/build-portal.mjs already knew this shape from placement_billing
-- ("an upsert would try to write placement_id too"); nobody carried it across.
--
-- ==========================================================================
-- TWO CHANGES, SO BOTH THE OLD PAGE AND THE NEW ONE WORK
-- ==========================================================================
--
-- 1. user_id defaults to auth.uid(). A page can now leave it out altogether:
--
--      POST /rest/v1/user_settings
--      Prefer: resolution=merge-duplicates,return=minimal
--      { "time_zone": "Asia/Manila" }        (or null to go back to the browser)
--
--    and the DO UPDATE sets time_zone and nothing else. This is the shape the
--    pages should move to — they stop having to know who they are, and the row
--    is the caller's by construction.
--
-- 2. UPDATE (user_id) is granted, so the pages as they are today — still
--    sending user_id — work the moment this runs, before any of them is
--    redeployed. It is safe for the reason 056's policies give: "a person
--    changes their own settings" has USING and WITH CHECK both user_id =
--    auth.uid(), so the only value user_id may be set to is the one it already
--    has. The grant names a column; the policy decides the value.

do $pre$
begin
  if to_regclass('public.user_settings') is null then
    raise exception
      'sql/056 has not been run on this database. It creates user_settings.';
  end if;
end
$pre$;

alter table public.user_settings
  alter column user_id set default auth.uid();

grant update (user_id) on public.user_settings to authenticated;

-- ==========================================================================
-- Check it worked
-- ==========================================================================

-- The default is in place. Must print auth.uid().
select column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'user_settings' and column_name = 'user_id';

-- Both columns may now be named in an UPDATE; updated_at still may not.
select column_name, privilege_type
from information_schema.column_privileges
where table_name = 'user_settings'
  and grantee = 'authenticated'
  and privilege_type in ('INSERT', 'UPDATE')
order by privilege_type, column_name;

-- The three policies are 056's, unchanged. Each must say user_id = auth.uid().
select polname, pg_get_expr(polqual, polrelid) as using_clause,
       pg_get_expr(polwithcheck, polrelid) as check_clause
from pg_policy
where polrelid = 'public.user_settings'::regclass
order by polname;

insert into public.schema_migrations (n) values (80) on conflict (n) do nothing;
