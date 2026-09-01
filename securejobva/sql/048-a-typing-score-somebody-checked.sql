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
--
-- So if you ever run this file again, run every later file it names above,
-- in number order, straight afterwards. tools/check.mjs keeps this list
-- honest: a new file that supersedes something here fails the build until
-- this block names it.
-- 048 — a typing score somebody checked
--
-- Run after: 045, which is the one that matters — see the check below.
-- Safe to re-run: yes
-- Also needed: nothing in the dashboard.
--
-- ==========================================================================
-- BEFORE ANYTHING ELSE
-- ==========================================================================
--
-- This file changes the assessment table. 045 is the file that CREATES it, and
-- the numbers in this folder are an order, not a promise that anybody followed
-- it — 046 and 047 touch none of this and run perfectly well on a database
-- where 045 never did.
--
-- So when 045 has been skipped, the first statement below fails with
--
--   ERROR: 42P01: relation "public.application_assessment" does not exist
--
-- which is Postgres saying "no" without saying what to do about it. The block
-- below says it instead. It costs four lines and it is the difference between
-- a two-minute fix and reading a migration to work out what it wanted.

do $pre$
begin
  if to_regclass('public.application_assessment') is null then
    raise exception
      'sql/045 has not been run on this database. It creates the assessment table that this file changes. Run sql/045-the-assessment.sql first, then this one.';
  end if;
end
$pre$;

-- ==========================================================================
-- THE NUMBER THAT DECIDED AN APPLICATION AND CAME FROM THE APPLICANT
-- ==========================================================================
--
-- 045 built the typing test into the page, and the page reported the result.
-- Two things followed from that, and neither was visible from anywhere.
--
-- The first was that the passage sat selectable on the screen directly above
-- the box it had to be typed into. Copy, paste, done: the text matched
-- character for character so accuracy scored 100, the elapsed time was about a
-- second so the words-per-minute floor took over, and the result was a clamped
-- 250 wpm. A perfect typing score, in two keystrokes. That is now blocked in
-- the page, and the page also counts keystrokes so text that arrives without
-- being typed earns nothing.
--
-- The second is the one a page cannot fix. score_typing is worked out from
-- typing_wpm and typing_accuracy, and those two columns are granted to the
-- applicant because the page has to write them. Anybody who can open a browser
-- console can send whatever numbers they like. And for the Admin Tasks track
-- that decides the whole assessment on its own, because both axes it is gated
-- on read from the typing figure — so a made-up number produced a verdict of
-- 'passed' and walked the application to Interview.
--
-- ==========================================================================
-- WHAT CHANGES
-- ==========================================================================
--
-- The typing test moves to a platform of its own. She does it there, enters
-- what she scored, and links the proof. Somebody here opens the proof and
-- writes down what it actually says.
--
-- So there are now two typing figures on the row and they mean different
-- things:
--
--   typing_wpm, typing_accuracy                    what she says she scored
--   typing_verified_wpm, typing_verified_accuracy  what somebody here read
--
-- The scoring uses the verified pair when it is there. And the verdict is not
-- reached at all until it is: an unverified assessment sits at 'in_progress'
-- rather than passing on a number nobody has looked at. advance_on_assessment
-- already fires only on a pass, so nothing walks itself to Interview any more.
--
-- The claimed figure is kept rather than overwritten. If the two disagree,
-- that disagreement is worth having on the row.

alter table public.application_assessment
  add column if not exists typing_proof text;

alter table public.application_assessment
  add column if not exists typing_verified_wpm smallint;

alter table public.application_assessment
  add column if not exists typing_verified_accuracy smallint;

alter table public.application_assessment
  add column if not exists typing_verified_by text;

alter table public.application_assessment
  add column if not exists typing_verified_at timestamptz;

alter table public.application_assessment drop constraint if exists assessment_typing_sane;
alter table public.application_assessment add constraint assessment_typing_sane check (
  coalesce(length(typing_proof), 0) <= 500
  and coalesce(typing_verified_wpm, 0) between 0 and 250
  and coalesce(typing_verified_accuracy, 0) between 0 and 100
  and coalesce(length(typing_verified_by), 0) <= 320
);

-- ==========================================================================
-- WHO WRITES WHICH OF THE TWO
-- ==========================================================================
--
-- The whole point of this file is in these two grants. She may write what she
-- scored and where the proof is. She may not write what somebody here read,
-- and staff may not write what she claimed — so the row keeps both accounts
-- and neither party can quietly become the other.

grant update (typing_wpm, typing_accuracy, typing_proof, scenario_answers, written_reply)
  on public.application_assessment to authenticated;

grant update (typing_verified_wpm, typing_verified_accuracy)
  on public.application_assessment to authenticated;

