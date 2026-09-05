-- DO NOT RE-RUN THIS FILE ON ITS OWN
--
-- The header below says this file is safe to re-run, and on its own it is:
-- every statement in it is written to be repeatable. What it is not safe to
-- do is run it AFTER the files that come later, because it defines a function
-- one of them has since replaced — and `create or replace` does exactly what
-- it says. Re-running this puts its own version back.
--
-- Nothing warns you when that happens. The schema looks perfect and the
-- behaviour is months old.
--
-- What this file would take back, and what to run afterwards to undo it:
--
--   score_assessment
--     -> re-run 063-the-verdict-does-not-wait.sql to restore
--
-- Re-running 049 puts the two human gates back in front of every verdict, so
-- assessments silently stop being graded until somebody checks them. That is
-- the old behaviour and it is not a broken one — but it is not the one that
-- was asked for, and nothing on any screen would say it had returned.
--
-- So if you ever run this file again, run every later file it names above,
-- in number order, straight afterwards. tools/check.mjs keeps this list
-- honest: a new file that supersedes something here fails the build until
-- this block names it.
-- 049 — four things, each measured by something that measures it
--
-- Run after: 048
-- Safe to re-run: yes
-- Also needed: nothing in the dashboard.
--
-- ==========================================================================
-- WHAT THIS IS FOR
-- ==========================================================================
--
-- The assessment is supposed to tell you four things about somebody: how
-- comfortable her English is, whether she notices detail, whether she can
-- sell, and how she handles a customer. Until this file, one of those was
-- measured and three were not.
--
--   english    was score_typing        — her typing speed
--   detail     was score_typing        — her typing speed, again
--   sales      was nothing at all      — the sales track was gated on customer
--   customer   was score_scenarios     — the only one that was true
--
-- A fast typist with weak English writes bad emails quickly. The two are
-- barely related, and every track is gated on english, so that one
-- substitution decided most of the assessment on a number about her fingers.
--
-- Three new banks of items, written in tools/assessment-items.mjs and keyed
-- here, now answer the three questions nothing was answering.
--
-- ==========================================================================
-- AND THE WORK SAMPLE FINALLY COUNTS
-- ==========================================================================
--
-- The written reply to an angry customer has been collected since 045 and has
-- never affected anything: written_score is filled in by staff after the
-- verdict has already been reached. It is a work sample — a piece of the
-- actual job, marked by a person — and that is about the most predictive thing
-- there is, roughly twice what multiple-choice judgement predicts on its own.
--
-- So english is now the average of two measures of the same thing: the eight
-- machine-marked items, and a human reading real work. That has a consequence
-- worth stating plainly, because it is the point rather than a side effect:
--
--   NOBODY PASSES UNTIL A PERSON HAS MARKED THE WRITING AND CHECKED THE TYPING.
--
-- Two human steps before anyone reaches Interview. That is deliberate. The
-- machine half is the half a chatbot can sit for her; the two human steps are
-- the half it cannot.

do $pre$
begin
  if to_regclass('public.application_assessment') is null then
    raise exception
      'sql/045 has not been run on this database. Run sql/045, then 048, then this one.';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_name = 'application_assessment'
                   and column_name = 'typing_verified_wpm') then
    raise exception
      'sql/048 has not been run on this database. It adds the checked typing figures that this file scores from. Run sql/048 first.';
  end if;
end
$pre$;

-- ==========================================================================
-- WHAT SHE ANSWERS
-- ==========================================================================
--
-- Positions, never scores, exactly as scenario_answers already works: the page
-- is sent the questions and their options in a fixed order and sends back
-- which one she picked. The points live below, in a function no browser can
-- reach. An assessment whose key ships in page source is not an assessment.

alter table public.application_assessment
  add column if not exists english_answers jsonb;

alter table public.application_assessment
  add column if not exists detail_answers jsonb;

alter table public.application_assessment
  add column if not exists sales_answers jsonb;

-- The connection check. Asked on the application form since 005 as a yes/no
-- nobody could verify; this is the link to a speed test somebody can open.
alter table public.application_assessment
  add column if not exists connection_proof text;

-- Filled in by the trigger. Never writable from a page.
alter table public.application_assessment
  add column if not exists score_english smallint;

alter table public.application_assessment
  add column if not exists score_detail smallint;

alter table public.application_assessment
  add column if not exists score_sales smallint;

