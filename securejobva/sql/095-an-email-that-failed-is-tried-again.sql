-- 095 — an email that failed is tried again
--
-- Run after: 094
-- Safe to re-run: yes
-- Also needed: pg_cron, which this file switches on itself. If Supabase will
--   not let it, the file stops at the first statement with a message saying
--   where to switch it on, and nothing else in it has happened. And, for the
--   retries to be safe, api/notify.js and api/invite.js taught the
--   x-idempotency-key header (see THE KEY below) — until they are, a retry can
--   send a second copy of an email the first try did deliver.
--
-- ==========================================================================
-- ONE TRY, AND THEN NOTHING (F51)
-- ==========================================================================
--
-- Every email this database asks for is one pg_net post to /api/notify or
-- /api/invite. pg_net sends it once, after the transaction commits, and writes
-- what came back into net._http_response, where it sits for six hours and is
-- then deleted. api/notify tries Resend twice inside that one request — a
-- pause of 800 ms — and that is the whole of the retrying anywhere.
--
-- So an outage longer than a second loses the email: Vercel deploying, Resend
-- having a bad minute, the network between the two. Nobody is told. The only
-- trace is a 502 in a table nobody reads, gone by the evening. For a staff
-- alert that is a seat request nobody answers; for a receipt it is a client
-- who thinks we never got their money.
--
-- ==========================================================================
-- AN OUTBOX
-- ==========================================================================
--
-- Every post now goes through one function, public.notify_send(), which:
--
--   1. writes the payload into public.notify_outbox, with a fresh key
--   2. posts it, as before, with the secret read from 094's store
--   3. remembers pg_net's request id on the row
--
-- and a job pg_cron runs every minute, public.notify_outbox_sweep(), reads the
-- answers back out of net._http_response:
--
--   2xx                       delivered. Done.
--   400, 405, 413, 422        refused for what it IS. Sending the same body
--                             again gets the same answer, so it is given up on
--                             at once and staff are told.
--   anything else             401 (a secret mid-change), 404 (a deploy without
--   (and no answer at all,    the endpoint), 429, any 5xx, a timeout, no answer
--   15 minutes on)            recorded at all: tried again later.
--
-- Later is 1, 2, 4, 8, 16, 32, 64, 128 minutes, then every four hours — ten
-- tries in all, about eight hours end to end. An outage shorter than that
-- loses nothing. One longer than that is given up on, and staff get ONE email
-- saying how many and from where, and /admin can list them (the table is
-- readable by staff) and send any of them again with retry_notify().
--
-- Eight hours is deliberate: it is well inside the 24 hours Resend remembers
-- an idempotency key, which is what makes trying again safe (below).
--
-- ==========================================================================
-- THE KEY
-- ==========================================================================
--
-- A retry is only safe if the endpoint can tell it is a retry. A 502 does not
-- prove the email was not sent — api/notify sends the staff alert and then the
-- applicant's copy, and the second can fail after the first went — and a
-- timeout proves nothing at all.
--
-- So each outbox row gets a key when it is written, and every try of that row
-- carries the same one, in a header:
--
--   x-idempotency-key: <uuid>
--
-- api/notify.js already gives Resend an Idempotency-Key for every send, made
-- fresh per request (see sendKey()). It must now build it from this header
-- when there is one — the header, then who the email is for — so that the
-- second try of the same row asks Resend for the same email it asked for the
-- first time, and Resend sends it once. The body is unchanged, byte for byte,
-- so nothing that reads it has to know.
--
-- And api/notify must say when a send to a person failed for a reason that
-- might pass (Resend down, 429, 5xx, no answer): today that answers 200 with
-- told:false, which this file reads as delivered. That is the contract change
-- in CONTRACT.md; until it lands, only the staff alerts (which already answer
-- 502) are retried.
--
-- ==========================================================================
-- WHAT THIS FILE DOES NOT DO
-- ==========================================================================
--
-- It changes no sender. Until 096 runs, every trigger still posts the way it
-- did, straight to pg_net, and this table stays empty. That is the order on
-- purpose: this file can land, the job can be seen running against an empty
-- table, and only then does 096 move the senders onto it.

