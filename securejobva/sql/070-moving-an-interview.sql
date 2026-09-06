-- 070 — moving an interview

-- Run after: 069 (the function this replaces), 062, 068
-- Safe to re-run: yes
-- Also needed: nothing in the dashboard.
--
-- ==========================================================================
-- CANCELLING IS NOT THE SAME AS MOVING
-- ==========================================================================
--
-- 068 gave a confirmed interview a way out, and the way out is a cancellation:
-- the slot goes, she is told it is off, and she waits to be offered a fresh
-- set to choose from. That is right when the new time is genuinely open.
--
-- It is the wrong shape for the ordinary case. Usually the conversation ends
-- with a time already agreed — "Wednesday is no good, can we do Thursday at
-- eleven" — and at that point offering her three options and waiting for her
-- to pick one of them is asking a question that has already been answered.
-- It also puts her interview back into an undecided state for however long
-- she takes to reply, which for somebody who has already committed to a time
-- reads as us having changed our minds about her.
--
-- So: move it. One decision, made here, and she is told what it now is.
--
-- ==========================================================================
-- WHICH ONE TO REACH FOR
-- ==========================================================================
--
--   move    you know the new time. She is told the new time. The interview
--           never stops existing, and the joining link is kept, because it is
--           nearly always the same room.
--
--   cancel  you do not know the new time, or there is not going to be one.
--           She is told it is off, and a fresh set of times can be offered.
--
-- The difference matters to her more than it does to us. A move says "still
-- happening, new time". A cancellation says "not happening" and leaves her
-- waiting on us to say something else.
--
-- ==========================================================================
-- THE MOMENT
-- ==========================================================================
--
-- notify_interview grows a fifth moment. It is detected the same way 'link'
-- is — a field changing on a row that is already confirmed — and it is placed
-- BEFORE 'link' deliberately: a move that also replaces the room is one piece
-- of news, and the 'moved' mail carries the link, so telling her twice about
-- one change would be the thing 058 already refuses to do.
--
-- 'moved' is not added to either placement list. No function moves a
-- placement slot, so a branch for it would be a claim about behaviour that
-- does not exist. If one is ever written, it is added there and here.

do $pre$
begin
  if to_regclass('public.interview_slots') is null then
    raise exception
      'sql/057 has not been run on this database. It creates interview_slots.';
  end if;
end
$pre$;

-- ==========================================================================
-- 1. MOVING IT
-- ==========================================================================

create or replace function public.reschedule_application_interview(
  slot uuid, at_time timestamptz, why text default null
)
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  row_ public.interview_slots;
  who  text;
begin
  if auth.uid() is null then
    raise exception 'sign in first';
  end if;

  if not public.has_permission('applications.edit') then
    raise exception 'not yours to move';
  end if;

  select * into row_ from public.interview_slots s where s.id = slot;

  if row_.id is null then
    raise exception 'no such time';
  end if;

  if row_.application_id is null then
    raise exception 'that is a placement interview, not an applicant one';
  end if;

  -- Moving an unconfirmed time is not moving anything: she has not been told
  -- it is happening, so withdraw it and offer another instead. Saying so is
  -- better than silently editing a time she may be about to choose.
  if row_.confirmed_at is null then
    raise exception 'that one is not confirmed — withdraw it and offer another';
  end if;

  -- The same two sanity checks 062 puts on offering, for the same reasons.
  if at_time < now() then
    raise exception 'that time has already passed';
  end if;

  if at_time > now() + interval '120 days' then
    raise exception 'that is more than four months away';
  end if;

  if at_time = row_.starts_at then
    raise exception 'that is the time it is already at';
  end if;

  if coalesce(length(why), 0) > 500 then
    raise exception 'that reason is too long';
  end if;

  who := coalesce(auth.jwt() ->> 'email', 'somebody');

  -- The note first, because it wants both times and the row is about to hold
  -- only one of them.
  insert into public.application_note_log (application_id, note, author)
  values (
    row_.application_id,
    'Interview moved — was ' ||
      to_char(row_.starts_at at time zone 'America/Chicago',
              'Dy DD Mon HH12:MI AM') || ', now ' ||
      to_char(at_time at time zone 'America/Chicago',
              'Dy DD Mon HH12:MI AM') || ' Central.' ||
      case when coalesce(why, '') <> '' then ' Reason: ' || why else '' end,
    who);

  -- One update, so the trigger sees one change and posts one message. The
  -- joining link is deliberately untouched: the room is nearly always the
  -- same one, and 067's Replace box is there for when it is not.
  update public.interview_slots
     set starts_at = at_time
   where id = slot;

  update public.application_tracking
     set interview_at = at_time
   where application_id = row_.application_id;

  return at_time;
