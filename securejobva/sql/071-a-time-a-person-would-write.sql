-- 071 — a time a person would write

-- Run after: 068 and 070 (the two functions this replaces)
-- Safe to re-run: yes
-- Also needed: nothing in the dashboard.
--
-- ==========================================================================
-- 02:00 PM
-- ==========================================================================
--
-- The notes written when an interview is cancelled or moved came out like
-- this:
--
--   Interview moved — was Wed 16 Sep 10:00 AM, now Thu 17 Sep 02:00 PM Central.
--
-- Nobody writes "02:00 PM". to_char's HH12 zero-pads, and DD does too, so a
-- day early in the month reads "Wed 06 Sep" the same way. FM turns the padding
-- off for the field that follows it, which is what these want.
--
-- MI keeps its padding deliberately: minutes are the one field where dropping
-- the zero is wrong, because "10:5" is not a time.
--
-- Two other things fixed in the same pass, since the line was being rewritten
-- anyway:
--
--   Both times now say Central. It used to sit at the end of the sentence,
--   after the second one, where it could be read as qualifying only that.
--   A note about moving an interview between two times is exactly the place
--   not to leave a zone ambiguous.
--
--   The cancelled note says "was to be", not "was". The interview never
--   happened, and "was Fri 11 Sep" reads like it did.
--
-- Nothing else in either function changes. This is the wording of a note and
-- nothing more — no behaviour, no permission, no mail.

-- ==========================================================================
-- 1. CANCELLING
-- ==========================================================================

create or replace function public.cancel_application_interview(
  slot uuid, why text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  row_   public.interview_slots;
  who    text;
  info   record;
begin
  if auth.uid() is null then
    raise exception 'sign in first';
  end if;

  if not public.has_permission('applications.edit') then
    raise exception 'not yours to cancel';
  end if;

  select * into row_ from public.interview_slots s where s.id = slot;

  if row_.id is null then
    raise exception 'no such time';
  end if;

  if row_.confirmed_at is null then
    raise exception 'that one is not confirmed — withdraw it instead';
  end if;

  if row_.application_id is null then
    raise exception 'that is a placement interview, not an applicant one';
  end if;

  if coalesce(length(why), 0) > 500 then
    raise exception 'that reason is too long';
  end if;

  select a.name, a.email into info
    from public.applications a where a.id = row_.application_id;

  who := coalesce(auth.jwt() ->> 'email', 'somebody');

  -- Told while there is still a row to tell her about.
  if coalesce(info.email, '') <> '' then
    perform public.post_interview_note(
      'cancelled', 'applicant', info.name, info.email, 'SecureJobVA', row_);
  end if;

  insert into public.application_note_log (application_id, note, author)
  values (
    row_.application_id,
    'Interview cancelled — was to be ' ||
      to_char(row_.starts_at at time zone 'America/Chicago',
              'Dy FMDD Mon FMHH12:MI AM') || ' Central.' ||
      case when coalesce(why, '') <> '' then ' Reason: ' || why else '' end,
    who);

  delete from public.interview_slots where id = slot;

  update public.application_tracking
     set interview_at = null
   where application_id = row_.application_id;
end;
$fn$;

revoke all on function public.cancel_application_interview(uuid, text) from public, anon;
grant execute on function public.cancel_application_interview(uuid, text) to authenticated;

-- ==========================================================================
-- 2. MOVING
-- ==========================================================================

create or replace function public.reschedule_application_interview(
  slot uuid, at_time timestamptz, why text default null
)
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  row_ public.interview_slots;
  who  text;
begin
  if auth.uid() is null then
    raise exception 'sign in first';
  end if;

  if not public.has_permission('applications.edit') then
    raise exception 'not yours to move';
  end if;

  select * into row_ from public.interview_slots s where s.id = slot;

  if row_.id is null then
    raise exception 'no such time';
  end if;

  if row_.application_id is null then
    raise exception 'that is a placement interview, not an applicant one';
  end if;

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

  who := coalesce(auth.jwt() ->> 'email', 'somebody');

  -- The note first: it wants both times, and the row is about to hold one.
  insert into public.application_note_log (application_id, note, author)
  values (
    row_.application_id,
    'Interview moved — was ' ||
      to_char(row_.starts_at at time zone 'America/Chicago',
              'Dy FMDD Mon FMHH12:MI AM') || ' Central, now ' ||
      to_char(at_time at time zone 'America/Chicago',
              'Dy FMDD Mon FMHH12:MI AM') || ' Central.' ||
      case when coalesce(why, '') <> '' then ' Reason: ' || why else '' end,
    who);

  -- One update, so the trigger sees one change and posts one message. The
  -- joining link is deliberately untouched.
  update public.interview_slots
     set starts_at = at_time
   where id = slot;

  update public.application_tracking
     set interview_at = at_time
   where application_id = row_.application_id;

  return at_time;
end;
$fn$;

revoke all on function public.reschedule_application_interview(uuid, timestamptz, text)
  from public, anon;
grant execute on function public.reschedule_application_interview(uuid, timestamptz, text)
  to authenticated;

-- ==========================================================================
-- Check it worked
-- ==========================================================================

select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in ('cancel_application_interview',
                       'reschedule_application_interview')
order by routine_name;

-- What the wording now looks like, without writing anything.
select to_char(timestamptz '2026-09-06 14:00-05' at time zone 'America/Chicago',
               'Dy FMDD Mon FMHH12:MI AM') as reads_as;

insert into public.schema_migrations (n) values (71) on conflict (n) do nothing;
