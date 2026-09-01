-- 051 — the clock, and the button that could never have worked
--
-- Run after: 050
-- Safe to re-run: yes
-- Also needed: nothing in the dashboard.
--
-- ==========================================================================
-- FIRST, THE ONE THAT STOPS EVERYTHING
-- ==========================================================================
--
-- submit_assessment() in 045 finds the caller's row like this:
--
--   where a.user_id = auth.uid()
--
-- Every other place in this database that asks "is this application hers"
-- asks it with two arms — 004, 013 three times, 025, 026 and 046 all read
--
--   a.user_id = auth.uid() or lower(a.email) = lower(auth.jwt() ->> 'email')
--
-- because applications.user_id is not filled in. Nothing writes it. It was
-- added by 004 along with claim_my_applications() to populate it, and that
-- function has never been called by any page — grep the repo, there are no
-- callers. Every application in the table has user_id null, which is exactly
-- why every one of those seven places carries the email arm.
--
-- submit_assessment() has only the first arm. So it matches nothing, for
-- everybody, always, and raises 'nothing of yours is open to send'.
--
-- THE SEND BUTTON ON THE ASSESSMENT HAS NEVER BEEN ABLE TO WORK.
--
-- It went unnoticed because 045 was written and not run: the table did not
-- exist until this week, so nothing ever reached the button. It is live now,
-- which makes this the first thing in this file.
--
-- The fix is to ask the question the way the rest of the database asks it.
-- owns_application() is that question, it already carries both arms, and it is
-- what 046 used when it faced the same choice.

create or replace function public.submit_assessment()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  target uuid;
begin
  if auth.uid() is null then
    raise exception 'sign in first';
  end if;

  select s.application_id into target
  from public.application_assessment s
  where public.owns_application(s.application_id)
    and s.submitted_at is null
  order by s.started_at desc
  limit 1;

  if target is null then
    raise exception 'nothing of yours is open to send';
  end if;

  -- The update the page cannot make. Fires score_assessment(), which fires
  -- advance_on_assessment(), which sets the stage and lets 031 send the mail.
  update public.application_assessment
     set submitted_at = now()
   where application_id = target;
end
$fn$;

revoke all on function public.submit_assessment() from public, anon;
grant execute on function public.submit_assessment() to authenticated;

-- ==========================================================================
-- THE CLOCK THAT DID NOT SURVIVE A REFRESH
-- ==========================================================================
--
-- Each timed part sets its deadline in the browser when the part opens:
--
--   ENDS = Date.now() + mins * 60000
--
-- Fresh, every time. So a part is twenty minutes long right up until somebody
-- closes the tab at nineteen minutes and opens it again, at which point it is
-- twenty minutes long once more. The comment above that line says the opposite
-- — "she can leave the page and the part is still over when it is over" — and
-- has been wrong since it was written.
--
-- Worse in the other direction: the auto-submit at zero only happens while the
-- page is open. Close the tab and the timer dies with it, so a part that ran
-- out is not submitted, it is simply never finished.
--
-- A deadline that lives in a browser is not a deadline. This is where it goes.
--
-- One column, holding the moment each part was first opened. Readable by the
-- two people who can already see the row, and writable by nobody at all: the
-- function below is the only thing that sets it, and it refuses to move a
-- moment it has already recorded.

alter table public.application_assessment
  add column if not exists part_opened jsonb not null default '{}'::jsonb;

-- Not in any grant, deliberately, so this is only stated rather than enforced
-- by a new revoke: 045 granted UPDATE column by column and a column added
-- afterwards is in none of those lists. The check at the bottom proves it.

create or replace function public.open_part(part text)
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  target uuid;
  already timestamptz;
  known   text[] := array['english', 'scenarios', 'detail', 'sales', 'written'];
begin
  if auth.uid() is null then
    raise exception 'sign in first';
  end if;

  -- Named parts only. A part this does not know about would record a deadline
  -- nothing ever reads, which is a clock that looks like it is running.
  if not (part = any(known)) then
    raise exception 'no such part: %', part;
  end if;

  select s.application_id, s.part_opened ->> part
    into target, already
  from public.application_assessment s
  where public.owns_application(s.application_id)
    and s.submitted_at is null
  order by s.started_at desc
  limit 1;

  if target is null then
    raise exception 'nothing of yours is open';
  end if;

  -- Already running. Returning the original moment rather than a new one is
  -- the whole point of this function: reopening a part does not restart it.
  if already is not null then
    return already;
  end if;

  update public.application_assessment
     set part_opened = part_opened || jsonb_build_object(part, now())
   where application_id = target;

  return now();
end
$fn$;

revoke all on function public.open_part(text) from public, anon;
grant execute on function public.open_part(text) to authenticated;

-- ==========================================================================
-- Check it worked
-- ==========================================================================

-- Both arms, or the send button matches nobody. This must print a definition
-- containing owns_application.
select pg_get_functiondef(oid) ~ 'owns_application' as send_button_uses_both_arms
from pg_proc
where proname = 'submit_assessment' and pronamespace = 'public'::regnamespace;

-- part_opened must appear in no UPDATE grant. A page that can write it is a
-- page that can restart its own clock.
select column_name, privilege_type
from information_schema.column_privileges
where table_name = 'application_assessment'
  and grantee in ('anon', 'authenticated')
  and column_name = 'part_opened';

-- How long each part has been open for anybody still mid-assessment. A part
-- open far longer than it is allowed is somebody who closed the tab and never
-- came back; the page closes it out the next time she opens it.
select a.name, k.part, (s.part_opened ->> k.part)::timestamptz as opened,
       round(extract(epoch from (now() - (s.part_opened ->> k.part)::timestamptz)) / 60) as minutes_ago
from public.application_assessment s
join public.applications a on a.id = s.application_id
cross join lateral jsonb_object_keys(s.part_opened) as k(part)
where s.submitted_at is null
order by opened;

insert into public.schema_migrations (n) values (51) on conflict (n) do nothing;
