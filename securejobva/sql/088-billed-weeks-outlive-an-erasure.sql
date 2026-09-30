-- 088 — billed weeks outlive an erasure
--
-- Run after: 087
-- Safe to re-run: yes
-- Also needed: nothing in the dashboard.
--
-- ==========================================================================
-- WHAT "REMOVE THIS PERSON ENTIRELY" ALSO REMOVED
-- ==========================================================================
--
-- 060 gave staff a delete on applications, and relied on the cascades already
-- in place to take everything that hangs off the person. One of those chains
-- ends somewhere 060 did not mean it to:
--
--   applications  ->  timesheets            on delete cascade   (030)
--   timesheets    ->  timesheet_days        on delete cascade   (030)
--   timesheets    ->  client_payment_weeks  on delete cascade   (055)
--
-- So erasing an assistant who worked, was billed and was paid takes the
-- approved weeks, their days, and the rows that tie a client's payment to
-- those weeks. The client_payments row itself survives (clients are ON DELETE
-- RESTRICT) and is now allocated to nothing, so 055's balance shows the client
-- in credit by exactly what they paid for her hours, and the only record of
-- which hours they paid for is gone. 060's own rationale — "a week that can be
-- deleted on its own is a bill that can be quietly reduced after it was
-- agreed" — is the thing the cascade does.
--
-- ==========================================================================
-- THE RULE
-- ==========================================================================
--
-- An application with a week that was agreed (status 'approved') or that a
-- payment has been allocated against cannot be deleted from a page. The
-- refusal says why and what to do instead. An application whose weeks are
-- all drafts, submitted or returned has billed nobody, and still goes in one
-- click exactly as 060 intended.
--
-- WHAT TO DO INSTEAD is not decided here. Honouring an erasure request while
-- keeping billing records means keeping SOME of the person — at least the
-- week, the hours and which client they were for — and removing the rest.
-- Which fields that is, and for how long they are kept, is a retention
-- decision for David, not something a migration should invent. Until there is
-- an answer, the refusal points staff at a person rather than at a button.
--
-- WHO IT APPLIES TO. A delete from a page. The SQL editor is left alone on
-- purpose: cleanup-test-data.sql and rehearse-cleanup.sql remove test
-- applications that carry approved, paid test weeks, and a deliberate delete
-- typed by hand with the whole picture in front of you is the override this
-- rule should have. Read from the token, since this function is SECURITY
-- DEFINER (it counts weeks and allocations whatever the caller may read) and
-- current_user inside it is the owner.

do $pre$
begin
  if to_regclass('public.client_payment_weeks') is null then
    raise exception
      'sql/055 has not been run on this database. It creates client_payment_weeks.';
  end if;
end
$pre$;

create or replace function public.keep_billed_weeks()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  agreed integer;
  paid   integer;
begin
  if coalesce(auth.jwt() ->> 'role', '') not in ('anon', 'authenticated') then
    return old;
  end if;

  select count(*) filter (where t.status = 'approved'),
         count(*) filter (where exists (
           select 1 from public.client_payment_weeks w where w.timesheet_id = t.id))
    into agreed, paid
  from public.timesheets t
  where t.application_id = old.id;

  if agreed > 0 or paid > 0 then
    raise exception
      'This person has % approved week(s) and % week(s) a client has paid for. Removing them would delete those billing records, so it cannot be done from here — this erasure has to be handled by hand (see sql/088).',
      agreed, paid
      using hint = 'sjva-billed-weeks';
  end if;

  return old;
end;
$fn$;

revoke all on function public.keep_billed_weeks() from public, anon, authenticated;

-- BEFORE DELETE triggers fire in name order, and this name sorts before 060's
-- applications_log_deletion. It would not matter if it did not — a raise
-- unwinds the tombstone too — but it means nothing is written first.
drop trigger if exists applications_keep_billed_weeks on public.applications;
create trigger applications_keep_billed_weeks
  before delete on public.applications
  for each row execute function public.keep_billed_weeks();

-- ==========================================================================
-- Check it worked
-- ==========================================================================

select tgname, tgenabled
from pg_trigger
where tgname = 'applications_keep_billed_weeks';

-- Who this now protects: applications with billed weeks, and how many.
select a.name,
       count(*) filter (where t.status = 'approved') as approved_weeks,
       count(w.timesheet_id)                         as paid_weeks
from public.applications a
join public.timesheets t on t.application_id = a.id
left join public.client_payment_weeks w on w.timesheet_id = t.id
group by a.id, a.name
having count(*) filter (where t.status = 'approved') > 0 or count(w.timesheet_id) > 0
order by a.name;

-- Payments allocated to no week. Most of these are normal — 055 makes the
-- allocation optional, and a payment recorded without one is still counted in
-- the balance. What an erasure used to add to this list was a payment that
-- HAD weeks until the person was deleted; there is no telling those apart
-- from here, so read it against the deletion_log dates from 060.
select cp.id, cp.client_id, cp.amount_cents, cp.paid_on
from public.client_payments cp
where not exists (select 1 from public.client_payment_weeks w where w.payment_id = cp.id)
order by cp.paid_on desc;

insert into public.schema_migrations (n) values (88) on conflict (n) do nothing;
