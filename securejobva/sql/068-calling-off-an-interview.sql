-- 068 — calling off an interview

-- Run after: 062 (the functions), 058 (post_interview_note), 022 (the notes)
-- Safe to re-run: yes
-- Also needed: nothing in the dashboard.
--
-- ==========================================================================
-- THE PROMISE WITH NOTHING BEHIND IT
-- ==========================================================================
--
-- Once an interview was confirmed there was no way out of it. Not one that
-- was hard to find — one that did not exist.
--
--   withdraw_application_slot   refuses a confirmed slot, and says so well:
--                               "cancel it with her, not from here".
--   offer_application_interview refuses to offer new times while one stands:
--                               "that interview is already confirmed".
--   /admin                      draws no control: "Withdraw is off — moving a
--                               confirmed interview is a conversation, not a
--                               button".
--
-- Every one of those is right on its own. Together they describe a
-- conversation and then provide nothing to do afterwards. You agree with her
-- on the phone that Wednesday no longer works, and then you cannot offer her
-- Thursday, cannot take Wednesday off the books, and cannot stop her seeing a
-- Join button for a meeting nobody will be at.
--
-- Her own page says, in the confirmed state, in her own words:
--
--     "If you need to move it, tell us and we will offer new times."
--
-- She tells us. Nothing can offer them. That is the same shape as 031's mail
-- promising times that were not there — a page asserting something no
-- function can deliver — and it is worth naming as the pattern rather than
-- the incident, because that is twice now.
--
-- ==========================================================================
-- WHAT THIS DOES, AND WHAT IT DELIBERATELY DOES NOT
-- ==========================================================================
--
-- Cancelling removes the slot. It does not mark it cancelled and leave it in
-- the table.
--
-- A cancelled_at column reads like the more careful choice, and it is the more
-- careful choice for the record. The cost is that every place deriving state
-- from these rows would have to learn to skip them: the confirmed/chosen/live
-- split on both pages, the "already confirmed" test above, and three separate
-- alerts on the Interviews tab that ask whether somebody has a time. Six
-- readers, each one a place to forget — and forgetting means a cancelled
-- interview that still counts as an interview somewhere, which is the exact
-- bug being fixed, moved rather than removed.
--
-- Deleting the row costs nothing anywhere else, because "no confirmed slot"
-- is a state everything already understands.
--
-- What is lost is the history, so this writes it where history already lives:
-- a note on the application, carrying who cancelled, the time that was
-- dropped, and the reason if one was given. "We moved her twice" is a real
-- thing to need to know, and the note log is the place people already look
-- for it.
--
-- The mail goes out BEFORE the delete, because post_interview_note takes the
-- row and there will not be one afterwards.

-- ==========================================================================
-- 1. CALLING IT OFF
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

  -- An unconfirmed time is a withdrawal, and 062 already does that. Sending
  -- somebody here for one would mail her about calling off an interview she
  -- was never told she had.
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

  -- ── tell her, while there is still a row to tell her about ────────────
  --
  -- Guarded on an address the same way every other branch in 066 is: a row
  -- with no email is a row we cannot write to, and failing the cancellation
  -- over it would leave the interview standing.
  if coalesce(info.email, '') <> '' then
    perform public.post_interview_note(
      'cancelled', 'applicant', info.name, info.email, 'SecureJobVA', row_);
  end if;

  -- ── the record, where records of this person already live ─────────────
  insert into public.application_note_log (application_id, note, author)
  values (
    row_.application_id,
    'Interview cancelled — was ' ||
      to_char(row_.starts_at at time zone 'America/Chicago',
              'Dy DD Mon HH12:MI AM') || ' Central.' ||
      case when coalesce(why, '') <> '' then ' Reason: ' || why else '' end,
    who);

  -- ── and take it off the books ─────────────────────────────────────────
  delete from public.interview_slots where id = slot;

  update public.application_tracking
     set interview_at = null
   where application_id = row_.application_id;
end;
$fn$;

revoke all on function public.cancel_application_interview(uuid, text) from public, anon;
grant execute on function public.cancel_application_interview(uuid, text) to authenticated;

-- ==========================================================================
-- Check it worked
-- ==========================================================================

select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name = 'cancel_application_interview';

-- Confirmed applicant interviews, which are the rows this can act on.
select a.name, s.starts_at, coalesce(s.meeting_url, '— no link —') as joining
from public.interview_slots s
join public.applications a on a.id = s.application_id
where s.confirmed_at is not null
order by s.starts_at;

insert into public.schema_migrations (n) values (68) on conflict (n) do nothing;
