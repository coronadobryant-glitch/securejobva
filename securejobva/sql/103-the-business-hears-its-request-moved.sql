-- 103 — the business hears its request moved
--
-- Run after: 102
-- Safe to re-run: yes
-- Also needed: api/notify.js taught DECIDE.seat_requests.decided, and
--   CONFIRM.seat_requests for the receipt on arrival (F11) — both in
--   CONTRACT.md. Until it is, these posts answer 200 "skipped" and nothing is
--   sent. Deploy api/notify first if none should be missed.
--
-- ==========================================================================
-- THE STAGES ARE ONLY ON A PAGE NOBODY OPENS (F13)
-- ==========================================================================
--
-- 012 gave a seat request six stages — received, call booked, matching,
-- shortlist sent, seat running, closed — and /seats shows the business which
-- one it is at, as a numbered list with "You are here". Staff move it in
-- /admin. Nothing tells the business it moved: they find out by signing in,
-- and a business that does not sign in, which is most of them before they
-- have an assistant, does not find out at all.
--
-- So moving a request now emails the address on the request, once, saying
-- which stage it has reached and what that stage means — the same words /seats
-- shows under each stage, so the email and the page cannot disagree.
--
-- ==========================================================================
-- WHICH MOVES
-- ==========================================================================
--
-- Forward moves, into a stage the business sees:
--
--   call_booked, matching, shortlist, running     each one, once, going forward
--   closed                                        from any stage
--
-- Not 'received' (that is the arrival, which F11's receipt covers), and not a
-- move backwards: shortlist back to matching is staff correcting their own
-- click, and an email saying the request has gone back a step for no reason
-- the business can see is worse than silence. A correction that matters is a
-- conversation.
--
-- To the address on the request — the person who asked — and not the client
-- contact 102 may have linked: the request is theirs, and the client contact
-- hears about the client's side through everything else.
--
-- ==========================================================================
-- THE PAYLOAD
-- ==========================================================================
--
--   { type: 'STATUS', table: 'seat_requests', event: 'decided',
--     person: { name, email },
--     record: { id, status, previous, company, seats } }
--
-- And F11, the receipt when a request ARRIVES, needs nothing from this file:
-- 096's notify_form already posts the whole new row, address included, as
-- { type: 'INSERT', table: 'seat_requests', record: {...} }, which is exactly
-- what api/notify's CONFIRM map answers for applications today. Adding
-- CONFIRM.seat_requests there is the whole of F11.

do $pre$
begin
  if to_regprocedure('public.notify_send(jsonb, text, text)') is null then
    raise exception 'sql/095 has not been run on this database.';
  end if;
end
$pre$;

create or replace function public.notify_seat_stage()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  stages constant text[] := array['received', 'call_booked', 'matching', 'shortlist', 'running'];
  was integer;
  now_ integer;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if coalesce(btrim(new.email), '') = '' then
    return new;
  end if;

  if new.status <> 'closed' then
    was  := array_position(stages, old.status);
    now_ := array_position(stages, new.status);
    -- Unknown stages, 'received', and every step backwards stay quiet.
    if now_ is null or now_ <= 1 or (was is not null and now_ <= was) then
      return new;
    end if;
  end if;

  perform public.notify_send(
    jsonb_build_object(
      'type',   'STATUS',
      'event',  'decided',
      'table',  'seat_requests',
      'person', jsonb_build_object('name', new.name, 'email', new.email),
      'record', jsonb_build_object(
        'id',       new.id,
        'status',   new.status,
        'previous', old.status,
        'company',  new.company,
        'seats',    new.seats)),
    'https://www.securejobva.com/api/notify',
    'notify_seat_stage');

  return new;
end;
$fn$;

revoke all on function public.notify_seat_stage() from public, anon, authenticated;

drop trigger if exists "notify-seat-stage" on public.seat_requests;
create trigger "notify-seat-stage"
  after update of status on public.seat_requests
  for each row
  when (old.status is distinct from new.status)
  execute function public.notify_seat_stage();

insert into public.schema_migrations (n) values (103) on conflict (n) do nothing;

-- ==========================================================================
-- Check it worked
-- ==========================================================================
--
-- Every open request, the stage it is at, and whether the business would be
-- emailed when it next moves forward (a request with no usable address
-- cannot be). Empty is fine — no open requests.

select coalesce(company, name, 'no name') as request,
       status,
       status_changed_at,
       case when coalesce(btrim(email), '') = '' then 'no address — will not be emailed'
            else 'will be emailed on the next move' end as told
from public.seat_requests
where status not in ('running', 'closed')
order by status_changed_at;
