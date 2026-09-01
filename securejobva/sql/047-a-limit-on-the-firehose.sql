-- DO NOT RE-RUN THIS FILE ON ITS OWN
--
-- The header above says this file is safe to re-run, and on its own it is:
-- every statement in it is written to be repeatable. What it is not safe to
-- do is run it AFTER the files that come later, because it defines functions
-- they have since replaced — and `create or replace` does exactly what it
-- says. Re-running this puts its own versions back.
--
-- Nothing warns you when that happens. Columns are added with `if not
-- exists` so they survive; only the logic goes backwards. The schema looks
-- perfect and the behaviour is months old.
--
-- What this file would take back, and what to run afterwards to undo it:
--
--   throttle_intake
--     -> re-run 052-the-counter-forgets.sql to restore
--
-- So if you ever run this file again, run every later file it names above,
-- in number order, straight afterwards. tools/check.mjs keeps this list
-- honest: a new file that supersedes something here fails the build until
-- this block names it.
-- 047 — a limit on the firehose
--
-- Run after: 046
-- Safe to re-run: yes
-- Also needed: nothing in the dashboard. But read WHAT TO CHECK AFTER RUNNING
-- at the bottom — one line of this depends on something only the live project
-- can confirm, and it is written to fail safe if that thing is not there.
--
-- Two problems, one shape.
--
--   1  Nothing limits how many times the public forms may be submitted.
--   2  Nothing limits what may be uploaded to the documents bucket.
--
-- Both come from the same deliberate design: the pages talk to PostgREST
-- directly with the publishable key, so there is no server of ours in the
-- path to put a limit on. That design is why the site is fast and cheap and it
-- is not being undone here — the limit goes where the request actually lands,
-- which is the database.
--
-- ==========================================================================
-- WHY NOT A FUNCTION IN FRONT OF THE FORMS
-- ==========================================================================
--
-- The obvious build is to move the two forms behind /api and rate-limit there.
-- It does not work while the tables still accept an insert from anon, because
-- anybody can skip the endpoint and post to PostgREST exactly as the page
-- does — the key is in the page source, which is by design.
--
-- Closing that means revoking insert from anon and giving the endpoint a
-- credential of its own. The only credential Supabase offers for that is the
-- service role key, and README.md is emphatic, correctly, that it does not go
-- in a function reachable from the internet. So: the limit goes in the
-- database, where every path arrives no matter which door it used.

-- ==========================================================================
-- WHERE THE COUNTING HAPPENS
-- ==========================================================================
--
-- One row per caller per table per window. Small, self-cleaning, and written
-- by a trigger rather than by anybody with a key.

create table if not exists public.intake_throttle (
  bucket       text primary key,
  window_start timestamptz not null default now(),
  n            integer not null default 0
);

alter table public.intake_throttle enable row level security;

-- Nobody. Not anon, not a signed-in user, not staff. The trigger below is
-- security definer and writes it; there is no reason for anything else to read
-- or write a table whose only purpose is to say no.
revoke all on public.intake_throttle from anon, authenticated;

-- ==========================================================================
-- WHO IS ASKING
-- ==========================================================================
--
-- PostgREST publishes the request's headers into a GUC, so a trigger can see
-- the caller's address without anything in front of it. Supabase sits behind a
-- proxy, so the address is the first hop in x-forwarded-for.
--
-- FAILS OPEN, ON PURPOSE. If that setting is missing — a different PostgREST
-- version, a direct connection, a psql session — this returns null and the
-- caller is not counted at all. The alternative is a rule that silently
-- refuses every lead the moment an assumption stops holding, and losing every
-- lead is a far worse failure than admitting a bot.
create or replace function public.caller_ip()
returns text
language plpgsql
stable
as $fn$
declare
  raw text;
begin
  begin
    raw := current_setting('request.headers', true)::json ->> 'x-forwarded-for';
  exception when others then
    return null;
  end;
  if raw is null or btrim(raw) = '' then
    return null;
  end if;
  -- "client, proxy1, proxy2" — the client is the first.
  return btrim(split_part(raw, ',', 1));
end;
$fn$;

revoke all on function public.caller_ip() from public, anon, authenticated;

-- ==========================================================================
-- THE LIMIT
-- ==========================================================================
--
-- A fixed window rather than a sliding one: it is a handful of rows and a
-- comparison instead of a scan over history, and the difference between the
-- two only matters to somebody trying to squeeze out an extra few requests an
-- hour, which is not the person this is for.
--
-- The numbers are set so that no real person will ever meet them. A business
-- filling in the booking form twice because they mistyped an address is two.
-- Ten is somebody testing, and they are welcome to. A hundred is a script.

create or replace function public.throttle_intake()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  ip     text := public.caller_ip();
  lim    integer;
  key    text;
  cur    public.intake_throttle%rowtype;
begin
  -- No address, no counting. See caller_ip() for why this is the safe way
  -- round.
  if ip is null then
    return new;
  end if;

  lim := case tg_table_name
           when 'applications'     then 5
           when 'seat_requests'    then 10
           when 'contact_messages' then 10
           else 20
         end;

  key := ip || ':' || tg_table_name;

  insert into public.intake_throttle (bucket, window_start, n)
  values (key, now(), 0)
  on conflict (bucket) do nothing;

  select * into cur from public.intake_throttle where bucket = key for update;

  -- A window older than an hour is a window that is over.
  if cur.window_start < now() - interval '1 hour' then
    update public.intake_throttle
       set window_start = now(), n = 1
     where bucket = key;
    return new;
  end if;

  if cur.n >= lim then
    raise exception
      'That is more submissions than we accept from one place in an hour. Write to support@securejobva.com and a person will pick it up.'
      using hint = 'sjva-throttled';
  end if;

  update public.intake_throttle set n = cur.n + 1 where bucket = key;
  return new;
