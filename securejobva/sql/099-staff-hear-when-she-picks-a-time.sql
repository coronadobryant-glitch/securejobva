-- 099 — staff hear when she picks a time
--
-- Run after: 098
-- Safe to re-run: yes
-- Also needed: api/notify.js taught DECIDE.interview_slots.arrived, and the
--   'moved' template taught the two placement sides, quoting record.reason
--   when 100 sends one (CONTRACT.md). Until it
--   is, the new posts answer 200 "skipped" and nothing is sent — nothing
--   breaks, the email simply does not exist yet.
--
-- ==========================================================================
-- WAITING ON US, AND WE DID NOT KNOW (F6, F35)
-- ==========================================================================
--
-- When an applicant picks one of the interview times we offered, the next move
-- is ours: somebody confirms it and she is told it is on. When she turns all
-- of them down, the next move is ours too: offer others. In both cases /status
-- tells her "Waiting on us" — and nobody here is told anything. 066 left both
-- moments unmailed on purpose, on the reasoning that /admin shows her pick as
-- a Confirm button in front of whoever acts on it, and mailing ourselves about
-- our own queue is how a queue stops being read.
--
-- That reasoning holds only for somebody who has /admin open. She waits for
-- however long it takes somebody to look, and a pick made on Friday evening is
-- confirmed on Monday. So both moments now email staff — to staff only:
--
--   picked     "<name> picked <time> — confirm it"
--   declined   "<name> could not make any of the times — offer others"
--
-- Her own side does not change. She is still not emailed about her own pick or
-- her own decline; the page already tells her, and api/notify keeps its second
-- lock that skips those (`picked`/`declined` with side 'applicant').
--
-- These go as event 'arrived' — the shape that reaches NOTIFY_TO — with
-- record.side 'applicant' and record.moment saying which:
--
--   { type: 'STATUS', table: 'interview_slots', event: 'arrived',
--     person: { name, email },              -- hers, so reply-to reaches her
--     record: { id, side: 'applicant', moment: 'picked' | 'declined',
--               application_id, other: 'SecureJobVA',
--               starts_at, minutes, meeting_url } }
--
-- ONE email for a decline, not one per time. decline_application_interviews
-- marks every offered time in one statement, and this trigger fires once per
-- row; only the first row of the set (earliest time) posts. A second round of
-- declines re-stamps the times from the first round as well, so a re-stamp
-- counts as a decline and the set is still found whole. The same rule now
-- applies to a placement decline, which until now sent the client one email
-- per time the assistant turned down.
--
-- ==========================================================================
-- A PLACEMENT INTERVIEW CAN MOVE (F18, with 100)
-- ==========================================================================
--
-- 070 left 'moved' off the placement side on purpose: no function moved a
-- placement slot, and a branch for one would describe a path that did not
-- exist. 100 adds that function, so 'moved' is added to both placement lists
-- here — the assistant and the client are each told the new time, exactly as
-- an applicant is when we move hers. 'cancelled' is posted by 100's cancel
-- function itself, while the row still exists, as 068/071 do for hers.
--
-- Everything else is 070's notify_interview, carried across unchanged.

do $pre$
begin
  if to_regclass('public.interview_slots') is null then
    raise exception 'sql/057 has not been run on this database.';
  end if;
  if to_regprocedure('public.notify_send(jsonb, text, text)') is null then
    raise exception 'sql/095 has not been run on this database.';
  end if;
end
$pre$;

-- ── the reason a placement interview moved, carried to both people ─────────
--
-- 100's reschedule_placement_interview and cancel_placement_interview each
-- take a reason, and /seats and /admin ask for one. 070's applicant version
-- writes its reason into her note log, but a placement has no note log, so the
-- only place the reason can go is the email itself — to the assistant and to
-- the client both, the way a swap's reply is quoted back to the client.
--
-- This is 058/096's post_interview_note with one more key, record.reason,
-- present only when there is one. A separate function rather than a new
-- post_interview_note, so 096 stays the one file that defines that sender.
--
-- A cancel passes its reason straight in. A move cannot: 'moved' is posted
-- from this trigger, which only sees the row. So 100 sets the reason for the
-- length of its own transaction (set_config(..., true)) just before its
-- update, clears it straight after, and the trigger reads it here.

