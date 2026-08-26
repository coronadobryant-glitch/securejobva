-- 006 — let an applicant correct their own application
--
-- Run after: 005
-- Safe to re-run: yes
-- Also needed: nothing in the dashboard.
--
-- 1.2 says an applicant may view AND edit their own data. Reading has worked
-- since 003; this is the writing half, and it is the more dangerous one, so
-- almost all of this file is about what they may NOT change.

-- ==========================================================================
-- WHAT AN APPLICANT MAY CHANGE
-- ==========================================================================
--
-- A column list, not `grant update on table`. Everything absent from this list
-- is unwritable by them no matter what any policy says, which means a mistake
-- in the policy below cannot become a mistake in the data.
--
-- Read the list for what is missing rather than what is there:
--
--   email     -- is their identity. The read policy matches on it, so being
--                able to edit it is being able to point at somebody else's
--                row, or to orphan your own.
--   user_id   -- same, by the other key.
--   status    -- is ours to set. An applicant who could write it would move
--                themselves to approved.
--   name      -- deliberately withheld. It is on the contract and on the ID
--                check, and a quiet change to it after approval is worth a
--                conversation, not a form field. They can ask.
--   created_at, id -- history.
--
-- Anything in application_tracking is untouchable here by construction: it is
-- a different table and they have no policy on it at all.

grant update (
  phone, cv, note,
  region, availability, has_equipment,
  skill_english, skill_customer, skill_data_entry, skill_social, skill_bookkeeping,
  posting_consent, posting_consent_at, posting_consent_text
) on public.applications to authenticated;

-- USING says which rows they may attempt to write. WITH CHECK says what the
-- row may look like afterwards. Both are needed and they are not the same
-- question: without WITH CHECK a row could be edited into somebody else's,
-- and the column grant above is what stops that being possible at all.
drop policy if exists "edit your own application" on public.applications;
create policy "edit your own application"
  on public.applications for update to authenticated
  using (
    user_id = auth.uid()
    or lower(email) = lower(coalesce(auth.jwt() ->> 'email', '__nobody__'))
  )
  with check (
    user_id = auth.uid()
    or lower(email) = lower(coalesce(auth.jwt() ->> 'email', '__nobody__'))
  );

-- Staff keep their own separate policy from 004. Postgres ORs permissive
-- policies together, so a staff member editing a stage and an applicant
-- fixing their phone number each pass by their own route, and neither
-- widens the other.

-- ==========================================================================
-- WITHDRAWING CONSENT
-- ==========================================================================
--
-- The consent text promises they can withdraw at any time, so that has to be
-- something they can actually do rather than something they have to ask for.
-- posting_consent is in the grant list above for exactly that reason.
--
-- Note what withdrawal does NOT do: it does not erase posting_consent_at or
-- posting_consent_text. If we ever posted on their behalf, the record of the
-- permission we were acting under has to survive the permission being taken
-- away, or there is no answer to "on what basis did you post this".
--
-- So a withdrawal sets the boolean false and leaves the history intact. The
-- trigger below enforces that rather than trusting the page to do it.

create or replace function public.keep_consent_history()
returns trigger
language plpgsql
as $fn$
begin
  -- Granting consent stamps the moment. Withdrawing leaves the stamp alone.
  if new.posting_consent and not old.posting_consent then
    new.posting_consent_at := now();
  elsif not new.posting_consent and old.posting_consent then
    new.posting_consent_at   := old.posting_consent_at;
    new.posting_consent_text := old.posting_consent_text;
  end if;
  return new;
end;
$fn$;

drop trigger if exists applications_consent_history on public.applications;
create trigger applications_consent_history
  before update on public.applications
  for each row execute function public.keep_consent_history();

-- ==========================================================================
-- Check it worked
-- ==========================================================================
--
-- applications should now list four policies: the public INSERT, the
-- owner-or-staff SELECT, the staff UPDATE and the applicant UPDATE.

select c.relname as table_name,
       c.relrowsecurity as rls_enabled,
       count(p.polname) as policy_count,
       coalesce(string_agg(p.polname, ' | ' order by p.polname), 'none') as policies
from pg_class c
left join pg_policy p on p.polrelid = c.oid
where c.relname = 'applications'
group by c.relname, c.relrowsecurity;

-- The columns a signed-in applicant may write. `email`, `user_id`, `status`
-- and `name` must NOT appear in this list.
select string_agg(column_name, ', ' order by column_name) as applicant_can_update
from information_schema.column_privileges
where table_name = 'applications'
  and grantee = 'authenticated'
  and privilege_type = 'UPDATE';
