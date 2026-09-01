-- DO NOT RE-RUN THIS FILE ON ITS OWN
--
-- The header above says this file is safe to re-run, and on its own it is:
-- every statement in it is written to be repeatable. What it is not safe to
-- do is run it AFTER the files that come later, because it defines functions
-- they have since replaced — and `create or replace` does exactly what it
-- says. Re-running this puts its own versions back.
--
-- Nothing warns you when that happens. Columns are added with `if not
-- exists` so they survive; only the logic goes backwards. The schema looks
-- perfect and the behaviour is months old.
--
-- What this file would take back, and what to run afterwards to undo it:
--
--   score_assessment
--     -> re-run 049-four-things-measured-once-each.sql to restore
--   submit_assessment
--     -> re-run 051-the-clock-and-the-send-button.sql to restore
--
-- So if you ever run this file again, run every later file it names above,
-- in number order, straight afterwards. tools/check.mjs keeps this list
-- honest: a new file that supersedes something here fails the build until
-- this block names it.
-- 045 — the assessment, taken and scored in the product
--
-- Run after: 044
-- Safe to re-run: yes
-- Also needed: nothing in the dashboard.
-- GENERATED IN PART — the scenario key below comes from
-- tools/assessment-items.mjs. Change the scenarios there and re-paste this.
--
-- ==========================================================================
-- WHAT THIS REPLACES
-- ==========================================================================
--
-- Moving somebody to `assessment` has, until now, sent an email saying "we
-- will be in touch with the detail" — and that sentence was the whole
-- feature. The stage existed, the five score columns from 008 existed, and
-- between them was a person sending a task by hand and typing a number back
-- in.
--
-- This closes that: the task is delivered on /status, the scored parts mark
-- themselves, and passing moves the stage to `interview` without anybody
-- doing it.
--
-- ==========================================================================
-- THE ANSWER KEY NEVER LEAVES THE DATABASE
-- ==========================================================================
--
-- The rule 025 set for DISC — "the browser is never told which word is a D" —
-- matters more here, because this one decides whether somebody gets an
-- interview. The page is sent the scenarios and their options in a fixed
-- order and sends back the POSITIONS ticked. The points live in the trigger
-- below and in tools/assessment-items.mjs, and in nothing that is served.
--
-- The option order is shuffled in the item bank so that no single column is
-- the answer: the best option sits at each of the four positions exactly
-- three times, so ticking one column all the way down scores 6 of 24, which
-- is what random guessing scores. tools/check.mjs asserts that spread, because
-- an edit that clustered the answers again would be invisible.
--
-- ==========================================================================
-- WHAT IT REFUSES TO DO
-- ==========================================================================
--
-- Passing advances the stage. Failing does NOT decline anybody. Advancing
-- somebody wrongly costs an interview slot; declining somebody wrongly loses
-- a real person permanently and silently, and a dropped connection, a misread
-- instruction and a browser crash all look exactly like a low score. Below the
-- line sets `verdict = 'below_line'` and stops, for a person to look at.
--
-- One attempt. `attempt` is a column rather than a constraint so staff can
-- grant a re-sit by hand when somebody's power went out, which happens.

-- --------------------------------------------------------------------------
-- The table
-- --------------------------------------------------------------------------

create table if not exists public.application_assessment (
  application_id uuid primary key
    references public.applications (id) on delete cascade,

  track        text        not null,
  attempt      smallint    not null default 1,
  started_at   timestamptz not null default now(),
  submitted_at timestamptz,

  -- What she actually did. Positions and raw counts, nothing scored.
  typing_wpm       smallint,
  typing_accuracy  smallint,
  scenario_answers jsonb,
  written_reply    text,

  -- Filled in by the trigger. Never writable from a page.
  score_typing    smallint,
  score_scenarios smallint,
  verdict         text not null default 'in_progress',

  -- The half a machine cannot mark.
  written_score    smallint,
  written_scored_by text,
  written_scored_at timestamptz,

  constraint assessment_verdict_known
    check (verdict in ('in_progress', 'passed', 'below_line')),
  constraint assessment_sane check (
    attempt between 1 and 5
    and coalesce(typing_wpm, 0) between 0 and 250
    and coalesce(typing_accuracy, 0) between 0 and 100
    and coalesce(length(written_reply), 0) <= 8000
    and coalesce(written_score, 0) between 0 and 10
  )
);

