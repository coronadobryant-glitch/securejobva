-- 089 — removing a placement that has weeks
--
-- Run after: 088
-- Safe to re-run: yes
-- Also needed: nothing in the dashboard.
--
-- ==========================================================================
-- 060 SAID THE WEEKS CASCADE. THEY DO NOT.
-- ==========================================================================
--
-- 060's header: "timesheets and placement_billing get nothing either. They
-- cascade from the placement." placement_billing does. timesheets does not:
-- 033 added timesheets.placement_id with no ON DELETE clause, so it is NO
-- ACTION, and deleting a placement with even one week attached fails on
-- timesheets_placement_id_fkey with 23503. rehearse-delete-order.sql already
-- expects exactly that error. /admin's confirm text tells staff that the
-- rates, the start and the interview times go with the placement and nothing
-- else is affected, and then shows a raw foreign-key message.
--
-- The usual reason to remove a placement is a wrong match — the wrong
-- client, fixed before anything was agreed — and she may well have recorded a
-- day or two against it already. That removal should work.
--
-- ==========================================================================
-- THE RULE, FROM A PAGE
-- ==========================================================================
--
--   any attached week approved, or paid for      refused, and the message
--                                                says how many. That is a
--                                                bill; it outlives the match
--                                                for the reason 088 gives.
--   otherwise                                    the weeks are let go —
--                                                placement_id back to null,
--                                                trial_week back to false —
--                                                and the placement is removed.
--
-- A week let go is exactly the state 033 calls "belongs to nobody, and cannot
-- be billed until it does": her hours are still there, on /hub and in /admin,
-- and 043 adopts them onto the next placement that covers those dates. Nothing
-- she recorded is lost, and nothing is billed to the client who is no longer
-- hers. The FK is NOT changed to ON DELETE SET NULL, because that would also
-- let a billed week go quietly, which is the case the refusal is for.
--
-- NOT FROM THE SQL EDITOR, and not inside a cascade:
--
--   the SQL editor       keeps 033's behaviour exactly: the foreign key
--                        refuses, and rehearse-delete-order.sql's prediction
--                        (23503 on timesheets_placement_id_fkey) stays true.
--                        Read from the token — no token, not a page.
--   an erasure           deleting an application cascades into its
--                        placements, and 088 has already decided on the
--                        application whether that may happen. A second
--                        opinion here, fired from inside that cascade, could
--                        only disagree with the first. pg_trigger_depth() is 1
--                        for a delete a page asked for and more than 1 for one
--                        a cascade made.
--
-- The comment in 060 is left as it was — a migration is not edited after it
-- has run — and this header is the correction to it.

do $pre$
begin
  if to_regclass('public.client_payment_weeks') is null then
    raise exception
      'sql/055 has not been run on this database. It creates client_payment_weeks.';
  end if;
end
$pre$;

create or replace function public.let_go_of_unbilled_weeks()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  agreed integer;
  paid   integer;
begin
  if coalesce(auth.jwt() ->> 'role', '') not in ('anon', 'authenticated') then
    return old;
  end if;
  if pg_trigger_depth() > 1 then
    return old;
  end if;

  select count(*) filter (where t.status = 'approved'),
         count(*) filter (where exists (
           select 1 from public.client_payment_weeks w where w.timesheet_id = t.id))
    into agreed, paid
  from public.timesheets t
  where t.placement_id = old.id;

  if agreed > 0 or paid > 0 then
    raise exception
      'This placement has % approved week(s) and % week(s) the client has paid for, so it cannot be removed. End it instead.',
      agreed, paid
      using hint = 'sjva-billed-weeks';
  end if;

  update public.timesheets
     set placement_id = null,
         trial_week = false
   where placement_id = old.id;

  return old;
end;
$fn$;

revoke all on function public.let_go_of_unbilled_weeks() from public, anon, authenticated;

drop trigger if exists placements_let_go_of_unbilled_weeks on public.placements;
create trigger placements_let_go_of_unbilled_weeks
  before delete on public.placements
  for each row execute function public.let_go_of_unbilled_weeks();

-- ==========================================================================
-- Check it worked
-- ==========================================================================

select tgname, tgenabled
from pg_trigger
where tgname = 'placements_let_go_of_unbilled_weeks';

-- Placements with weeks attached, and whether /admin could now remove each.
select p.id, c.name as client, p.status,
       count(t.id)                                   as weeks,
       count(*) filter (where t.status = 'approved') as approved,
       count(w.timesheet_id)                         as paid,
       (count(*) filter (where t.status = 'approved') = 0 and count(w.timesheet_id) = 0)
                                                     as removable_from_admin
from public.placements p
join public.clients c on c.id = p.client_id
join public.timesheets t on t.placement_id = p.id
left join public.client_payment_weeks w on w.timesheet_id = t.id
group by p.id, c.name, p.status
order by c.name;

insert into public.schema_migrations (n) values (89) on conflict (n) do nothing;
