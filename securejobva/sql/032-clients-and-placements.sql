-- 032 — clients, placements, and the two rates
--
-- Run after: 031
-- Safe to re-run: yes
-- Also needed: nothing in the dashboard.
--
-- Everything so far knows about applicants and staff. Nothing knows that an
-- assistant works for anybody. So "you have a client" is a sentence the system
-- cannot say, a week of hours cannot be billed to anyone, and the Clients tab
-- in /admin is a list of logos for the home page.
--
-- What this adds, in one line each:
--
--   clients             the businesses assistants are placed with
--   placements          which assistant works for which client, from when
--   placement_billing   what the client pays per hour   — the client may read
--   placement_pay       what the assistant is paid      — the assistant may read
--   swap_requests       a client asking for somebody different
--
-- ==========================================================================
-- WHY THE TWO RATES ARE TWO TABLES
-- ==========================================================================
--
-- The cut is the gap between what a client pays and what an assistant gets,
-- and it stays confidential by neither side seeing the other's number — not by
-- storing no numbers, which would mean no client could be shown what they owe.
--
-- Both rates on one placements row cannot be fenced. A column grant separates
-- ROLES, and a client and an assistant are both `authenticated`; a policy
-- separates ROWS, and this is the same row. There is no column-level policy in
-- Postgres, and the one view trick that would work — a definer view exposing a
-- subset — is exactly what tools/check.mjs refuses, because a view running as
-- its owner ignores every policy underneath it.
--
-- So each rate goes in its own table with its own policy, which is the rule
-- check.mjs already states: a column that genuinely must be hidden belongs in
-- its own table. That is why 005 put the internal pipeline in
-- application_tracking rather than adding columns to applications.
--
-- The result is a fence made of the same material as every other fence here.
-- A client querying placement_pay gets zero rows, not a filtered answer, and
-- not because a page declined to ask.

-- ==========================================================================
-- CLIENTS
-- ==========================================================================
--
-- A business, not a seat request. seat_requests is somebody who once asked us
-- for help and may never have become anything; this is somebody an assistant
-- is actually placed with. A client may take several assistants over the
-- years, so it is its own row rather than a name copied onto each placement.
--
-- contact_email is how they sign in. It is the only thing tying a person at
-- that business to these rows, so it is matched case-insensitively and is the
-- one field that must be right.

create table if not exists public.clients (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  contact_name  text,
  contact_email text,
  -- Weekly or monthly, because clients differ. This is the cycle only and
  -- never an amount; the amounts live in the two tables further down.
  billing_cycle text not null default 'weekly',
  notes         text,
  created_at    timestamptz not null default now(),

  constraint clients_name_sane
    check (length(btrim(name)) between 1 and 200),
  constraint clients_cycle_check
    check (billing_cycle in ('weekly', 'monthly'))
);

create unique index if not exists clients_email_idx
  on public.clients (lower(contact_email))
  where contact_email is not null;

-- ==========================================================================
-- PLACEMENTS
-- ==========================================================================
--
-- One assistant, one client, from a date. Not a sixth rung on the application
-- ladder: the ladder runs one way once, and somebody can finish with one
-- client and start with another, which would need a rung to move backwards.
--
--   matched   picked, meeting being arranged. Nothing has started.
--   trial     the client said yes. Paid trial, for however long they set.
--   ongoing   the trial ended and they were kept on.
--   ended     finished. The row stays, so a week worked in July still points
--             at the client it was worked for.

create table if not exists public.placements (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  client_id      uuid not null references public.clients (id) on delete restrict,
  status         text not null default 'matched',
  started_on     date,
  ended_on       date,
  hours_per_week integer not null default 40,
  trial_weeks    integer,
  created_at     timestamptz not null default now(),

  constraint placements_status_check
    check (status in ('matched', 'trial', 'ongoing', 'ended')),
  constraint placements_hours_sane
    check (hours_per_week between 1 and 168),
  constraint placements_trial_sane
    check (trial_weeks is null or trial_weeks between 1 and 52),
  constraint placements_dates_sane
    check (ended_on is null or started_on is null or ended_on >= started_on)
);

create index if not exists placements_app_idx
  on public.placements (application_id, started_on desc);
create index if not exists placements_client_idx
  on public.placements (client_id, started_on desc);

-- One live placement per assistant. You said one client at a time, and this is
-- where that becomes true rather than remaining a thing everyone remembers to
-- do. A partial unique index, so any number of ended ones may sit behind it.
create unique index if not exists placements_one_live_idx
  on public.placements (application_id)
  where status in ('matched', 'trial', 'ongoing');

-- ==========================================================================
-- THE TWO RATES
-- ==========================================================================
--
-- numeric, not float. A rate multiplied by hours is money, and 7.75 * 36 must
-- be 279.00 exactly rather than 278.99999999999994.

