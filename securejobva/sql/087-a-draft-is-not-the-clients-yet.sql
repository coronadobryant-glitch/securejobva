-- 087 — a draft is not the client's yet
--
-- Run after: 086
-- Safe to re-run: yes
-- Also needed: nothing in the dashboard.
--
-- ==========================================================================
-- WHAT 033 SAID, AND WHAT ITS POLICY DID
-- ==========================================================================
--
-- 033's comment on the client's update policy: a client "may not touch a
-- draft — that week is not theirs to see the inside of yet". The update
-- policy honours that (status = 'submitted' only). The two READ policies
-- beside it do not: the client arm of "an assistant reads their own weeks"
-- and "an assistant reads their own days" asks only whether the week is on
-- their placement, whatever its status.
--
-- So /seats lists a week she is still filling in — 'draft', with the partial
-- daily hours and a running dollar figure — before she has sent anything. A
-- client who sees Tuesday at 11 hours on Tuesday evening will ask about it;
-- she may be about to correct it. A week becomes the client's to look at when
-- she sends it, which is the moment the update policy already uses.
--
-- ==========================================================================
-- WHAT CHANGES
-- ==========================================================================
--
-- Both read policies are rewritten with the same three arms as 033, and the
-- client arm now also requires status <> 'draft'. 'returned' stays visible:
-- the client saw it when it was submitted and it was sent back with a note,
-- which is history the client is part of.
--
-- The days are fenced one step up, as 033 fenced them, through a function
-- that asks the week — a new one rather than a new body for 033's
-- timesheet_is_clients, which other things may lean on and which answers a
-- different question ("is this their week", not "may they look at it yet").
--
-- Nothing else moves: the assistant reads all of her own weeks, staff read
-- everything, and 085's timesheet_charges runs as the caller so it inherits
-- the same fence — a client's balance never counted drafts anyway, since only
-- approved weeks are owed.

do $pre$
begin
  if to_regprocedure('public.timesheet_is_clients(uuid)') is null then
    raise exception
      'sql/033 has not been run on this database. It defines the client arm this file narrows.';
  end if;
end
$pre$;

create or replace function public.client_may_read_week(ts uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1 from public.timesheets t
    where t.id = ts
      and t.status <> 'draft'
      and t.placement_id is not null
      and public.is_placement_client(t.placement_id)
  );
$fn$;

revoke all on function public.client_may_read_week(uuid) from public, anon;
grant execute on function public.client_may_read_week(uuid) to authenticated;

drop policy if exists "an assistant reads their own weeks" on public.timesheets;
create policy "an assistant reads their own weeks"
  on public.timesheets for select to authenticated
  using (
    public.owns_application(application_id)
    or (placement_id is not null
        and status <> 'draft'
        and public.is_placement_client(placement_id))
    or public.has_permission('applications.view_all')
  );

drop policy if exists "an assistant reads their own days" on public.timesheet_days;
create policy "an assistant reads their own days"
  on public.timesheet_days for select to authenticated
  using (
    public.owns_timesheet(timesheet_id)
    or public.client_may_read_week(timesheet_id)
    or public.has_permission('applications.view_all')
  );

-- ==========================================================================
-- Check it worked
-- ==========================================================================

-- The client arm of both policies mentions draft. Two rows, both true.
select polname,
       pg_get_expr(polqual, polrelid) ~ 'draft|client_may_read_week' as drafts_fenced
from pg_policy
where polname in ('an assistant reads their own weeks', 'an assistant reads their own days');

-- Weeks a client could see before this file and cannot now.
select status, count(*)
from public.timesheets
where placement_id is not null
group by status
order by status;

insert into public.schema_migrations (n) values (87) on conflict (n) do nothing;