do $cron$
begin
  if to_regclass('private.webhook_secret') is null then
    raise exception 'sql/094 has not been run on this database. It holds the secret every post here reads.';
  end if;
  if to_regclass('net._http_response') is null then
    raise exception 'pg_net is not enabled. Database → Extensions → pg_net, then run this again.';
  end if;

  begin
    create extension if not exists pg_cron with schema pg_catalog;
  exception when others then
    raise exception using
      message = 'pg_cron could not be switched on (' || sqlerrm || '), so nothing would ever retry a failed email.',
      hint    = 'In the Supabase dashboard: Database → Extensions → search pg_cron → enable it (or Integrations → Cron → enable). Then paste this file again. Nothing in this paste has happened: the error undid all of it.';
  end;

  -- What Supabase's own instructions for pg_cron add after creating it: on a
  -- project where the extension was created by the platform's admin role, the
  -- SQL editor's role needs these to schedule and read jobs. Harmless where it
  -- already has them; a refusal here is left to the schedule below to report.
  begin
    execute 'grant usage on schema cron to postgres';
    execute 'grant all privileges on all tables in schema cron to postgres';
  exception when others then
    raise warning 'could not grant cron to postgres (%) — continuing', sqlerrm;
  end;
end
$cron$;

-- ==========================================================================
-- THE TABLE
-- ==========================================================================

create table if not exists public.notify_outbox (
  id              bigint generated always as identity primary key,
  created_at      timestamptz not null default now(),
  -- Which function asked, so a row in /admin says what kind of email it was
  -- without anybody reading JSON.
  source          text not null,
  url             text not null,
  payload         jsonb not null,
  idempotency_key text not null,

  attempts        integer not null default 0,
  request_id      bigint,
  last_sent_at    timestamptz,
  next_try_at     timestamptz,
  last_status     integer,
  last_error      text,
  delivered_at    timestamptz,
  gave_up_at      timestamptz,

  constraint notify_outbox_key_once unique (idempotency_key),
  -- Only our own two endpoints. A row is a request this database will make
  -- again and again on a timer; that is not something any other address gets.
  constraint notify_outbox_url_ours check (url in (
    'https://www.securejobva.com/api/notify',
    'https://www.securejobva.com/api/invite')),
  constraint notify_outbox_sane check (
    attempts between 0 and 50
    and length(source) between 1 and 100
    and coalesce(length(last_error), 0) <= 2000)
);

create index if not exists notify_outbox_waiting_idx
  on public.notify_outbox (next_try_at)
  where delivered_at is null and gave_up_at is null;

create index if not exists notify_outbox_request_idx
  on public.notify_outbox (request_id)
  where request_id is not null and delivered_at is null and gave_up_at is null;

alter table public.notify_outbox enable row level security;

revoke all on public.notify_outbox from anon, authenticated;

-- Staff may read it, so /admin can show what did not go. Nobody writes it but
-- the functions below: a page that could edit a payload could make this
-- database send anybody anything with our name on it.
grant select on public.notify_outbox to authenticated;

drop policy if exists "staff read the outbox" on public.notify_outbox;
create policy "staff read the outbox"
  on public.notify_outbox for select to authenticated
  using (public.has_permission('applications.view_all'));

-- ==========================================================================
-- ONE TRY OF ONE ROW
-- ==========================================================================
--
-- Never raises. Everything that calls this is a trigger on a row somebody just
-- saved — an application, a payment, an interview two people agreed — and an
-- email that could not be queued must not undo that. A failure is written on
-- the row and the sweep picks it up.

create or replace function public.notify_outbox_post(item bigint)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  row_   public.notify_outbox;
  secret text;
  rid    bigint;
  later  interval;
begin
  select * into row_ from public.notify_outbox o where o.id = item for update;
  if row_.id is null or row_.delivered_at is not null or row_.gave_up_at is not null then
    return;
  end if;

  -- 1, 2, 4 ... minutes, never more than four hours. Worked out from the
  -- attempt this one is about to become, so the first failure waits a minute.
  later := least(power(2, row_.attempts) * interval '1 minute', interval '4 hours');

  secret := private.webhook_secret();
  if coalesce(secret, '') = '' then
    update public.notify_outbox
       set attempts = attempts + 1, last_sent_at = now(),
           last_error = 'no webhook secret stored (sql/094)', next_try_at = now() + later
     where id = item;
    return;
  end if;

  begin
    rid := net.http_post(
      url     := row_.url,
      body    := row_.payload,
      headers := jsonb_build_object(
        'Content-Type',      'application/json',
        'x-webhook-secret',  secret,
        'x-idempotency-key', row_.idempotency_key),
      timeout_milliseconds := 10000
    );
  exception when others then
    update public.notify_outbox
       set attempts = attempts + 1, last_sent_at = now(),
           last_error = left('could not queue: ' || sqlerrm, 2000), next_try_at = now() + later
     where id = item;
    return;
  end;

  update public.notify_outbox
     set attempts = attempts + 1, request_id = rid, last_sent_at = now(), next_try_at = null
   where id = item;
end;
$fn$;

revoke all on function public.notify_outbox_post(bigint) from public, anon, authenticated;

