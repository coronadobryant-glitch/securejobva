-- 057 — three times and a handshake
--
-- Run after: 056
-- Safe to re-run: yes
-- Also needed: one Database Webhook, described at the bottom.
--
-- ==========================================================================
-- THE ONE THING TWO PEOPLE ARRANGE BETWEEN THEMSELVES
-- ==========================================================================
--
-- A placement is 'matched' when we have picked somebody and nobody has met
-- yet. What happens next has, until now, happened in email: somebody at
-- SecureJobVA in the middle of every exchange, relaying times between a
-- business in Houston and an assistant in Manila.
--
-- The shape is small and the failure is always the same one. Three times get
-- offered and then a week goes by. Nothing anywhere records that a week has
-- gone by, or which of the two people it is waiting on.
--
--   The client offers times.        Two or three that suit them.
--   The assistant picks one.        In her own clock, seeing theirs too.
--   The client confirms it.         And says where they will meet.
--
-- Nobody approves it. This is the first thing in the product a client and an
-- assistant settle without us, and adding an approval step would put a third
-- person into a two-person decision and a day into every match. What staff get
-- instead is a list of every interview being arranged and how long it has been
-- waiting, which is the thing that actually goes wrong.
--
-- ==========================================================================
-- A ROW PER OFFERED TIME, AND THE STATE IS DERIVED
-- ==========================================================================
--
-- There is no status column. The state of an interview is read off the rows —
-- offered, chosen, confirmed, declined — because a status column beside them
-- is a second place to say the same thing and therefore a place to disagree
-- with it. 038 is in this repo because two constraints once described the same
-- status differently.
--
--   every slot null          they have offered times, she has not picked
--   one with chosen_at       she has picked, waiting on them
--   that one confirmed_at    it is on
--   all with declined_at     none of them worked; offer more
--
-- starts_at is timestamptz and that is the whole point of this file. Almost
-- every date in this schema is a date — a timesheet week, a start day — and
-- 056 exists partly to say so. This one is genuinely an instant: 9:00 AM in
-- Houston and 10:00 PM in Manila are the same moment, and both people have to
-- be able to see it as their own.

do $pre$
begin
  if to_regclass('public.placements') is null then
    raise exception
      'sql/032 has not been run on this database. It creates placements, which an interview hangs off.';
  end if;
end
$pre$;

create table if not exists public.interview_slots (
  id           uuid primary key default gen_random_uuid(),
  placement_id uuid not null references public.placements (id) on delete cascade,
  starts_at    timestamptz not null,
  minutes      integer not null default 30,
  -- Stamped from the token by the function that writes the row, never sent by
  -- a page. Same rule as 050 and 055.
  offered_by   text,
  created_at   timestamptz not null default now(),

  chosen_at    timestamptz,
  confirmed_at timestamptz,
  declined_at  timestamptz,

  meeting_url  text,

  constraint interview_minutes_sane
    check (minutes between 5 and 240),
  constraint interview_url_sane
    check (coalesce(length(meeting_url), 0) <= 500),
  -- Confirming something nobody picked is not a state this flow has. Held
  -- here rather than trusted to the function, because the function is one
  -- refactor away from being wrong and this is not.
  constraint interview_confirm_needs_a_choice
    check (confirmed_at is null or chosen_at is not null)
);

create index if not exists interview_slots_place_idx
  on public.interview_slots (placement_id, starts_at);

-- One live pick per placement, and one confirmed interview per placement. The
-- same shape as placements_one_live_idx, and for the same reason: this is a
-- rule everybody would otherwise have to remember, and the day somebody
-- double-clicks Choose is the day they stop remembering it.
create unique index if not exists interview_one_choice_idx
  on public.interview_slots (placement_id)
  where chosen_at is not null and declined_at is null;

create unique index if not exists interview_one_confirmed_idx
  on public.interview_slots (placement_id)
  where confirmed_at is not null;

-- ==========================================================================
-- FIVE FUNCTIONS, AND NO WRITE GRANT AT ALL
-- ==========================================================================
--
-- The table takes SELECT and nothing else. Every change goes through one of
-- the functions below, and each one asks who is calling before it does
-- anything.
--
-- This is not the usual policy-plus-column-grant arrangement, and the reason
-- is that a column grant is given to `authenticated` as a whole rather than to
-- a person. Both people can read this row and each may write different parts
-- of it: she picks, they confirm. A grant on chosen_at is a grant to everybody
-- signed in, and the policy behind it only says WHICH ROWS — so a client could
-- write a pick onto their own placement and the page would report that the
-- assistant had chosen a time she had never seen.
--
-- Two actors, one row, different columns. A function is the only place that
-- distinction can actually be enforced.

-- ── the client offers a time ──────────────────────────────────────────────