-- typing_verified_by and typing_verified_at appear in no grant at all. They
-- are the record of who checked a proof, and 030, 042, 028, 008 and 046 all
-- say the same thing about a record like that: a field the browser fills is a
-- field the browser can choose. The trigger below stamps them.
--
-- The policies from 045 already fence the rows — she may only update her own
-- and only while it is unsent, staff may update any. Nothing about that
-- changes, so nothing here re-states it.

create or replace function public.stamp_typing_check()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if new.typing_verified_wpm is distinct from old.typing_verified_wpm
  or new.typing_verified_accuracy is distinct from old.typing_verified_accuracy then
    if new.typing_verified_wpm is null and new.typing_verified_accuracy is null then
      -- Cleared, which is how a wrong reading is taken back.
      new.typing_verified_by := null;
      new.typing_verified_at := null;
    else
      new.typing_verified_by := coalesce(auth.jwt() ->> 'email', 'somebody');
      new.typing_verified_at := now();
    end if;
  else
    new.typing_verified_by := old.typing_verified_by;
    new.typing_verified_at := old.typing_verified_at;
  end if;
  return new;
end;
$fn$;

revoke all on function public.stamp_typing_check() from public, anon, authenticated;

-- Before the scorer, so the scorer sees the stamp it is about to score from.
-- Postgres fires same-timing triggers in name order, and 'a_' sorts before
-- 'assessment_scored'.
drop trigger if exists a_typing_check_stamp on public.application_assessment;
create trigger a_typing_check_stamp
  before update on public.application_assessment
  for each row execute function public.stamp_typing_check();

-- ==========================================================================
-- THE SCORING, REPLACED
-- ==========================================================================
--
-- Two changes from 045, and the scenario key below is copied across unchanged
-- because a migration is never edited after it has run and this file has to
-- carry its own copy.
--
--   1  It runs again when a verified figure is written, not only on submit.
--      Without that, checking a proof would change nothing.
--
--   2  It refuses to reach a verdict on an unverified typing figure. Every
--      track is gated on english, english reads from typing, so this applies
--      to all of them rather than only to Admin Tasks.

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
  wpm      integer;
  acc      integer;
  checked  boolean;
begin
  -- Nothing to score until it is sent.
  if new.submitted_at is null then
    return new;
  end if;

  -- Score on the send itself, and again whenever somebody writes down what a
  -- proof actually said. Any other update — a note, a written score — leaves
  -- these numbers exactly as they were found.
  if old.submitted_at is not null
     and new.typing_verified_wpm is not distinct from old.typing_verified_wpm
     and new.typing_verified_accuracy is not distinct from old.typing_verified_accuracy then
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
    if picked is not null and picked between 0 and 3 then
      got := got + key[picked + 1];
    end if;
  end loop;

  new.score_scenarios := case when possible = 0 then 0
                              else round((got::numeric / possible) * 10) end;

  -- ── typing ─────────────────────────────────────────────────────────────
  -- The checked figure wins where there is one. Where there is not, the
  -- claimed figure is still scored — so the row shows what she would get if
  -- the proof holds up — but the verdict below refuses to act on it.
  checked := new.typing_verified_wpm is not null or new.typing_verified_accuracy is not null;
  wpm := coalesce(new.typing_verified_wpm, new.typing_wpm, 0);
  acc := coalesce(new.typing_verified_accuracy, new.typing_accuracy, 0);

  -- 40 wpm is the BPO floor and 95% the accuracy line. Accuracy gates rather
  -- than averages: 90 wpm at 80% is somebody producing work you have to redo.
  if acc < 95 then
    new.score_typing := least(4, greatest(0, round(wpm::numeric / 20)));
  else
    new.score_typing := least(10, greatest(0, round(wpm::numeric / 6)));
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

  -- The half this file exists for. Every track is gated on english and english
  -- reads from typing, so no track may be decided until a person has opened
  -- the proof. 'in_progress' is not a failure and does not decline anybody —
  -- it is the row saying it is waiting on us rather than on her.
  if not checked then
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

-- She may write what she claims. She may NOT write what was checked.
-- typing_verified_by and typing_verified_at must appear in neither list.
select column_name, privilege_type
from information_schema.column_privileges
where table_name = 'application_assessment'
  and grantee = 'authenticated'
  and column_name like 'typing%'
order by column_name;

-- Both triggers, in the order that matters: the stamp runs before the scorer.
select tgname
from pg_trigger
where tgrelid = 'public.application_assessment'::regclass and not tgisinternal
order by tgname;

-- Who is waiting on somebody here to open a proof. Anything in this list is an
-- applicant who has finished and is sitting at 'in_progress' because nobody
-- has checked her typing yet.
select a.name, a.email, s.track, s.submitted_at::date as sent,
       s.typing_wpm as claimed_wpm, s.typing_accuracy as claimed_acc,
       s.typing_proof
from public.application_assessment s
join public.applications a on a.id = s.application_id
where s.submitted_at is not null
  and s.typing_verified_wpm is null
order by s.submitted_at;

insert into public.schema_migrations (n) values (48) on conflict (n) do nothing;
