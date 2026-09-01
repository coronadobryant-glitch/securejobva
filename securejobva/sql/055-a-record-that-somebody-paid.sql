-- 055 — a record that somebody paid
--
-- Run after: 054
-- Safe to re-run: yes
-- Also needed: nothing in the dashboard.
--
-- ==========================================================================
-- THE BILL ONLY EVER GOES UP
-- ==========================================================================
--
-- /seats adds up every approved, non-trial week a client has ever had and
-- heads the number "Total approved, not yet paid". The second half of that
-- sentence is not checked against anything, because nothing in this database
-- has ever recorded that money arrived.
--
-- So the first client who pays is told, on their own page, that they still owe
-- it. And the week after, that they owe it plus the new week. There is no
-- point at which the number falls, and no screen anywhere that says otherwise.
--
-- It has been harmless so far for one reason only: no money has moved through
-- the product yet. That stops being true the moment somebody sends a transfer.
--
-- ==========================================================================
-- WHAT THIS IS, AND WHAT IT DELIBERATELY IS NOT
-- ==========================================================================
--
-- This is a ledger of transfers that a person watched land and wrote down. It
-- is not a payment provider: there is no card, no fee, no webhook and no
-- reconciliation. Staff record what arrived; the client's page subtracts it.
--
-- Two tables rather than one:
--
--   client_payments        the money. Amount, when, how, reference, note.
--   client_payment_weeks   which weeks it settled, if anybody says.
--
-- The second is optional on purpose. A client wires a round number against
-- three weeks and a bit; forcing staff to split it before the payment can be
-- recorded means the payment does not get recorded. So the balance is always
-- honest — total approved minus total paid — and the week-by-week "paid" marks
-- are a finer answer that appears only where somebody has actually said.
--
-- ==========================================================================
-- MONEY IS AN INTEGER NUMBER OF CENTS
-- ==========================================================================
--
-- 046 is the reason. A weekly quote was held in a column that could not carry
-- cents, and $327.50 was stored, displayed and quoted as $327. The rates on
-- placement_billing are numeric(8,2) and exact; this column is integer cents
-- and also exact. What must never happen again is a money column that rounds
-- on the way in and gives no sign that it did.

do $pre$
begin
  if to_regclass('public.clients') is null or to_regclass('public.placements') is null then
    raise exception
      'sql/032 has not been run on this database. It creates clients and placements, which this file hangs off.';
  end if;
  if to_regclass('public.timesheets') is null then
    raise exception
      'sql/030 has not been run on this database. It creates timesheets, which the week allocations point at.';
  end if;
end
$pre$;

-- ==========================================================================
-- THE MONEY
-- ==========================================================================

create table if not exists public.client_payments (
  id           uuid primary key default gen_random_uuid(),
  -- restrict, not cascade. Deleting a client who has paid us should be
  -- refused rather than quietly taking the record of their money with it.
  client_id    uuid not null references public.clients (id) on delete restrict,
  amount_cents integer not null,
  paid_on      date not null default current_date,
  method       text not null default 'bank_transfer',
  -- Their reference on the transfer, so a line on a bank statement can be
  -- matched back to this row by a human being months later.
  reference    text,
  note         text,
  recorded_at  timestamptz not null default now(),
  -- Stamped from the token by the trigger below, never sent by a page. The
  -- same rule as 050: who did a thing is not something the doer gets to type.
  recorded_by  text,

  -- Positive only. A wrong entry is deleted, not cancelled out by a negative
  -- one — an offsetting pair reads as two payments to everything that counts
  -- rows, and the client's page is one of the things that counts rows.
  constraint client_payments_amount_sane
    check (amount_cents > 0 and amount_cents <= 100000000),
  constraint client_payments_method_check
    check (method in ('bank_transfer', 'wise', 'paypal', 'card', 'cheque', 'cash', 'other')),
  constraint client_payments_reference_sane
    check (coalesce(length(reference), 0) <= 200),
  constraint client_payments_note_sane
    check (coalesce(length(note), 0) <= 2000)
);

create index if not exists client_payments_client_idx
  on public.client_payments (client_id, paid_on desc);

-- ==========================================================================
-- WHICH WEEKS IT SETTLED
-- ==========================================================================
--
-- A week is a timesheet row, so this points at one rather than spelling out a
-- (placement, date) pair again. timesheets already holds one sheet per person
-- per week and knows its own placement, which means a week cannot be named
-- here in a way that does not exist.
--
-- A timesheet may appear against at most one payment. Two payments settling
-- the same week is either a mistake or a part payment, and a part payment is
-- exactly the case the optional allocation above exists to handle: record both
-- payments, allocate neither, and the balance is still right.

create table if not exists public.client_payment_weeks (
  payment_id   uuid not null references public.client_payments (id) on delete cascade,
  timesheet_id uuid not null references public.timesheets (id) on delete cascade,
  primary key (payment_id, timesheet_id)
);

create unique index if not exists client_payment_weeks_one_payment_idx
  on public.client_payment_weeks (timesheet_id);

-- A week may only be settled by a payment from the client whose week it is.
-- Nothing above says so: both sides are uuids, and a mistyped id would file
-- one client's money against another client's hours and reduce the wrong
-- balance. The two tables can only be seen at once from here.
create or replace function public.check_payment_week_client()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  pay_client  uuid;
  week_client uuid;
begin
  select client_id into pay_client
  from public.client_payments where id = new.payment_id;

  select p.client_id into week_client
  from public.timesheets t
  join public.placements p on p.id = t.placement_id
  where t.id = new.timesheet_id;

  if week_client is null then
    raise exception 'that week is not attached to a placement, so nobody is billed for it';
  end if;

  if pay_client is distinct from week_client then
    raise exception 'that week belongs to a different client than the payment';
  end if;

  return new;