alter table public.application_assessment enable row level security;

-- --------------------------------------------------------------------------
-- Who may touch it
-- --------------------------------------------------------------------------
--
-- anon gets nothing at all. This holds an applicant's answers and, once the
-- trigger has run, the number that decides her application.

revoke all on public.application_assessment from anon, authenticated;

-- She may start one and fill it in. She may NOT write a score, a verdict, or
-- the time it was submitted — those are the trigger's, and a column list is
-- the only thing that stops a page from setting them.
grant select on public.application_assessment to authenticated;
grant insert (application_id, track) on public.application_assessment to authenticated;
grant update (typing_wpm, typing_accuracy, scenario_answers, written_reply)
  on public.application_assessment to authenticated;

drop policy if exists "she reads her own assessment" on public.application_assessment;
create policy "she reads her own assessment"
  on public.application_assessment for select to authenticated
  using (public.owns_application(application_id) or public.has_permission('applications.view_all'));

drop policy if exists "she starts her own assessment" on public.application_assessment;
create policy "she starts her own assessment"
  on public.application_assessment for insert to authenticated
  with check (public.owns_application(application_id));

-- Open only while it is hers to fill in. Once submitted_at is set the row is
-- closed to her, which is what makes "one attempt" true rather than polite.
drop policy if exists "she fills in her own, once" on public.application_assessment;
create policy "she fills in her own, once"
  on public.application_assessment for update to authenticated
  using (public.owns_application(application_id) and submitted_at is null)
  with check (public.owns_application(application_id) and submitted_at is null);

drop policy if exists "staff read every assessment" on public.application_assessment;
create policy "staff read every assessment"
  on public.application_assessment for select to authenticated
  using (public.has_permission('applications.view_all'));

-- Staff mark the writing, and nothing else.
grant update (written_score, written_scored_by, written_scored_at, attempt)
  on public.application_assessment to authenticated;

drop policy if exists "staff mark the writing" on public.application_assessment;
create policy "staff mark the writing"
  on public.application_assessment for update to authenticated
  using (public.has_permission('applications.view_all'))
  with check (public.has_permission('applications.view_all'));

-- --------------------------------------------------------------------------
-- Scoring, and the stage move
-- --------------------------------------------------------------------------

create or replace function public.score_assessment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  got      integer := 0;
  possible integer := 0;
  key      integer[];
  picked   integer;
  q        integer;
  axes     text[];
  eng      integer;
  cust     integer;
  dent     integer;
  ok       boolean := true;
begin
  -- Only when she sends it, and only once.
  if new.submitted_at is null or old.submitted_at is not null then
    return new;
  end if;

  -- ── the scenarios ──────────────────────────────────────────────────────
  -- generated by tools/assessment-items.mjs — do not edit by hand
  for q, key in
    select * from (values
      (0,  array[2, 0, 0, 1]),
      (1,  array[0, 1, 0, 2]),
      (2,  array[0, 1, 2, 0]),
      (3,  array[1, 2, 0, 0]),
      (4,  array[0, 1, 0, 2]),
      (5,  array[2, 0, 1, 0]),
      (6,  array[1, 2, 0, 0]),
      (7,  array[0, 0, 2, 2]),
      (8,  array[0, 1, 2, 0]),
      (9,  array[0, 0, 0, 2]),
      (10, array[2, 0, 0, 1]),
      (11, array[1, 2, 0, 0])
    ) as t(q, pts)
  loop
    possible := possible + 2;
    picked := nullif(new.scenario_answers -> q ->> 'p', '')::integer;
    -- A skipped or malformed answer scores nothing rather than raising: a
    -- half-finished assessment must still produce a row somebody can look at.
    if picked is not null and picked between 0 and 3 then
      got := got + key[picked + 1];
    end if;
  end loop;

  new.score_scenarios := case when possible = 0 then 0
                              else round((got::numeric / possible) * 10) end;

  -- ── typing ─────────────────────────────────────────────────────────────
  -- 40 wpm is the BPO floor and 95% the accuracy line. Accuracy gates rather
  -- than averages: 90 wpm at 80% is somebody producing work you have to redo.
  if coalesce(new.typing_accuracy, 0) < 95 then
    new.score_typing := least(4, greatest(0, round(coalesce(new.typing_wpm, 0)::numeric / 20)));
  else
    new.score_typing := least(10, greatest(0, round(coalesce(new.typing_wpm, 0)::numeric / 6)));
  end if;

  -- ── which axes this track is gated on ──────────────────────────────────
  axes := case new.track
            when 'Admin Tasks' then array['english', 'data_entry']
            else array['english', 'customer']
          end;

  eng  := new.score_typing;      -- until the writing is read, typing stands in
  cust := new.score_scenarios;
  dent := new.score_typing;

  if 'english'    = any(axes) and eng  < 7 then ok := false; end if;
  if 'customer'   = any(axes) and cust < 7 then ok := false; end if;
  if 'data_entry' = any(axes) and dent < 7 then ok := false; end if;

  new.verdict := case when ok then 'passed' else 'below_line' end;
  return new;
