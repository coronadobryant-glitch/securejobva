-- 075 — one answer for every address
--
-- Run after: 074
-- Safe to re-run: yes
-- Also needed: nothing in the dashboard.
--
-- ==========================================================================
-- WHAT 027 WAS TELLING STRANGERS
-- ==========================================================================
--
-- 027 refuses a second application, and it refuses it in two different
-- sentences depending on what it found:
--
--   a live application    "You already have an application with us..."
--   a recent decline      "...not taken forward that time. You are welcome to
--                          apply again from 14 December 2026."
--
-- Both were written for the person applying, and both are right for her. The
-- trouble is who else can ask. The endpoint is public by design and anon may
-- insert `email`, so anybody holding the key from the page source can post an
-- application under any address and read the answer back:
--
--   one sentence       that person is in our pipeline right now
--   the other          that person applied, was turned down, and on which day
--   anything else      they never applied
--
-- And it costs nothing. A probe built to fail on a CHECK after this trigger
-- runs — a name of 201 characters, say — writes no row, sends no email and,
-- because an aborted statement rolls back everything it did, is never counted
-- by the throttle from 047/052 either. Trigger order cannot fix that last
-- part: the throttle's counter is written inside the same statement, and a
-- refusal takes the increment with it whichever of the two ran first. So this
-- file does not rename anything to change the order.
--
-- ==========================================================================
-- WHAT CHANGES
-- ==========================================================================
--
-- One sentence for both cases, and no date. It says there is an application
-- under this address and where to go to see it, which is true in both cases
-- and is all the person applying needs: /status is where she reads what
-- happened, and — once the page change in the contract lands — the date she
-- may apply again. The rule itself is exactly 027's: live blocks, a decline
-- blocks for three months, the resend of an identical row still reaches the
-- primary key and comes back 409.
--
-- The hint is unchanged, `sjva-one-application`, so careers.html and
-- es/careers.html go on recognising the refusal and showing the message
-- instead of parking the row in a queue it can never leave. A page that wants
-- the Spanish sentence should key it on that hint.
--
-- ==========================================================================
-- WHAT THIS DOES NOT CLOSE
-- ==========================================================================
--
-- One bit is still there: refused versus accepted still says whether the
-- address has applied. Closing that needs the refusal to depend on who is
-- ASKING rather than on what they typed — a verified sign-in before an
-- application under an existing address can be refused or created — and that
-- is a change to how applying works, not to this function. It is left to
-- David as a product decision.
--
-- The squatting case in the finding is untouched for the same reason: anybody
-- can file an application under somebody else's address first. She can sign
-- in with that address and see it, and staff can remove it; stopping it at the
-- door needs the same verified sign-in.
--
-- ==========================================================================
-- THIS REPLACES 027's FUNCTION
-- ==========================================================================
--
-- The body below is 027's with the two messages merged. 027 now needs the
-- DO NOT RE-RUN block that tools/check.mjs asks for, naming this file — the
-- contract lists the exact lines. Until it has it, check.mjs fails on purpose.

do $pre$
begin
  if not exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    where c.relname = 'applications' and t.tgname = 'applications_one_per_person'
  ) then
    raise exception
      'sql/027 has not been run on this database. It creates the trigger whose function this file replaces.';
  end if;
end
$pre$;

create or replace function public.one_application_per_person()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  prev record;
begin
  select a.id, a.status, coalesce(a.status_changed_at, a.created_at) as at
    into prev
    from public.applications a
   where lower(a.email) = lower(new.email)
     and a.id <> new.id
   order by a.created_at desc
   limit 1;

  if not found then
    return new;
  end if;

  -- A decline more than three months old is somebody welcome back. That is
  -- the only case that lets the row through, and it is 027's rule unchanged.
  if prev.status = 'declined' and now() >= prev.at + interval '3 months' then
    return new;
  end if;

  -- Live, or declined recently. The same sentence either way, and no date, so
  -- the answer says nothing about the other row beyond that it exists.
  raise exception
    'There is already an application under this email address. Sign in on the "Your application" page with it to see where it stands.'
    using hint = 'sjva-one-application';
end;
$fn$;

revoke all on function public.one_application_per_person() from public, anon, authenticated;

-- 027's trigger already points at this function by name, so nothing about it
-- changes. Recreated anyway so this file is whole on its own.
drop trigger if exists applications_one_per_person on public.applications;
create trigger applications_one_per_person
  before insert on public.applications
  for each row execute function public.one_application_per_person();

-- ==========================================================================
-- Check it worked
-- ==========================================================================

-- The function no longer knows how to say a date. Must be false.
select pg_get_functiondef(oid) ~ 'to_char' as still_prints_a_date
from pg_proc
where proname = 'one_application_per_person' and pronamespace = 'public'::regnamespace;

-- Still a BEFORE INSERT trigger, still one of it.
select t.tgname,
       case when (t.tgtype::int & 2) = 2 then 'before' else 'after' end as timing
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
where not t.tgisinternal
  and c.relname = 'applications'
  and t.tgname = 'applications_one_per_person';

insert into public.schema_migrations (n) values (75) on conflict (n) do nothing;
