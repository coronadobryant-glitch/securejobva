-- 005 — applicant tracking: pipeline, contact history, skills
--
-- Run after: 004
-- Safe to re-run: yes
-- Also needed: nothing in the dashboard.
--
-- Turns the applications table into something you can actually work a queue
-- from: where each person is in the internal pipeline, when they were last
-- contacted and by whom, whether they replied, and what they can actually do.

-- ==========================================================================
-- TWO STATUSES, ON PURPOSE
-- ==========================================================================
--
-- `status` on public.applications is the one the applicant sees on /status,
-- and it stays exactly as it is: applied, assessment, interview, approved,
-- declined. It is a promise about their progress.
--
-- The pipeline below is the internal one -- new, reviewed, contacted,
-- interviewed, hired, rejected, ghosted -- and it is nobody's business but
-- ours. Collapsing the two would mean an applicant opening /status and
-- reading the word "Ghosted" about themselves.
--
-- So the internal fields live in their own table rather than as more columns
-- on applications. That is not tidiness: an applicant is granted SELECT on a
-- list of columns of their own row, and a column-level grant is a fragile way
-- to hold one field back. A separate table with its own policy cannot leak by
-- someone forgetting to update a list.

create table if not exists public.application_tracking (
  application_id    uuid primary key
    references public.applications (id) on delete cascade,

  pipeline          text not null default 'new',

  -- Response tracking. contacted_by is the staff email rather than a user id,
  -- for the same reason roles are keyed by email: it stays readable in the
  -- table without a join, and it survives someone's account being recreated.
  last_contacted_at timestamptz,
  contacted_by      text,
  response_received boolean not null default false,

  updated_at        timestamptz not null default now(),

  constraint application_tracking_pipeline_valid check (
    pipeline in ('new', 'reviewed', 'contacted', 'interviewed',
                 'hired', 'rejected', 'ghosted')
  ),
  constraint application_tracking_sane check (
    coalesce(length(contacted_by), 0) <= 320
  )
);

alter table public.application_tracking enable row level security;
revoke all on public.application_tracking from anon, authenticated;
grant select, insert, update on public.application_tracking to authenticated;

-- Staff only, all three ways. An applicant has no policy here at all, so the
-- table does not exist as far as their session is concerned.
drop policy if exists "staff read tracking" on public.application_tracking;
create policy "staff read tracking"
  on public.application_tracking for select to authenticated
  using (public.has_permission('applications.view_all'));

drop policy if exists "staff write tracking" on public.application_tracking;
create policy "staff write tracking"
  on public.application_tracking for insert to authenticated
  with check (public.has_permission('applications.edit'));

drop policy if exists "staff update tracking" on public.application_tracking;
create policy "staff update tracking"
  on public.application_tracking for update to authenticated
  using (public.has_permission('applications.edit'))
  with check (public.has_permission('applications.edit'));

-- Every application that predates this table counts as new and uncontacted.
insert into public.application_tracking (application_id)
  select id from public.applications
on conflict do nothing;

-- New applications should not have to wait for someone to click before they
-- appear in the queue, so the row is created with the application.
create or replace function public.track_new_application()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  insert into public.application_tracking (application_id)
  values (new.id)
  on conflict do nothing;
  return new;
end;
$fn$;

drop trigger if exists applications_track on public.applications;
create trigger applications_track
  after insert on public.applications
  for each row execute function public.track_new_application();

-- ==========================================================================
-- SKILLS
-- ==========================================================================
--
-- Structured levels rather than a paragraph, so the dashboard can answer
-- "advanced English and at least intermediate social media" without anyone
-- reading a CV.
--
-- These go ON applications, not in the tracking table: the applicant typed
-- them, they are their own answers, and they should see and be able to correct
-- them. That is the line between the two tables -- their data here, our
-- working notes there.
--
-- One scale for every skill, including English. A separate three-value scale
-- for some and four for others would mean two sort orders and two dropdowns
-- for no real gain.

alter table public.applications add column if not exists skill_english        text;
alter table public.applications add column if not exists skill_customer       text;
alter table public.applications add column if not exists skill_data_entry     text;
alter table public.applications add column if not exists skill_social         text;
alter table public.applications add column if not exists skill_bookkeeping    text;

