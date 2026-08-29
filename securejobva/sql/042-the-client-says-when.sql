-- 042 — the client says when the work starts
--
-- Run after: 041
-- Safe to re-run: yes
-- Also needed: nothing in the dashboard.
--
-- ==========================================================================
-- A DATE NOBODY HAD AGREED TO
-- ==========================================================================
--
-- started_on is typed in /admin at the moment of matching. But at that moment
-- nothing has happened yet — the card on both portals says so in as many
-- words: "the next step is a meeting, and nothing is settled until after
-- that." So the date is a guess.
--
-- The trial is counted from that guess. The first billable week is therefore
-- decided by it too, and if the work actually begins a week later than staff
-- supposed, the free trial has quietly run out over days nobody worked. That
-- is a billing error with a friendly face: every screen agrees, and every
-- screen is wrong together.
--
-- The person who knows when work can start is the client. So they say.
--
--   /admin      proposes a date when matching, as now
--   /seats      shows it and asks them to confirm it or give another
--   here        stamps the real date and moves the placement to trial
--
-- Staff keep the commercial terms — the two rates, the hours, the length of
-- the trial. The client owns the one fact only they have.
--
-- ==========================================================================
-- WHY THIS IS A TABLE AND NOT AN UPDATE
-- ==========================================================================
--
-- The obvious build is to let a client update their own placement row. 032
-- grants the columns like this:
--
--   grant update (status, started_on, ended_on, hours_per_week, trial_weeks)
--     on public.placements to authenticated;
--
-- A policy gates rows, not columns, and a client and an assistant are both
-- `authenticated`. So any policy letting a client write that row lets them
-- rewrite hours_per_week and trial_weeks — the two numbers that decide what
-- they pay. The same wall as 039 and 041, reached from a third direction.
--
-- So the confirmation is its own row, the way swap_requests already is: the
-- client writes what they are entitled to say, and something else decides what
-- it means. placements stays writable by staff alone.

create table if not exists public.placement_starts (
  placement_id uuid primary key references public.placements (id) on delete cascade,
  starts_on    date not null,
  -- Stamped from the token, never sent by the page, for the same reason 028
  -- stamps a note's author: a field the browser fills is a field the browser
  -- can lie about, and this one is the record of who agreed to a date.
  confirmed_by text,
  confirmed_at timestamptz not null default now()
);

-- One confirmation per placement, which the primary key already enforces. A
-- client who needs to move the date afterwards is a conversation, not a form:
-- by then somebody may have worked days against it.

create or replace function public.confirm_placement_start()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  pl public.placements%rowtype;
begin
  select * into pl from public.placements where id = new.placement_id;

  if not found then
    raise exception 'that placement does not exist';
  end if;

  -- Only from matched. A trial that has begun has hours behind it, and an
  -- ended placement is history.
  if pl.status <> 'matched' then
    raise exception 'this placement is already %, so its start is settled', pl.status;
  end if;

  -- A window rather than a constraint, because a CHECK may not read the clock.
  -- Generous on both sides: a date last week is a start that already happened
  -- and somebody is catching up on paperwork; four months out is somebody who
  -- has mistyped a year.
  if new.starts_on < current_date - interval '30 days'
     or new.starts_on > current_date + interval '120 days' then
    raise exception 'that start date is not within a few months of today';
  end if;

  new.confirmed_by := coalesce(auth.jwt() ->> 'email', new.confirmed_by);

  -- The promotion. Definer, so it does not need the staff-only write policy on
  -- placements — and note this is the moment 035 already emails the assistant
  -- "You start with them on <date>", which is exactly right and cost nothing.
  update public.placements
     set started_on = new.starts_on,
         status     = 'trial'
   where id = new.placement_id;

  return new;
end;
$fn$;

revoke all on function public.confirm_placement_start() from public, anon, authenticated;

drop trigger if exists a_start_is_confirmed on public.placement_starts;
create trigger a_start_is_confirmed
  before insert on public.placement_starts
  for each row
  execute function public.confirm_placement_start();

-- ==========================================================================
-- WHO MAY SAY IT
-- ==========================================================================

alter table public.placement_starts enable row level security;

revoke all on public.placement_starts from anon, authenticated;
grant select on public.placement_starts to authenticated;

-- The two fields a person may actually send. confirmed_by and confirmed_at are
-- not granted at all, because the trigger writes them.
grant insert (placement_id, starts_on) on public.placement_starts to authenticated;

drop policy if exists "both sides read the start that was agreed" on public.placement_starts;
create policy "both sides read the start that was agreed"
  on public.placement_starts for select to authenticated
  using (
    public.is_placement_client(placement_id)
    or public.is_placement_assistant(placement_id)
    or public.has_permission('applications.view_all')
  );

-- Only the client. The assistant is told the date; they do not set it, and
-- staff move a placement through /admin as they always have.
drop policy if exists "the client confirms the start" on public.placement_starts;
create policy "the client confirms the start"
  on public.placement_starts for insert to authenticated
  with check (public.is_placement_client(placement_id));

-- ==========================================================================
-- Check it worked
-- ==========================================================================
--
-- Two grants for a signed-in person, and neither of them a way to write the
-- stamp.

select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'placement_starts'
  and grantee = 'authenticated'
order by privilege_type;

select column_name, privilege_type
from information_schema.column_privileges
where table_schema = 'public' and table_name = 'placement_starts'
  and grantee = 'authenticated'
order by column_name;

-- The trigger is on, and before insert, so it can stamp.

select tgname, pg_get_triggerdef(oid) as definition
from pg_trigger
where tgrelid = 'public.placement_starts'::regclass
  and not tgisinternal;

-- What is waiting on a client to say when. Anything matched with no row here
-- is a placement nobody has agreed a date for.

select c.name as business, p.status, p.started_on as proposed,
       s.starts_on as confirmed
from public.placements p
join public.clients c on c.id = p.client_id
left join public.placement_starts s on s.placement_id = p.id
order by c.name;
