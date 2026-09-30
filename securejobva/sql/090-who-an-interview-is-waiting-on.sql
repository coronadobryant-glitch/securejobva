-- 090 — who an interview is waiting on
--
-- Run after: 089
-- Safe to re-run: yes
-- Also needed: nothing in the dashboard.
--
-- ==========================================================================
-- DECLINED, THEN OFFERED AGAIN, STILL SAYS DECLINED
-- ==========================================================================
--
-- 057's interview_state works out where an interview has got to from the
-- slots, in this order:
--
--   confirmed  ->  waiting_on_client  ->  declined  ->  waiting_on_assistant
--
-- "declined" is tested as `max(declined_at) is not null`: ANY declined slot.
-- But decline_interviews keeps the declined rows (they are the record that
-- she said none of them worked), and offer_interview adds the new times
-- beside them without clearing anything. So after the client offers a fresh
-- set, the old declined rows are still there, the test still matches, and
-- /admin's "Interviews being arranged" goes on saying "none of the times
-- worked — the client needs to offer more" while three new times sit
-- waiting for the assistant. The stuck badge points at the wrong person.
--
-- /seats and /hub already get this right in the page (slotState: declined
-- AND nothing live). The view now asks the same question: declined only when
-- there is no slot that has not been declined.
--
-- Everything else about the view is 057's, column for column and in the same
-- order, so /admin reads it exactly as before. Dropped and recreated rather
-- than replaced, as 057 did and as tools/check.mjs asks of a rewritten view.
--
-- 057 now carries an older copy of this view. It is created with `create
-- view` rather than `or replace`, which tools/check.mjs's superseded-file
-- rule does not track, so the build will not ask for a warning in 057 —
-- but re-running 057 after this file puts the wrong state back. The README's
-- rule (never re-run a file below the highest landed number) is what covers
-- it.

drop view if exists public.interview_state;
create view public.interview_state
with (security_invoker = true) as
select
  p.id                                                as placement_id,
  p.client_id,
  p.application_id,
  count(s.id)                                         as offered,
  min(s.starts_at) filter (where s.declined_at is null) as earliest,
  max(s.created_at)                                   as last_offered,
  max(s.chosen_at)                                    as chosen_at,
  max(s.confirmed_at)                                 as confirmed_at,
  max(s.declined_at)                                  as declined_at,
  case
    when max(s.confirmed_at) is not null then 'confirmed'
    when max(s.chosen_at)    is not null then 'waiting_on_client'
    -- Declined only when every slot there is has been declined. A new set
    -- offered after a decline is her turn again.
    when max(s.declined_at)  is not null
         and count(s.id) filter (where s.declined_at is null) = 0 then 'declined'
    when count(s.id) > 0                 then 'waiting_on_assistant'
    else 'not_started'
  end                                                 as state,
  extract(day from now() - coalesce(max(s.chosen_at), max(s.created_at), p.created_at))::integer
                                                      as days_waiting
from public.placements p
left join public.interview_slots s on s.placement_id = p.id
where p.status = 'matched'
group by p.id, p.client_id, p.application_id, p.created_at;

-- The drop took 057's grant with it.
revoke all on public.interview_state from anon;
grant select on public.interview_state to authenticated;

-- ==========================================================================
-- Check it worked
-- ==========================================================================

-- Same list 057 ends with. A placement whose client offered again after a
-- decline now shows waiting_on_assistant.
select state, days_waiting, offered, earliest
from public.interview_state
order by
  case state
    when 'waiting_on_client' then 1
    when 'waiting_on_assistant' then 2
    when 'declined' then 3
    when 'not_started' then 4
    else 5
  end,
  days_waiting desc;

insert into public.schema_migrations (n) values (90) on conflict (n) do nothing;
