-- 058 — telling both sides
--
-- Run after: 057
-- Safe to re-run: yes
-- Also needed: THE SECRET. See the note at the bottom before you paste this.
--
-- ==========================================================================
-- AN INTERVIEW NOBODY IS TOLD ABOUT IS AN INTERVIEW NOBODY ATTENDS
-- ==========================================================================
--
-- 057 gives a client and an assistant a way to settle a time between
-- themselves. Neither of them lives in this product: she opens /hub when she
-- files her hours, they open /seats when a week needs approving. A time
-- offered on a Tuesday and read the following Monday is not scheduling, it is
-- a slower kind of silence.
--
-- Four moments are worth an email, and each one goes to exactly one person —
-- the one who now has to do something:
--
--   offered     to her.     They have suggested times. Pick one.
--   picked      to them.    She has chosen. Confirm it.
--   confirmed   to both.    It is on. Here is when and where.
--   declined    to them.    None worked. Offer some others.
--
-- Confirmed is the only one that goes to two people, and it is posted twice
-- rather than sent once to a list — the two of them are told different things.
-- She is told a time on her own clock and where to join; they are told it is
-- agreed and that she has been informed.
--
-- Nothing goes to staff. This is the one exchange in the product they are not
-- part of, which was the decision behind 057, and mailing them every offered
-- time would quietly undo it. What staff get is the interview_state view.
--
-- ==========================================================================
-- WHY THE ROW ALONE IS NOT ENOUGH
-- ==========================================================================
--
-- 019 and 028 hang their notifications off a Supabase Database Webhook, which
-- carries the whole row and so needs nothing read back — which is why
-- api/notify.js does not hold the service role key, and must not.
--
-- An interview_slots row carries a placement_id and two timestamps. The two
-- email addresses are three joins away. So this is a trigger rather than a
-- dashboard webhook, and it does the joins here where the rights already
-- exist, exactly as 035 and 036 do for the same reason.

do $pre$
begin
  if to_regclass('public.interview_slots') is null then
    raise exception 'sql/057 has not been run on this database.';
  end if;
  if to_regclass('net.http_post') is null and
     not exists (select 1 from pg_proc where proname = 'http_post') then
    raise exception
      'pg_net is not enabled. Database → Extensions → pg_net, then run this again.';
  end if;
end
$pre$;

create or replace function public.notify_interview()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  info    record;
  moment  text;
  live    integer;
begin
  -- Which of the four this is. Ordered so that the most final wins: a single
  -- update that both picks and confirms is a confirmation, not a pick.
  if tg_op = 'INSERT' then
    -- Only the first time in a round. A client offering three times in ten
    -- seconds is one thing that happened, and three emails about it teaches
    -- her to stop opening them.
    select count(*) into live
    from public.interview_slots s
    where s.placement_id = new.placement_id and s.declined_at is null;

    if live > 1 then
      return new;
    end if;
    moment := 'offered';

  elsif new.confirmed_at is not null and old.confirmed_at is null then
    moment := 'confirmed';
  elsif new.declined_at is not null and old.declined_at is null then
    moment := 'declined';
  elsif new.chosen_at is not null and old.chosen_at is null then
    moment := 'picked';
  else
    -- Clearing a pick, tidying a losing slot, writing a link onto a row that
    -- was already confirmed. Real changes, and none of them news.
    return new;
  end if;

  -- The contact name and address are on client_private, not on clients. 039
  -- moved them there precisely so that a policy handing an assistant the
  -- client row does not hand her the client's email — and this function is
  -- security definer, which is what lets it read across that line without
  -- widening it for anybody else.
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

  -- The assistant's side.
  if moment in ('offered', 'confirmed') and coalesce(info.assistant_email, '') <> '' then
    perform public.post_interview_note(
      moment, 'assistant', info.assistant_name, info.assistant_email,
      coalesce(info.client_name, 'a client'), new);
  end if;

  -- The client's side.
  if moment in ('picked', 'declined', 'confirmed') and coalesce(info.client_email, '') <> '' then
    perform public.post_interview_note(
      moment, 'client', coalesce(info.client_contact, info.client_name),
      info.client_email, coalesce(info.assistant_name, 'your assistant'), new);
  end if;

  return new;
end;
$fn$;

-- The posting half, on its own, because the function above decides WHO is told
-- and this one only knows HOW. Confirmed calls it twice with two different
-- people, and neither call should have to know that.
create or replace function public.post_interview_note(
  moment text, side text, who text, addr text, other text, slot public.interview_slots
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  payload jsonb;
begin
  payload := jsonb_build_object(
    'type',  'STATUS',
    'event', moment,
    'table', 'interview_slots',
    'person', jsonb_build_object('name', who, 'email', addr),
    'record', jsonb_build_object(
      'id',          slot.id,
      'side',        side,
      'other',       other,
      -- Sent as the instant it is. The page renders it in whoever is reading
      -- it; the email cannot know their zone, so it names Central and says so.
      'starts_at',   slot.starts_at,
      'minutes',     slot.minutes,
      'meeting_url', slot.meeting_url)
  );

  begin
    perform net.http_post(
      url     := 'https://www.securejobva.com/api/notify',
      body    := payload,
      headers := jsonb_build_object(
        'Content-Type',     'application/json',
        'x-webhook-secret', '__WEBHOOK_SECRET__'),
      timeout_milliseconds := 10000
    );
  exception when others then
    -- A warning, never an exception. An email that does not go must not undo
    -- an interview that two people just agreed.
    raise warning 'notify_interview could not post for %: %', slot.id, sqlerrm;
  end;
end;
$fn$;

revoke all on function public.notify_interview() from public, anon, authenticated;
revoke all on function public.post_interview_note(text, text, text, text, text, public.interview_slots)
  from public, anon, authenticated;

drop trigger if exists "notify-interview" on public.interview_slots;
create trigger "notify-interview"
  after insert or update on public.interview_slots
  for each row execute function public.notify_interview();

-- ==========================================================================
-- THE SECRET
-- ==========================================================================
--
-- __WEBHOOK_SECRET__ above is a placeholder and this file will post nothing
-- until it is replaced. Do NOT commit the real one: copy this file, paste the
-- secret into the copy, run the copy, and throw it away.
--
--   cp sql/058-telling-both-sides.sql sql/058-PASTE-THIS.local.sql
--   # replace __WEBHOOK_SECRET__ with the value of WEBHOOK_SECRET on Vercel
--
-- .gitignore already keeps *.local.sql out of the repo — the same arrangement
-- 019, 028, 031, 035, 036 and 037 use, and for the same reason.

-- ==========================================================================
-- Check it worked
-- ==========================================================================

-- The placeholder is still in place, which means nothing will be sent. This
-- returning a row is the reminder, not a failure — unless you meant to paste
-- the real secret, in which case it is exactly the failure you want to see.
select 'the placeholder is still here — nothing will be emailed' as warning
where exists (
  select 1 from pg_proc
  where proname = 'post_interview_note'
    and prosrc like '%__WEBHOOK_SECRET__%'
);

-- Neither function is callable by anybody signed in. Empty is the pass.
select p.proname, r.rolname
from pg_proc p
cross join lateral (values ('anon'), ('authenticated')) as r(rolname)
where p.proname in ('notify_interview', 'post_interview_note')
  and has_function_privilege(r.rolname, p.oid, 'EXECUTE');

insert into public.schema_migrations (n) values (58) on conflict (n) do nothing;