create or replace function public.post_interview_note_with_reason(
  moment text, side text, who text, addr text, other text,
  slot public.interview_slots, why text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  record_ jsonb;
begin
  record_ := jsonb_build_object(
    'id',          slot.id,
    'side',        side,
    'other',       other,
    'starts_at',   slot.starts_at,
    'minutes',     slot.minutes,
    'meeting_url', slot.meeting_url);

  if coalesce(btrim(why), '') <> '' then
    record_ := record_ || jsonb_build_object('reason', btrim(why));
  end if;

  perform public.notify_send(
    jsonb_build_object(
      'type',   'STATUS',
      'event',  moment,
      'table',  'interview_slots',
      'person', jsonb_build_object('name', who, 'email', addr),
      'record', record_),
    'https://www.securejobva.com/api/notify',
    'post_interview_note_with_reason');
end;
$fn$;

revoke all on function public.post_interview_note_with_reason(text, text, text, text, text, public.interview_slots, text)
  from public, anon, authenticated;

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
  first_ uuid;
  why    text;
begin
  if tg_op = 'INSERT' then
    moment := 'offered';
  elsif new.confirmed_at is not null and old.confirmed_at is null then
    moment := 'confirmed';
  elsif new.declined_at is not null
        and new.declined_at is distinct from old.declined_at then
    -- A fresh stamp, not only a first one. decline_application_interviews
    -- (062) stamps every unconfirmed time she has, including times she
    -- turned down in an earlier round and which stayed on the record when
    -- new ones were offered (090). Those rows carry the new declined_at too,
    -- and the earliest of the set is usually one of them; if a re-stamped row
    -- were not a 'declined', the set's first row would never speak and a
    -- second "none of these work" would reach nobody. Placement declines
    -- stamp only rows not yet declined (057), so they are unchanged.
    moment := 'declined';
  elsif new.chosen_at is not null and old.chosen_at is null then
    moment := 'picked';
  elsif new.confirmed_at is not null
        and new.starts_at is distinct from old.starts_at then
    -- The time moved on an interview already confirmed. Ahead of 'link' on
    -- purpose: a move that also changes the room is one piece of news, and
    -- the 'moved' mail carries the link (070).
    moment := 'moved';
  elsif new.confirmed_at is not null
        and new.meeting_url is distinct from old.meeting_url
        and coalesce(new.meeting_url, '') <> '' then
    moment := 'link';
  else
    return new;
  end if;

  -- A decline marks every time in the set in one statement, and this fires
  -- once per row. Only the first of the set speaks. All the rows declined
  -- together carry the same declined_at, which is how the set is found.
  if moment = 'declined' then
    select s.id into first_
      from public.interview_slots s
     where s.declined_at = new.declined_at
       and ((new.application_id is not null and s.application_id = new.application_id)
         or (new.placement_id is not null and s.placement_id = new.placement_id))
     order by s.starts_at, s.id
     limit 1;

    if first_ is distinct from new.id then
      return new;
    end if;
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

    -- The two moments that wait on us, to us (F35). Her address rides along
    -- as the person so that replying to the alert reaches her.
    if moment in ('picked', 'declined') then
      perform public.notify_send(
        jsonb_build_object(
          'type',   'STATUS',
          'event',  'arrived',
          'table',  'interview_slots',
          'person', jsonb_build_object('name', info.name, 'email', info.email),
          'record', jsonb_build_object(
            'id',             new.id,
            'side',           'applicant',
            'moment',         moment,
            'application_id', new.application_id,
            'other',          'SecureJobVA',
            'starts_at',      new.starts_at,
            'minutes',        new.minutes,
            'meeting_url',    new.meeting_url)),
        'https://www.securejobva.com/api/notify',
        'notify_interview');
    end if;

    return new;
  end if;

  -- ── a placement interview, between a client and an assistant ───────────
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

  -- The reason 100's reschedule_placement_interview set for this move, if
  -- any. Missing setting reads as null (the `true`), so a move made any other
  -- way simply carries none.
  if moment = 'moved' then
    why := nullif(btrim(coalesce(current_setting('sjva.interview_reason', true), '')), '');
  end if;

  if moment in ('offered', 'confirmed', 'moved') and coalesce(info.assistant_email, '') <> '' then
    perform public.post_interview_note_with_reason(
      moment, 'assistant', info.assistant_name, info.assistant_email,
      coalesce(info.client_name, 'a client'), new, why);
  end if;

  if moment in ('picked', 'declined', 'confirmed', 'moved') and coalesce(info.client_email, '') <> '' then
    perform public.post_interview_note_with_reason(
      moment, 'client', coalesce(info.client_contact, info.client_name),
      info.client_email, coalesce(info.assistant_name, 'your assistant'), new, why);
  end if;

  return new;
end;
$fn$;

revoke all on function public.notify_interview() from public, anon, authenticated;

drop trigger if exists "notify-interview" on public.interview_slots;
create trigger "notify-interview"
  after insert or update on public.interview_slots
  for each row execute function public.notify_interview();

insert into public.schema_migrations (n) values (99) on conflict (n) do nothing;

-- ==========================================================================
-- Check it worked
-- ==========================================================================
--
-- Applicant interviews waiting on us right now: a time picked and not yet
-- confirmed, or every time declined. These are the rows that, from now on,
-- email staff the moment they happen. (Ones already in this state before the
-- file ran sent nothing, so this is also the list to act on today.)
-- Empty is fine: nobody is waiting.

select a.name,
       case when s.chosen_at is not null then 'picked a time — confirm it'
            else 'declined every time — offer others' end as waiting_on_us,
       s.starts_at,
       coalesce(s.chosen_at, s.declined_at) as since
from public.interview_slots s
join public.applications a on a.id = s.application_id
where s.confirmed_at is null
  and (s.chosen_at is not null
       or (s.declined_at is not null
           and not exists (select 1 from public.interview_slots o
                            where o.application_id = s.application_id
                              and o.declined_at is null)
           and s.id = (select o.id from public.interview_slots o
                        where o.application_id = s.application_id
                        order by o.starts_at, o.id limit 1)))
order by since;
