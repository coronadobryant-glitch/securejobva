-- 069 — one set of times, one email

-- Run after: 067 (the function this replaces)
-- Safe to re-run: yes
-- Also needed: nothing in the dashboard.
--
-- ==========================================================================
-- THREE TIMES OFFERED, THREE IDENTICAL EMAILS
-- ==========================================================================
--
-- notify_interview fires per row, and offering her a choice means inserting
-- two or three rows. Each one posted its own "Your interview — pick a time",
-- so putting up a set of three sent her three identical emails within about
-- a minute of each other, all pointing at the same page.
--
-- Found by doing it: two times were offered in /admin and the trigger was
-- read afterwards to see how many messages that had been.
--
-- The mail belongs to the SET, not to the row. She is told when times first
-- appear on her page, and adding a second and third to a set she has already
-- been told about is not news — the same reasoning 058 already applies to a
-- joining link arriving on a placement interview that was confirmed with one.
--
-- So: post 'offered' only when this row is the first live one. A slot is live
-- if it is neither declined nor confirmed. That gets the cases right without
-- needing to know anything about batches or timing:
--
--   offer three in a row      the first mails, the next two are silent
--   she declines all three    they are declined, so no longer live
--   offer three more          the first of the new set mails again, correctly
--   withdraw one, add another the set was already announced, stays silent
--
-- Nothing else in the function changes, and the placement half is carried
-- across untouched.

create or replace function public.notify_interview()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  moment text;
  info   record;
  others integer;
begin
  if tg_op = 'INSERT' then
    moment := 'offered';
  elsif new.confirmed_at is not null and old.confirmed_at is null then
    moment := 'confirmed';
  elsif new.declined_at is not null and old.declined_at is null then
    moment := 'declined';
  elsif new.chosen_at is not null and old.chosen_at is null then
    moment := 'picked';
  elsif new.confirmed_at is not null
        and new.meeting_url is distinct from old.meeting_url
        and coalesce(new.meeting_url, '') <> '' then
    moment := 'link';
  else
    return new;
  end if;

  -- ── her own interview, with us ─────────────────────────────────────────
  if new.application_id is not null then
    select a.name, a.email
      into info
      from public.applications a
     where a.id = new.application_id;

    -- The set, not the row. Counted excluding this one, and excluding times
    -- that are spent: a declined or confirmed slot is not part of a set she
    -- is still being asked to choose from.
    if moment = 'offered' then
      select count(*) into others
        from public.interview_slots s
       where s.application_id = new.application_id
         and s.id <> new.id
         and s.declined_at is null
         and s.confirmed_at is null;

      if others > 0 then
        -- She has already been told times are up. This is another one landing
        -- on a page she has already been sent to.
        return new;
      end if;
    end if;

    if moment in ('offered', 'confirmed', 'link') and coalesce(info.email, '') <> '' then
      perform public.post_interview_note(
        moment, 'applicant', info.name, info.email, 'SecureJobVA', new);
    end if;

    return new;
  end if;

  -- ── a placement interview, between a client and an assistant ───────────
  --
  -- Carried across from 067 unchanged, including 'link' being absent from
  -- both lists: on a placement the link rides in on the confirmation.
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
   where p.id = new.placement_id;

  if moment in ('offered', 'confirmed') and coalesce(info.assistant_email, '') <> '' then
    perform public.post_interview_note(
      moment, 'assistant', info.assistant_name, info.assistant_email,
      coalesce(info.client_name, 'a client'), new);
  end if;

  if moment in ('picked', 'declined', 'confirmed') and coalesce(info.client_email, '') <> '' then
    perform public.post_interview_note(
      moment, 'client', coalesce(info.client_contact, info.client_name),
      info.client_email, coalesce(info.assistant_name, 'your assistant'), new);
  end if;

  return new;
end;
$fn$;

revoke all on function public.notify_interview() from public, anon, authenticated;

drop trigger if exists "notify-interview" on public.interview_slots;
create trigger "notify-interview"
  after insert or update on public.interview_slots
  for each row execute function public.notify_interview();

-- post_interview_note is untouched, so this file carries no webhook secret
-- and can be run exactly as committed. Same as 066 and 067.

-- ==========================================================================
-- Check it worked
-- ==========================================================================

select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name = 'notify_interview';

-- Live times per applicant. Only the first of each set was mailed.
select a.name, count(*) as live_times
from public.interview_slots s
join public.applications a on a.id = s.application_id
where s.declined_at is null and s.confirmed_at is null
group by a.name
order by a.name;

insert into public.schema_migrations (n) values (69) on conflict (n) do nothing;
