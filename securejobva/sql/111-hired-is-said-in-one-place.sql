-- 111 — hired is said in one place
--
-- Run after: 110
-- Safe to re-run: yes
-- Also needed: /admin's internal-pipeline dropdown no longer offering
--   'Hired' as something to pick, and its hired count and Breakdown bar
--   reading the stage (CONTRACT.md). Pasted before that, the dropdown still
--   works for every other value, and picking 'Hired' there is refused with a
--   sentence saying to set the stage instead.
--
-- ==========================================================================
-- TWO "HIRED"s (F32)
-- ==========================================================================
--
-- An applicant has two places that can say hired:
--
--   applications.status            the stage she sees on /status. 'hired'
--                                  opens her portal (046's is_hired), emails
--                                  her "you are on the team" (031), and is
--                                  what the match form lists (only hired
--                                  people can be placed).
--   application_tracking.pipeline  our internal note of where she is (005),
--                                  which has its own 'hired'.
--
-- Staff set them with two separate dropdowns. Set one and forget the other and
-- the hired count at the top of /admin (which reads the pipeline) and the
-- Hired bar in the Breakdown disagree with who actually has a portal.
--
-- ==========================================================================
-- THE DECISION
-- ==========================================================================
--
-- The stage is the truth. It is the one with consequences — a portal, an
-- email, a placement — and the one she can see. The pipeline's 'hired'
-- becomes a mirror of it that nobody types:
--
--   - the stage becomes 'hired'        -> the pipeline is set to 'hired'
--   - the stage leaves 'hired'         -> a pipeline still saying 'hired' is
--                                         set back: 'rejected' if she is now
--                                         declined, 'interviewed' otherwise
--   - a page sets the pipeline to      -> refused, sjva-hired-is-the-stage:
--     'hired' while she is not hired,     "set her stage to Hired; this
--     or away from 'hired' while she is   follows by itself"
--
-- The other six pipeline values are untouched and as free as they were. The
-- SQL editor and definer functions are exempt from the refusal (the mirror
-- itself is one), the same exemption 074 makes.
--
-- ==========================================================================
-- THE ROWS THAT ALREADY DISAGREE
-- ==========================================================================
--
-- Fixed now, in the one direction that changes nothing she can see: anybody
-- whose stage is 'hired' gets pipeline 'hired'. Silent — the pipeline is
-- internal and nothing mails on it.
--
-- The other direction — pipeline 'hired', stage not — is NOT fixed here,
-- because the fix would be either moving her stage (which emails her and
-- opens her portal: a decision) or quietly rewriting a note somebody made on
-- purpose. They are listed in the check below. For each, a person decides:
-- set her stage to Hired in /admin if she is, or change the pipeline if she
-- is not.

do $pre$
begin
  if to_regclass('public.application_tracking') is null then
    raise exception 'sql/005 has not been run on this database.';
  end if;
end
$pre$;

-- ── the mirror ──────────────────────────────────────────────────────────────

create or replace function public.pipeline_follows_hired()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if new.status = 'hired' then
    insert into public.application_tracking (application_id, pipeline)
    values (new.id, 'hired')
    on conflict (application_id) do update
      set pipeline = 'hired', updated_at = now()
      where public.application_tracking.pipeline <> 'hired';
  elsif old.status = 'hired' then
    update public.application_tracking
       set pipeline = case when new.status = 'declined' then 'rejected' else 'interviewed' end,
           updated_at = now()
     where application_id = new.id
       and pipeline = 'hired';
  end if;
  return new;
end;
$fn$;

revoke all on function public.pipeline_follows_hired() from public, anon, authenticated;

drop trigger if exists applications_pipeline_follows_hired on public.applications;
create trigger applications_pipeline_follows_hired
  after update of status on public.applications
  for each row
  when (old.status is distinct from new.status)
  execute function public.pipeline_follows_hired();

-- ── the refusal ─────────────────────────────────────────────────────────────
--
-- Invoker, and asks current_user, for 074's reason: inside the mirror above
-- (a definer function) current_user is the owner and the write is let through;
-- from a page it is 'authenticated' and the rule applies. Staff can read
-- applications, so the stage lookup needs no definer rights.

create or replace function public.hired_is_the_stage()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $fn$
declare
  stage text;
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.pipeline is not distinct from old.pipeline then
    return new;
  end if;

  select a.status into stage from public.applications a where a.id = new.application_id;

  if new.pipeline = 'hired' and stage is distinct from 'hired' then
    raise exception 'Set her stage to Hired — the pipeline follows it by itself.'
      using hint = 'sjva-hired-is-the-stage';
  end if;

  if tg_op = 'UPDATE' and old.pipeline = 'hired' and stage = 'hired' then
    raise exception 'She is Hired. Move her stage first if that has changed — the pipeline follows it by itself.'
      using hint = 'sjva-hired-is-the-stage';
  end if;

  return new;
end;
$fn$;

revoke all on function public.hired_is_the_stage() from public, anon, authenticated;

drop trigger if exists application_tracking_hired_is_the_stage on public.application_tracking;
create trigger application_tracking_hired_is_the_stage
  before insert or update on public.application_tracking
  for each row execute function public.hired_is_the_stage();

-- ── the rows that already disagree, in the direction that is safe ──────────

insert into public.application_tracking (application_id, pipeline)
select a.id, 'hired'
from public.applications a
where a.status = 'hired'
on conflict (application_id) do update
  set pipeline = 'hired', updated_at = now()
  where public.application_tracking.pipeline <> 'hired';

insert into public.schema_migrations (n) values (111) on conflict (n) do nothing;

-- ==========================================================================
-- Check it worked
-- ==========================================================================
--
-- Empty is the pass. Each row is somebody whose pipeline says hired and whose
-- stage does not — decide each one in /admin (see THE ROWS THAT ALREADY
-- DISAGREE). Nobody should appear the other way round after this file.

select a.name,
       a.status as stage,
       t.pipeline,
       case when a.status = 'hired' then 'stage hired, pipeline not — should not happen'
            else 'pipeline hired, stage not — decide' end as what_to_do
from public.applications a
join public.application_tracking t on t.application_id = a.id
where (a.status = 'hired') <> (t.pipeline = 'hired')
order by a.name;
