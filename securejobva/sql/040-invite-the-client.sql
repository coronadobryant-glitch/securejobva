-- 040 — tell the client their portal exists
--
-- Run after: 039
-- Also needed: nothing in the dashboard. The endpoint is /api/invite, which
--              ships with the site and needs no new environment variable.
-- Safe to re-run: yes
--
-- 039 gave /seats a door a client could actually use. This is the part that
-- tells them where it is.
--
-- ==========================================================================
-- NOBODY EVER WROTE TO A CLIENT
-- ==========================================================================
--
-- Every notification in this database resolves its recipient the same way,
-- in 035:
--
--   select ... into who from public.applications a where a.id = new.application_id;
--
-- `who` is always the assistant. The trigger fires on placements, timesheets,
-- leave and applications, and in every one of those cases the person block
-- carries the assistant's address with staff copied in separately. A client
-- contact's address is asked for in /admin, stored in client_private, and used
-- as the key to their entire portal — and has never once been sent to.
--
-- Which makes the approval step a thing nobody is waiting for. The assistant
-- sends a week, staff are told, and the one person who can approve it learns
-- nothing. The hours sit there, and the reason they sit there is that we never
-- said the page existed.
--
-- ==========================================================================
-- ONE EMAIL, AT THE MOMENT THERE IS SOMETHING TO SEE
-- ==========================================================================
--
-- On the placement, not on the client. A business created in /admin with no
-- assistant attached has an empty portal, and an invitation to look at nothing
-- is worse than silence. When a placement lands there is a person, a start
-- date, and a week coming.
--
-- Not on 'ended', for the same reason 035 leaves it out: that is a
-- conversation with a person, not a robot's job.
--
-- Every placement, not only the first. Supabase treats a repeat as a fresh
-- sign-in link rather than an error, and a client taking on a second assistant
-- is exactly a moment they need to get back in. No de-duplication to keep
-- correct, and nothing to go stale.

create or replace function public.invite_the_client()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  cmail text;
  cname text;
  aname text;
begin
  -- Read through both halves 039 made. contact_email is optional in /admin, so
  -- this is quite normally null and that is not a failure.
  select p.contact_email, c.name
    into cmail, cname
    from public.clients c
    left join public.client_private p on p.client_id = c.id
   where c.id = new.client_id;

  if cmail is null or btrim(cmail) = '' then
    return new;
  end if;

  select a.name into aname
    from public.applications a
   where a.id = new.application_id;

  -- Wrapped exactly as 031 wraps its own call, and for the same reason. pg_net
  -- queues rather than waits, so this does not hold the transaction open — but
  -- an unhandled exception here would roll back the INSERT and make matching
  -- somebody to a client impossible. A placement that saved and an email that
  -- did not is a person to chase. The other way round is a broken /admin.
  begin
    perform net.http_post(
      url     := 'https://www.securejobva.com/api/invite',
      body    := jsonb_build_object(
        'email',     cmail,
        'business',  cname,
        'assistant', aname,
        'starts_on', new.started_on),
      headers := jsonb_build_object(
        'Content-Type',     'application/json',
        'x-webhook-secret', '__WEBHOOK_SECRET__'),
      timeout_milliseconds := 10000
    );
  exception when others then
    raise warning 'invite_the_client: could not queue the invitation for % (%)', cmail, sqlerrm;
  end;

  return new;
end;
$fn$;

revoke all on function public.invite_the_client() from public, anon, authenticated;

drop trigger if exists placement_invites_the_client on public.placements;
create trigger placement_invites_the_client
  after insert on public.placements
  for each row
  execute function public.invite_the_client();

-- ==========================================================================
-- Check it worked
-- ==========================================================================
--
-- One trigger, on insert, pointing at the function above.

select tgname, pg_get_triggerdef(oid) as definition
from pg_trigger
where tgrelid = 'public.placements'::regclass
  and not tgisinternal
order by tgname;

-- The secret really got substituted. A placeholder here means the repo copy
-- was pasted instead of the filled-in one, and every invitation will be
-- refused by the endpoint with 401 while looking perfectly fine from here.

select case
         when pg_get_functiondef('public.invite_the_client()'::regprocedure)
              like '%\_\_WEBHOOK\_SECRET\_\_%' escape '\'
         then 'PLACEHOLDER STILL IN PLACE — paste the filled-in copy'
         else 'secret substituted'
       end as webhook_secret;

-- And who can be written to at all. A client with no address is a client this
-- will stay silent about, which is correct and worth being able to see.

select c.name,
       case when p.contact_email is null or btrim(p.contact_email) = ''
            then 'no address — will not be invited'
            else 'can be invited' end as reachable
from public.clients c
left join public.client_private p on p.client_id = c.id
order by c.name;
