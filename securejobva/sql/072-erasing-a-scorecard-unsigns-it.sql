-- 072 — erasing a scorecard unsigns it

-- Run after: 065 (the function this replaces)
-- Safe to re-run: yes
-- Also needed: nothing in the dashboard.
--
-- ==========================================================================
-- SCORED BY SOMEBODY, WITH NOTHING SCORED
-- ==========================================================================
--
-- stamp_scorer writes scored_by and scored_at whenever any of the thirteen
-- score columns changes. Clearing them all is a change, so erasing a
-- scorecard stamped it: the row came out with every box empty and a line
-- underneath saying who scored it.
--
-- Found by clearing a set of test scores and reading the row back. The name
-- it wrote was "somebody", because the clear came through the service key,
-- which carries no email — so the row said an interview had been scored, by
-- nobody in particular, with no scores on it.
--
-- 050 already got this right for the written mark:
--
--   if new.written_score is distinct from old.written_score then
--     if new.written_score is null then
--       new.written_scored_by := null;
--       new.written_scored_at := null;
--     else
--       ...stamp...
--
-- 065 copied the shape of the stamp and not the shape of the erasure. This
-- carries it across: a score moving stamps, a scorecard emptied unsigns.
--
-- Which matters more than it looks. scored_by is the answer to "did a person
-- sit in that call and form a view" — and a row that says yes while showing
-- nothing is worse than one that says nothing at all, because the first is
-- read as a scorecard somebody filled in and then lost.
--
-- ==========================================================================
-- ONE STUCK ROW
-- ==========================================================================
--
-- The else branch below restores old.scored_by, so a row already carrying a
-- stale name cannot be cleared by writing to that column: the write is not a
-- score change, so the old value is put straight back. It clears the next
-- time a score on that row moves and comes back to empty, which after this
-- file is run is one edit.

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

    -- Emptied, not scored. Both scorecards are checked, because a row scored
    -- under 008 and cleared should unsign for the same reason.
    if new.iv_spoken           is null
   and new.iv_setup            is null
   and new.iv_reliability      is null
   and new.iv_tools            is null
   and new.iv_answers          is null
   and new.iv_customer_service is null
   and new.iv_admin_tasks      is null
   and new.iv_sales_marketing  is null
   and new.score_english       is null
   and new.score_customer      is null
   and new.score_data_entry    is null
   and new.score_social        is null
   and new.score_bookkeeping   is null then
      new.scored_by := null;
      new.scored_at := null;
    else
      new.scored_by := coalesce(auth.jwt() ->> 'email', 'somebody');
      new.scored_at := now();
    end if;

  else
    new.scored_by := old.scored_by;
    new.scored_at := old.scored_at;
  end if;
  return new;
end;
$fn$;

revoke all on function public.stamp_scorer() from public, anon, authenticated;

-- ==========================================================================
-- Check it worked
-- ==========================================================================

select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name = 'stamp_scorer';

-- Anybody claiming to be scored with nothing scored. Should be no rows once
-- each such row has had a score moved and cleared again.
select a.name, t.scored_by, t.scored_at
from public.application_tracking t
join public.applications a on a.id = t.application_id
where t.scored_by is not null
  and t.iv_spoken is null and t.iv_setup is null and t.iv_reliability is null
  and t.iv_tools is null and t.iv_answers is null
  and t.iv_customer_service is null and t.iv_admin_tasks is null
  and t.iv_sales_marketing is null
  and t.score_english is null and t.score_customer is null
  and t.score_data_entry is null and t.score_social is null
  and t.score_bookkeeping is null;

insert into public.schema_migrations (n) values (72) on conflict (n) do nothing;
