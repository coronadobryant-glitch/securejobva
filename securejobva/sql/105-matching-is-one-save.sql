-- 105 — matching somebody to a client is one save
--
-- Run after: 104
-- Safe to re-run: yes
-- Also needed: /admin's match form calling place_assistant() instead of its
--   four requests (CONTRACT.md). Until it does, the form works as it does
--   today, partial saves and all.
--
-- ==========================================================================
-- FOUR REQUESTS, ANY OF WHICH CAN BE THE LAST (F39)
-- ==========================================================================
--
-- The match form in /admin makes up to five separate requests: the client, its
-- private half, the placement, and the two rates. Each is its own transaction.
-- A failure between them leaves what came before:
--
--   - a client with no private half — no contact address, so nobody at that
--     business can sign in, and (before 104) nowhere in /admin to add one
--   - a placement with no rates, which the client's statement cannot price
--   - and pressing Save again after either makes the client a second time
--
-- place_assistant() does all of it in one transaction. Either every row is
-- written or none is, and the error says which rule refused it.
--
--   place_assistant(
--     application  uuid,              who is being placed
--     client       uuid,              an existing client — or null, and then:
--     business     text,                the new client's name (required then)
--     contact      text,                its contact's name
--     address      text,                its contact's address
--     cycle        text,                'weekly' or 'monthly'
--     starts_on    date,              the proposed first day (042 lets the
--                                     client confirm or change it)
--     hours        integer,           hours a week, 1–168, default 40
--     trial_weeks  integer,           null or 0 for no trial, else 1–52
--     bill_rate    numeric,           what the client pays an hour
--     pay_rate     numeric,           what she is paid an hour
--     from_request uuid               the seat request this came from (102)
--   ) returns uuid                    the placement
--
-- The rules the form checks today, kept here so a page cannot skip them:
-- a start day, both rates, rates rounded to the cent as typed (the form's
-- rule, so 7.755 is refused rather than silently becoming 7.76), the
-- assistant never paid more than the client is charged, one live placement
-- per assistant (032's index, refused here first with a sentence), and only
-- somebody who is hired. A new client goes through 104's create_client rules.
--
-- The emails are what they were: the placement row fires 035's
-- notify_decision ("we have found you a client") and 040's invite to the
-- client contact, now both through the outbox (096) — and because they are
-- queued in the same transaction, a failed match sends neither.

do $pre$
begin
  if to_regprocedure('public.create_client(text, text, text, text, text, uuid)') is null then
    raise exception 'sql/104 has not been run on this database.';
  end if;
end
$pre$;

create or replace function public.place_assistant(
  application  uuid,
  client       uuid,
  business     text,
  contact      text,
  address      text,
  cycle        text,
  starts_on    date,
  hours        integer,
  trial_weeks  integer,
  bill_rate    numeric,
  pay_rate     numeric,
  from_request uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  cid   uuid := client;
  pid   uuid;
  stage text;
  who   text;
begin
  if auth.uid() is null then
    raise exception 'sign in first';
  end if;
  if not public.has_permission('applications.edit') then
    raise exception 'only SecureJobVA staff can match an assistant to a client';
  end if;

  select a.status, a.name into stage, who from public.applications a where a.id = application;
  if stage is null then
    raise exception 'no such applicant';
  end if;
  if stage <> 'hired' then
    raise exception '% is at %, not hired. Move her to Hired first; only somebody on the team can be placed.', who, stage
      using hint = 'sjva-place-not-hired';
  end if;

  if exists (select 1 from public.placements p
              where p.application_id = application
                and p.status in ('matched', 'trial', 'ongoing')) then
    raise exception '% already has a live placement. End it before matching her again.', who
      using hint = 'sjva-place-already-live';
  end if;

  if starts_on is null then
    raise exception 'Which day do they start?' using hint = 'sjva-place-start';
  end if;

  if bill_rate is null or pay_rate is null then
    raise exception 'Both rates are needed: what the client pays an hour, and what she is paid.'
      using hint = 'sjva-place-rates';
  end if;
  if bill_rate < 0 or pay_rate < 0 or bill_rate > 100000 or pay_rate > 100000
     or bill_rate <> round(bill_rate, 2) or pay_rate <> round(pay_rate, 2) then
    raise exception 'A rate is dollars and cents: 7.75, not 7.755.' using hint = 'sjva-place-rates';
  end if;
  if pay_rate > bill_rate then
    raise exception 'The assistant is set to be paid more than the client is charged. Check both numbers.'
      using hint = 'sjva-place-rates';
  end if;

  if coalesce(hours, 40) not between 1 and 168 then
    raise exception 'Hours a week is between 1 and 168.' using hint = 'sjva-place-hours';
  end if;
  if coalesce(trial_weeks, 0) not between 0 and 52 then
    raise exception 'A trial is up to 52 weeks, or none.' using hint = 'sjva-place-trial';
  end if;

  -- A new client, with every rule 104 holds a client to. Inside this
  -- transaction, so a refusal further down takes the client with it.
  if cid is null then
    cid := public.create_client(business, contact, address, coalesce(cycle, 'weekly'), null, from_request);
  elsif not exists (select 1 from public.clients c where c.id = cid) then
    raise exception 'no such client';
  elsif from_request is not null then
    update public.seat_requests set client_id = cid where id = from_request;
  end if;

  insert into public.placements
    (application_id, client_id, status, started_on, hours_per_week, trial_weeks)
  values
    (application, cid, 'matched', starts_on, coalesce(hours, 40), nullif(trial_weeks, 0))
  returning id into pid;

  insert into public.placement_billing (placement_id, rate) values (pid, bill_rate);
  insert into public.placement_pay     (placement_id, rate) values (pid, pay_rate);

  return pid;
end;
$fn$;

revoke all on function public.place_assistant(uuid, uuid, text, text, text, text, date, integer, integer, numeric, numeric, uuid)
  from public, anon;
grant execute on function public.place_assistant(uuid, uuid, text, text, text, text, date, integer, integer, numeric, numeric, uuid)
  to authenticated;

insert into public.schema_migrations (n) values (105) on conflict (n) do nothing;

-- ==========================================================================
-- Check it worked
-- ==========================================================================
--
-- What the old four-request form may already have left half-made. Empty is
-- the pass. Each row is one to finish by hand (rates on the placement's row
-- in /admin; a contact with update_client from 104):
--
--   placement with no rates    a live placement missing one or both rates
--   client with no contact     a client with no address, or no private half
--   same name twice            two clients a retry may have made

select 'placement with no rates' as half_made,
       coalesce(c.name, '?') || ' — ' || a.name as which
from public.placements p
join public.applications a on a.id = p.application_id
left join public.clients c on c.id = p.client_id
where p.status in ('matched', 'trial', 'ongoing')
  and (not exists (select 1 from public.placement_billing b where b.placement_id = p.id)
       or not exists (select 1 from public.placement_pay y where y.placement_id = p.id))
union all
select 'client with no contact', c.name
from public.clients c
left join public.client_private cp on cp.client_id = c.id
where coalesce(btrim(cp.contact_email), '') = ''
union all
select 'same name twice', min(c.name)
from public.clients c
group by lower(btrim(c.name))
having count(*) > 1
order by 1, 2;
