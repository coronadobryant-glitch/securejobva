-- 100 — a confirmed placement interview can move, or be called off
--
-- Run after: 099 (whose notify_interview tells both sides about a move)
-- Safe to re-run: yes
-- Also needed: api/notify.js's 'moved' and 'cancelled' templates taught the
--   'assistant' and 'client' sides (CONTRACT.md) — today both are written for
--   an applicant and point at /status — and taught to quote record.reason
--   when it is there. And the buttons, in /seats for the
--   client and in /admin for staff. Until the templates land the posts answer
--   200 with the applicant wording, so deploy api/notify first.
--
-- ==========================================================================
-- ONCE IT IS CONFIRMED, NOBODY CAN TOUCH IT (F18)
-- ==========================================================================
--
-- 057 lets a client offer times and the assistant pick one, and the client
-- confirm it. After that the row is fixed: withdraw_interview_slot refuses a
-- confirmed one ("change the time instead"), and nothing changes the time.
-- Neither the client nor staff has a button, so a move goes by email to
-- support and is fixed by hand in the database.
--
-- Two functions, the same pair 070 and 068/071 gave an applicant's interview:
--
--   reschedule_placement_interview(slot, at_time, why)
--       the new time is known. Both people are told the new time ('moved',
--       from 099's trigger). The interview never stops existing and the
--       joining link is kept.
--
--   cancel_placement_interview(slot, why)
--       there is no new time yet. Both people are told it is off
--       ('cancelled', posted here while the row still exists), the row goes,
--       and the client offers fresh times the usual way — offer_interview
--       refuses only while a confirmed slot exists, and there no longer is one.
--
-- Who may call them: the client of that placement, or staff
-- (applications.edit). Not the assistant: in 057's handshake the client
-- proposes and confirms, and she picks. If a time stops working for her she
-- says so to the client or to us, and one of them moves it — the same as an
-- applicant, who asks us rather than moving her own interview.
--
-- Same sanity checks as offering: not in the past, not more than four months
-- out, not the time it already is, a reason of at most 500 characters.
--
-- The reason goes to both people, in the 'moved' or 'cancelled' email, as
-- record.reason (absent when none was given). A placement has no note log for
-- it to go into instead, as 070's applicant reason does. api/notify quotes it
-- the way it quotes a swap's reply (CONTRACT.md).

do $pre$
begin
  if to_regprocedure('public.post_interview_note_with_reason(text, text, text, text, text, public.interview_slots, text)') is null then
    raise exception 'sql/099 has not been run on this database.';
  end if;
end
$pre$;

-- ── moving it ───────────────────────────────────────────────────────────────

create or replace function public.reschedule_placement_interview(
  slot uuid, at_time timestamptz, why text default null
)
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  row_ public.interview_slots;
begin
  if auth.uid() is null then
    raise exception 'sign in first';
  end if;

  select * into row_ from public.interview_slots s where s.id = slot;

  if row_.id is null then
    raise exception 'no such time';
  end if;

  if row_.placement_id is null then
    raise exception 'that is an applicant interview, not a placement one';
  end if;

  if not (public.is_placement_client(row_.placement_id)
          or public.has_permission('applications.edit')) then
    raise exception 'that is not your interview to move';
  end if;

  -- Unconfirmed is not moving anything: withdraw it and offer another.
  if row_.confirmed_at is null then
    raise exception 'that one is not confirmed — withdraw it and offer another';
  end if;

  if at_time < now() then
    raise exception 'that time has already passed';
  end if;

  if at_time > now() + interval '120 days' then
    raise exception 'that is more than four months away';
  end if;

  if at_time = row_.starts_at then
    raise exception 'that is the time it is already at';
  end if;

  if coalesce(length(why), 0) > 500 then
    raise exception 'that reason is too long';
  end if;

  -- The reason rides to 099's trigger, which posts 'moved' to both people and
  -- quotes it (record.reason). Set for this transaction only, and cleared
  -- straight after, so nothing else in the same transaction picks it up.
  perform set_config('sjva.interview_reason', coalesce(btrim(why), ''), true);

  -- One update, so 099's trigger sees one change and tells each side once.
  -- The link is untouched: it is nearly always the same room.
  update public.interview_slots
     set starts_at = at_time
   where id = slot;

  perform set_config('sjva.interview_reason', '', true);

  return at_time;
end;
$fn$;

revoke all on function public.reschedule_placement_interview(uuid, timestamptz, text)
  from public, anon;
grant execute on function public.reschedule_placement_interview(uuid, timestamptz, text)
  to authenticated;

-- ── calling it off ──────────────────────────────────────────────────────────

create or replace function public.cancel_placement_interview(
  slot uuid, why text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  row_ public.interview_slots;
  info record;
begin
  if auth.uid() is null then
    raise exception 'sign in first';
  end if;

  select * into row_ from public.interview_slots s where s.id = slot;

  if row_.id is null then
    raise exception 'no such time';
  end if;

  if row_.placement_id is null then
    raise exception 'that is an applicant interview, not a placement one';
  end if;

  if not (public.is_placement_client(row_.placement_id)
          or public.has_permission('applications.edit')) then
    raise exception 'that is not your interview to cancel';
  end if;

  if row_.confirmed_at is null then
    raise exception 'that one is not confirmed — withdraw it instead';
  end if;

  if coalesce(length(why), 0) > 500 then
    raise exception 'that reason is too long';
  end if;

  select a.name  as assistant_name,
         a.email as assistant_email,
         c.name  as client_name,
         cp.contact_name  as client_contact,
         cp.contact_email as client_email
    into info
    from public.placements p
    join public.applications a on a.id = p.application_id
    left join public.clients c on c.id = p.client_id
    left join public.client_private cp on cp.client_id = c.id
   where p.id = row_.placement_id;

  -- Told while there is still a row to tell them about, as 071 does, with
  -- the reason quoted to both (record.reason) when one was given.
  if coalesce(info.assistant_email, '') <> '' then
    perform public.post_interview_note_with_reason(
      'cancelled', 'assistant', info.assistant_name, info.assistant_email,
      coalesce(info.client_name, 'a client'), row_, why);
  end if;

  if coalesce(info.client_email, '') <> '' then
    perform public.post_interview_note_with_reason(
      'cancelled', 'client', coalesce(info.client_contact, info.client_name),
      info.client_email, coalesce(info.assistant_name, 'your assistant'), row_, why);
  end if;

  delete from public.interview_slots where id = slot;
end;
$fn$;

revoke all on function public.cancel_placement_interview(uuid, text) from public, anon;
grant execute on function public.cancel_placement_interview(uuid, text) to authenticated;

insert into public.schema_migrations (n) values (100) on conflict (n) do nothing;

-- ==========================================================================
-- Check it worked
-- ==========================================================================
--
-- The two functions, each callable by a signed-in session and not by anon,
-- next to every confirmed placement interview they can now move. Expect two
-- function rows saying 'signed in only', then one row per confirmed
-- interview (none is fine).

select 'function' as what, p.proname::text as name,
       case when has_function_privilege('anon', p.oid, 'EXECUTE') then 'ANON CAN CALL'
            when has_function_privilege('authenticated', p.oid, 'EXECUTE') then 'signed in only'
            else 'nobody can call' end as detail,
       null::timestamptz as starts_at
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.proname in ('reschedule_placement_interview', 'cancel_placement_interview')
union all
select 'confirmed interview', coalesce(c.name, 'a client') || ' with ' || a.name,
       coalesce(s.meeting_url, 'no link'), s.starts_at
from public.interview_slots s
join public.placements pl on pl.id = s.placement_id
join public.applications a on a.id = pl.application_id
left join public.clients c on c.id = pl.client_id
where s.confirmed_at is not null
order by 1 desc, 4;
