-- 081 — a link is a web address
--
-- Run after: 080
-- Safe to re-run: yes
-- Also needed: nothing in the dashboard.
--
-- ==========================================================================
-- FIVE COLUMNS THAT BECOME AN href
-- ==========================================================================
--
-- Every one of these is typed by somebody, stored as text, and drawn later as
-- <a href="..."> on a page or in an email sent under the SecureJobVA name:
--
--   interview_slots.meeting_url          staff or a client types it; /status,
--                                        /hub, /admin and api/notify draw it
--   application_socials.url              anon, on the apply form; /admin draws
--                                        it for anyone with social.view
--   application_assessment.connection_proof
--                                        the applicant; /admin draws it
--   application_assessment.typing_proof  the applicant (a storage path, or a
--                                        link); /admin draws it
--   applications.cv                      anon on the form, the applicant after;
--                                        /admin draws it
--
-- Only two of the writers ever checked the scheme: 057's confirm_interview
-- and 067's set_application_interview_link both refuse anything that is not
-- ^https?://. The staff confirm path in 062 (confirm_application_interview)
-- checked only the length, and every other column above checked nothing. So a
-- 'javascript:...' value, or a bare 'meet.google.com/abc' that resolves as a
-- path on securejobva.com and 404s at interview time, could be stored and
-- drawn. On /admin the page's own guard for social links is dead code (N1: the
-- regex was eaten by template-literal escaping), the staff session sits in
-- localStorage, and there is no CSP — so the database is the one place this
-- can be made true for every reader at once.
--
-- THE RULE. http or https, then no whitespace, no quote of either kind and no
-- angle bracket anywhere. The second half is N55: api/notify's esc() does not
-- escape quotes, so a link carrying `"` could add attributes to the <a> in an
-- email. Refusing the character here closes that for every mail template
-- without waiting for the api change (which should still happen).
--
--   ^https?://[^[:space:]"'<>]+$     (case-insensitive)
--
-- ONLY WHEN IT CHANGES. Each trigger looks at a value only when the write
-- changes it, so a row stored before this file with a bad link can still have
-- its other columns updated — confirming, moving, marking — without being
-- refused over something nobody touched. The query at the bottom lists those
-- rows so they can be looked at.
--
-- REFUSE, OR MAKE INERT. Two different answers, on purpose:
--
--   typed by staff, a client or a signed-in applicant, on a page that can
--   show an error              refused, with hint sjva-link
--
--   typed by anon on the apply form   made inert, never refused. careers.html
--   posts the application and its socials without a signed-in session, and a
--   refused insert is parked in a queue it can never leave (N71) — an
--   applicant lost over a malformed social link is far worse than the link.
--   So a social URL that is not a web address becomes the handle, which every
--   page already prints as text; a CV link with some other scheme
--   (javascript:, data:) is dropped; a CV link typed without its scheme
--   ("drive.google.com/…") gets https:// in front, which is what she meant.

-- ==========================================================================
-- 1. THE JOINING LINK — every writer, including the three functions
-- ==========================================================================
--
-- On the table rather than in the functions, so it holds for 057, 062, 067
-- and 070 at once and for whatever writes this column next. The functions
-- are SECURITY DEFINER, so this is deliberately NOT exempt by role: the SQL
-- editor is held to it too, since a link is either a web address or it is not.
-- Blank becomes null, which is what 062 meant when it was sent ''.

create or replace function public.meeting_url_is_a_link()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $fn$
begin
  -- Compared before it is tidied, so a row whose stored link was never
  -- touched by this write is left exactly as it was.
  if tg_op = 'UPDATE' and new.meeting_url is not distinct from old.meeting_url then
    return new;
  end if;

  new.meeting_url := nullif(btrim(coalesce(new.meeting_url, '')), '');

  if new.meeting_url is not null
     and new.meeting_url !~* '^https?://[^[:space:]"''<>]+$' then
    raise exception 'the joining link has to be a web address starting with https://'
      using hint = 'sjva-link';
  end if;

  return new;
end;
$fn$;

revoke all on function public.meeting_url_is_a_link() from public, anon, authenticated;

drop trigger if exists interview_slots_link_is_a_link on public.interview_slots;
create trigger interview_slots_link_is_a_link
  before insert or update on public.interview_slots
  for each row execute function public.meeting_url_is_a_link();

-- ==========================================================================
-- 2. THE ASSESSMENT PROOFS — refused, because /status shows the error
-- ==========================================================================
--
-- status.html already refuses a speed-test link that does not start with
-- http, in the browser. This is the same rule for a request that did not come
-- through the browser. typing_proof is normally a storage path the page wrote
-- after uploading the screenshot, "applicant-docs/<her application>/typing-…";
-- that shape is allowed, for her own folder only.