-- ==========================================================================
-- THE ONE WAY EVERY SENDER POSTS
-- ==========================================================================
--
-- What 096 puts in place of every net.http_post in this database. Returns the
-- outbox row's id, or null if even the row could not be written — in which
-- case it tries the plain post the old way, so that a broken outbox is never
-- worse than having no outbox.

create or replace function public.notify_send(
  payload jsonb,
  url     text default 'https://www.securejobva.com/api/notify',
  source  text default 'unknown'
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  item bigint;
begin
  begin
    insert into public.notify_outbox (source, url, payload, idempotency_key, next_try_at)
    values (left(coalesce(source, 'unknown'), 100), url, payload, gen_random_uuid()::text, now())
    returning id into item;
  exception when others then
    raise warning 'notify_send could not write the outbox for %: % — posting once without it',
      source, sqlerrm;
    begin
      perform net.http_post(
        url     := url,
        body    := payload,
        headers := jsonb_build_object(
          'Content-Type',     'application/json',
          'x-webhook-secret', coalesce(private.webhook_secret(), '')),
        timeout_milliseconds := 10000
      );
    exception when others then
      raise warning 'notify_send could not post for % either: %', source, sqlerrm;
    end;
    return null;
  end;

  perform public.notify_outbox_post(item);
  return item;
end;
$fn$;

revoke all on function public.notify_send(jsonb, text, text) from public, anon, authenticated;

-- ==========================================================================
-- THE SWEEP, EVERY MINUTE
-- ==========================================================================

create or replace function public.notify_outbox_sweep()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  r          record;
  done       integer := 0;
  again      integer := 0;
  posted     integer := 0;
  dropped    integer := 0;
  lost       text;
  first_lost bigint;
  oldest     timestamptz;
  gone       bigint[] := '{}';
  max_tries  constant integer := 10;
begin
  -- One sweep at a time. A minute is plenty for this, but a slow one must not
  -- overlap the next and post the same row twice.
  if not pg_try_advisory_xact_lock(hashtext('sjva-notify-outbox')) then
    return jsonb_build_object('skipped', 'another sweep is running');
  end if;

  -- ── 1. read what came back ────────────────────────────────────────────────
  for r in
    select o.id, o.attempts, o.last_sent_at,
           h.id as answered, h.status_code, h.timed_out, h.error_msg,
           left(h.content, 300) as content
      from public.notify_outbox o
      left join net._http_response h on h.id = o.request_id
     where o.delivered_at is null and o.gave_up_at is null
       and o.request_id is not null
  loop
    if r.answered is null then
      -- No answer yet. pg_net usually answers within seconds; fifteen minutes
      -- of nothing is an answer lost (the worker restarted, the row aged out),
      -- and the only safe reading of a lost answer is "try again".
      if r.last_sent_at < now() - interval '15 minutes' then
        update public.notify_outbox
           set request_id = null, last_status = null,
               last_error = 'no answer recorded within 15 minutes',
               next_try_at = now()
         where id = r.id;
        again := again + 1;
      end if;

    elsif r.status_code between 200 and 299 then
      update public.notify_outbox
         set delivered_at = now(), last_status = r.status_code, last_error = null
       where id = r.id;
      done := done + 1;

    elsif r.status_code in (400, 405, 413, 422) then
      -- Refused for what it is. The same body gets the same answer.
      update public.notify_outbox
         set gave_up_at = now(), last_status = r.status_code,
             last_error = left(coalesce(r.content, 'refused'), 2000)
       where id = r.id;
      gone := gone || r.id;

    else
      update public.notify_outbox
         set request_id = null,
             last_status = r.status_code,
             last_error = left(coalesce(
               r.error_msg,
               case when r.timed_out then 'timed out' end,
               r.content, 'no status'), 2000),
             next_try_at = now() + least(power(2, r.attempts - 1) * interval '1 minute',
                                         interval '4 hours')
       where id = r.id;
      again := again + 1;
    end if;
  end loop;

  -- ── 2. give up on what has had its ten tries ────────────────────────────────
  with given_up as (
    update public.notify_outbox
       set gave_up_at = now()
     where delivered_at is null and gave_up_at is null
       and request_id is null and attempts >= max_tries
    returning id
  )
  select gone || coalesce(array_agg(id), '{}') into gone from given_up;

  -- ── 3. send what is due ─────────────────────────────────────────────────────
  for r in
    select o.id from public.notify_outbox o
     where o.delivered_at is null and o.gave_up_at is null
       and o.request_id is null and o.attempts < max_tries
       and o.next_try_at <= now()
     order by o.id
     limit 100
  loop
    perform public.notify_outbox_post(r.id);
    posted := posted + 1;
  end loop;

  -- ── 4. tell staff, once, about anything given up on in this sweep ──────────
  --
  -- Only the rows this sweep gave up on, by id, so an earlier sweep's are
  -- never announced twice.
  --
  -- About everything except its own alerts: an alert about a lost alert, when
  -- the reason is that nothing can be sent, would only queue another.
  select count(*), min(o.id), min(o.created_at), string_agg(distinct o.source, ', ')
    into dropped, first_lost, oldest, lost
    from public.notify_outbox o
   where o.id = any(gone)
     and o.source <> 'notify_outbox';

  if coalesce(dropped, 0) > 0 then
    perform public.notify_send(
      jsonb_build_object(
        'type',   'STATUS',
        'event',  'arrived',
        'table',  'notify_outbox',
        'person', jsonb_build_object(),
        'record', jsonb_build_object(
          'id',      first_lost,
          'count',   dropped,
          'sources', lost,
          'oldest',  oldest)),
      'https://www.securejobva.com/api/notify',
      'notify_outbox');
  end if;

  -- ── 5. tidy ─────────────────────────────────────────────────────────────────
  -- A month of delivered rows answers "did that email go?" for anything
  -- anybody will ask about. Rows given up on stay half a year, because each is
  -- an email somebody may still be owed.
  delete from public.notify_outbox
   where (delivered_at is not null and delivered_at < now() - interval '30 days')
      or (gave_up_at   is not null and gave_up_at   < now() - interval '180 days');

  return jsonb_build_object('delivered', done, 'retrying', again,
                            'posted', posted, 'given_up', coalesce(dropped, 0));
end;
$fn$;

revoke all on function public.notify_outbox_sweep() from public, anon, authenticated;

-- ==========================================================================
-- TRY AGAIN, FROM /admin
-- ==========================================================================
--
-- For a row given up on, once whatever was wrong is fixed (a template added to
-- api/notify, an endpoint deployed). Same key, so if it did in fact go the
-- first time, Resend sends nothing. Staff only.

create or replace function public.retry_notify(item bigint)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if auth.uid() is null then
    raise exception 'sign in first';
  end if;
  if not public.has_permission('applications.edit') then
    raise exception 'only SecureJobVA staff can resend an email';
  end if;

  update public.notify_outbox
     set gave_up_at = null, attempts = 0, request_id = null,
         next_try_at = now(), last_error = 'resent by ' || coalesce(auth.jwt() ->> 'email', 'staff')
   where id = item and delivered_at is null;

  if not found then
    raise exception 'that email has already gone, or is not in the outbox';
  end if;

  perform public.notify_outbox_post(item);
end;
$fn$;

revoke all on function public.retry_notify(bigint) from public, anon;
grant execute on function public.retry_notify(bigint) to authenticated;

-- ==========================================================================
-- THE JOB
-- ==========================================================================
--
-- Every minute. Unscheduled first by name, so a re-run replaces the job rather
-- than adding a second one beside it.

do $job$
begin
  perform cron.unschedule(j.jobname) from cron.job j where j.jobname = 'sjva-notify-outbox';
  perform cron.schedule('sjva-notify-outbox', '* * * * *', 'select public.notify_outbox_sweep()');
end
$job$;

insert into public.schema_migrations (n) values (95) on conflict (n) do nothing;

-- ==========================================================================
-- Check it worked
-- ==========================================================================
--
-- One row. Expect: cron_job 'every minute, active', outbox_rows 0 (nothing
-- uses it until 096), and the three functions callable by nobody but their
-- owner ('owner only'). retry_notify is the one staff may call.

select
  coalesce((select case when j.active then 'every minute, active' else 'PAUSED' end
              from cron.job j where j.jobname = 'sjva-notify-outbox'),
           'MISSING — nothing will retry') as cron_job,
  (select count(*) from public.notify_outbox) as outbox_rows,
  case when has_function_privilege('authenticated', 'public.notify_send(jsonb, text, text)', 'EXECUTE')
         or has_function_privilege('anon', 'public.notify_send(jsonb, text, text)', 'EXECUTE')
         or has_function_privilege('authenticated', 'public.notify_outbox_sweep()', 'EXECUTE')
         or has_function_privilege('authenticated', 'public.notify_outbox_post(bigint)', 'EXECUTE')
       then 'A PAGE CAN SEND MAIL — revoke it'
       else 'owner only' end as who_can_send,
  case when has_function_privilege('anon', 'public.retry_notify(bigint)', 'EXECUTE')
       then 'anon can retry — revoke it'
       else 'staff, through has_permission' end as who_can_retry;