create table if not exists public.placement_billing (
  placement_id uuid primary key references public.placements (id) on delete cascade,
  rate         numeric(8,2) not null,
  constraint placement_billing_sane check (rate >= 0 and rate <= 100000)
);

create table if not exists public.placement_pay (
  placement_id uuid primary key references public.placements (id) on delete cascade,
  rate         numeric(8,2) not null,
  constraint placement_pay_sane check (rate >= 0 and rate <= 100000)
);

-- ==========================================================================
-- ASKING FOR SOMEBODY DIFFERENT
-- ==========================================================================
--
-- The one control on a client's page that ends somebody's job, and the person
-- it happens to is not in the room. So it is a request in a queue and nothing
-- else: the placement is untouched, the assistant keeps working, and the
-- client keeps being billed until a person decides otherwise.
--
-- Note who may NOT read this table: the assistant it is about. Nobody should
-- learn from a portal that a client asked for them to be replaced. That is a
-- conversation, in somebody's own words, once it is known what is actually
-- happening — and a policy is the only way to be sure the page never shows it
-- by accident.

create table if not exists public.swap_requests (
  id           uuid primary key default gen_random_uuid(),
  placement_id uuid not null references public.placements (id) on delete cascade,
  reason       text not null,
  status       text not null default 'open',
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz,
  resolved_by  text,

  constraint swap_status_check
    check (status in ('open', 'resolved', 'withdrawn')),
  constraint swap_reason_sane
    check (length(btrim(reason)) between 1 and 4000)
);

create index if not exists swap_open_idx
  on public.swap_requests (status, created_at)
  where status = 'open';

-- ==========================================================================
-- WHO IS ASKING
-- ==========================================================================
--
-- owns_application() from 026 already answers "is this assistant me". This is
-- the other side of the room.

create or replace function public.is_client_contact(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1 from public.clients c
    where c.id = cid
      and c.contact_email is not null
      and lower(c.contact_email) = lower(coalesce(auth.jwt() ->> 'email', '__nobody__'))
  );
$fn$;

revoke all on function public.is_client_contact(uuid) from public, anon;
grant execute on function public.is_client_contact(uuid) to authenticated;

-- The same question asked about a placement rather than a client, which is
-- what every policy below actually needs.
create or replace function public.is_placement_client(p uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1 from public.placements pl
    where pl.id = p and public.is_client_contact(pl.client_id)
  );
$fn$;

revoke all on function public.is_placement_client(uuid) from public, anon;
grant execute on function public.is_placement_client(uuid) to authenticated;

create or replace function public.is_placement_assistant(p uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1 from public.placements pl
    where pl.id = p and public.owns_application(pl.application_id)
  );
$fn$;

revoke all on function public.is_placement_assistant(uuid) from public, anon;
grant execute on function public.is_placement_assistant(uuid) to authenticated;

-- ==========================================================================
-- GRANTS
-- ==========================================================================

alter table public.clients            enable row level security;
alter table public.placements         enable row level security;
alter table public.placement_billing  enable row level security;
alter table public.placement_pay      enable row level security;
alter table public.swap_requests      enable row level security;

revoke all on public.clients           from anon, authenticated;
revoke all on public.placements        from anon, authenticated;
revoke all on public.placement_billing from anon, authenticated;
revoke all on public.placement_pay     from anon, authenticated;
revoke all on public.swap_requests     from anon, authenticated;

grant select on public.clients            to authenticated;
grant select on public.placements         to authenticated;
grant select on public.placement_billing  to authenticated;
grant select on public.placement_pay      to authenticated;
grant select on public.swap_requests      to authenticated;

-- Staff write these. A client may only ever ask for a swap, and an assistant
-- writes nothing here at all — their side of a placement is something that
-- happens to them, not something they set.
grant insert (name, contact_name, contact_email, billing_cycle, notes) on public.clients to authenticated;
grant update (name, contact_name, contact_email, billing_cycle, notes) on public.clients to authenticated;

grant insert (application_id, client_id, status, started_on, hours_per_week, trial_weeks)
  on public.placements to authenticated;
grant update (status, started_on, ended_on, hours_per_week, trial_weeks)
  on public.placements to authenticated;

grant insert (placement_id, rate) on public.placement_billing to authenticated;
grant update (rate)               on public.placement_billing to authenticated;
grant insert (placement_id, rate) on public.placement_pay     to authenticated;
grant update (rate)               on public.placement_pay     to authenticated;

grant insert (placement_id, reason) on public.swap_requests to authenticated;
grant update (status, resolved_at, resolved_by) on public.swap_requests to authenticated;

-- ── clients ───────────────────────────────────────────────────────────────

drop policy if exists "a client reads their own business" on public.clients;
create policy "a client reads their own business"
  on public.clients for select to authenticated
  using (public.is_client_contact(id) or public.has_permission('applications.view_all'));