create or replace function public.assessment_links_are_links()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $fn$
begin
  if new.connection_proof is distinct from old.connection_proof
     and nullif(btrim(coalesce(new.connection_proof, '')), '') is not null
     and new.connection_proof !~* '^https?://[^[:space:]"''<>]+$' then
    raise exception 'the speed test link has to be a web address starting with https://'
      using hint = 'sjva-link';
  end if;

  if new.typing_proof is distinct from old.typing_proof
     and nullif(btrim(coalesce(new.typing_proof, '')), '') is not null
     and new.typing_proof !~* '^https?://[^[:space:]"''<>]+$'
     and not (new.typing_proof like 'applicant-docs/' || new.application_id::text || '/%'
              and position('..' in new.typing_proof) = 0
              and new.typing_proof !~ '[[:space:]"''<>]') then
    raise exception 'the typing proof has to be your uploaded screenshot or a web address'
      using hint = 'sjva-link';
  end if;

  return new;
end;
$fn$;

revoke all on function public.assessment_links_are_links() from public, anon, authenticated;

drop trigger if exists assessment_links_are_links on public.application_assessment;
create trigger assessment_links_are_links
  before update on public.application_assessment
  for each row execute function public.assessment_links_are_links();

-- ==========================================================================
-- 3. THE APPLY FORM — made inert, never refused
-- ==========================================================================

create or replace function public.social_url_is_a_link()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $fn$
begin
  new.url := nullif(btrim(coalesce(new.url, '')), '');
  if new.url is not null and new.url !~* '^https?://[^[:space:]"''<>]+$' then
    -- Kept, as text. The handle column is printed, never linked.
    new.handle := coalesce(nullif(btrim(coalesce(new.handle, '')), ''), left(new.url, 200));
    new.url := null;
  end if;
  return new;
end;
$fn$;

revoke all on function public.social_url_is_a_link() from public, anon, authenticated;

drop trigger if exists application_socials_url_is_a_link on public.application_socials;
create trigger application_socials_url_is_a_link
  before insert or update on public.application_socials
  for each row execute function public.social_url_is_a_link();

create or replace function public.cv_link_is_a_link()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $fn$
begin
  if tg_op = 'UPDATE' and new.cv is not distinct from old.cv then
    return new;
  end if;

  new.cv := nullif(btrim(coalesce(new.cv, '')), '');
  if new.cv is null or new.cv ~* '^https?://[^[:space:]"''<>]+$' then
    return new;
  end if;

  -- Some other scheme: javascript:, data:, vbscript:, file:. Nothing an
  -- applicant pastes as a link to her CV looks like this, and none of it can
  -- be made safe by editing, so it goes.
  if new.cv ~* '^[a-z][a-z0-9+.-]*:' and new.cv !~* '^[a-z0-9.-]+:[0-9]+(/|$)' then
    new.cv := null;
    return new;
  end if;

  -- No scheme at all: "drive.google.com/file/d/…". A host with a dot and no
  -- spaces is a web address with the https:// left off, which is how most
  -- people type one.
  if new.cv ~* '^[a-z0-9-]+(\.[a-z0-9-]+)+(:[0-9]+)?(/[^[:space:]"''<>]*)?$' then
    new.cv := 'https://' || new.cv;
    return new;
  end if;

  -- Anything else is words, not a link. Left as she wrote it — /admin must
  -- print a cv that is not an https link as text, which the contract asks of
  -- it — rather than thrown away.
  return new;
end;
$fn$;

revoke all on function public.cv_link_is_a_link() from public, anon, authenticated;

drop trigger if exists applications_cv_is_a_link on public.applications;
create trigger applications_cv_is_a_link
  before insert or update on public.applications
  for each row execute function public.cv_link_is_a_link();

-- ==========================================================================
-- Check it worked
-- ==========================================================================

-- Four triggers.
select c.relname as table_name, t.tgname
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
where t.tgname in ('interview_slots_link_is_a_link', 'assessment_links_are_links',
                   'application_socials_url_is_a_link', 'applications_cv_is_a_link')
order by c.relname;

-- Links already stored that this rule would refuse. Nothing above changes
-- them; each is somebody's joining link, proof or CV that a page will draw
-- as a link until it is fixed or the page learns to print it as text.
select 'interview_slots.meeting_url' as col, id::text as row_id, meeting_url as value
from public.interview_slots
where meeting_url is not null and meeting_url !~* '^https?://[^[:space:]"''<>]+$'
union all
select 'application_socials.url', application_id::text || ' ' || platform, url
from public.application_socials
where url is not null and url !~* '^https?://[^[:space:]"''<>]+$'
union all
select 'application_assessment.connection_proof', application_id::text, connection_proof
from public.application_assessment
where connection_proof is not null and connection_proof !~* '^https?://[^[:space:]"''<>]+$'
union all
select 'applications.cv', id::text, cv
from public.applications
where cv is not null and btrim(cv) <> '' and cv !~* '^https?://[^[:space:]"''<>]+$';

insert into public.schema_migrations (n) values (81) on conflict (n) do nothing;