alter table public.application_assessment drop constraint if exists assessment_new_scores_sane;
alter table public.application_assessment add constraint assessment_new_scores_sane check (
  coalesce(score_english, 0) between 0 and 10
  and coalesce(score_detail, 0) between 0 and 10
  and coalesce(score_sales, 0) between 0 and 10
  and coalesce(length(connection_proof), 0) <= 500
);

-- She may send her answers and her connection proof. She may not send a score
-- — those three columns appear in no grant at all, the same way score_typing
-- and score_scenarios never have.
grant update (
  typing_wpm, typing_accuracy, typing_proof, connection_proof,
  scenario_answers, english_answers, detail_answers, sales_answers,
  written_reply
) on public.application_assessment to authenticated;

-- ==========================================================================
-- THE SCORING, REPLACED AGAIN
-- ==========================================================================
--
-- 048's version is kept whole and extended rather than patched, because a
-- migration is never edited after it has run and this file has to carry its
-- own copy of everything it needs. The scenario key below is identical to the
-- one in 045 and 048; the other three are new.
--
-- All four keys are generated by tools/assessment-items.mjs, and
-- tools/check.mjs fails the build if this file and that one ever disagree.

create or replace function public.score_assessment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  q        integer;
  key      integer[];
  picked   integer;
  got      integer;
  possible integer;
  axes     text[];
  eng      integer;
  cust     integer;
  det      integer;
  sal      integer;
  ok       boolean := true;
  wpm      integer;
  acc      integer;
  checked  boolean;
  marked   boolean;