create or replace function public.offer_interview(
  placement uuid, at_time timestamptz, mins integer default 30
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'sign in first';
  end if;

  if not public.is_placement_client(placement) then
    raise exception 'that is not your placement';
  end if;

  -- Offering a fourth time after the interview is settled is somebody looking
  -- at a stale page, and the honest answer is to say so rather than to add a
  -- slot nobody will ever see.
  if exists (select 1 from public.interview_slots s
             where s.placement_id = placement and s.confirmed_at is not null) then
    raise exception 'that interview is already confirmed';
  end if;

  if at_time < now() then
    raise exception 'that time has already passed';
  end if;

  if at_time > now() + interval '120 days' then
    raise exception 'that is more than four months away';
  end if;

  insert into public.interview_slots (placement_id, starts_at, minutes, offered_by)
  values (placement, at_time, coalesce(mins, 30),
          coalesce(auth.jwt() ->> 'email', 'somebody'))
  returning id into new_id;

  return new_id;
end;
$fn$;

-- ── the client takes one back ─────────────────────────────────────────────

create or replace function public.withdraw_interview_slot(slot uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  pl uuid;
  picked timestamptz;
  done timestamptz;
begin
  if auth.uid() is null then
    raise exception 'sign in first';
  end if;

  select s.placement_id, s.chosen_at, s.confirmed_at
    into pl, picked, done
  from public.interview_slots s where s.id = slot;

  if pl is null then
    raise exception 'no such time';
  end if;

  if not public.is_placement_client(pl) then
    raise exception 'that is not your placement';
  end if;

  if done is not null then
    raise exception 'that interview is confirmed — change the time instead';
  end if;

  -- Withdrawing the very time she just picked is allowed and is worth allowing:
  -- something came up. The row goes, she is back to the remaining times, and
  -- the page says so rather than showing her a pick that no longer exists.
  delete from public.interview_slots where id = slot;
end;
$fn$;

-- ── the assistant picks one ───────────────────────────────────────────────

create or replace function public.choose_interview(slot uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  pl uuid;
  starts timestamptz;
  already timestamptz;
begin
  if auth.uid() is null then
    raise exception 'sign in first';
  end if;

  select s.placement_id, s.starts_at, s.chosen_at
    into pl, starts, already
  from public.interview_slots s where s.id = slot;

  if pl is null then
    raise exception 'no such time';
  end if;

  if not public.is_placement_assistant(pl) then
    raise exception 'that interview is not yours';
  end if;

  if exists (select 1 from public.interview_slots s
             where s.placement_id = pl and s.confirmed_at is not null) then
    raise exception 'that interview is already confirmed';
  end if;

  -- Choosing the same one twice is choosing it once. Returning the original
  -- moment rather than a new one keeps the record of when she actually said
  -- yes — the same reasoning as close_part in 054.
  if already is not null then
    return already;
  end if;

  -- Changing her mind clears the previous pick rather than colliding with the
  -- unique index. She is allowed to change it right up until they confirm.
  update public.interview_slots
     set chosen_at = null
   where placement_id = pl and chosen_at is not null and confirmed_at is null;

  -- A round she has already declined is reopened by picking from it, which is
  -- what "actually, that Wednesday works after all" looks like.
  update public.interview_slots
     set declined_at = null
   where placement_id = pl and declined_at is not null;

  update public.interview_slots
     set chosen_at = now()
   where id = slot;

  return now();
end;
$fn$;

-- ── the assistant says none of them work ──────────────────────────────────

create or replace function public.decline_interviews(placement uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  n integer;
begin
  if auth.uid() is null then
    raise exception 'sign in first';
  end if;

  if not public.is_placement_assistant(placement) then
    raise exception 'that interview is not yours';
  end if;

  if exists (select 1 from public.interview_slots s
             where s.placement_id = placement and s.confirmed_at is not null) then
    raise exception 'that interview is already confirmed';
  end if;

  -- Marked rather than deleted. "She has seen these three and none of them
  -- work" and "nobody has offered anything yet" are different things, and the
  -- client's page has to be able to tell them apart — otherwise silence looks
  -- identical to a refusal and they wait instead of offering more.
  update public.interview_slots
     set declined_at = now(), chosen_at = null
   where placement_id = placement and declined_at is null;

  get diagnostics n = row_count;
  return n;
end;
$fn$;

-- ── the client confirms it ────────────────────────────────────────────────

create or replace function public.confirm_interview(slot uuid, url text default null)
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  pl uuid;
  picked timestamptz;
  already timestamptz;
  link text;
begin
  if auth.uid() is null then
    raise exception 'sign in first';
  end if;

  select s.placement_id, s.chosen_at, s.confirmed_at
    into pl, picked, already
  from public.interview_slots s where s.id = slot;

  if pl is null then
    raise exception 'no such time';
  end if;

  if not public.is_placement_client(pl) then
    raise exception 'that is not your placement';
  end if;

  if picked is null then
    raise exception 'she has not picked that time';
  end if;

  link := nullif(btrim(coalesce(url, '')), '');

  -- Only http and https. This string is put in front of an assistant as
  -- something to click, and it is typed by somebody else — a javascript: URL
  -- here would be a link one person can aim at another person's session.
  if link is not null and link !~* '^https?://' then
    raise exception 'a meeting link should start with https://';
  end if;

  -- Confirming twice is confirming once, and the second press must not move
  -- the moment it was agreed.
  if already is not null then
    if link is not null then
      update public.interview_slots set meeting_url = link where id = slot;
    end if;
    return already;
  end if;

  update public.interview_slots
     set confirmed_at = now(), meeting_url = link
   where id = slot;

  -- The times that were not taken go, now that one is settled. They are not
  -- history worth keeping: nobody asks which Tuesday was also offered, and
  -- leaving them means the confirmed card has to explain why three greyed-out
  -- rows are sitting under it for ever.
  delete from public.interview_slots
   where placement_id = pl and id <> slot;

  return now();
end;
$fn$;

-- ==========================================================================
-- WHO MAY SEE IT
-- ==========================================================================

alter table public.interview_slots enable row level security;

revoke all on public.interview_slots from anon;
grant select on public.interview_slots to authenticated;

-- No insert, no update, no delete, to anybody. Every change is one of the five
-- functions above, and each one asks who is calling.

drop policy if exists "both sides read their interview" on public.interview_slots;
create policy "both sides read their interview"
  on public.interview_slots for select to authenticated
  using (
    public.is_placement_client(placement_id)
    or public.is_placement_assistant(placement_id)
    or public.has_permission('applications.view_all')
  );

revoke all on function public.offer_interview(uuid, timestamptz, integer) from public, anon;
revoke all on function public.withdraw_interview_slot(uuid)               from public, anon;
revoke all on function public.choose_interview(uuid)                      from public, anon;
revoke all on function public.decline_interviews(uuid)                    from public, anon;
revoke all on function public.confirm_interview(uuid, text)               from public, anon;

grant execute on function public.offer_interview(uuid, timestamptz, integer) to authenticated;
grant execute on function public.withdraw_interview_slot(uuid)               to authenticated;
grant execute on function public.choose_interview(uuid)                      to authenticated;
grant execute on function public.decline_interviews(uuid)                    to authenticated;
grant execute on function public.confirm_interview(uuid, text)               to authenticated;

-- ==========================================================================
-- WHAT STAFF SEE
-- ==========================================================================
--
-- One row per placement being arranged, and the only column anybody reads
-- first is the last one: who is it waiting on, and for how long.
--
-- security_invoker, so the policy above still applies rather than being
-- bypassed by the view's owner. A client opening this sees their own
-- interview; staff see all of them, because has_permission is in the policy.

drop view if exists public.interview_state;
create view public.interview_state
with (security_invoker = true) as
select
  p.id                                                as placement_id,
  p.client_id,
  p.application_id,
  count(s.id)                                         as offered,
  min(s.starts_at) filter (where s.declined_at is null) as earliest,
  max(s.created_at)                                   as last_offered,
  max(s.chosen_at)                                    as chosen_at,
  max(s.confirmed_at)                                 as confirmed_at,
  max(s.declined_at)                                  as declined_at,
  case
    when max(s.confirmed_at) is not null then 'confirmed'
    when max(s.chosen_at)    is not null then 'waiting_on_client'
    when max(s.declined_at)  is not null then 'declined'
    when count(s.id) > 0                 then 'waiting_on_assistant'
    else 'not_started'
  end                                                 as state,
  -- How long it has been sitting where it is. The number that turns a list of
  -- interviews into a list of things to chase.
  extract(day from now() - coalesce(max(s.chosen_at), max(s.created_at), p.created_at))::integer
                                                      as days_waiting
from public.placements p
left join public.interview_slots s on s.placement_id = p.id
where p.status = 'matched'
group by p.id, p.client_id, p.application_id, p.created_at;

grant select on public.interview_state to authenticated;

-- ==========================================================================
-- Telling both sides
-- ==========================================================================
--
-- sql/058 does that, and it is a separate file because it needs the webhook
-- secret pasted into it and this one does not. Run it next.
--
-- It is a trigger rather than a Database Webhook from the dashboard, unlike
-- 019 and 028. Those carry the whole row and so need nothing read back, which
-- is exactly why api/notify.js does not hold the service role key. A row in
-- this table carries a placement_id and two timestamps; the two email
-- addresses are three joins away, so the joins happen in the database where
-- the rights already are — the same arrangement 035 and 036 use.

-- ==========================================================================
-- Check it worked
-- ==========================================================================

-- The one rule. Empty is the pass.
select privilege_type
from information_schema.role_table_grants
where table_name = 'interview_slots' and grantee = 'anon';

-- Nobody writes this table directly. Anything but SELECT here is a way around
-- the five functions, and therefore a way for a client to record a pick the
-- assistant never made. Empty is the pass.
select grantee, privilege_type
from information_schema.role_table_grants
where table_name = 'interview_slots'
  and grantee in ('anon', 'authenticated')
  and privilege_type <> 'SELECT';

-- Every interview being arranged, worst first. This is the admin list.
select state, days_waiting, offered, earliest
from public.interview_state
order by
  case state
    when 'waiting_on_client' then 1
    when 'waiting_on_assistant' then 2
    when 'declined' then 3
    when 'not_started' then 4
    else 5
  end,
  days_waiting desc;

insert into public.schema_migrations (n) values (57) on conflict (n) do nothing;
