-- 011 — let an applicant read back the consent they gave
--
-- Run after: 010
-- Safe to re-run: yes
-- Also needed: nothing in the dashboard.
--
-- /status asks for posting_consent and the whole query is refused with 42501,
-- so the page shows "We could not load your application just now" and the
-- applicant sees nothing at all. /admin fails the same way.
--
-- 006 granted posting_consent for UPDATE, because the applicant ticks the box.
-- Nothing ever granted it for SELECT, so they could write the answer and not
-- read it back. A column-level grant refuses the entire statement over one
-- missing column rather than returning the rest, which is the safe direction
-- for it to fail in -- but it means a page asking for one ungranted column
-- looks exactly like a broken database.
--
-- The two timestamps alongside it are here for the same reason: the page shows
-- when consent was given and what text was agreed to, and leaving them out
-- would only mean a 009 the next time somebody adds them to a query.

grant select (
  posting_consent, posting_consent_at, posting_consent_text
) on public.applications to authenticated;

-- --------------------------------------------------------------------------
-- Check it worked
-- --------------------------------------------------------------------------
--
-- Every column /status and /admin ask for should appear here. anon must still
-- show INSERT and nothing else.

select grantee,
       string_agg(distinct privilege_type, ',' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_name = 'applications' and grantee in ('anon', 'authenticated')
group by grantee;

select column_name
from information_schema.column_privileges
where table_name = 'applications'
  and grantee = 'authenticated'
  and privilege_type = 'SELECT'
order by column_name;
