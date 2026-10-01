-- 098 — staff hear when the exams are sent
--
-- Run after: 097
-- Safe to re-run: yes
-- Also needed: api/notify.js taught DECIDE.application_assessment.arrived
--   (CONTRACT.md). Either order is safe: until it is, api/notify answers this
--   post 200 "skipped" and sends nothing, and the outbox counts that as
--   delivered — so posts made before the template lands are not re-sent
--   once it does. Deploy api/notify first if none should be missed.
--
-- ==========================================================================
-- SILENCE ON BOTH SIDES (F4, F34)
-- ==========================================================================
--
-- When an applicant sends her assessment, the scorer grades it on the spot
-- (063) and she is told "Received". Then nothing, on either side:
--
--   passed       she moves to Interview only once somebody checks her typing
--                proof (097 makes that move actually happen) — and nobody is
--                told there is a proof to check
--   below_line   she is declined only when somebody declines her by hand — and
--                nobody is told there is somebody to decline
--
-- How long she waits is how often somebody happens to open /admin.
--
-- So sending the assessment now emails staff, once, with what the scorer
-- decided and what is needed from a person:
--
--   passed, typing not yet checked    check her typing proof — she moves to
--                                     Interview, and is emailed, the moment
--                                     the checked figures are saved (097)
--   passed, typing already checked    nothing — she has already moved
--   below_line                        read it and decide; nothing automatic
--                                     ever declines anybody (063)
--
-- To staff only. Her own side is unchanged: she is not emailed a grade, which
-- is a decision a person makes, and the page already says it was received.
--
-- ==========================================================================
-- THE PAYLOAD
-- ==========================================================================
--
-- The STATUS 'arrived' shape every staff alert uses (036, 031's leave), so it
-- reaches NOTIFY_TO with reply-to set to her address:
--
--   { type: 'STATUS', table: 'application_assessment', event: 'arrived',
--     person: { name, email },
--     record: { id: <application id>, track, verdict, typing_wpm,
--               typing_accuracy, typing_checked, needs } }
--
-- `needs` is one of 'typing check', 'nothing', 'a decision' — written here so
-- the email and the database agree on what the next step is.

do $pre$
begin
  if to_regprocedure('public.notify_send(jsonb, text, text)') is null then
    raise exception 'sql/095 has not been run on this database.';
  end if;
end
$pre$;

create or replace function public.notify_assessment_sent()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  who     record;
  checked boolean;
begin
  -- The send, and only the send. Every later re-score (a checked typing
  -- figure, a mark on the writing) is staff's own work, and mailing staff
  -- about their own click is how an inbox stops being read.
  if old.submitted_at is not null or new.submitted_at is null then
    return new;
  end if;

  select a.name, a.email into who
    from public.applications a where a.id = new.application_id;

  checked := new.typing_verified_wpm is not null or new.typing_verified_accuracy is not null;

  perform public.notify_send(
    jsonb_build_object(
      'type',   'STATUS',
      'event',  'arrived',
      'table',  'application_assessment',
      'person', jsonb_build_object('name', who.name, 'email', who.email),
      'record', jsonb_build_object(
        'id',              new.application_id,
        'track',           new.track,
        'verdict',         new.verdict,
        'typing_wpm',      new.typing_wpm,
        'typing_accuracy', new.typing_accuracy,
        'typing_checked',  checked,
        'needs', case
                   when new.verdict = 'passed' and not checked then 'typing check'
                   when new.verdict = 'passed' then 'nothing'
                   else 'a decision'
                 end)),
    'https://www.securejobva.com/api/notify',
    'notify_assessment_sent');

  return new;
end;
$fn$;

revoke all on function public.notify_assessment_sent() from public, anon, authenticated;

-- AFTER, so the verdict is the one score_assessment (a BEFORE trigger on the
-- same update) has just written.
drop trigger if exists "notify-assessment-sent" on public.application_assessment;
create trigger "notify-assessment-sent"
  after update of submitted_at on public.application_assessment
  for each row execute function public.notify_assessment_sent();

insert into public.schema_migrations (n) values (98) on conflict (n) do nothing;

-- ==========================================================================
-- Check it worked
-- ==========================================================================
--
-- The trigger, on the right table, firing after an update of submitted_at, and
-- callable by nobody signed in. Expect one row: 'after update', 'owner only'.

select c.relname as on_table,
       t.tgname as trigger_name,
       case when pg_get_triggerdef(t.oid) like '%AFTER UPDATE OF submitted_at%'
            then 'after update' else 'WRONG TIMING: ' || pg_get_triggerdef(t.oid) end as fires,
       case when has_function_privilege('authenticated', 'public.notify_assessment_sent()', 'EXECUTE')
            then 'A PAGE CAN CALL IT' else 'owner only' end as who_can_call
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
where t.tgname = 'notify-assessment-sent';
