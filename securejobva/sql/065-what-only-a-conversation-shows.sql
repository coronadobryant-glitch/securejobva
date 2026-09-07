-- DO NOT RE-RUN THIS FILE ON ITS OWN
--
-- Every statement in it is repeatable, so on its own it is safe. What it is
-- not safe to do is run it AFTER the file that comes later.
--
-- What this file would take back, and what to run afterwards to undo it:
--
--   stamp_scorer
--     -> re-run 072-erasing-a-scorecard-unsigns-it.sql to restore
--
-- 065's version stamps scored_by on any change to a score column, including
-- the change that clears the last one. Erasing a scorecard then signs it:
-- every box empty, and a line underneath saying who scored it. 050 already
-- handled that for the written mark; 065 copied the stamp and not the
-- erasure.
--
-- The view and the columns this file adds are not affected, and nothing
-- replaces them.
--
-- tools/check.mjs keeps this list honest.

-- 065 — scoring the interview on what only a conversation shows

-- Run after: 061 (the view this replaces), 063, 064
-- Safe to re-run: yes
-- Also needed: nothing in the dashboard.
--
-- ==========================================================================
-- WHAT WAS WRONG WITH THE OLD SCORECARD
-- ==========================================================================
--
-- 008 added five interview scores: english, customer, data_entry, social and
-- bookkeeping, each 1 to 10. It was written before tracks existed and was
-- never joined to them, so three things were true of it at once:
--
--   1. It asked about work nobody applies for. There is no Bookkeeping track
--      and no Social Media track — the site offers three jobs, Customer
--      Service, Sales & Marketing and Admin Tasks — so two of the five boxes
--      were about a business this one is not.
--
--   2. It re-marked what a machine had already marked better. Since 049 the
--      assessment scores english, customer, detail and sales from her actual
--      answers, before anybody speaks to her. Typing it again out of ten after
--      a call is a second, worse opinion of the same thing.
--
--   3. It had no anchors. 1 to 10, no written levels, so nobody's 7 meant what
--      anybody else's 7 meant — including the same person's 7 a month later.
--
-- ==========================================================================
-- WHAT AN INTERVIEW IS ACTUALLY FOR HERE
-- ==========================================================================
--
-- The five things below are the ones nothing else in this product can see. The
-- assessment cannot, the screenshots cannot, and the speed test cannot:
--
--   spoken English    The assessment tests WRITTEN english — eight multiple
--                     choice questions and a typed reply. A virtual assistant
--                     is on client calls. Nothing in this product has ever
--                     measured whether she can hold one.
--
--   setup             The speedtest link proves bandwidth and nothing else.
--                     It does not prove a headset that works, a room without
--                     a television in it, or a camera a client can look at.
--                     Video shows all three in the first ten seconds.
--
--   reliability       Whether she came on time, gave notice, and turned up
--                     ready. is_ghosted already tracks the same instinct on
--                     the queue; this is the interview's half of it.
--
--   tools             Whether she can use software. Not the room and not the
--                     hardware — those are 'setup' — but learning a client's
--                     CRM, living in a spreadsheet, and fixing her own problem
--                     at six in the morning with nobody to ask. For somebody
--                     working alone in another country it is the difference
--                     between a person you manage and a person you hand things
--                     to, and nothing in this product has asked about it.
--
--   own answers       status.html says it in the comment on the paste guard:
--                     "the real defence is the interviewer asking her about
--                     two of her own answers". The written reply and the
--                     typing screenshot are both things she supplies. This is
--                     where that gets checked, and until now there was nowhere
--                     to write down how it went.
--
-- Then the job. One score per track she applied for, and only those — the
-- three the site actually offers.
--
-- ==========================================================================
-- WHY 1 TO 5 AND NOT 1 TO 10
-- ==========================================================================
--
-- Rating scales of two to four points test poorly for reliability, and ten
-- point scales compress at the top: everybody good lands between 7 and 9 and
-- stops being distinguishable, which is the half of the scale a hiring
-- decision is actually made in. Five points with WRITTEN anchors is the
-- standard recommendation for an interview scorecard, and the anchors are the
-- part that does the work — a number without them is an opinion wearing a
-- uniform.
--
-- The anchors themselves live with the interviewer rather than in the
-- database, because they are prose and they will be edited. The database's job
-- is to refuse a 6.

do $pre$
begin
  if to_regclass('public.application_tracking') is null then
    raise exception
      'sql/006 has not been run on this database. It creates application_tracking, which this file adds to.';
  end if;
end
$pre$;

-- ==========================================================================
-- THE FIVE A CONVERSATION SHOWS
-- ==========================================================================