end
$fn$;

revoke all on function public.score_assessment() from public, anon, authenticated;

drop trigger if exists assessment_scored on public.application_assessment;
create trigger assessment_scored
  before update on public.application_assessment
  for each row execute function public.score_assessment();

-- --------------------------------------------------------------------------
-- Passing moves the stage — and that is all it does
-- --------------------------------------------------------------------------
--
-- Separate from the scoring trigger so the move is AFTER the row is stored.
-- Setting applications.status fires "notify-application-status" from 031, so
-- the interview email is the one that already exists and is already tested —
-- nothing new sends mail.

create or replace function public.advance_on_assessment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if new.verdict <> 'passed' or old.verdict = 'passed' then
    return new;
  end if;

  -- Only from assessment. Somebody already at interview or hired must not be
  -- walked backwards or forwards by a re-sit.
  update public.applications
     set status = 'interview',
         status_changed_at = now()
   where id = new.application_id
     and status = 'assessment';

  return new;
end
$fn$;

revoke all on function public.advance_on_assessment() from public, anon, authenticated;

drop trigger if exists assessment_advances on public.application_assessment;
create trigger assessment_advances
  after update on public.application_assessment
  for each row execute function public.advance_on_assessment();

-- --------------------------------------------------------------------------
-- Sending it
-- --------------------------------------------------------------------------
--
-- `submitted_at` is deliberately not in any grant: a page that could set it
-- could also decide when scoring runs, and scoring is what decides the
-- application. So finishing is a function rather than a column write, and it
-- takes no arguments at all — it works on the caller's own row and there is
-- no id to pass, which means there is no id to pass somebody else's.
--
-- It is the same shape as the rest of the SECURITY DEFINER functions here:
-- it checks who is asking rather than trusting what it is told.

create or replace function public.submit_assessment()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  target uuid;
begin
  if auth.uid() is null then
    raise exception 'sign in first';
  end if;

  select s.application_id into target
  from public.application_assessment s
  join public.applications a on a.id = s.application_id
  where a.user_id = auth.uid()
    and s.submitted_at is null
  order by s.started_at desc
  limit 1;

  if target is null then
    raise exception 'nothing of yours is open to send';
  end if;

  -- The update the page cannot make. Fires score_assessment(), which fires
  -- advance_on_assessment(), which sets the stage and lets 031 send the mail.
  update public.application_assessment
     set submitted_at = now()
   where application_id = target;
end
$fn$;

revoke all on function public.submit_assessment() from public, anon;
grant execute on function public.submit_assessment() to authenticated;

-- --------------------------------------------------------------------------
-- Stamped, the way every file since 044 is
-- --------------------------------------------------------------------------

insert into public.schema_migrations (n) values (45) on conflict (n) do nothing;

-- ==========================================================================
-- VERIFICATION — read-only, changes nothing
-- ==========================================================================

select a.name,
       a.status,
       s.track,
       s.attempt,
       s.typing_wpm,
       s.typing_accuracy,
       s.score_typing,
       s.score_scenarios,
       s.written_score,
       s.verdict,
       s.submitted_at::date as sent
from public.application_assessment s
join public.applications a on a.id = s.application_id
order by s.started_at desc
limit 100;
