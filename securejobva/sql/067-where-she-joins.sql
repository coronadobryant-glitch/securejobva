-- 067 — where she joins

-- Run after: 062, 066 (the function this replaces)
-- Safe to re-run: yes
-- Also needed: nothing in the dashboard.
--
-- ==========================================================================
-- THE PROMISE NOTHING KEPT
-- ==========================================================================
--
-- 062 gave confirm_application_interview a url argument from the beginning,
-- and /admin never passed one. So meeting_url was null on every confirmed
-- applicant interview, and her confirmation mail fell through to the line
-- that says the joining details will follow before the day.
--
-- Nothing sent them. There was no way to put a link on the row after the
-- confirm — the page is granted no update on interview_slots at all, by
-- design — and no moment that would have mailed it if there had been.
--
-- Which is the wrong way round for how the two things actually happen. You
-- agree a time with somebody and make the room afterwards. Requiring the link
-- at the moment of confirming means either holding the confirmation back until
-- the room exists, or confirming and then having no way to tell her where to
-- go.
--
-- So: a link can go in with the confirm, or onto a confirmed row later, and
-- the later one mails her — because that mail is the promise the confirmation
-- already made on its behalf.
--
-- ==========================================================================
-- WHAT THIS ADDS
-- ==========================================================================
--
--   set_application_interview_link   staff paste a link onto a confirmed slot
--   notify_interview                 gains a 'link' moment for her side only
--
-- 058 treated writing a link onto an already-confirmed row as "a real change,
-- and none of them news", and for a placement it still is: the client wrote it
-- while confirming and the assistant's confirmation mail carried it. On her
-- interview the link arrives after, so it is the only news there is.

do $pre$
begin
  if to_regclass('public.interview_slots') is null then
    raise exception 'sql/057 has not been run on this database.';
  end if;
end
$pre$;

-- ==========================================================================
-- PUTTING A LINK ON A CONFIRMED INTERVIEW
-- ==========================================================================

create or replace function public.set_application_interview_link(
  slot uuid, url text
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  app  uuid;
  conf timestamptz;
begin
  if not public.has_permission('applications.edit') then
    raise exception 'not yours to send';
  end if;

  select s.application_id, s.confirmed_at
    into app, conf
  from public.interview_slots s where s.id = slot;

  if app is null then
    raise exception 'no such interview';
  end if;

  -- Only after it is confirmed. A link on a time she has not agreed to is an
  -- invitation to a meeting that may not happen, and the mail below would tell
  -- her to be somewhere at a time nobody settled.
  if conf is null then
    raise exception 'confirm the time first, then send the link';
  end if;

  if coalesce(length(url), 0) = 0 then
    raise exception 'that link is empty';
  end if;

  if length(url) > 500 then
    raise exception 'that joining link is too long';
  end if;

  -- Shape only. Whether the room exists is not something this can know, and a
  -- pattern that tries ends up refusing somebody's perfectly good link.
  if url !~* '^https?://' then
    raise exception 'a joining link starts with http:// or https://';
  end if;

  update public.interview_slots
     set meeting_url = url
   where id = slot;

  return url;
end;
$fn$;

revoke all on function public.set_application_interview_link(uuid, text) from public, anon;
grant execute on function public.set_application_interview_link(uuid, text) to authenticated;

-- ==========================================================================
-- AND TELLING HER
-- ==========================================================================
--
-- 066's version, with one moment added. Everything else is carried across
-- unchanged, including the placement half, which is live.

create or replace function public.notify_interview()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  moment text;
  info   record;
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
        and new.meeting_url is distinct from old.meeting_url
        and coalesce(new.meeting_url, '') <> '' then
    -- A link arriving on an interview that is already agreed. 058 called this
    -- "not news" and on a placement it is not: the client types it while
    -- confirming, so the confirmation mail already carried it. Here it is the
    -- only news there is, and the confirmation mail promised it.
    moment := 'link';
  else
    -- Clearing a pick, tidying a losing slot, clearing a link.
    return new;
  end if;

  -- ── her own interview, with us ─────────────────────────────────────────
  if new.application_id is not null then
    select a.name, a.email
      into info
      from public.applications a
     where a.id = new.application_id;

    if moment in ('offered', 'confirmed', 'link') and coalesce(info.email, '') <> '' then
      perform public.post_interview_note(
        moment, 'applicant', info.name, info.email, 'SecureJobVA', new);
    end if;

    return new;
  end if;

  -- ── a placement interview, between a client and an assistant ───────────
  --
  -- 'link' is deliberately not in either list below. On a placement the link
  -- rides in on the confirmation, and a second mail saying the same thing is
  -- how people stop reading the first.
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
-- can be run exactly as committed. Same as 066.

-- ==========================================================================
-- Check it worked
-- ==========================================================================

select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in ('set_application_interview_link', 'notify_interview')
order by routine_name;

-- Confirmed interviews and whether she has been told where to go.
select a.name, s.starts_at, coalesce(s.meeting_url, '— not sent —') as joining
from public.interview_slots s
join public.applications a on a.id = s.application_id
where s.confirmed_at is not null
order by s.starts_at;

insert into public.schema_migrations (n) values (67) on conflict (n) do nothing;
