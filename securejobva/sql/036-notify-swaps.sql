-- 036 — tell somebody when a client wants a different assistant
--
-- Run after: 035
-- Safe to re-run: yes
-- Also needed: nothing in the dashboard. Same WEBHOOK_SECRET as 028/031/035.
--
-- 032 gave a client a way to ask for somebody else and put the request in a
-- queue with a count on a tab. Nothing tells anybody it arrived.
--
-- Of everything in this system that could go unnoticed, this is the worst. A
-- client has said the placement is not working. Somebody's job is the subject,
-- the client is waiting on a reply, and the only way to find out is to happen
-- to open /admin and look at the right tab. That is the failure 031 and 035
-- were written to end, in the one place where it costs most.
--
-- ==========================================================================
-- IT GOES TO STAFF, AND ONLY TO STAFF
-- ==========================================================================
--
-- The assistant is not told, and must never be. 032 already keeps her out of
-- swap_requests entirely — she cannot read the table — and this keeps her out
-- of the mail too. Nobody should learn from an inbox that a client asked for
-- them to be replaced. That is a conversation somebody has with her, in their
-- own words, once it is known what is actually happening.
--
-- So this is an 'arrived' message: it reaches NOTIFY_TO like a seat request
-- does, and there is no outbound half at all.

do $$
begin
  if '__WEBHOOK_SECRET__' like ('\_\_WEBHOOK' || '\_SECRET\_\_') then
    raise exception
      'This is the repo copy, with the placeholder still in it. Paste the filled-in copy instead — the one with the real WEBHOOK_SECRET, from the scratchpad or from Vercel.';
  end if;
end $$;

-- ==========================================================================
-- ITS OWN FUNCTION
-- ==========================================================================
--
-- Not folded into notify_decision(). Every table that one handles reaches its
-- person through application_id; a swap request points at a placement and its
-- subject is the client, not the assistant. Bending the shared function around
-- a row that works the other way would make the next reader of it wrong about
-- all five.

create or replace function public.notify_swap()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  info    record;
  payload jsonb;
begin
  select a.name as assistant, c.name as client, p.started_on, p.status as placement_status
    into info
    from public.placements p
    join public.applications a on a.id = p.application_id
    left join public.clients c on c.id = p.client_id
   where p.id = new.placement_id;

  payload := jsonb_build_object(
    'type',  'STATUS',
    'event', 'arrived',
    'table', 'swap_requests',
    -- No person block. This one is addressed to staff and to nobody else, and
    -- leaving it empty is what stops a future edit reaching for it.
    'person', jsonb_build_object(),
    'record', jsonb_build_object(
      'id',         new.id,
      'reason',     new.reason,
      'assistant',  coalesce(info.assistant, 'an assistant'),
      'client',     coalesce(info.client, 'a client'),
      'since',      info.started_on,
      'placement',  info.placement_status)
  );

  begin
    perform net.http_post(
      url     := 'https://www.securejobva.com/api/notify',
      body    := payload,
      headers := jsonb_build_object(
        'Content-Type',    'application/json',
        'x-webhook-secret', '__WEBHOOK_SECRET__'),
      timeout_milliseconds := 10000
    );
  exception when others then
    raise warning 'notify_swap could not post for %: %', new.id, sqlerrm;
  end;

  return new;
end;
$fn$;

revoke all on function public.notify_swap() from public, anon, authenticated;

drop trigger if exists "notify-swap-asked" on public.swap_requests;
create trigger "notify-swap-asked"
  after insert on public.swap_requests
  for each row
  execute function public.notify_swap();

-- ==========================================================================
-- Check it worked
-- ==========================================================================
--
-- Ten rows now, and the two functions should carry the same secret.

select c.relname as table_name, t.tgname as trigger_name, p.proname as runs
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_proc p on p.oid = t.tgfoid
where not t.tgisinternal and t.tgname like 'notify-%'
order by c.relname, t.tgname;

select proname,
       md5(substring(prosrc from 'x-webhook-secret'',\s*''([^'']+)')) as secret_md5
from pg_proc
where proname in ('notify_decision', 'notify_swap')
order by proname;
