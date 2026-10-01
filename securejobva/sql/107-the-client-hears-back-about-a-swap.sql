-- 107 — the client hears back about asking for somebody different
--
-- Run after: 106
-- Safe to re-run: yes
-- Also needed: api/notify.js taught DECIDE.swap_requests.received and
--   .resolved (CONTRACT.md), and /admin a box for the reply when marking one
--   handled. Until the templates land the posts answer 200 "skipped".
--
-- ==========================================================================
-- ASKED, AND THEN NOTHING (F25)
-- ==========================================================================
--
-- A client who asks for a different assistant (032) gets no email when they
-- ask, and none when staff deal with it. When staff mark it handled, the "we
-- are on it" note on /seats simply disappears and the form is back, so the
-- client learns the outcome only if somebody remembers to write to them.
--
-- Two emails, to the client contact, and to nobody else:
--
--   received   when they ask: we have it, a person is on it, and nothing has
--              changed for the assistant in the meantime (true: 036 tells
--              staff only, and she is never told — that does not change)
--   resolved   when staff mark it handled, carrying what staff wrote back
--
-- What staff wrote back is a new column, swap_requests.resolution_note, which
-- staff fill in when they mark the request handled. It is the email: "marked
-- handled" with no words is the same silence in a longer form, which is what
-- 031 said about a returned timesheet. Empty is allowed (the email then just
-- says it has been dealt with and we will be in touch), because a request
-- handled on the phone has nothing left to say in writing.
--
-- The assistant still learns nothing from either. 032 keeps her out of the
-- table, 036 keeps her out of the staff mail, and this mails the client alone.
--
-- ==========================================================================
-- THE PAYLOADS
-- ==========================================================================
--
--   { type: 'STATUS', table: 'swap_requests', event: 'received' | 'resolved',
--     person: { name: <client contact>, email: <client address> },
--     record: { id, business, assistant, asked_on, reason, placement,
--               started_on, reply } }
--
-- `reply` is resolution_note, on 'resolved' only. `reason` is what the client
-- wrote, so the email can quote it back to them. `placement` is the
-- placement's status, because "nothing changes for her in the meantime, and
-- you are billed as normal" is true of a placement that has started and false
-- of one still at 'matched', where nobody is billed for anything (F19).
--
-- `started_on` is the placement's first day (032), because 'trial' alone does
-- not say she has begun: a trial whose first day is next Monday bills nobody
-- yet either. api/notify.js says "she keeps working and you keep being billed"
-- only when started_on is present and on or before today in Central. Without
-- it the email leaves that sentence out, which is safe but takes the
-- reassurance away from a trial that really has started.

do $pre$
begin
  if to_regprocedure('public.notify_send(jsonb, text, text)') is null then
    raise exception 'sql/095 has not been run on this database.';
  end if;
end
$pre$;

alter table public.swap_requests
  add column if not exists resolution_note text;

alter table public.swap_requests drop constraint if exists swap_resolution_note_sane;
alter table public.swap_requests add constraint swap_resolution_note_sane
  check (coalesce(length(resolution_note), 0) <= 4000);

-- Staff only, in practice: 032's update policy on swap_requests is
-- has_permission('applications.edit'), and a client holds no update policy.
grant update (resolution_note) on public.swap_requests to authenticated;

create or replace function public.notify_swap_client()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  info record;
  ev   text;
begin
  if tg_op = 'INSERT' then
    ev := 'received';
  elsif new.status = 'resolved' and old.status is distinct from 'resolved' then
    ev := 'resolved';
  else
    return new;
  end if;

  select c.name as business, cp.contact_name, cp.contact_email, a.name as assistant,
         p.status as placement_status, p.started_on
    into info
    from public.placements p
    join public.applications a on a.id = p.application_id
    join public.clients c on c.id = p.client_id
    left join public.client_private cp on cp.client_id = c.id
   where p.id = new.placement_id;

  if coalesce(btrim(info.contact_email), '') = '' then
    return new;
  end if;

  perform public.notify_send(
    jsonb_build_object(
      'type',   'STATUS',
      'event',  ev,
      'table',  'swap_requests',
      'person', jsonb_build_object('name', info.contact_name, 'email', info.contact_email),
      'record', jsonb_build_object(
        'id',        new.id,
        'business',  info.business,
        'assistant', info.assistant,
        'asked_on',  new.created_at::date,
        'reason',    new.reason,
        'placement', info.placement_status,
        'started_on', info.started_on,
        'reply',     case when ev = 'resolved'
                          then nullif(btrim(coalesce(new.resolution_note, '')), '') end)),
    'https://www.securejobva.com/api/notify',
    'notify_swap_client');

  return new;
end;
$fn$;

revoke all on function public.notify_swap_client() from public, anon, authenticated;

drop trigger if exists "notify-swap-client-asked" on public.swap_requests;
create trigger "notify-swap-client-asked"
  after insert on public.swap_requests
  for each row execute function public.notify_swap_client();

drop trigger if exists "notify-swap-client-resolved" on public.swap_requests;
create trigger "notify-swap-client-resolved"
  after update of status on public.swap_requests
  for each row
  when (old.status is distinct from new.status)
  execute function public.notify_swap_client();

insert into public.schema_migrations (n) values (107) on conflict (n) do nothing;

-- ==========================================================================
-- Check it worked
-- ==========================================================================
--
-- Requests still open, with whether the client will hear when they are
-- handled. Open requests from before this file never got a 'received' email —
-- that is not sent retroactively — but they will get the 'resolved' one.

select coalesce(c.name, 'a client') as client,
       a.name as assistant,
       s.created_at::date as asked_on,
       case when coalesce(btrim(cp.contact_email), '') = '' then 'no address — will not be told'
            else 'will be told when handled' end as client_told
from public.swap_requests s
join public.placements p on p.id = s.placement_id
join public.applications a on a.id = p.application_id
left join public.clients c on c.id = p.client_id
left join public.client_private cp on cp.client_id = c.id
where s.status = 'open'
order by s.created_at;