alter table public.application_tracking add column if not exists iv_spoken      smallint;
alter table public.application_tracking add column if not exists iv_setup       smallint;
alter table public.application_tracking add column if not exists iv_reliability smallint;
alter table public.application_tracking add column if not exists iv_tools       smallint;
alter table public.application_tracking add column if not exists iv_answers     smallint;

-- ==========================================================================
-- AND ONE PER JOB, BECAUSE THERE ARE THREE JOBS
-- ==========================================================================
--
-- Named after the tracks on /careers rather than after a skill, so that adding
-- a fourth job is a column and a line in the page, and so that nobody has to
-- remember that "data entry" meant Admin Tasks.

alter table public.application_tracking add column if not exists iv_customer_service smallint;
alter table public.application_tracking add column if not exists iv_admin_tasks      smallint;
alter table public.application_tracking add column if not exists iv_sales_marketing  smallint;

-- One to five, or null for not asked. Null and zero stayed different in 008 and
-- stay different here: zero is a judgement, null is that nobody made one. Zero
-- is simply not on the scale at all.
alter table public.application_tracking drop constraint if exists application_tracking_iv_valid;
alter table public.application_tracking add constraint application_tracking_iv_valid check (
  (iv_spoken           is null or iv_spoken           between 1 and 5) and
  (iv_setup            is null or iv_setup            between 1 and 5) and
  (iv_reliability      is null or iv_reliability      between 1 and 5) and
  (iv_tools            is null or iv_tools            between 1 and 5) and
  (iv_answers          is null or iv_answers          between 1 and 5) and
  (iv_customer_service is null or iv_customer_service between 1 and 5) and
  (iv_admin_tasks      is null or iv_admin_tasks      between 1 and 5) and
  (iv_sales_marketing  is null or iv_sales_marketing  between 1 and 5)
);

-- ==========================================================================
-- 008'S FIVE COLUMNS ARE LEFT WHERE THEY ARE
-- ==========================================================================
--
-- Not dropped. Every one of them is null on every application — checked before
-- writing this — so nothing is being preserved except the habit: a migration
-- that drops columns is the one that cannot be undone by re-running it, and
-- this file is meant to be safe to re-run. They stop being written and stop
-- being read, which is the whole of what "removed" needs to mean here.
--
-- If they are still null in six months, drop them then, in a file that says so.

-- ==========================================================================
-- WHO SCORED, STAMPED RATHER THAN TYPED
-- ==========================================================================
--
-- 008 stamps scored_by and scored_at when any of ITS five change. The new
-- columns need the same treatment for the same reason 008 gave: left to the
-- page it gets forgotten or set to the wrong person, and the database already
-- knows who is asking.

create or replace function public.stamp_scorer()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if new.iv_spoken           is distinct from old.iv_spoken
  or new.iv_setup            is distinct from old.iv_setup
  or new.iv_reliability      is distinct from old.iv_reliability
  or new.iv_tools            is distinct from old.iv_tools
  or new.iv_answers          is distinct from old.iv_answers
  or new.iv_customer_service is distinct from old.iv_customer_service
  or new.iv_admin_tasks      is distinct from old.iv_admin_tasks
  or new.iv_sales_marketing  is distinct from old.iv_sales_marketing
  or new.score_english       is distinct from old.score_english
  or new.score_customer      is distinct from old.score_customer
  or new.score_data_entry    is distinct from old.score_data_entry
  or new.score_social        is distinct from old.score_social
  or new.score_bookkeeping   is distinct from old.score_bookkeeping then
    new.scored_by := coalesce(auth.jwt() ->> 'email', 'somebody');
    new.scored_at := now();
  else
    new.scored_by := old.scored_by;
    new.scored_at := old.scored_at;
  end if;
  return new;
end;
$fn$;

revoke all on function public.stamp_scorer() from public, anon, authenticated;

-- The name is 008's, deliberately. Creating this under a new name would leave
-- 008's trigger in place beside it, both firing on the same update, and the
-- older one would set scored_by from its own five columns alone — so scoring
-- an interview under this file would stamp nobody, and re-saving a note would
-- stamp the wrong person. One trigger, replaced.
drop trigger if exists application_tracking_stamp_scorer on public.application_tracking;
create trigger application_tracking_stamp_scorer
  before update on public.application_tracking
  for each row execute function public.stamp_scorer();

-- ==========================================================================
-- WHAT THE PAGE MAY WRITE
-- ==========================================================================
--
-- application_tracking has no policy for applicants at all — 008 put the
-- scores here precisely so a 2 out of 5 about somebody cannot reach them
-- through a web page — so this grant reaches staff and nobody else.

grant update (iv_spoken, iv_setup, iv_reliability, iv_tools, iv_answers,
              iv_customer_service, iv_admin_tasks, iv_sales_marketing)
  on public.application_tracking to authenticated;

