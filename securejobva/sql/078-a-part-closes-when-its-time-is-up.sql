-- 078 — a part closes when its time is up
--
-- Run after: 077
-- Safe to re-run: yes
-- Also needed: nothing in the dashboard.
--
-- ==========================================================================
-- THE CLOCK WAS A RECORD, NOT A RULE
-- ==========================================================================
--
-- 051 moved the start of each part's clock into the database (part_opened),
-- and 054 did the same for its end (part_done). Both are honest records. What
-- neither does is stop anything: the only rule on the applicant's writes is
-- 045's policy, "her row, and not yet sent". So once a part has closed — or
-- its time has run out — she can still send
--
--   PATCH /rest/v1/application_assessment?application_id=eq.<hers>
--         {"english_answers": [ ...the answers she looked up afterwards... ]}
--
-- and it is accepted, because submitted_at is still null. The eight-minute
-- English part is an eight-minute part only for somebody who does not open a
-- console. On Send, score_assessment grades whatever the column holds.
--
-- ==========================================================================
-- THE RULE, PER PART
-- ==========================================================================
--
-- Each answer column belongs to one part, and the limits are the ones
-- status.html already runs its clock on (bankPart and writtenPart):
--
--   part        column              minutes
--   scenarios   scenario_answers    20
--   english     english_answers      8
--   detail      detail_answers      10
--   sales       sales_answers        8
--   written     written_reply       20
--   typing      typing_wpm, typing_accuracy, typing_proof, connection_proof
--                                   (no clock — 054 explains why)
--
-- A column may change only while its part is open:
--
--   not yet opened     no, and refused out loud. A timed part's answers
--                      written before its clock started are answers written
--                      with no clock at all. (Typing has no clock, so this
--                      does not apply to it.)
--   opened, running    yes, up to the limit plus two minutes' grace.
--   done               no, by keeping the old value (see below).
--   out of time        no, by keeping the old value (see below).
--
-- The grace is for the last save, not for the applicant. The page's timer
-- fires on the browser's clock (N29) and its final save is a network request
-- after that; a device a minute fast or a slow connection must not lose the
-- answers she picked in the last few seconds. Two minutes on an eight-minute
-- part is generous, and still nowhere near enough to look anything up.
--
-- ==========================================================================
-- WHY THIS ONE PUTS THE OLD VALUE BACK INSTEAD OF RAISING
-- ==========================================================================
--
-- 064 raises, and says why: a refusal that quietly succeeds teaches somebody
-- probing that nothing is watching. That is right for 064's columns, which
-- nobody but staff ever writes. It is wrong here, because the page itself
-- writes these columns AT the deadline, every time:
--
--   the timer reaches zero and clicks Done   closePart() saves the answers,
--                                            THEN calls close_part()
--   she comes back after the time ran out    the page saves what she had and
--                                            closes the part
--
-- If that save raised, closePart() would stop before close_part(), the part
-- would never be marked done, and every visit after would hit the same wall —
-- an applicant locked in front of a part she cannot finish. Keeping the value
-- that was there at the deadline lets the save "succeed", close_part() runs,
-- and the part ends with exactly the answers she had in time. That is the
-- rule the page already describes to her ("closed with the answers you had"),
-- now true on the server as well.
--
-- ==========================================================================
-- AND WHY "NEVER OPENED" RAISES ANYWAY
-- ==========================================================================
--
-- The argument above is about a part whose clock ran. A part that was never
-- opened is a different case, and keeping the old value there loses work
-- without a word. The page reaches it one way: status.html's openPart()
-- fails open. If rpc/open_part does not come back, it runs the clock from the
-- device's time and shows the questions anyway — the right call before this
-- file, when the worst it cost was a longer deadline. With a silent revert
-- here, every answer she saved for that part would "succeed" with a 2xx and
-- be put back to nothing, and she would sit the whole part to hand in an
-- empty column.
--
-- So that case raises, with hint sjva-part-not-open, and the page's own
-- error path (closePart shows any sjva- message) tells her. The page is also
-- being changed not to fail open: if open_part fails it keeps the questions
-- hidden and asks her to try again, so she never answers into a part the
-- database does not know is running. This raise is what stops the loss if
-- that ever regresses. It cannot lock anybody in the way the header
-- describes, because opening the part again (a reload) is what stamps
-- part_opened, and after that the ordinary rule applies.
--
-- WHO IT APPLIES TO. A request from a page (current_user 'authenticated')
-- that is not staff. current_user rather than the token for the reason 074
-- gives at length: submit_assessment() and the other definer functions run as
-- their owner, and the SQL editor runs as postgres — none of those are her
-- editing her answers. Staff (applications.view_all, the permission 064 uses
-- for this table) are let through as well; they have no page that writes
-- these columns, and a person fixing a row by hand should not be fought.

do $pre$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'application_assessment'
      and column_name = 'part_done'
  ) then
    raise exception
      'sql/054 has not been run on this database. It adds part_done, which this file reads.';
  end if;
end
$pre$;

