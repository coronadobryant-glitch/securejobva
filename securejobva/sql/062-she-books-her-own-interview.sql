-- 062 — she books her own interview
--
-- Run after: 061
-- Safe to re-run: yes
-- Also needed: nothing in the dashboard.
--
-- ==========================================================================
-- AN EMAIL THAT ASKS HER TO WAIT
-- ==========================================================================
--
-- Moving somebody to Interview emails her "we will be in touch to arrange
-- it", and then nothing arranges it. There is one interview_at column, a
-- person types a date into it, and between those two moments the arrangement
-- happens in an inbox somewhere, by hand, one applicant at a time. That is
-- fine for a handful and it is the first thing to break at volume.
--
-- 057 already solved this problem once, for the other side of the business:
-- a client offers a placed assistant two or three times, she picks one, the
-- client confirms, or she says none of them work. The table it built holds
-- starts_at, minutes, offered_by, chosen_at, confirmed_at, declined_at and
-- meeting_url — every column an applicant interview needs. The only thing
-- about it that is specific to placements is which row it points at.
--
-- So this widens the table rather than building a second one.
--
-- ==========================================================================
-- WHY NEW FUNCTIONS RATHER THAN BRANCHING THE OLD ONES
-- ==========================================================================
--
-- The shape is the same and the permissions are not, which is the whole
-- reason these are five new functions instead of five `if placement_id is
-- null` branches inside the live ones.
--
--   a placement    the CLIENT offers, the ASSISTANT picks, the CLIENT confirms
--   an application WE offer,          the APPLICANT picks, WE confirm
--
-- Every authorization check differs, and three of the five old functions take
-- a slot id rather than a parent, so branching would mean each one loading the
-- row, working out which kind it is, and then asking a different question.
-- That is a lot of new ways to get the answer wrong inside code that is
-- currently running for real placements. These leave that code untouched.
--
-- ==========================================================================
-- 1. ONE TABLE, TWO KINDS OF ROW
-- ==========================================================================

alter table public.interview_slots
  alter column placement_id drop not null;

alter table public.interview_slots
  add column if not exists application_id uuid
    references public.applications (id) on delete cascade;

-- Exactly one, never both and never neither. Without this the table would
-- happily hold a row belonging to nothing, which every read would then have to
-- remember to exclude.
alter table public.interview_slots
  drop constraint if exists interview_slot_belongs_to_one;
alter table public.interview_slots
  add constraint interview_slot_belongs_to_one
  check (num_nonnulls(placement_id, application_id) = 1);

create index if not exists interview_slots_app_idx
  on public.interview_slots (application_id)
  where application_id is not null;

-- ==========================================================================
-- 2. WE OFFER THE TIMES
-- ==========================================================================