-- ==========================================================================
-- THE QUEUE VIEW
-- ==========================================================================
--
-- Dropped and recreated rather than replaced: postgres refuses to replace a
-- view whose column list changes, with 42P16, and it refuses partway through
-- the paste. 061 learned this the same way.
--
-- iv_avg is the average of whichever boxes were filled in, which is the right
-- average for a scorecard where the job boxes differ per applicant: somebody
-- interviewed for one track is not marked down for the two she did not apply
-- for. score_avg stays for the old five, so a row scored under 008 still
-- reports what it reported.

drop view if exists public.application_queue;

create or replace view public.application_queue
with (security_barrier = true, security_invoker = true) as
select
  a.id,
  a.created_at,
  a.name,
  a.email,
  a.country,
  a.region,
  a.tracks,
  a.track,
  a.experience,
  a.status,
  a.skill_english,
  a.skill_customer,
  a.skill_data_entry,
  a.skill_social,
  a.skill_bookkeeping,

  -- What she says she has to work with. 061 left these out on the grounds that
  -- the page did not read them, which was true and is the wrong way round: the
  -- page could not read them, so nobody ever saw what every applicant is asked
  -- to tick. One of the four has ticked no equipment at all and has the slowest
  -- line of the lot, and his row has never mentioned it.
  --
  -- They are her claim rather than a measurement, which is exactly why they
  -- belong beside the setup score: that score is somebody checking this.
  a.kit,
  a.speed,
  t.pipeline,
  t.last_contacted_at,
  t.contacted_by,
  t.response_received,
  t.interview_at,
  t.interviewer,
  t.score_english,
  t.score_customer,
  t.score_data_entry,
  t.score_social,
  t.score_bookkeeping,
  t.iv_spoken,
  t.iv_setup,
  t.iv_reliability,
  t.iv_tools,
  t.iv_answers,
  t.iv_customer_service,
  t.iv_admin_tasks,
  t.iv_sales_marketing,
  t.scored_by,
  t.scored_at,

  (select round(avg(v)::numeric, 1)
     from unnest(array[t.score_english, t.score_customer, t.score_data_entry,
                       t.score_social, t.score_bookkeeping]) as v
    where v is not null) as score_avg,

  (select round(avg(v)::numeric, 1)
     from unnest(array[t.iv_spoken, t.iv_setup, t.iv_reliability, t.iv_tools, t.iv_answers,
                       t.iv_customer_service, t.iv_admin_tasks, t.iv_sales_marketing]) as v
    where v is not null) as iv_avg,

  (t.pipeline = 'contacted'
     and not t.response_received
     and t.last_contacted_at is not null
     and t.last_contacted_at < now() - interval '7 days') as is_ghosted,

  -- Booked, in the past, and still sitting at `interviewed`. Somebody either
  -- did not turn up or nobody wrote down what happened, and both want chasing.
  --
  -- Reading the new columns as well as the old, because an interview scored
  -- under 065 must stop counting as unresolved — and one scored under 008
  -- must go on not counting.
  (t.interview_at is not null
     and t.interview_at < now()
     and t.pipeline = 'interviewed'
     and t.score_english is null
     and t.score_customer is null
     and t.score_data_entry is null
     and t.score_social is null
     and t.score_bookkeeping is null
     and t.iv_spoken is null
     and t.iv_setup is null
     and t.iv_reliability is null
     and t.iv_tools is null
     and t.iv_answers is null
     and t.iv_customer_service is null
     and t.iv_admin_tasks is null
     and t.iv_sales_marketing is null) as interview_unresolved,

  coalesce(t.last_contacted_at, a.created_at) as waiting_since
from public.applications a
left join public.application_tracking t on t.application_id = a.id;

-- The drop took these with it.
revoke all on public.application_queue from anon, authenticated;
grant select on public.application_queue to authenticated;

-- ==========================================================================
-- Check it worked
-- ==========================================================================

-- security_invoker must still be set, or every signed-in applicant reads every
-- row, including the scores about them.
select coalesce((
         select option_value from unnest(c.reloptions) o(option_value)
          where option_value like 'security_invoker%'
       ), 'NOT SET — every applicant can read every row') as invoker
from pg_class c
where c.relname = 'application_queue';

-- Nine rows: the eight new columns and iv_avg. kit and speed are checked
-- separately below.
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'application_queue'
  and (column_name like 'iv\_%')
order by column_name;

-- She may write the interview scores; she may not, because application_tracking
-- has no applicant policy at all. This lists what the role may update — the
-- fence is the policy, and this is only the grant.
select column_name
from information_schema.column_privileges
where table_name = 'application_tracking'
  and grantee = 'authenticated'
  and privilege_type = 'UPDATE'
order by column_name;

-- And what she says she has to work with, which no screen has ever shown.
select name, speed, kit
from public.application_queue
order by created_at;

insert into public.schema_migrations (n) values (65) on conflict (n) do nothing;
