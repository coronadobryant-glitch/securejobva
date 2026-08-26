-- 008 — interviewer scores, 1 to 10
--
-- Run after: 007
-- Safe to re-run: yes
-- Also needed: nothing in the dashboard.
--
-- 005 stores what an applicant says about their own skills. This is what the
-- interviewer says after speaking to them, on a 1-10 scale, which is the
-- number the hiring decision actually rests on.
--
-- The two are kept apart rather than one overwriting the other. Seeing that
-- somebody rated themselves advanced and interviewed at 4 is information;
-- replacing the claim with the score throws that away, and the gap between
-- them is often the most useful thing on the record.

-- ==========================================================================
-- WHERE THIS LIVES
-- ==========================================================================
--
-- On application_tracking, not on applications. That is the staff-only table
-- with no policy for applicants, so a score cannot reach the person it is
-- about -- an applicant reading "4/10 on customer service" about themselves,
-- written by someone they met once, is a conversation nobody intended to have
-- through a web page.
--
-- Same reasoning as the pipeline in 005: their answers on applications, our
-- assessment here.

alter table public.application_tracking add column if not exists score_english     smallint;
alter table public.application_tracking add column if not exists score_customer    smallint;
alter table public.application_tracking add column if not exists score_data_entry  smallint;
alter table public.application_tracking add column if not exists score_social      smallint;
alter table public.application_tracking add column if not exists score_bookkeeping smallint;

-- Who gave the scores and when. An unattributed number is hard to ask about
-- later, and two interviewers will score differently on purpose.
alter table public.application_tracking add column if not exists scored_by text;
alter table public.application_tracking add column if not exists scored_at timestamptz;

-- 1 to 10, or null for not yet assessed. Null and zero must stay different:
-- zero is a judgement, null is that nobody has made one.
alter table public.application_tracking drop constraint if exists application_tracking_scores_valid;
alter table public.application_tracking add constraint application_tracking_scores_valid check (
  (score_english     is null or score_english     between 1 and 10) and
  (score_customer    is null or score_customer    between 1 and 10) and
  (score_data_entry  is null or score_data_entry  between 1 and 10) and
  (score_social      is null or score_social      between 1 and 10) and
  (score_bookkeeping is null or score_bookkeeping between 1 and 10) and
  coalesce(length(scored_by), 0) <= 320
);

-- --------------------------------------------------------------------------
-- Stamp who scored, automatically
-- --------------------------------------------------------------------------
--
-- Left to the page, this gets forgotten or set to the wrong person. The
-- database knows who is asking, so it fills it in -- and only when a score
-- actually changes, so re-saving a note does not rewrite the attribution.

create or replace function public.stamp_scorer()
returns trigger
language plpgsql
as $fn$
begin
  if new.score_english     is distinct from old.score_english
  or new.score_customer    is distinct from old.score_customer
  or new.score_data_entry  is distinct from old.score_data_entry
  or new.score_social      is distinct from old.score_social
  or new.score_bookkeeping is distinct from old.score_bookkeeping then
    new.scored_by := coalesce(auth.jwt() ->> 'email', new.scored_by);
    new.scored_at := now();
  end if;
  return new;
end;
$fn$;

drop trigger if exists application_tracking_stamp_scorer on public.application_tracking;
create trigger application_tracking_stamp_scorer
  before update on public.application_tracking
  for each row execute function public.stamp_scorer();

-- --------------------------------------------------------------------------
-- The queue view carries the scores
-- --------------------------------------------------------------------------
--
-- Replaced whole rather than altered: a view cannot have a column added in
-- place, and rewriting it here keeps 005 and this file each readable on their
-- own. security_invoker stays -- without it the view would run as its owner
-- and hand every row to every signed-in applicant, which is the trap
-- check.mjs now guards.
--
-- Dropped first, and this is not optional. CREATE OR REPLACE VIEW may only
-- APPEND columns to the end of an existing view: it cannot rename one, reorder
-- them, or insert a column in the middle. The scores below land where
-- is_ghosted used to sit, so replacing in place fails with
--
--   42P16: cannot change name of view column "is_ghosted" to "score_english"
--
-- Dropping loses the grants with it, which is why the revoke and grant below
-- are repeated rather than assumed. Nothing depends on this view, so the drop
-- is safe; add `cascade` only if that stops being true, and re-grant whatever
-- it takes down with it.

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
  t.score_english,
  t.score_customer,
  t.score_data_entry,
  t.score_social,
  t.score_bookkeeping,
  t.scored_by,
  t.scored_at,

  -- The average of whatever has been scored, to one decimal. Null until at
  -- least one score exists, so "not assessed" never renders as a 0.0.
  (select round(avg(v)::numeric, 1)
     from unnest(array[t.score_english, t.score_customer, t.score_data_entry,
                       t.score_social, t.score_bookkeeping]) as v
    where v is not null) as score_avg,

  (t.pipeline = 'contacted'
     and not t.response_received
     and t.last_contacted_at is not null
     and t.last_contacted_at < now() - interval '7 days') as is_ghosted,

  coalesce(t.last_contacted_at, a.created_at) as waiting_since
from public.applications a
left join public.application_tracking t on t.application_id = a.id;

revoke all on public.application_queue from anon, authenticated;
grant select on public.application_queue to authenticated;

-- ==========================================================================
-- Check it worked
-- ==========================================================================
--
-- The view must still say security_invoker. If this returns false, every
-- signed-in applicant can read every row including the scores about them.

select c.relname as view_name,
       coalesce((
         select option_value from unnest(c.reloptions) o(option_value)
          where option_value like 'security_invoker%'
       ), 'NOT SET — every applicant can read every row') as invoker
from pg_class c
where c.relname = 'application_queue';

-- Nobody who is not staff has any policy on the tracking table, so nobody
-- else can read a score. Three policies expected, all staff-gated.
select coalesce(string_agg(p.polname, ' | ' order by p.polname), 'none') as tracking_policies
from pg_class c
left join pg_policy p on p.polrelid = c.oid
where c.relname = 'application_tracking';
