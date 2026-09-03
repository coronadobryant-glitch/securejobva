-- 061 — the answer nobody could read
--
-- Run after: 060
-- Safe to re-run: yes
-- Also needed: nothing in the dashboard.
--
-- ==========================================================================
-- EVERY APPLICANT ANSWERS IT, NOBODY WHO NEEDS IT CAN SEE IT
-- ==========================================================================
--
-- The apply form asks how much experience somebody has and stores it on
-- applications.experience. It is on the review step before they send, and it
-- is quoted back to them in their own confirmation email, so the applicant has
-- now seen their answer twice.
--
-- application_queue has never selected it. /admin reads the queue with
-- select=*, so `a.experience` has always arrived undefined, and the row
-- renderer prints `esc(a.experience || "?")`. Every application in the queue —
-- all four of the real ones — shows `?` where the answer is, and has since the
-- view was first written.
--
-- The `?` is what made it invisible. It is the same mark the page would print
-- for somebody who genuinely skipped the question, so the screen said
-- "unanswered" four times rather than "not asked for", and the one person doing
-- the triage had no reason to doubt it.
--
-- a.track goes back for the same reason and a different one. It is the single
-- track column from before tracks[] existed, and rowHtml still falls back to it
-- for rows written before the change. The fallback could never fire — the view
-- does not return the column it reads — so any such row shows an em dash
-- instead of the one track it does have. Restoring the column is what the code
-- already believes is true; deleting the fallback would only make the silence
-- deliberate.
--
-- ==========================================================================
-- WHAT THIS DOES NOT WIDEN
-- ==========================================================================
--
-- security_invoker stays on, so who may read a row is still decided by the
-- policies on applications and not by this view. The two columns are answers
-- the applicant typed about themselves, on a view that already returns their
-- name, email and country; nobody gains a row, and nobody gains a column about
-- anybody they could not already read.
--
-- shifts, speed and kit stay out. The page does not read them, and a view
-- column nothing renders is another thing to keep in step for no one's benefit.
--
-- The drop is required, not tidiness: postgres refuses to replace a view whose
-- column list changes, with 42P16, and it refuses it partway through the paste.

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

-- The drop took these with it.
revoke all on public.application_queue from anon, authenticated;
grant select on public.application_queue to authenticated;

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

-- Both columns are back. Two rows, or the drop-and-create did not take.
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'application_queue'
  and column_name in ('experience', 'track')
order by column_name;

-- What /admin will now show where it has been printing `?`. Any row still
-- reading null here is a person who really did skip the question — which is
-- the distinction the page could not make until now.
select experience, count(*) as applicants
from public.application_queue
group by experience
order by count(*) desc;

insert into public.schema_migrations (n) values (61) on conflict (n) do nothing;
