-- 039 — a client has a name, and an assistant may know it
--
-- Run after: 038
-- Safe to re-run: yes
-- Also needed: nothing in the dashboard.
--
-- On /hub, an assistant placed with a business saw her client card headed
--
--   your client
--
-- in lowercase, because that string is the fallback in the page, not a name.
-- Found by clicking, like 037 and 038 before it.
--
-- ==========================================================================
-- WHY THE NAME WAS FENCED IN WITH THE MONEY
-- ==========================================================================
--
-- The portal asks for the placement with the business nested in:
--
--   placements?select=id,status,...,clients(name)
--
-- 032 gave public.clients exactly one SELECT policy:
--
--   using (is_client_contact(id) or has_permission('applications.view_all'))
--
-- An assistant is neither. The embed comes back null, PostgREST keeps the
-- parent row, and the page falls through to its default. So she is placed,
-- the card renders, the trial dates are right, and the one fact the card
-- exists to carry — who she works for — is the only thing missing.
--
-- The obvious repair is a fourth policy on clients letting the placed
-- assistant read the row. It is also wrong, and for the reason this file
-- exists: `grant select on public.clients to authenticated` is table-wide, so
-- any policy that hands her the row hands her contact_email, billing_cycle
-- and notes with it. Column grants cannot help — she and the client contact
-- are both `authenticated`, and a grant separates roles, not people.
--
-- That is the same wall that put the two rates in two tables, and it has the
-- same answer, already written down in 032: a column that must be hidden
-- belongs in its own table. Here the hidden ones are the majority, so they
-- move and the name stays.
--
--   clients          id, name          — both sides of a placement may read
--   client_private   everything else   — the client contact and staff only
--
-- ==========================================================================
-- THE PRIVATE HALF
-- ==========================================================================

create table if not exists public.client_private (
  client_id     uuid primary key references public.clients (id) on delete cascade,
  contact_name  text,
  contact_email text,
  -- Weekly or monthly. The cycle only, never an amount; the amounts are still
  -- one table each further down, and neither of them moved.
  billing_cycle text not null default 'weekly',
  notes         text,

  constraint client_private_cycle_check
    check (billing_cycle in ('weekly', 'monthly'))
);

-- Copy before dropping, and only while there is something to copy from. A
-- re-run finds the columns gone and does nothing, which is why this guards on
-- the catalogue rather than on the data.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'clients'
      and column_name = 'contact_email'
  ) then
    insert into public.client_private (client_id, contact_name, contact_email, billing_cycle, notes)
    select c.id, c.contact_name, c.contact_email,
           coalesce(c.billing_cycle, 'weekly'), c.notes
    from public.clients c
    on conflict (client_id) do nothing;
  end if;
end
$$;

-- is_client_contact() is how a person at that business reaches every row they
-- own — the client policies on clients, placements, placement_billing,
-- timesheets and swap_requests all stand on it. It moves to the new table
-- BEFORE the old columns go, so there is no moment where it reads a column
-- that is not there.
--
-- It is security definer, so it reads client_private without RLS applying,
-- and nothing below can recurse back through it.
create or replace function public.is_client_contact(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1 from public.client_private p
    where p.client_id = cid
      and p.contact_email is not null
      and lower(p.contact_email) = lower(coalesce(auth.jwt() ->> 'email', '__nobody__'))
  );
$fn$;

revoke all on function public.is_client_contact(uuid) from public, anon;
grant execute on function public.is_client_contact(uuid) to authenticated;

-- The uniqueness that makes contact_email a sign-in follows the column. Made
-- first, so the address is never briefly unguarded.
create unique index if not exists client_private_email_idx
  on public.client_private (lower(contact_email))
  where contact_email is not null;

drop index if exists public.clients_email_idx;

alter table public.clients drop column if exists contact_name;
alter table public.clients drop column if exists contact_email;
alter table public.clients drop column if exists billing_cycle;
alter table public.clients drop column if exists notes;

-- ==========================================================================
-- WHO MAY READ WHICH HALF
-- ==========================================================================

alter table public.client_private enable row level security;

revoke all on public.client_private from anon, authenticated;
grant select on public.client_private to authenticated;
grant insert (client_id, contact_name, contact_email, billing_cycle, notes)
  on public.client_private to authenticated;
grant update (contact_name, contact_email, billing_cycle, notes)
  on public.client_private to authenticated;

drop policy if exists "a client reads their own details" on public.client_private;
create policy "a client reads their own details"
  on public.client_private for select to authenticated
  using (public.is_client_contact(client_id) or public.has_permission('applications.view_all'));

drop policy if exists "staff add client details" on public.client_private;
create policy "staff add client details"
  on public.client_private for insert to authenticated
  with check (public.has_permission('applications.edit'));

drop policy if exists "staff edit client details" on public.client_private;
create policy "staff edit client details"
  on public.client_private for update to authenticated
  using (public.has_permission('applications.edit'))
  with check (public.has_permission('applications.edit'));

-- The question this whole file is for: is this business one I am placed with.
-- The mirror of is_placement_client, asked about a client rather than a
-- placement, and it says nothing about the placement beyond that it exists.
--
-- Ended placements count. Somebody who worked for a business in July should
-- still be able to read July's timesheet without the name going blank.
create or replace function public.is_client_assistant(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1 from public.placements pl
    where pl.client_id = cid and public.owns_application(pl.application_id)
  );
$fn$;

revoke all on function public.is_client_assistant(uuid) from public, anon;
grant execute on function public.is_client_assistant(uuid) to authenticated;

-- Replaced by name, not added alongside. 038 was the whole lesson in what
-- happens when a rule gets written twice; policies double more forgivingly
-- than constraints do (they OR, where constraints AND), but a stale one still
-- means two places to read before you know the answer.
drop policy if exists "a client reads their own business" on public.clients;
drop policy if exists "both sides of a placement read the business" on public.clients;
create policy "both sides of a placement read the business"
  on public.clients for select to authenticated
  using (
    public.is_client_contact(id)
    or public.is_client_assistant(id)
    or public.has_permission('applications.view_all')
  );

-- ==========================================================================
-- Check it worked
-- ==========================================================================
--
-- clients holds a name and an id, and nothing anyone needs hidden.

select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'clients'
order by ordinal_position;

-- Every business has its private half, and no address was lost on the way.

select
  (select count(*) from public.clients)        as businesses,
  (select count(*) from public.client_private) as private_rows,
  (select count(*) from public.client_private
    where contact_email is not null)           as with_an_address;

-- One SELECT policy on each half, and the one on clients names three ways in.

select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('clients', 'client_private')
order by tablename, policyname;
