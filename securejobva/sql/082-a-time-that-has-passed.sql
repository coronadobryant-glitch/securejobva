-- 082 — a time that has passed
--
-- Run after: 081
-- Safe to re-run: yes
-- Also needed: nothing in the dashboard.
--
-- ==========================================================================
-- MONDAY, PICKED ON WEDNESDAY
-- ==========================================================================
--
-- The offer functions refuse a time in the past (057's offer_interview, and
-- 062's for applicants). Nothing refuses PICKING one. /status and /hub draw a
-- Choose button for every unconfirmed slot whatever its starts_at, and both
-- choose functions — 057's choose_interview and 062's
-- choose_application_interview — check ownership, confirmation and the
-- previous pick, and never the clock.
--
-- So times offered for Monday and opened on Wednesday can still be chosen. The
-- pick is stored, the card says "picked, we will confirm", and nobody is told
-- to offer new times — she waits on an interview slot that is already over,
-- and the other side sees a pick they cannot sensibly confirm.
--
-- ==========================================================================
-- ON THE TABLE, NOT IN THE TWO FUNCTIONS
-- ==========================================================================
--
-- Both functions end the same way: clear any earlier pick, then set chosen_at
-- on this slot. Checking the slot as that last write lands covers both of
-- them, and anything written later that sets chosen_at, without a new body for
-- either function. A raise there unwinds the whole call, so the earlier pick
-- she had is put back rather than lost.
--
-- Not exempt by role: a definer function is exactly who does this write, and
-- a time that has passed has passed for the SQL editor too.
--
-- Only the move from not-picked to picked. A slot picked on Sunday for Monday
-- does not become an error on Tuesday — that is a pick somebody still has to
-- confirm or clear, and 062/057 already give them the controls to do it.
-- Confirming a time after it has happened is left alone deliberately: staff
-- sometimes confirm after the fact to put the date on the record.

create or replace function public.pick_is_in_the_future()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $fn$
begin
  if new.chosen_at is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.chosen_at is not null then
    return new;
  end if;

  if new.starts_at <= now() then
    raise exception 'that time has already passed'
      using hint = 'sjva-time-passed';
  end if;

  return new;
end;
$fn$;

revoke all on function public.pick_is_in_the_future() from public, anon, authenticated;

drop trigger if exists interview_slots_pick_is_ahead on public.interview_slots;
create trigger interview_slots_pick_is_ahead
  before insert or update on public.interview_slots
  for each row execute function public.pick_is_in_the_future();

-- ==========================================================================
-- Check it worked
-- ==========================================================================

select tgname, tgenabled
from pg_trigger
where tgname = 'interview_slots_pick_is_ahead';

-- Picks already sitting on a time that has gone by, unconfirmed. Each one is
-- somebody waiting on nothing: offer new times, or clear the pick.
select s.id, s.placement_id, s.application_id, s.starts_at, s.chosen_at
from public.interview_slots s
where s.chosen_at is not null
  and s.confirmed_at is null
  and s.starts_at <= now()
order by s.starts_at;

insert into public.schema_migrations (n) values (82) on conflict (n) do nothing;