end;
$fn$;

revoke all on function public.reschedule_application_interview(uuid, timestamptz, text)
  from public, anon;
grant execute on function public.reschedule_application_interview(uuid, timestamptz, text)
  to authenticated;

-- ==========================================================================
-- 2. AND TELLING HER
-- ==========================================================================
--
-- 069's version with one moment added. Everything else is carried across
-- unchanged, including the one-email-per-set rule and the placement half.

create or replace function public.notify_interview()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  moment text;
  info   record;
  others integer;
begin
  if tg_op = 'INSERT' then
    moment := 'offered';
  elsif new.confirmed_at is not null and old.confirmed_at is null then
    moment := 'confirmed';
  elsif new.declined_at is not null and old.declined_at is null then
    moment := 'declined';
  elsif new.chosen_at is not null and old.chosen_at is null then
    moment := 'picked';
  elsif new.confirmed_at is not null
        and new.starts_at is distinct from old.starts_at then
    -- The time moved on an interview she has already been told is happening.
    -- Ahead of 'link' on purpose: a move that also changes the room is one
    -- piece of news, and this mail carries the link.
    moment := 'moved';
  elsif new.confirmed_at is not null
        and new.meeting_url is distinct from old.meeting_url
        and coalesce(new.meeting_url, '') <> '' then
    moment := 'link';
  else
    return new;
  end if;

  -- ── her own interview, with us ─────────────────────────────────────────
  if new.application_id is not null then
    select a.name, a.email
      into info
      from public.applications a
     where a.id = new.application_id;

    -- 069's rule: the offer mail belongs to the set, not to the row.
    if moment = 'offered' then
      select count(*) into others
        from public.interview_slots s
       where s.application_id = new.application_id
         and s.id <> new.id
         and s.declined_at is null
         and s.confirmed_at is null;

      if others > 0 then
        return new;
      end if;
    end if;

    if moment in ('offered', 'confirmed', 'link', 'moved')
       and coalesce(info.email, '') <> '' then
      perform public.post_interview_note(
        moment, 'applicant', info.name, info.email, 'SecureJobVA', new);
    end if;

    return new;
  end if;

  -- ── a placement interview, between a client and an assistant ───────────
  --
  -- Carried across unchanged. 'moved' is absent from both lists below because
  -- nothing moves a placement slot; adding it would be a claim about a path
  -- that does not exist.
  select a.name  as assistant_name,
         a.email as assistant_email,
         c.name  as client_name,
         cp.contact_name  as client_contact,
         cp.contact_email as client_email
    into info
    from public.placements p
    join public.applications a on a.id = p.application_id
    left join public.clients c on c.id = p.client_id
    left join public.client_private cp on cp.client_id = c.id
   where p.id = new.placement_id;

  if moment in ('offered', 'confirmed') and coalesce(info.assistant_email, '') <> '' then
    perform public.post_interview_note(
      moment, 'assistant', info.assistant_name, info.assistant_email,
      coalesce(info.client_name, 'a client'), new);
  end if;

  if moment in ('picked', 'declined', 'confirmed') and coalesce(info.client_email, '') <> '' then
    perform public.post_interview_note(
      moment, 'client', coalesce(info.client_contact, info.client_name),
      info.client_email, coalesce(info.assistant_name, 'your assistant'), new);
  end if;

  return new;
end;
$fn$;

revoke all on function public.notify_interview() from public, anon, authenticated;

drop trigger if exists "notify-interview" on public.interview_slots;
create trigger "notify-interview"
  after insert or update on public.interview_slots
  for each row execute function public.notify_interview();

-- post_interview_note is untouched, so this file carries no webhook secret and
-- can be run exactly as committed. Same as 066, 067 and 069.

-- ==========================================================================
-- Check it worked
-- ==========================================================================

select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in ('reschedule_application_interview', 'notify_interview')
order by routine_name;

-- Confirmed applicant interviews, which are the rows this can move.
select a.name, s.starts_at, coalesce(s.meeting_url, '— no link —') as joining
from public.interview_slots s
join public.applications a on a.id = s.application_id
where s.confirmed_at is not null
order by s.starts_at;

insert into public.schema_migrations (n) values (70) on conflict (n) do nothing;
