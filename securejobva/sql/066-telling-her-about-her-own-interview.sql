-- DO NOT RE-RUN THIS FILE ON ITS OWN
--
-- Every statement in it is repeatable, so on its own it is safe. What it is
-- not safe to do is run it AFTER the files that come later.
--
-- What this file would take back, and what to run afterwards to undo it:
--
--   notify_interview
--     -> re-run 070-moving-an-interview.sql to restore. That file defines
--        notify_interview in full, carrying 066, 067 and 069 forward, so it
--        is the only one needed however long this chain gets.
--
-- 066's version has no 'link' moment, so pasting a joining link onto a
-- confirmed interview stops telling her where to go — and her confirmation
-- mail has already promised that the details will follow. The link still
-- lands on the row. Nothing says it did.
--
-- tools/check.mjs keeps this list honest.
-- 066 — telling her about her own interview

-- Run after: 058 (the function this replaces), 062, 065
-- Safe to re-run: yes
-- Also needed: the webhook secret, exactly as 058 needs it. See the bottom.
--
-- ==========================================================================
-- WHAT WAS WRONG
-- ==========================================================================
--
-- 057 built the interview handshake for a placement: a client offers times,
-- an assistant picks one, the client confirms it. 058 gave that four emails,
-- each addressed to the one person who then has to do something.
--
-- 062 reused the same table for an applicant's interview with US and reversed
-- the parts — we offer, she picks, we confirm — and wired no mail at all.
--
-- Not "wired the wrong mail". None. notify_interview looks the parties up
-- like this:
--
--     from public.placements p
--     join public.applications a on a.id = p.application_id
--     ...
--     where p.id = new.placement_id;
--
-- An applicant's slot has no placement_id. The lookup matches nothing, every
-- field in `info` comes back null, and both branches below it are guarded by
-- coalesce(..., '') <> '' — so the trigger fires, finds no address, and
-- returns having sent nothing. Silently, because there is nothing wrong with
-- a slot that has no placement; it is simply the other kind.
--
-- What that looked like from her side: she was moved to interview, got the
-- stage mail from 031 saying times were waiting on her page, found none —
-- and then, when times WERE offered, was told nothing at all. The only way to
-- discover an interview had been proposed was to open the page and look.
--
-- ==========================================================================
-- WHAT THIS DOES
-- ==========================================================================
--
-- One function, two shapes of row. A slot with a placement_id behaves exactly
-- as it did — that code is copied across unchanged, and the placement flow is
-- live. A slot with an application_id now finds the applicant and mails her.
--
-- Two moments reach her, matching the two the assistant gets on a placement:
--
--   offered     we have put times forward — go and pick one
--   confirmed   it is set, here is when, in Central and on your own clock
--
-- `picked` and `declined` do not mail anybody on this side. On a placement
-- they tell the client, who is waiting on the assistant; here the other party
-- is us, and /admin already shows her pick as a Confirm button on the row —
-- so the same information is already in front of the person who acts on it.
-- Mailing ourselves about our own queue is how a queue stops being read.
--
-- side is 'applicant', which api/notify.js branches on: her mail names no
-- client, because on her interview there is not one, and points at /status
-- rather than /hub.

do $pre$
begin
  if to_regclass('public.interview_slots') is null then
    raise exception
      'sql/057 has not been run on this database. It creates interview_slots.';
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
  else
    -- Clearing a pick, tidying a losing slot, writing a link onto a row that
    -- was already confirmed. Real changes, and none of them news.
    return new;
  end if;

  -- ── her own interview, with us ─────────────────────────────────────────
  --
  -- Checked first and returned from, so the placement lookup below never runs
  -- on a row that has no placement. That lookup finding nothing was the whole
  -- bug: it is not an error, so nothing said anything.
  if new.application_id is not null then
    select a.name, a.email
      into info
      from public.applications a
     where a.id = new.application_id;

    if moment in ('offered', 'confirmed') and coalesce(info.email, '') <> '' then
      perform public.post_interview_note(
        moment, 'applicant', info.name, info.email, 'SecureJobVA', new);
    end if;

    return new;
  end if;

  -- ── a placement interview, between a client and an assistant ───────────
  --
  -- Unchanged from 058. The contact name and address are on client_private,
  -- not on clients: 039 moved them there precisely so that a policy handing an
  -- assistant the client row does not hand her the client's email, and this
  -- function is security definer, which is what lets it read across that line
  -- without widening it for anybody else.
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

revoke all on function public.notify_interview() from public, anon, authenticated;

-- The trigger itself is 058's and does not change, but it is recreated here so
-- that running this file on a database where 058's trigger was dropped leaves
-- a working one rather than a working function nothing calls.
drop trigger if exists "notify-interview" on public.interview_slots;
create trigger "notify-interview"
  after insert or update on public.interview_slots
  for each row execute function public.notify_interview();

-- ==========================================================================
-- THE SECRET
-- ==========================================================================
--
-- post_interview_note is NOT redefined here, which matters: it is the half
-- that carries the webhook secret, and 058 was pasted with the real one in
-- place of the placeholder. Leaving it alone means this file needs no secret
-- and can be committed and run as it stands.
--
-- If post_interview_note is ever redefined, it has to be done the way 058
-- says: copy the file, paste the secret into the copy, run the copy, throw it
-- away. Never commit it.
--
-- ==========================================================================
-- Check it worked
-- ==========================================================================

-- Both shapes of row reach the right branch. Nothing here sends anything; it
-- reports what the trigger would find.
select 'applicant slots' as kind, count(*) as rows,
       count(*) filter (where application_id is not null) as routable
from public.interview_slots
where application_id is not null
union all
select 'placement slots', count(*),
       count(*) filter (where placement_id is not null)
from public.interview_slots
where placement_id is not null;

-- The applicants an offered time would now reach. An empty address here is
-- the one case that still silently sends nothing, and it cannot happen: the
-- apply form requires an email.
select a.name, a.email, a.status
from public.applications a
where a.status = 'interview'
order by a.created_at;

insert into public.schema_migrations (n) values (66) on conflict (n) do nothing;
