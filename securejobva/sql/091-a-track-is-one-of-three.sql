-- 091 — a track is one of three
--
-- Run after: 090
-- Safe to re-run: yes
-- Also needed: nothing in the dashboard.
--
-- ==========================================================================
-- A CONFIRMATION EMAIL WITH SOMEBODY ELSE'S WORDS IN IT
-- ==========================================================================
--
-- When an application lands, api/notify mails the applicant a confirmation:
-- "We have your application for <tracks>", signed by SecureJobVA, from
-- support@securejobva.com, DKIM and all. <tracks> is whatever the row says,
-- and anon may insert tracks (046's column list) with no limit on what the
-- array holds. So one anonymous POST with
--
--   email:  somebody@example.com
--   tracks: ["Customer Service. ACTION REQUIRED: your payout is on hold,
--            confirm at https://evil.example/verify"]
--
-- passes every constraint, and api/notify mails that person a signed message
-- from our domain carrying the attacker's sentence and link. One request per
-- victim. That is a phishing relay on the company's sending domain, and the
-- Resend reputation it spends is ours.
--
-- The page only ever sends three values — the three checkboxes on
-- careers.html and es/careers.html, which carry the same English values in
-- both languages:
--
--   Customer Service     Sales & Marketing     Admin Tasks
--
-- So a new application's tracks must be those, at most all three, and 002's
-- single `track` (which nothing sends any more) must be one of them or empty.
--
-- The name is the other free text the email quotes (its first word, "Hi …").
-- Nobody's name contains "://" or starts a word with "www.", so a name that
-- does is refused too. Nothing else about a name is judged.
--
-- ==========================================================================
-- A TRIGGER ON INSERT, NOT A CHECK CONSTRAINT
-- ==========================================================================
--
-- A CHECK would also be tested every time an old row is updated — the
-- applicant fixing her phone number, staff moving her stage — and an old row
-- with an odd value in tracks would suddenly refuse all of those. NOT VALID
-- does not help: it skips the existing rows once, when the constraint is
-- added, and then checks them on every later update anyway. applicants cannot
-- edit tracks or name afterwards (006 grants neither), so the insert is the
-- only door and the only place this needs to stand.
--
-- From a page only (current_user anon or authenticated). A row created by
-- hand in the SQL editor is somebody deliberate. The refusal carries an sjva-
-- hint so careers.html shows the message instead of parking the row — though
-- nobody using the form can reach it.
--
-- api/notify should ALSO stop quoting unchecked values (the contract hands
-- that over). This makes the database stop storing them; the two are
-- belt and braces, and the belt is here because it covers every reader.

create or replace function public.application_tracks_are_ours()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $fn$
declare
  known text[] := array['Customer Service', 'Sales & Marketing', 'Admin Tasks'];
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if new.tracks is not null
     and (not (new.tracks <@ known) or cardinality(new.tracks) > 3) then
    raise exception 'Pick one or more of the three roles on the form.'
      using hint = 'sjva-unknown-track';
  end if;

  if nullif(btrim(coalesce(new.track, '')), '') is not null
     and not (new.track = any(known)) then
    raise exception 'Pick one or more of the three roles on the form.'
      using hint = 'sjva-unknown-track';
  end if;

  if new.name ~* '(://|(^|[[:space:]])www\.)' then
    raise exception 'Put just your name in the name box.'
      using hint = 'sjva-name-is-a-name';
  end if;

  return new;
end;
$fn$;

revoke all on function public.application_tracks_are_ours() from public, anon, authenticated;

drop trigger if exists applications_tracks_are_ours on public.applications;
create trigger applications_tracks_are_ours
  before insert on public.applications
  for each row execute function public.application_tracks_are_ours();

-- ==========================================================================
-- Check it worked
-- ==========================================================================

select tgname, tgenabled
from pg_trigger
where tgname = 'applications_tracks_are_ours';

-- Applications already stored with a track this would refuse, or a name that
-- looks like a link. Each of these was mailed a confirmation quoting it.
select id, created_at, email, tracks, track, name
from public.applications
where (tracks is not null
       and not (tracks <@ array['Customer Service', 'Sales & Marketing', 'Admin Tasks']))
   or (nullif(btrim(coalesce(track, '')), '') is not null
       and track not in ('Customer Service', 'Sales & Marketing', 'Admin Tasks'))
   or name ~* '(://|(^|[[:space:]])www\.)'
order by created_at desc;

insert into public.schema_migrations (n) values (91) on conflict (n) do nothing;
