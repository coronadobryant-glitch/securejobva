-- 101 — an application says yes to both
--
-- Run after: 100, and 084 (the two columns this requires)
-- Safe to re-run: yes
-- Also needed: the careers pages that ASK — careers.html and es/careers.html
--   with the 18+ and privacy boxes (shipped in 78bbb7c) — deployed and live
--   BEFORE this is pasted. Pasted first, it is still safe (see THE QUEUE), but
--   the clock described there would never start. And /es/careers taught the
--   hint `sjva-consent-needed` (CONTRACT.md): until it is, the Spanish page
--   shows this file's English sentence.
--
-- ==========================================================================
-- THE BOXES WERE ONLY ON THE PAGE (F1)
-- ==========================================================================
--
-- 084 added adult_confirmed and privacy_consent_text and said, in as many
-- words, that it did not make either required — because the page and the
-- schema ship separately and a required column pasted before the page would
-- refuse every application. The page now asks: Send stays disabled until both
-- boxes are ticked. But the page is the only thing asking. The anon key is in
-- its source, and a POST straight to /rest/v1/applications without either
-- field is accepted, with both left blank — an application from somebody who
-- never said they were an adult and never agreed to what we do with their
-- data.
--
-- From now on the database asks too. A new application from the public form
-- must say adult_confirmed = true and carry the consent sentence she agreed
-- to. One that does not is refused with a sentence written for her, and the
-- hint `sjva-consent-needed`, which careers.html already treats as a
-- deliberate no (it shows the message instead of parking the row).
--
-- ==========================================================================
-- THE QUEUE — what about applications already waiting in a browser
-- ==========================================================================
--
-- careers.html parks an application it could not send in localStorage and
-- re-sends it on the visitor's next visit, for up to seven days (QUEUE_TTL).
-- A row parked by the page as it was BEFORE it asked carries neither field.
-- Refusing those would lose real applications from people who did nothing
-- wrong, silently: drain() drops a refused row and nobody is on the page to
-- read why.
--
-- So the decision, made here and nowhere else:
--
--   A row with NEITHER field (both null) is the old page's shape. It is
--   accepted for as long as an old page could still be holding one: until
--   eight days after the first application that DID carry consent arrived.
--   That first consented row is the proof the asking page is live, and seven
--   days after it every queue written by the page before it has expired (one
--   day of margin). After that, the old shape is refused like any other.
--
--   A row with EITHER field present is the new page's shape, and must have
--   both, now: adult_confirmed true and a consent sentence. A new page cannot
--   send one without the other, so a row that does is not a queued old one.
--
-- No date to remember and nothing to paste later: the database starts the
-- clock itself, from evidence, the day the page goes live. If the page has
-- not gone live when this is pasted, the clock simply has not started and
-- old-shape rows go on being accepted — which is today's behaviour, not a
-- new failure. The check below says which of the three states it is in.
--
-- ==========================================================================
-- WHO IT APPLIES TO
-- ==========================================================================
--
-- Requests from a page: the token's role is anon or authenticated. Not the SQL
-- editor or anything run by hand (the token is empty there), so an application
-- typed in by staff on somebody's behalf, or a restore, is not refused — the
-- same exemption 084's stamp and 091's track rule make, for the same reason.
-- auth.role() rather than current_user because this function is definer: it
-- has to read other people's applications to find the first consented one,
-- and inside a definer function current_user is the owner, not the caller.

do $pre$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'applications'
                   and column_name = 'adult_confirmed') then
    raise exception 'sql/084 has not been run on this database. It adds the two columns this file requires.';
  end if;
end
$pre$;

create or replace function public.application_says_yes_to_both()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  says_consent boolean;
  old_shape    boolean;
  first_yes    timestamptz;
begin
  if coalesce(auth.jwt() ->> 'role', '') not in ('anon', 'authenticated') then
    return new;
  end if;

  says_consent := nullif(btrim(coalesce(new.privacy_consent_text, '')), '') is not null;
  old_shape    := new.adult_confirmed is null and new.privacy_consent_text is null;

  if old_shape then
    -- The first application that carried consent is the day the asking page
    -- went live. Until eight days after it, a queued row from the page before
    -- may still arrive.
    select min(a.privacy_consent_at) into first_yes
      from public.applications a
     where a.privacy_consent_at is not null;

    if first_yes is null or now() < first_yes + interval '8 days' then
      return new;
    end if;
  end if;

  if new.adult_confirmed is distinct from true or not says_consent then
    raise exception 'Please tick both boxes — that you are 18 or older, and that you agree to how we use your details — then send it again.'
      using hint = 'sjva-consent-needed';
  end if;

  return new;
end;
$fn$;

revoke all on function public.application_says_yes_to_both() from public, anon, authenticated;

-- BEFORE INSERT only. What she agreed to when she applied is history (084 puts
-- it back on any update), so there is nothing to check on an update.
drop trigger if exists applications_say_yes_to_both on public.applications;
create trigger applications_say_yes_to_both
  before insert on public.applications
  for each row execute function public.application_says_yes_to_both();

insert into public.schema_migrations (n) values (101) on conflict (n) do nothing;

-- ==========================================================================
-- Check it worked
-- ==========================================================================
--
-- One row. `state` is one of:
--
--   waiting for the page     no application has carried consent yet. Old-shape
--                            rows are still accepted. Deploy the careers pages
--                            that ask, if they are not live.
--   old queues still drain   the page is live; rows without either answer are
--                            accepted until `old_shape_refused_from`.
--   both required            every new application from the form must say both.
--
-- Rows that say only one of the two are refused in every state.

select case
         when min(privacy_consent_at) is null then 'waiting for the page'
         when now() < min(privacy_consent_at) + interval '8 days' then 'old queues still drain'
         else 'both required'
       end as state,
       min(privacy_consent_at) as first_consented_application,
       min(privacy_consent_at) + interval '8 days' as old_shape_refused_from,
       count(*) filter (where privacy_consent_at is not null) as with_consent,
       count(*) filter (where privacy_consent_at is null
                          and created_at > now() - interval '30 days') as without_consent_last_30_days
from public.applications;