end;
$fn$;

revoke all on function public.throttle_intake() from public, anon, authenticated;

drop trigger if exists throttle_applications on public.applications;
create trigger throttle_applications
  before insert on public.applications
  for each row execute function public.throttle_intake();

drop trigger if exists throttle_seat_requests on public.seat_requests;
create trigger throttle_seat_requests
  before insert on public.seat_requests
  for each row execute function public.throttle_intake();

drop trigger if exists throttle_contact_messages on public.contact_messages;
create trigger throttle_contact_messages
  before insert on public.contact_messages
  for each row execute function public.throttle_intake();

-- Old windows are of no interest to anybody. Cleared opportunistically rather
-- than on a schedule, because a cron job for a table that holds a few hundred
-- rows is a moving part that has to be maintained forever.
delete from public.intake_throttle where window_start < now() - interval '2 days';

-- ==========================================================================
-- THE BUCKET
-- ==========================================================================
--
-- 013 lets anon upload into a folder whose name has the SHAPE of an id. It
-- never checks that the id belongs to anything. Nobody can read or overwrite
-- somebody else's file — there is no anon select and no anon update, and that
-- part was right — but an unlimited number of 10 MB files can be written into
-- invented folders, and storage is billed by the gigabyte.
--
-- The page uploads only after the application row has been written, so by the
-- time a file arrives there is always a real row to point at. That makes the
-- check possible: the folder has to be an application that exists.
--
-- A TRIGGER, NOT A POLICY, and the first attempt at this file got it wrong.
--
-- The obvious build puts the check in the policy: `and application_exists(...)`.
-- A policy is evaluated as the CALLING role, so anon would need EXECUTE on
-- that function — and tools/check.mjs refused the file, correctly, on two
-- counts at once: anon would hold something other than INSERT for the first
-- time in this project's history, and the function would be SECURITY DEFINER,
-- reachable by anyone, and never ask who was calling.
--
-- A trigger runs as its owner and needs no grant to anybody. anon gains
-- nothing at all, the policy keeps saying the one thing a policy is good at —
-- what the name has to look like — and the questions that need to read another
-- table are asked somewhere that is allowed to read it.

create or replace function public.check_applicant_upload()
returns trigger
language plpgsql
security definer
set search_path = public, storage, pg_temp
as $fn$
declare
  folder text;
  used   integer;
begin
  if new.bucket_id is distinct from 'applicant-docs' then
    return new;
  end if;

  folder := (storage.foldername(new.name))[1];

  if folder is null
     or folder !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'that is not a document folder';
  end if;

  -- The whole point. An invented folder is now refused instead of billed for.
  if not exists (select 1 from public.applications a where a.id = folder::uuid) then
    raise exception 'there is no application to attach that file to';
  end if;

  -- A CV, a certificate, an ID, and room to get it wrong twice.
  select count(*) into used
  from storage.objects o
  where o.bucket_id = 'applicant-docs'
    and (storage.foldername(o.name))[1] = folder;

  if used >= 5 then
    raise exception 'that application already holds as many files as it may';
  end if;

  return new;
end;
$fn$;

revoke all on function public.check_applicant_upload() from public, anon, authenticated;

drop trigger if exists applicant_upload_belongs_to_somebody on storage.objects;
create trigger applicant_upload_belongs_to_somebody
  before insert on storage.objects
  for each row execute function public.check_applicant_upload();

-- 013's policy is left exactly as it was. It still checks the shape of the
-- name, which is the right job for a policy, and the trigger above now checks
-- the two things a policy could not ask without handing anon a new privilege.

-- ==========================================================================
-- WHAT TO CHECK AFTER RUNNING
-- ==========================================================================
--
-- ONE THING MATTERS AND IT CANNOT BE CHECKED FROM THE REPO.
--
-- Everything above rests on PostgREST publishing request.headers into a GUC
-- this database can read. It does on Supabase today. If it ever does not,
-- caller_ip() returns null, throttle_intake() waves everything through, and
-- the forms behave exactly as they did before this file — no leads lost, no
-- limit applied.
--
-- So run this and then confirm the limit is actually on, rather than assuming
-- it. Submit the contact form once from a browser and look:

select bucket, window_start, n
from public.intake_throttle
order by window_start desc
limit 10;

-- A row means the address is visible and the limit is live.
-- NO ROWS means caller_ip() is returning null and NOTHING IS BEING LIMITED —
-- the forms still work, and the protection is not there. Say so out loud
-- rather than believing a file that ran without error.

-- The upload trigger is on. Without this row, invented folders are still
-- accepted and the policy alone is back to checking only the shape.
select tgname, tgenabled
from pg_trigger
where tgrelid = 'storage.objects'::regclass
  and tgname = 'applicant_upload_belongs_to_somebody';

-- Nobody holds anything on the counter table.
select grantee, privilege_type
from information_schema.role_table_grants
where table_name = 'intake_throttle' and grantee in ('anon', 'authenticated');

-- Files sitting in folders that are not applications. Anything here was
-- written before this file ran and can be deleted.
select f.folder, count(*) as files, sum((o.metadata->>'size')::bigint) as bytes
from storage.objects o
cross join lateral (select (storage.foldername(o.name))[1] as folder) f
where o.bucket_id = 'applicant-docs'
  and f.folder ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and not exists (select 1 from public.applications a where a.id = f.folder::uuid)
group by f.folder
order by bytes desc nulls last;

insert into public.schema_migrations (n) values (47) on conflict (n) do nothing;
