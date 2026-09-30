-- 084 — an application says what she agreed to
--
-- Run after: 083
-- Safe to re-run: yes
-- Also needed: nothing in the dashboard.
--
-- ==========================================================================
-- TWO THINGS THE FORM NEVER ASKED
-- ==========================================================================
--
-- The apply dialog on /careers collects a name, an address, a phone number, a
-- CV and five self-assessments, and never asks the person to agree to the
-- privacy notice (P5). "18 or older" is a bullet in the requirements list,
-- outside the dialog, and nothing in the dialog asks either (P6). So there is
-- no record, on any application, that the person saw what we do with their
-- data or said they were an adult — and no column to hold one if the page
-- started asking tomorrow.
--
-- This file adds the columns. It does not decide what the consent SAYS — that
-- is the page's copy and the privacy policy's — and it does not make either
-- answer required.
--
-- ==========================================================================
-- WHY NULLABLE, AND WHY NOT REQUIRED YET
-- ==========================================================================
--
-- The page and this file ship separately: this is pasted by hand, the page is
-- deployed by Vercel, and either can land first. If these were NOT NULL, or a
-- CHECK required adult_confirmed, every application sent by the page as it is
-- today would be refused the moment this ran — and careers.html parks a
-- refused row in a queue it can never leave (N71). So:
--
--   adult_confirmed         boolean, null. true when she ticked it. null means
--                           the form did not ask, which is every row before
--                           the page change.
--   privacy_consent_text    text, null. The exact sentence she agreed to, as
--                           shown, in the language she saw it in. Kept for
--                           the same reason 006 keeps posting_consent_text: if
--                           the wording changes, the record says what THIS
--                           person agreed to.
--   privacy_consent_at      timestamptz, null. Stamped here, by the database,
--                           the moment a row arrives carrying consent text.
--                           Never sent by a page and granted to nobody — the
--                           same rule as recorded_by in 055.
--
-- Making them required is a later file, once the page has been sending them
-- long enough that nothing is still queued in a browser from before. Saying
-- when that is belongs to David.

alter table public.applications add column if not exists adult_confirmed boolean;
alter table public.applications add column if not exists privacy_consent_text text;
alter table public.applications add column if not exists privacy_consent_at timestamptz;

-- A cap, as every text column the public can write has one. Two thousand is
-- several paragraphs; a consent line is one.
alter table public.applications drop constraint if exists applications_consent_sane;
alter table public.applications add constraint applications_consent_sane
  check (coalesce(length(privacy_consent_text), 0) <= 2000);

-- ==========================================================================
-- WHO MAY WRITE THEM
-- ==========================================================================
--
-- anon sends the two answers with the application, exactly as it sends
-- everything else on the form (046's column list). The stamp is not granted.
-- Nobody gets UPDATE on any of the three: what she agreed to when she applied
-- is history, and 006 already shows the shape for changing a mind later
-- (posting_consent can be withdrawn and keeps its record).

grant insert (adult_confirmed, privacy_consent_text) on public.applications to anon;

-- Readable by name as well as through 018's table grant, so a page that asks
-- for them in a select= list passes tools/check.mjs ("portal reads only
-- columns it is granted").
grant select (adult_confirmed, privacy_consent_text, privacy_consent_at)
  on public.applications to authenticated;

-- ==========================================================================
-- THE STAMP
-- ==========================================================================
--
-- From a page (current_user anon or authenticated) the moment is always
-- now() — whatever arrived in the column, which should be nothing, since it
-- is not granted. From the SQL editor a deliberate value is kept, so a row
-- imported by hand can carry the time it was really given.

create or replace function public.stamp_privacy_consent()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $fn$
begin
  -- A correction typed by hand in the SQL editor is the one write to these
  -- that is meant. Everything else — a page, through whatever grant — puts the
  -- record back as it was.
  if tg_op = 'UPDATE' and current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    new.privacy_consent_text := old.privacy_consent_text;
    new.privacy_consent_at   := old.privacy_consent_at;
    new.adult_confirmed      := old.adult_confirmed;
    return new;
  end if;

  new.privacy_consent_text := nullif(btrim(coalesce(new.privacy_consent_text, '')), '');
  if new.privacy_consent_text is null then
    new.privacy_consent_at := null;
  elsif current_user in ('anon', 'authenticated') or new.privacy_consent_at is null then
    new.privacy_consent_at := now();
  end if;
  return new;
end;
$fn$;

revoke all on function public.stamp_privacy_consent() from public, anon, authenticated;

drop trigger if exists applications_stamp_consent on public.applications;
create trigger applications_stamp_consent
  before insert or update on public.applications
  for each row execute function public.stamp_privacy_consent();

-- ==========================================================================
-- Check it worked
-- ==========================================================================

-- Three columns, all nullable.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'applications'
  and column_name in ('adult_confirmed', 'privacy_consent_text', 'privacy_consent_at')
order by column_name;

-- anon may insert the two answers and NOT the stamp. privacy_consent_at in
-- this list means a page can backdate a consent.
select column_name
from information_schema.column_privileges
where table_name = 'applications'
  and grantee = 'anon'
  and privilege_type = 'INSERT'
  and column_name in ('adult_confirmed', 'privacy_consent_text', 'privacy_consent_at');

-- How many applications carry a consent, once the page asks. Zero until then.
select count(*) filter (where privacy_consent_at is not null) as consented,
       count(*) filter (where adult_confirmed)               as said_adult,
       count(*)                                              as applications
from public.applications;

insert into public.schema_migrations (n) values (84) on conflict (n) do nothing;
