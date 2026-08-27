-- 023 — when the interview is
--
-- Run after: 022
-- Safe to re-run: yes
-- Also needed: nothing in the dashboard.
--
-- The pipeline has an `interviewed` stage and no idea when the interview is,
-- so nothing can tell you an interview is tomorrow, that one was booked for
-- last Tuesday and nobody moved it on, or that two are at the same time.

-- ==========================================================================
-- STAFF-ONLY, LIKE EVERYTHING ELSE ABOUT OUR SIDE OF IT
-- ==========================================================================
--
-- On application_tracking rather than applications. An applicant should learn
-- when their interview is from the person arranging it, not by finding a
-- timestamp on a status page — and a date that appeared without explanation
-- would generate more email than it saved.

alter table public.application_tracking
  add column if not exists interview_at timestamptz;

-- Who is taking it. Free text rather than a reference: the interviewer is
-- often named before they have an account, and a booking should not wait on
-- one being made.
alter table public.application_tracking
  add column if not exists interviewer text;

alter table public.application_tracking drop constraint if exists application_tracking_interviewer_sane;
alter table public.application_tracking add constraint application_tracking_interviewer_sane
  check (coalesce(length(interviewer), 0) <= 200);

-- --------------------------------------------------------------------------
-- The queue view carries it
-- --------------------------------------------------------------------------
--
-- Dropped and recreated, not replaced. CREATE OR REPLACE VIEW may only append
-- columns to the end — it cannot insert one in the middle — and 008 already
-- hit that as 42P16. The new columns land next to the other tracking fields
-- rather than tacked on, so the view reads in the order somebody would expect.
--
-- security_invoker stays. Without it the view runs as its owner and hands
-- every row to every signed-in applicant, which is what check.mjs guards.

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
  a.status,
  a.skill_english,
  a.skill_customer,
  a.skill_data_entry,
  a.skill_social,
  a.skill_bookkeeping,
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
  t.scored_by,
  t.scored_at,

  (select round(avg(v)::numeric, 1)
     from unnest(array[t.score_english, t.score_customer, t.score_data_entry,
                       t.score_social, t.score_bookkeeping]) as v
    where v is not null) as score_avg,

  (t.pipeline = 'contacted'
     and not t.response_received
     and t.last_contacted_at is not null
     and t.last_contacted_at < now() - interval '7 days') as is_ghosted,

  -- Booked, in the past, and still sitting at `interviewed`. Somebody either
  -- did not turn up or nobody wrote down what happened, and both want chasing.
  (t.interview_at is not null
     and t.interview_at < now()
     and t.pipeline = 'interviewed'
     and t.score_english is null
     and t.score_customer is null
     and t.score_data_entry is null
     and t.score_social is null
     and t.score_bookkeeping is null) as interview_unresolved,

  coalesce(t.last_contacted_at, a.created_at) as waiting_since
from public.applications a
left join public.application_tracking t on t.application_id = a.id;

revoke all on public.application_queue from anon, authenticated;
grant select on public.application_queue to authenticated;

create index if not exists application_tracking_interview_idx
  on public.application_tracking (interview_at)
  where interview_at is not null;

-- ==========================================================================
-- Check it worked
-- ==========================================================================
--
-- The view must still say security_invoker. If this comes back NOT SET, every
-- signed-in applicant can read every row, including the scores about them.

select coalesce((
         select option_value from unnest(c.reloptions) o(option_value)
          where option_value like 'security_invoker%'
       ), 'NOT SET — every applicant can read every row') as invoker
from pg_class c
where c.relname = 'application_queue';

-- Anything booked, and whether it is still open.
select date_trunc('day', interview_at) as day, count(*) as interviews
from public.application_tracking
where interview_at is not null
group by 1
order by 1;