drop policy if exists "staff add clients" on public.clients;
create policy "staff add clients"
  on public.clients for insert to authenticated
  with check (public.has_permission('applications.edit'));

drop policy if exists "staff edit clients" on public.clients;
create policy "staff edit clients"
  on public.clients for update to authenticated
  using (public.has_permission('applications.edit'))
  with check (public.has_permission('applications.edit'));

-- ── placements ────────────────────────────────────────────────────────────
--
-- Both sides read the placement itself: the assistant needs to know who they
-- work for, the client needs to know who is working for them. Neither can
-- reach the other's rate, because neither rate is on this table.

drop policy if exists "both sides read their placement" on public.placements;
create policy "both sides read their placement"
  on public.placements for select to authenticated
  using (
    public.owns_application(application_id)
    or public.is_client_contact(client_id)
    or public.has_permission('applications.view_all')
  );

drop policy if exists "staff make placements" on public.placements;
create policy "staff make placements"
  on public.placements for insert to authenticated
  with check (public.has_permission('applications.edit'));

drop policy if exists "staff move placements" on public.placements;
create policy "staff move placements"
  on public.placements for update to authenticated
  using (public.has_permission('applications.edit'))
  with check (public.has_permission('applications.edit'));

-- ── the rates: the whole point of the file ────────────────────────────────
--
-- One line each, and they are not symmetrical by accident. A client may read
-- what they are charged and nothing about what we pay; an assistant may read
-- what they are paid and nothing about what we charge. Staff read both, which
-- is the only place the two numbers ever meet.

drop policy if exists "a client reads what they are charged" on public.placement_billing;
create policy "a client reads what they are charged"
  on public.placement_billing for select to authenticated
  using (public.is_placement_client(placement_id) or public.has_permission('applications.view_all'));

drop policy if exists "staff set what a client is charged" on public.placement_billing;
create policy "staff set what a client is charged"
  on public.placement_billing for insert to authenticated
  with check (public.has_permission('applications.edit'));

drop policy if exists "staff change what a client is charged" on public.placement_billing;
create policy "staff change what a client is charged"
  on public.placement_billing for update to authenticated
  using (public.has_permission('applications.edit'))
  with check (public.has_permission('applications.edit'));

drop policy if exists "an assistant reads what they are paid" on public.placement_pay;
create policy "an assistant reads what they are paid"
  on public.placement_pay for select to authenticated
  using (public.is_placement_assistant(placement_id) or public.has_permission('applications.view_all'));

drop policy if exists "staff set what an assistant is paid" on public.placement_pay;
create policy "staff set what an assistant is paid"
  on public.placement_pay for insert to authenticated
  with check (public.has_permission('applications.edit'));

drop policy if exists "staff change what an assistant is paid" on public.placement_pay;
create policy "staff change what an assistant is paid"
  on public.placement_pay for update to authenticated
  using (public.has_permission('applications.edit'))
  with check (public.has_permission('applications.edit'));

-- ── swaps ─────────────────────────────────────────────────────────────────
--
-- The assistant is deliberately absent from this policy. is_placement_client,
-- not is_placement_assistant.

drop policy if exists "a client reads their own swap requests" on public.swap_requests;
create policy "a client reads their own swap requests"
  on public.swap_requests for select to authenticated
  using (public.is_placement_client(placement_id) or public.has_permission('applications.view_all'));

drop policy if exists "a client asks for somebody different" on public.swap_requests;
create policy "a client asks for somebody different"
  on public.swap_requests for insert to authenticated
  with check (public.is_placement_client(placement_id));

drop policy if exists "staff resolve swap requests" on public.swap_requests;
create policy "staff resolve swap requests"
  on public.swap_requests for update to authenticated
  using (public.has_permission('applications.edit'))
  with check (public.has_permission('applications.edit'));

-- ==========================================================================
-- Check it worked
-- ==========================================================================

select c.relname as table_name,
       c.relrowsecurity as rls_enabled,
       coalesce(string_agg(distinct p.polname, ' | '), 'none') as policies
from pg_class c
left join pg_policy p on p.polrelid = c.oid
where c.relname in ('clients', 'placements', 'placement_billing', 'placement_pay', 'swap_requests')
group by c.relname, c.relrowsecurity
order by c.relname;

select table_name, grantee,
       string_agg(distinct privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_name in ('clients', 'placements', 'placement_billing', 'placement_pay', 'swap_requests')
  and grantee in ('anon', 'authenticated')
group by table_name, grantee
order by table_name, grantee;

-- The two rate tables must be reachable by different people. These two should
-- name different functions — if they name the same one, the fence is not there.
select polrelid::regclass as table_name, polname, pg_get_expr(polqual, polrelid) as using_clause
from pg_policy
where polrelid in ('public.placement_billing'::regclass, 'public.placement_pay'::regclass)
  and polcmd = 'r'
order by 1;