create or replace function public.offer_application_interview(
  app uuid, at_time timestamptz, mins integer default 30
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

  if not public.has_permission('applications.edit') then
    raise exception 'not yours to offer';
  end if;

  if not exists (select 1 from public.applications a where a.id = app) then
    raise exception 'no such application';
  end if;

  -- Offering a fourth time after it is settled is somebody looking at a stale
  -- page, and the honest answer is to say so rather than to add a slot nobody
  -- will ever see. Same rule as 057.
  if exists (select 1 from public.interview_slots s
             where s.application_id = app and s.confirmed_at is not null) then
    raise exception 'that interview is already confirmed';
  end if;

  if at_time < now() then
    raise exception 'that time has already passed';
  end if;

  if at_time > now() + interval '120 days' then
    raise exception 'that is more than four months away';
  end if;

  insert into public.interview_slots (application_id, starts_at, minutes, offered_by)
  values (app, at_time, coalesce(mins, 30),
          coalesce(auth.jwt() ->> 'email', 'somebody'))
  returning id into new_id;

  return new_id;
end;
$fn$;

-- ── and take one back ─────────────────────────────────────────────────────

create or replace function public.withdraw_application_slot(slot uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  app uuid;
  conf timestamptz;
begin
  if not public.has_permission('applications.edit') then
    raise exception 'not yours to withdraw';
  end if;

  select s.application_id, s.confirmed_at into app, conf
  from public.interview_slots s where s.id = slot;

  if app is null then
    raise exception 'no such time';
  end if;

  -- Pulling the time somebody has already been told is confirmed is not a
  -- withdrawal, it is a cancellation, and it needs to be a conversation.
  if conf is not null then
    raise exception 'that one is confirmed — cancel it with her, not from here';
  end if;

  delete from public.interview_slots where id = slot;
end;
$fn$;

-- ==========================================================================
-- 3. SHE PICKS ONE
-- ==========================================================================

create or replace function public.choose_application_interview(slot uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  app uuid;
  already timestamptz;
begin
  if auth.uid() is null then
    raise exception 'sign in first';
  end if;

  select s.application_id, s.chosen_at into app, already
  from public.interview_slots s where s.id = slot;

  if app is null then
    raise exception 'no such time';
  end if;

  if not public.owns_application(app) then
    raise exception 'that interview is not yours';
  end if;

  if exists (select 1 from public.interview_slots s
             where s.application_id = app and s.confirmed_at is not null) then
    raise exception 'that interview is already confirmed';
  end if;

  -- Choosing the same one twice is choosing it once. Returning the original
  -- moment rather than a new one keeps the record of when she actually said
  -- yes — the same reasoning as close_part in 054.
  if already is not null then
    return already;
  end if;

  -- Changing her mind clears the previous pick. She may right up until we
  -- confirm.
  update public.interview_slots
     set chosen_at = null
   where application_id = app and chosen_at is not null and confirmed_at is null;

  -- A round she has already declined is reopened by picking from it, which is
  -- what "actually, that Wednesday works after all" looks like.
  update public.interview_slots
     set declined_at = null
   where application_id = app and declined_at is not null;

  update public.interview_slots set chosen_at = now() where id = slot;

  return now();
end;
$fn$;

-- ── or says none of them work ─────────────────────────────────────────────

create or replace function public.decline_application_interviews(app uuid)
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

  if not public.owns_application(app) then
    raise exception 'that interview is not yours';
  end if;

  if exists (select 1 from public.interview_slots s
             where s.application_id = app and s.confirmed_at is not null) then
    raise exception 'that interview is already confirmed';
  end if;

  -- The pick goes with it. Saying none of them work while one is still marked
  -- chosen leaves two answers on the record and no way to tell which was last.
  update public.interview_slots
     set declined_at = now(), chosen_at = null
   where application_id = app and confirmed_at is null;

  get diagnostics n = row_count;
  return n;
end;
$fn$;

-- ==========================================================================
-- 4. WE CONFIRM IT, AND THAT IS WHAT WRITES THE DATE
-- ==========================================================================
--
-- The single interview_at column stays exactly what it was, and confirming a
-- slot is one of the two things that writes it — a person typing a date in is
-- still the other. That is deliberate: the Interviews tab, its badge and all
-- four of its warnings read interview_at and nothing else, so they keep
-- working with no change at all, and a date set by hand behaves today the way
-- it did yesterday.

create or replace function public.confirm_application_interview(
  slot uuid, url text default null
)
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  app    uuid;
  starts timestamptz;
  picked timestamptz;
begin
  if not public.has_permission('applications.edit') then
    raise exception 'not yours to confirm';
  end if;

  select s.application_id, s.starts_at, s.chosen_at
    into app, starts, picked
  from public.interview_slots s where s.id = slot;

  if app is null then
    raise exception 'no such time';
  end if;

  -- Confirming something nobody picked is not a state this flow has. It is
  -- also the shape of a double booking: two people told a different time is
  -- confirmed because somebody confirmed the one they preferred.
  if picked is null then
    raise exception 'she has not picked that one';
  end if;

  if coalesce(length(url), 0) > 500 then
    raise exception 'that joining link is too long';
  end if;

  update public.interview_slots
     set confirmed_at = now(), meeting_url = url
   where id = slot;

  -- The other offers are spent. Leaving them open would put times in front of
  -- her that are no longer on the table.
  delete from public.interview_slots
   where application_id = app and id <> slot and confirmed_at is null;

  -- And the column everything else already reads.
  update public.application_tracking
     set interview_at = starts
   where application_id = app;

  if not found then
    insert into public.application_tracking (application_id, interview_at)
    values (app, starts)
    on conflict (application_id) do update set interview_at = excluded.interview_at;
  end if;

  return starts;
end;
$fn$;

-- ==========================================================================
-- 5. WHO MAY SEE AND DO WHAT
-- ==========================================================================
--
-- The read policy gains one clause. An applicant reads the times offered to
-- her, both sides of a placement keep reading theirs, and staff who can see
-- applications keep seeing everything.
--
-- Still no insert, update or delete to anybody. Every change is one of the ten
-- functions, and each one asks who is calling.

drop policy if exists "both sides read their interview" on public.interview_slots;
create policy "both sides read their interview"
  on public.interview_slots for select to authenticated
  using (
    public.is_placement_client(placement_id)
    or public.is_placement_assistant(placement_id)
    or public.owns_application(application_id)
    or public.has_permission('applications.view_all')
  );

revoke all on function public.offer_application_interview(uuid, timestamptz, integer) from public, anon;
revoke all on function public.withdraw_application_slot(uuid)                          from public, anon;
revoke all on function public.choose_application_interview(uuid)                       from public, anon;
revoke all on function public.decline_application_interviews(uuid)                     from public, anon;
revoke all on function public.confirm_application_interview(uuid, text)                from public, anon;

grant execute on function public.offer_application_interview(uuid, timestamptz, integer) to authenticated;
grant execute on function public.withdraw_application_slot(uuid)                          to authenticated;
grant execute on function public.choose_application_interview(uuid)                       to authenticated;
grant execute on function public.decline_application_interviews(uuid)                     to authenticated;
grant execute on function public.confirm_application_interview(uuid, text)                to authenticated;

-- ==========================================================================
-- CHECK IT WORKED
-- ==========================================================================
--
-- 1. The column, and the rule that a row belongs to exactly one thing.

select column_name, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'interview_slots'
  and column_name in ('placement_id', 'application_id')
order by column_name;
-- expect: application_id YES, placement_id YES

select conname
from pg_constraint
where conrelid = 'public.interview_slots'::regclass
  and conname = 'interview_slot_belongs_to_one';
-- expect: one row

-- 2. The five new functions.

select proname
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and proname like '%application_interview%' or proname = 'withdraw_application_slot'
order by proname;
-- expect: choose_application_interview, confirm_application_interview,
--         decline_application_interviews, offer_application_interview,
--         withdraw_application_slot

-- 3. Nothing already in the table was orphaned by the change.

select count(*) as slots_belonging_to_nothing
from public.interview_slots
where placement_id is null and application_id is null;
-- expect: 0, and the constraint above makes it impossible from here on

insert into public.schema_migrations (n) values (62) on conflict (n) do nothing;
