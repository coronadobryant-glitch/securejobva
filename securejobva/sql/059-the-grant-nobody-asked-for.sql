-- 059 — the grant nobody asked for
--
-- Run after: 058
-- Safe to re-run: yes
-- Also needed: nothing in the dashboard.
--
-- RUN THIS ONE NOW. It closes a hole that 055, 056 and 057 opened.
--
-- ==========================================================================
-- FOUR TABLES SHIPPED WITH EVERY PRIVILEGE GRANTED TO EVERY SIGNED-IN USER
-- ==========================================================================
--
-- Every migration in this repo from 001 onwards writes:
--
--   revoke all on public.<table> from anon, authenticated;
--
-- and then grants back, precisely, what each side may do. 055, 056 and 057
-- each wrote only the first half of that list:
--
--   revoke all on public.<table> from anon;
--
-- Supabase ships ALTER DEFAULT PRIVILEGES granting everything on a new table
-- in `public` to anon, authenticated and service_role. So a new table does not
-- start empty and the revoke is not a formality — it is the whole of the
-- lockdown, and half of it was missing.
--
-- The verification query at the bottom of 057 said so in as many words. It
-- asked for anything other than SELECT held by anon or authenticated, called
-- empty the pass, and came back with six rows: INSERT, UPDATE, DELETE,
-- TRUNCATE, REFERENCES, TRIGGER. The one at the bottom of 055 returned four,
-- naming recorded_by and recorded_at as writable.
--
-- ==========================================================================
-- WHAT WAS ACTUALLY REACHABLE, AND WHAT WAS NOT
-- ==========================================================================
--
-- Row-level security caught most of it, which is the only reason this is being
-- written calmly. INSERT, UPDATE and DELETE all pass through a policy, and the
-- policies were right:
--
--   interview_slots       has a SELECT policy and no other. With RLS on and no
--                         policy for a command, that command is refused
--                         whatever the grant says. Nobody could write a row.
--   client_payments       insert, update and delete each require
--                         has_permission('applications.edit'). A client or an
--                         applicant got nothing.
--   user_settings         every policy is user_id = auth.uid(). Nobody could
--                         reach anybody else's row.
--
-- Two things were genuinely open.
--
-- FIRST, AND THIS IS THE ONE THAT MATTERS: **RLS does not apply to TRUNCATE.**
-- A policy is a row filter, and TRUNCATE does not visit rows — it is a
-- table-level operation, checked against the table privilege and nothing else.
-- So the grant above meant that any signed-in account at all, including an
-- applicant who created one this morning, could have emptied the payments
-- ledger, every interview being arranged, and everybody's time zone. No policy
-- in this schema would have been consulted, and nothing would have been
-- written down about it afterwards.
--
-- Nothing suggests anybody did. These tables are days old and have almost no
-- rows in them. The point is that the door was open, not that somebody walked
-- through it.
--
-- SECOND, and much smaller: recorded_by and recorded_at on client_payments
-- were writable on UPDATE by staff. The trigger from 055 stamps the author on
-- INSERT and only on INSERT, so the record of who wrote a payment down could
-- afterwards be changed to somebody else. That is a staff-only reach and it is
-- still wrong: 050 exists to make authorship a thing the database says rather
-- than a thing a page sends.
--
-- ==========================================================================
-- THE FIX IS THE LINE THAT WAS MISSING
-- ==========================================================================
--
-- Revoke everything from both roles, then grant back exactly the same set the
-- three files intended. Nothing below is a new decision — it is the grant list
-- already written in 055, 056 and 057, applied this time to a table that has
-- had its defaults taken off it first.

do $pre$
begin
  if to_regclass('public.client_payments') is null then
    raise exception 'sql/055 has not been run on this database.';
  end if;
  if to_regclass('public.user_settings') is null then
    raise exception 'sql/056 has not been run on this database.';
  end if;
  if to_regclass('public.interview_slots') is null then
    raise exception 'sql/057 has not been run on this database.';
  end if;
end
$pre$;

-- ── take the defaults off ─────────────────────────────────────────────────
--
-- service_role is deliberately untouched. That is the key the dashboard uses,
-- it bypasses RLS by design, and it is the one credential this repo has always
-- said must never reach anything web-facing.

revoke all on public.client_payments      from anon, authenticated;
revoke all on public.client_payment_weeks from anon, authenticated;
revoke all on public.user_settings        from anon, authenticated;
revoke all on public.interview_slots      from anon, authenticated;

-- ── 055: the payments ledger ──────────────────────────────────────────────