end;
$fn$;

drop trigger if exists client_payment_weeks_same_client on public.client_payment_weeks;
create trigger client_payment_weeks_same_client
  before insert or update on public.client_payment_weeks
  for each row execute function public.check_payment_week_client();

-- ==========================================================================
-- WHO WROTE IT DOWN
-- ==========================================================================

create or replace function public.stamp_payment_author()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  new.recorded_by := coalesce(auth.jwt() ->> 'email', 'somebody');
  return new;
end;
$fn$;

drop trigger if exists client_payments_stamp_author on public.client_payments;
create trigger client_payments_stamp_author
  before insert on public.client_payments
  for each row execute function public.stamp_payment_author();

-- ==========================================================================
-- WHO MAY SEE AND DO WHAT
-- ==========================================================================
--
-- A client reads their own payments and nothing else's — the same shape as
-- placement_billing, and for the same reason: this is their money.
--
-- The assistant is absent from every policy here, deliberately. What a client
-- pays us is not what we pay her, and 032 keeps those two numbers apart on
-- purpose. Nothing on this table should become the thing that joins them.

alter table public.client_payments      enable row level security;
alter table public.client_payment_weeks enable row level security;

revoke all on public.client_payments      from anon;
revoke all on public.client_payment_weeks from anon;

grant select on public.client_payments      to authenticated;
grant select on public.client_payment_weeks to authenticated;

-- recorded_by and recorded_at are in no insert grant. The trigger writes the
-- first; the default writes the second. Leaving them out of the column list is
-- what makes "never sent by a page" true rather than merely intended.
grant insert (client_id, amount_cents, paid_on, method, reference, note)
  on public.client_payments to authenticated;
grant update (amount_cents, paid_on, method, reference, note)
  on public.client_payments to authenticated;
grant delete on public.client_payments to authenticated;

grant insert (payment_id, timesheet_id) on public.client_payment_weeks to authenticated;
grant delete on public.client_payment_weeks to authenticated;

drop policy if exists "a client reads their own payments" on public.client_payments;
create policy "a client reads their own payments"
  on public.client_payments for select to authenticated
  using (public.is_client_contact(client_id) or public.has_permission('applications.view_all'));

drop policy if exists "staff record a payment" on public.client_payments;
create policy "staff record a payment"
  on public.client_payments for insert to authenticated
  with check (public.has_permission('applications.edit'));

drop policy if exists "staff correct a payment" on public.client_payments;
create policy "staff correct a payment"
  on public.client_payments for update to authenticated
  using (public.has_permission('applications.edit'))
  with check (public.has_permission('applications.edit'));

drop policy if exists "staff remove a payment" on public.client_payments;
create policy "staff remove a payment"
  on public.client_payments for delete to authenticated
  using (public.has_permission('applications.edit'));

-- The allocation is readable by whoever may read the payment it hangs off, so
-- the client's page can mark a week paid. Written by staff only.

drop policy if exists "a client reads what their payment settled" on public.client_payment_weeks;
create policy "a client reads what their payment settled"
  on public.client_payment_weeks for select to authenticated
  using (
    exists (
      select 1 from public.client_payments p
      where p.id = payment_id
        and (public.is_client_contact(p.client_id) or public.has_permission('applications.view_all'))
    )
  );

drop policy if exists "staff allocate a payment" on public.client_payment_weeks;
create policy "staff allocate a payment"
  on public.client_payment_weeks for insert to authenticated
  with check (public.has_permission('applications.edit'));

drop policy if exists "staff unallocate a payment" on public.client_payment_weeks;
create policy "staff unallocate a payment"
  on public.client_payment_weeks for delete to authenticated
  using (public.has_permission('applications.edit'));

-- ==========================================================================
-- Check it worked
-- ==========================================================================

-- The one rule. Empty is the pass — anon may not touch either table.
select table_name, privilege_type
from information_schema.role_table_grants
where table_name in ('client_payments', 'client_payment_weeks')
  and grantee = 'anon';

-- Neither of the two things a payment knows about its own authorship may be
-- WRITTEN by a page. Reading them is fine — SELECT is granted on the table as
-- a whole, so leaving the privilege_type filter off lists both as readable and
-- reads like a failure when nothing is wrong. Empty is the pass.
select column_name, privilege_type
from information_schema.column_privileges
where table_name = 'client_payments'
  and grantee in ('anon', 'authenticated')
  and privilege_type in ('INSERT', 'UPDATE')
  and column_name in ('recorded_by', 'recorded_at');

-- What every client actually owes, which is the number this file exists to
-- make possible: approved, non-trial weeks at the placement's rate, less what
-- has been written down as paid.
select c.name,
       round(coalesce(sum(w.hours * b.rate), 0), 2)   as approved,
       coalesce(max(paid.cents), 0) / 100.0           as paid,
       round(coalesce(sum(w.hours * b.rate), 0), 2)
         - coalesce(max(paid.cents), 0) / 100.0       as balance
from public.clients c
left join public.placements p on p.client_id = c.id
left join public.placement_billing b on b.placement_id = p.id
left join (
  select t.placement_id,
         (select coalesce(sum(d.hours), 0)
            from public.timesheet_days d where d.timesheet_id = t.id) as hours
  from public.timesheets t
  where t.status = 'approved' and not t.trial_week
) w on w.placement_id = p.id
left join lateral (
  select coalesce(sum(cp.amount_cents), 0) as cents
  from public.client_payments cp where cp.client_id = c.id
) paid on true
group by c.id, c.name
order by c.name;

insert into public.schema_migrations (n) values (55) on conflict (n) do nothing;