-- Null means "not answered", which is different from "beginner" and has to
-- stay tellable apart -- an unanswered skill is a prompt, a beginner is a fact.
alter table public.applications drop constraint if exists applications_skills_valid;
alter table public.applications add constraint applications_skills_valid check (
  coalesce(skill_english,     'beginner') in ('beginner','intermediate','advanced','fluent') and
  coalesce(skill_customer,    'beginner') in ('beginner','intermediate','advanced','fluent') and
  coalesce(skill_data_entry,  'beginner') in ('beginner','intermediate','advanced','fluent') and
  coalesce(skill_social,      'beginner') in ('beginner','intermediate','advanced','fluent') and
  coalesce(skill_bookkeeping, 'beginner') in ('beginner','intermediate','advanced','fluent')
);

-- ==========================================================================
-- INTAKE
-- ==========================================================================
--
-- `country` already exists. `region` is the state or province inside it, left
-- as free text rather than a list of Mexican states, because this site says on
-- its own careers page that it hires worldwide and a fixed list would make a
-- liar of it.

alter table public.applications add column if not exists region        text;
alter table public.applications add column if not exists availability  text;
alter table public.applications add column if not exists has_equipment boolean;

alter table public.applications drop constraint if exists applications_intake_sane;
alter table public.applications add constraint applications_intake_sane check (
  coalesce(length(region), 0) <= 120 and
  coalesce(length(availability), 0) <= 200
);

-- The applicant may read their own answers back. Note which columns are NOT
-- here: everything in application_tracking, which is a different table
-- precisely so that this list cannot be the thing that leaks it.
grant select (
  skill_english, skill_customer, skill_data_entry, skill_social, skill_bookkeeping,
  region, availability, has_equipment
) on public.applications to authenticated;

-- ==========================================================================
-- THE QUEUE
-- ==========================================================================
--
-- "Oldest without a response" is the view that stops people falling through
-- the cracks, so it is a query rather than something the dashboard has to
-- reconstruct. Ghosted is derived here rather than stored: a stored flag needs
-- a scheduled job to stay true, and this is correct the moment it is read.
--
-- A security barrier view runs the underlying policies as the caller, so this
-- shows a signed-in applicant nothing at all.

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

  -- Contacted, no reply, and a week gone. Seven days is the number in the
  -- brief; it lives here so there is one place to change it.
  (t.pipeline = 'contacted'
     and not t.response_received
     and t.last_contacted_at is not null
     and t.last_contacted_at < now() - interval '7 days') as is_ghosted,

  -- What the queue sorts on: how long this person has been waiting on us.
  -- Never contacted falls back to when they applied, so a new application and
  -- a fortnight-old silence are measured the same way.
  coalesce(t.last_contacted_at, a.created_at) as waiting_since
from public.applications a
left join public.application_tracking t on t.application_id = a.id;

revoke all on public.application_queue from anon, authenticated;
grant select on public.application_queue to authenticated;

create index if not exists application_tracking_pipeline_idx
  on public.application_tracking (pipeline, last_contacted_at);
create index if not exists application_tracking_waiting_idx
  on public.application_tracking (response_received, last_contacted_at);

-- ==========================================================================
-- Check it worked
-- ==========================================================================
--
-- application_tracking must be rls_enabled with three policies. If it ever
-- shows 'none', every signed-in applicant can read the pipeline.

select c.relname as table_name,
       c.relrowsecurity as rls_enabled,
       coalesce(string_agg(distinct p.polcmd::text, ','), 'none') as policies
from pg_class c
left join pg_policy p on p.polrelid = c.oid
where c.relname in ('applications', 'application_tracking')
group by c.relname, c.relrowsecurity
order by c.relname;

-- Every application should have exactly one tracking row.
select
  (select count(*) from public.applications)          as applications,
  (select count(*) from public.application_tracking)  as tracking_rows,
  (select count(*) from public.applications a
     left join public.application_tracking t on t.application_id = a.id
    where t.application_id is null)                   as untracked;
