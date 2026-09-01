-- 054 — finished is not the same as started
--
-- Run after: 053
-- Safe to re-run: yes
-- Also needed: nothing in the dashboard.
--
-- ==========================================================================
-- A PART MARKED DONE AFTER ONE ANSWER
-- ==========================================================================
--
-- The page decides whether a part is finished by looking at whether its
-- answers column holds anything:
--
--   done.english = s && s.english_answers
--
-- That was true for as long as the answers were only written when she pressed
-- Done. 051 changed it: answers now save as she goes, so the deadline running
-- out while the tab is shut costs her the questions she had not reached rather
-- than all of them.
--
-- Which means the FIRST answer she picks writes that column. Two and a half
-- seconds later the part is marked finished, the Start button is gone, and she
-- cannot get back into it. One question of eight, and the part is over.
--
-- Caught by walking the pages rather than by reading them: answer one, reload,
-- and English is done. The whole of 051 made this worse — before it, nothing
-- was written until she finished, so there was nothing to misread.
--
-- ==========================================================================
-- SO RECORD FINISHING, RATHER THAN INFERRING IT
-- ==========================================================================
--
-- The same shape as part_opened in 051, for the same reason: the page cannot
-- be trusted to say when a part is over any more than it can be trusted to say
-- when one began. Written by a function, readable by the two people who can
-- already see the row, and in no grant at all.
--
-- The two together now say the whole story of a part — when it was opened, and
-- whether it was finished — and neither is a guess about the other.

do $pre$
begin
  if to_regclass('public.application_assessment') is null then
    raise exception
      'sql/045 has not been run on this database. Run 045, 048, 049, 050 and 051 first.';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_name = 'application_assessment'
                   and column_name = 'part_opened') then
    raise exception
      'sql/051 has not been run on this database. It adds part_opened, which this file is the other half of.';
  end if;
end
$pre$;

alter table public.application_assessment
  add column if not exists part_done jsonb not null default '{}'::jsonb;

-- In no grant, like part_opened. 045 grants UPDATE column by column, so a
-- column added afterwards is in none of those lists — stated here and proved
-- by the check at the bottom.

create or replace function public.close_part(part text)
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  target uuid;
  already timestamptz;
  -- typing is here and not in open_part's list on purpose: it has no clock,
  -- because it is a form for reporting a result from another site rather than
  -- something taken here. It still has to be markable as finished.
  known text[] := array['english', 'scenarios', 'detail', 'sales', 'written', 'typing'];
begin
  if auth.uid() is null then
    raise exception 'sign in first';
  end if;

  if not (part = any(known)) then
    raise exception 'no such part: %', part;
  end if;

  select s.application_id, s.part_done ->> part
    into target, already
  from public.application_assessment s
  where public.owns_application(s.application_id)
    and s.submitted_at is null
  order by s.started_at desc
  limit 1;

  if target is null then
    raise exception 'nothing of yours is open';
  end if;

  -- Finishing a part twice is finishing it once. Returning the original moment
  -- rather than a new one keeps the record of when she actually stopped.
  if already is not null then
    return already;
  end if;

  update public.application_assessment
     set part_done = part_done || jsonb_build_object(part, now())
   where application_id = target;

  return now();
end;
$fn$;

revoke all on function public.close_part(text) from public, anon;
grant execute on function public.close_part(text) to authenticated;

-- ==========================================================================
-- Check it worked
-- ==========================================================================

-- Neither of the two things a part knows about itself may be WRITTEN by a
-- page. Reading them is fine and expected — 045 grants SELECT on this table as
-- a whole, so leaving the privilege_type filter off lists both as readable and
-- reads like a failure when nothing is wrong. This asks the question it means.
-- Empty is the pass.
select column_name, privilege_type
from information_schema.column_privileges
where table_name = 'application_assessment'
  and grantee in ('anon', 'authenticated')
  and privilege_type = 'UPDATE'
  and column_name in ('part_opened', 'part_done');

-- Where everybody mid-assessment has actually got to. A part that is opened
-- and not done is one somebody is sitting in, or walked away from; before this
-- file it was indistinguishable from a part they had finished.
select a.name, s.track,
       (select count(*) from jsonb_object_keys(s.part_opened)) as parts_opened,
       (select count(*) from jsonb_object_keys(s.part_done))   as parts_finished,
       s.submitted_at
from public.application_assessment s
join public.applications a on a.id = s.application_id
where s.submitted_at is null
order by s.started_at;

insert into public.schema_migrations (n) values (54) on conflict (n) do nothing;