begin
  if new.submitted_at is null then
    return new;
  end if;

  -- Score on the send, and again whenever a person writes down something the
  -- verdict depends on: what the typing proof said, or what the writing was
  -- worth. Any other update leaves every number exactly as it was found.
  if old.submitted_at is not null
     and new.typing_verified_wpm is not distinct from old.typing_verified_wpm
     and new.typing_verified_accuracy is not distinct from old.typing_verified_accuracy
     and new.written_score is not distinct from old.written_score then
    return new;
  end if;

  -- ── the judgement scenarios ────────────────────────────────────────────
  -- generated by tools/assessment-items.mjs — do not edit by hand
  got := 0; possible := 0;
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
    if picked is not null and picked between 0 and 3 then
      got := got + key[picked + 1];
    end if;
  end loop;
  new.score_scenarios := case when possible = 0 then 0
                              else round((got::numeric / possible) * 10) end;

  -- ── english ────────────────────────────────────────────────────────────
  -- generated by tools/assessment-items.mjs — do not edit by hand
  got := 0; possible := 0;
  for q, key in
    select * from (values
      (0, array[2, 0, 0, 1]),
      (1, array[0, 2, 0, 1]),
      (2, array[0, 1, 0, 2]),
      (3, array[0, 2, 1, 0]),
      (4, array[2, 0, 0, 1]),
      (5, array[0, 1, 2, 0]),
      (6, array[0, 0, 2, 1]),
      (7, array[1, 0, 0, 2])
    ) as t(q, pts)
  loop
    possible := possible + 2;
    picked := nullif(new.english_answers -> q ->> 'p', '')::integer;
    if picked is not null and picked between 0 and 3 then
      got := got + key[picked + 1];
    end if;
  end loop;
  new.score_english := case when possible = 0 then 0
                            else round((got::numeric / possible) * 10) end;

  -- ── detail ─────────────────────────────────────────────────────────────
  -- generated by tools/assessment-items.mjs — do not edit by hand
  got := 0; possible := 0;
  for q, key in
    select * from (values
      (0, array[2, 0, 0, 0]),
      (1, array[0, 2, 0, 0]),
      (2, array[0, 0, 2, 0]),
      (3, array[0, 0, 2, 0]),
      (4, array[0, 0, 0, 2]),
      (5, array[2, 0, 0, 1]),
      (6, array[0, 0, 0, 2]),
      (7, array[1, 2, 0, 0])
    ) as t(q, pts)
  loop
    possible := possible + 2;
    picked := nullif(new.detail_answers -> q ->> 'p', '')::integer;
    if picked is not null and picked between 0 and 3 then
      got := got + key[picked + 1];
    end if;
  end loop;
  new.score_detail := case when possible = 0 then 0
                           else round((got::numeric / possible) * 10) end;

  -- ── sales ──────────────────────────────────────────────────────────────
  -- Only the sales track is asked these, so an empty bank is an ordinary
  -- state rather than a zero somebody earned. It scores 0 and gates nothing,
  -- because sales is not in any other track's axes.
  -- generated by tools/assessment-items.mjs — do not edit by hand
  got := 0; possible := 0;
  for q, key in
    select * from (values
      (0, array[0, 2, 1, 0]),
      (1, array[2, 0, 0, 1]),
      (2, array[0, 0, 2, 0]),
      (3, array[2, 0, 0, 1]),
      (4, array[0, 0, 1, 2]),
      (5, array[0, 0, 2, 1]),
      (6, array[0, 2, 0, 1]),
      (7, array[0, 0, 0, 2])
    ) as t(q, pts)
  loop
    possible := possible + 2;
    picked := nullif(new.sales_answers -> q ->> 'p', '')::integer;
    if picked is not null and picked between 0 and 3 then
      got := got + key[picked + 1];
    end if;
  end loop;
  new.score_sales := case when possible = 0 then 0
                          else round((got::numeric / possible) * 10) end;

  -- ── typing ─────────────────────────────────────────────────────────────
  -- Still recorded, no longer standing in for anything. The checked figure
  -- wins where there is one.
  checked := new.typing_verified_wpm is not null or new.typing_verified_accuracy is not null;
  wpm := coalesce(new.typing_verified_wpm, new.typing_wpm, 0);
  acc := coalesce(new.typing_verified_accuracy, new.typing_accuracy, 0);

  if acc < 95 then
    new.score_typing := least(4, greatest(0, round(wpm::numeric / 20)));
  else
    new.score_typing := least(10, greatest(0, round(wpm::numeric / 6)));
  end if;

  -- ── the four axes ──────────────────────────────────────────────────────
  --
  -- english is the average of the two things that measure it: eight items a
  -- machine marks, and a person reading a real reply to a real customer. They
  -- disagree sometimes, and when they do the average is a better answer than
  -- either — which is the entire argument for having both.
  marked := new.written_score is not null;

  eng  := case when marked
               then round((coalesce(new.score_english, 0) + new.written_score)::numeric / 2)
               else coalesce(new.score_english, 0) end;
  cust := coalesce(new.score_scenarios, 0);
  det  := coalesce(new.score_detail, 0);
  sal  := coalesce(new.score_sales, 0);

  axes := case new.track
            when 'Admin Tasks'       then array['english', 'detail']
            when 'Sales & Marketing' then array['english', 'sales', 'customer']
            else array['english', 'customer']
          end;

  if 'english'  = any(axes) and eng  < 7 then ok := false; end if;
  if 'customer' = any(axes) and cust < 7 then ok := false; end if;
  if 'detail'   = any(axes) and det  < 7 then ok := false; end if;
  if 'sales'    = any(axes) and sal  < 7 then ok := false; end if;

  -- Typing is a floor rather than an axis. 40 wpm is the BPO floor and 95% the
  -- accuracy line; below either, the work comes back for somebody to redo.
  if wpm < 40 or acc < 95 then ok := false; end if;

  -- ── the verdict ────────────────────────────────────────────────────────
  --
  -- Two human steps stand between an assessment and a pass, and neither is
  -- optional. Until both have happened the row sits at 'in_progress', which is
  -- not a failure and declines nobody — it is the row saying it is waiting on
  -- us rather than on her.
  if not checked or not marked then
    new.verdict := 'in_progress';
  else
    new.verdict := case when ok then 'passed' else 'below_line' end;
  end if;

  return new;
end
$fn$;

revoke all on function public.score_assessment() from public, anon, authenticated;

drop trigger if exists assessment_scored on public.application_assessment;
create trigger assessment_scored
  before update on public.application_assessment
  for each row execute function public.score_assessment();

-- ==========================================================================
-- Check it worked
-- ==========================================================================

-- She may send answers. She may not send a score. None of score_english,
-- score_detail, score_sales, score_typing or score_scenarios may appear here.
select column_name, privilege_type
from information_schema.column_privileges
where table_name = 'application_assessment'
  and grantee = 'authenticated'
  and privilege_type = 'UPDATE'
order by column_name;

-- Who is waiting on somebody here. Two columns to fill in, and the row says
-- which of them is missing.
select a.name, a.email, s.track,
       s.submitted_at::date as sent,
       s.score_english, s.score_detail, s.score_sales, s.score_scenarios,
       case when s.typing_verified_wpm is null then 'typing not checked' end as typing,
       case when s.written_score is null then 'writing not marked' end as writing,
       s.verdict
from public.application_assessment s
join public.applications a on a.id = s.application_id
where s.submitted_at is not null
  and (s.typing_verified_wpm is null or s.written_score is null)
order by s.submitted_at;

insert into public.schema_migrations (n) values (49) on conflict (n) do nothing;