grant select on public.client_payments      to authenticated;
grant select on public.client_payment_weeks to authenticated;

-- recorded_by and recorded_at appear in no list here, which is what makes
-- "never sent by a page" true rather than merely intended.
grant insert (client_id, amount_cents, paid_on, method, reference, note)
  on public.client_payments to authenticated;
grant update (amount_cents, paid_on, method, reference, note)
  on public.client_payments to authenticated;
grant delete on public.client_payments to authenticated;

grant insert (payment_id, timesheet_id) on public.client_payment_weeks to authenticated;
grant delete on public.client_payment_weeks to authenticated;

-- ── 056: the time zone ────────────────────────────────────────────────────

grant select on public.user_settings to authenticated;
grant insert (user_id, time_zone) on public.user_settings to authenticated;
grant update (time_zone)          on public.user_settings to authenticated;

-- ── 057: the interview ────────────────────────────────────────────────────
--
-- SELECT and nothing else, to anybody. Every change goes through one of the
-- five functions in 057, each of which asks who is calling. That was the whole
-- design and until now it was not true.

grant select on public.interview_slots to authenticated;

-- ==========================================================================
-- AND STOP THE AUTHORSHIP MOVING
-- ==========================================================================
--
-- The grant above is the fix. This is the belt to its braces: 055 stamps the
-- author before insert, so an UPDATE could still carry recorded_by somewhere
-- else. Now the trigger fires on both, and on update it puts back what is
-- already there rather than restamping — the question is "who wrote this
-- down", not "who last touched it".

create or replace function public.stamp_payment_author()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if tg_op = 'INSERT' then
    new.recorded_by := coalesce(auth.jwt() ->> 'email', 'somebody');
    new.recorded_at := now();
  else
    -- Whatever the update tried to say about either, the answer is what the
    -- row already said.
    new.recorded_by := old.recorded_by;
    new.recorded_at := old.recorded_at;
  end if;
  return new;
end;
$fn$;

drop trigger if exists client_payments_stamp_author on public.client_payments;
create trigger client_payments_stamp_author
  before insert or update on public.client_payments
  for each row execute function public.stamp_payment_author();

-- ==========================================================================
-- Check it worked
-- ==========================================================================
--
-- All four of these are the queries that caught it, widened to every table
-- this file touches. Empty is the pass, on all of them.

-- Nothing but SELECT, to either public role, on any of the four.
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_name in ('client_payments', 'client_payment_weeks',
                     'user_settings', 'interview_slots')
  and grantee in ('anon', 'authenticated')
  and privilege_type not in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
order by table_name, grantee, privilege_type;

-- TRUNCATE specifically, because it is the one RLS would not have stopped.
select table_name, grantee
from information_schema.role_table_grants
where table_name in ('client_payments', 'client_payment_weeks',
                     'user_settings', 'interview_slots')
  and grantee in ('anon', 'authenticated')
  and privilege_type = 'TRUNCATE';

-- anon holds nothing at all on any of them.
select table_name, privilege_type
from information_schema.role_table_grants
where table_name in ('client_payments', 'client_payment_weeks',
                     'user_settings', 'interview_slots')
  and grantee = 'anon';

-- interview_slots is written by its five functions and by nothing else.
select grantee, privilege_type
from information_schema.role_table_grants
where table_name = 'interview_slots'
  and grantee in ('anon', 'authenticated')
  and privilege_type <> 'SELECT';

-- The two columns that say who wrote a payment down are readable and not
-- writable. This is the query from 055 that returned four rows.
select column_name, privilege_type
from information_schema.column_privileges
where table_name = 'client_payments'
  and grantee in ('anon', 'authenticated')
  and privilege_type in ('INSERT', 'UPDATE')
  and column_name in ('recorded_by', 'recorded_at');

-- And the same for the one on user_settings.
select column_name, privilege_type
from information_schema.column_privileges
where table_name = 'user_settings'
  and grantee in ('anon', 'authenticated')
  and privilege_type in ('INSERT', 'UPDATE')
  and column_name = 'updated_at';

-- ==========================================================================
-- Nothing was lost
-- ==========================================================================
--
-- Not a check, a reassurance. If these come back with the counts you expect,
-- the tables are intact and this was closed before anybody used it.

select 'client_payments'      as what, count(*) from public.client_payments
union all
select 'client_payment_weeks',        count(*) from public.client_payment_weeks
union all
select 'user_settings',               count(*) from public.user_settings
union all
select 'interview_slots',             count(*) from public.interview_slots;

insert into public.schema_migrations (n) values (59) on conflict (n) do nothing;
