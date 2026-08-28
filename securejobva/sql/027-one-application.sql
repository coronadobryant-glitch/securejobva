-- 027 — one application per person, and three months after a decline
--
-- Run after: 026
-- Safe to re-run: yes
-- Also needed: nothing in the dashboard.
--
-- Anybody could apply as many times as they liked. Two people have already
-- arrived twice, which costs somebody a second read of the same person and
-- makes the queue lie about how many are waiting.
--
-- The rule: one application at a time, and after a decline you are welcome
-- back in three months. Both live here rather than in the page, because a rule
-- in a page is a rule anybody can skip by posting straight at the endpoint —
-- and the endpoint is public by design, since that is how the form works.

-- ==========================================================================
-- THE RULE
-- ==========================================================================
--
-- security definer because anon may INSERT and may not SELECT: the check has
-- to read a table the caller cannot. search_path is pinned for the same reason
-- every other definer function here pins it.
--
-- `id <> new.id` matters more than it looks. careers.html mints the row id in
-- the browser and re-sends the identical row when a connection drops, and the
-- queue drains days later. Without that line the resend finds itself, and
-- somebody who applied once is told they already applied. With it, the resend
-- reaches the primary key instead and comes back 409 — which the page has
-- understood as "already saved" since yesterday.

create or replace function public.one_application_per_person()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  prev record;
  again date;
begin
  select a.id, a.status, coalesce(a.status_changed_at, a.created_at) as at
    into prev
    from public.applications a
   where lower(a.email) = lower(new.email)
     and a.id <> new.id
   order by a.created_at desc
   limit 1;

  if not found then
    return new;
  end if;

  /* Anything not declined is live — applied, assessment, interview, approved
     or hired. Applying again while you are in the process is not a second
     chance, it is the same person in the queue twice. */
  if prev.status <> 'declined' then
    raise exception
      'You already have an application with us. Sign in on the "Your application" page to see where it has got to.'
      using hint = 'sjva-one-application';
  end if;

  again := (prev.at + interval '3 months')::date;

  if now() < prev.at + interval '3 months' then
    raise exception
      'You applied before and were not taken forward that time. You are welcome to apply again from %.',
      to_char(again, 'FMDD Month YYYY')
      using hint = 'sjva-one-application';
  end if;

  return new;
end;
$fn$;

-- The hint is what the page matches on. The message is what a person reads, so
-- it is written for them and not for us: it says what happened, and when they
-- can come back, rather than "constraint violated".

drop trigger if exists applications_one_per_person on public.applications;
create trigger applications_one_per_person
  before insert on public.applications
  for each row execute function public.one_application_per_person();

-- ==========================================================================
-- Check it worked
-- ==========================================================================
--
-- The trigger must be listed, and it must be a BEFORE INSERT.

select t.tgname as trigger_name,
       case when (t.tgtype::int & 2) = 2 then 'before' else 'after' end as timing,
       case when (t.tgtype::int & 4) = 4 then 'insert' else 'other' end as event
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
where not t.tgisinternal
  and c.relname = 'applications'
  and t.tgname = 'applications_one_per_person';

-- Anybody already in the table twice, which this does not touch. Existing rows
-- are history; the rule starts from the next application.
select lower(email) as email, count(*) as applications
from public.applications
group by lower(email)
having count(*) > 1
order by count(*) desc;