create or replace function public.assessment_part_is_open()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $fn$
declare
  lim    record;
  opened timestamptz;
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if public.has_permission('applications.view_all') then
    return new;
  end if;

  -- The five timed parts. Written as a VALUES list so the table in the header
  -- and the rule are the same shape to read.
  for lim in
    select * from (values
      ('scenarios', 20),
      ('english',    8),
      ('detail',    10),
      ('sales',      8),
      ('written',   20)
    ) as t(part, minutes)
  loop
    -- Unchanged columns are never touched, so this only ever decides about
    -- the one she is actually writing.
    if (lim.part = 'scenarios' and new.scenario_answers is not distinct from old.scenario_answers)
       or (lim.part = 'english' and new.english_answers is not distinct from old.english_answers)
       or (lim.part = 'detail'  and new.detail_answers  is not distinct from old.detail_answers)
       or (lim.part = 'sales'   and new.sales_answers   is not distinct from old.sales_answers)
       or (lim.part = 'written' and new.written_reply   is not distinct from old.written_reply) then
      continue;
    end if;

    opened := nullif(old.part_opened ->> lim.part, '')::timestamptz;

    -- Never opened: refused out loud, not kept quietly. See "AND WHY NEVER
    -- OPENED RAISES ANYWAY" in the header — a quiet revert here is a whole
    -- part of answers thrown away behind a 2xx.
    if opened is null and not (old.part_done ? lim.part) then
      raise exception 'this part''s clock never started, so its answers cannot be saved. Reload the page and open the part again.'
        using hint = 'sjva-part-not-open';
    end if;

    if opened is null
       or old.part_done ? lim.part
       or now() > opened + make_interval(mins => lim.minutes + 2) then
      -- Keep what was there when the part closed. See the header.
      if lim.part = 'scenarios' then new.scenario_answers := old.scenario_answers;
      elsif lim.part = 'english' then new.english_answers := old.english_answers;
      elsif lim.part = 'detail'  then new.detail_answers  := old.detail_answers;
      elsif lim.part = 'sales'   then new.sales_answers   := old.sales_answers;
      elsif lim.part = 'written' then new.written_reply   := old.written_reply;
      end if;
    end if;
  end loop;

  -- Typing has no clock, only an end. Once she has saved that part, the four
  -- figures she reported are what staff check the screenshot against, and
  -- changing them afterwards would be changing the claim under the proof.
  if old.part_done ? 'typing' then
    new.typing_wpm       := old.typing_wpm;
    new.typing_accuracy  := old.typing_accuracy;
    new.typing_proof     := old.typing_proof;
    new.connection_proof := old.connection_proof;
  end if;

  return new;
end;
$fn$;

revoke all on function public.assessment_part_is_open() from public, anon, authenticated;

-- The name sorts after 064's assessment_figures_are_staff_only and before
-- assessment_scored. Neither order matters: this only rewrites answer columns
-- on an unsent row, and the scorer only runs on the send, which is a definer
-- path this function lets straight through.
drop trigger if exists assessment_part_is_open on public.application_assessment;
create trigger assessment_part_is_open
  before update on public.application_assessment
  for each row execute function public.assessment_part_is_open();

-- ==========================================================================
-- THE SERVER'S CLOCK, FOR THE PAGE
-- ==========================================================================
--
-- The other half of N29. status.html compares a deadline the server stamped
-- with Date.now() from the device, so a phone whose clock runs five minutes
-- fast closes every part five minutes early — on opening, if it is far enough
-- out. The page needs to know how far its clock is from this one, and there
-- was nothing to ask. There is now: one number, the database's now().
--
-- Invoker, signed-in only, and it reads nothing about anybody.

create or replace function public.server_time()
returns timestamptz
language sql
stable
security invoker
set search_path = public, pg_temp
as $fn$
  select now();
$fn$;

revoke all on function public.server_time() from public, anon;
grant execute on function public.server_time() to authenticated;

-- ==========================================================================
-- Check it worked
-- ==========================================================================

-- On, and SECURITY INVOKER (false below). A definer here would make
-- current_user the owner for everybody and the rule would apply to nobody.
select t.tgname, p.prosecdef as is_security_definer
from pg_trigger t
join pg_proc p on p.oid = t.tgfoid
where t.tgname = 'assessment_part_is_open';

-- What it would have stopped: unsent rows whose answer columns hold something
-- for a part that was never opened. Anything here was written with no clock
-- running. Read it rather than acting on it — before 051 nothing was opened at
-- all, so an old row can be here innocently.
select a.name, s.track,
       (s.english_answers  is not null and not (s.part_opened ? 'english'))   as english_unopened,
       (s.scenario_answers is not null and not (s.part_opened ? 'scenarios')) as scenarios_unopened,
       (s.detail_answers   is not null and not (s.part_opened ? 'detail'))    as detail_unopened,
       (s.sales_answers    is not null and not (s.part_opened ? 'sales'))     as sales_unopened,
       (s.written_reply    is not null and not (s.part_opened ? 'written'))   as written_unopened
from public.application_assessment s
join public.applications a on a.id = s.application_id
where s.submitted_at is null;

insert into public.schema_migrations (n) values (78) on conflict (n) do nothing;
