-- 083 — who did it is not typed
--
-- Run after: 082
-- Safe to re-run: yes
-- Also needed: nothing in the dashboard.
--
-- ==========================================================================
-- THE THREE THAT WERE LEFT
-- ==========================================================================
--
-- 046, 050 and 055 moved "who did this" out of the page and into a trigger,
-- one table at a time, on the principle 055 states best: who did a thing is
-- not something the doer gets to type. Three were never reached:
--
--   contact_messages.handled_by   /admin sends handled_by: ME (010 grants
--                                 UPDATE on the whole table to staff)
--   notices.created_by            /admin sends created_by: ME (026 grants it)
--   client_logos.added_by         /admin sends added_by: ME (015 grants the
--                                 whole table)
--
-- and the fourth — status_changed_at on applications and seat_requests, from
-- the browser's clock — is 074's.
--
-- Each field is now written from the verified token (and now(), for the one
-- timestamp) whatever the page sent, the same shape as 046's stamp_contacter:
-- from a page, the token wins; from the SQL editor, where there is no token,
-- the value typed is kept, because a person fixing a row by hand is the one
-- case where typing it is the point.
--
-- The grants are left as they are, so /admin keeps working unchanged while
-- it still sends these fields; they are simply no longer believed.
--
-- NOT NARROWED, AND WHY. 010's UPDATE on contact_messages is the whole table,
-- so staff can also rewrite the name, address and body of a message from the
-- console. The obvious narrowing — update (handled_at, handled_by) — trips
-- tools/check.mjs's rule that no _at or _by column is granted to a page, and
-- revoking those two as well leaves /admin no way to mark a message answered.
-- The clean answer is a staff-only function that marks a message handled or
-- open and a revoke of the table grant, which needs /admin to call it first.
-- That is left for when /admin changes; the stamp below is what matters now,
-- and it holds whatever the grant is.

-- ==========================================================================
-- 1. A MESSAGE, MARKED HANDLED
-- ==========================================================================
--
-- handled_at is stamped too. The page sends new Date() from the staff
-- laptop; the moment a message was answered is the server's to record, like
-- every other *_at in this schema. Reopening (handled_at back to null) clears
-- both, which is what /admin's "Mark open" already sends.

create or replace function public.stamp_message_handler()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if new.handled_at is null then
    new.handled_by := null;
    return new;
  end if;

  -- Already handled and still handled: the record of who did it stays.
  if old.handled_at is not null then
    new.handled_at := old.handled_at;
    new.handled_by := old.handled_by;
    return new;
  end if;

  if auth.jwt() ->> 'email' is not null then
    new.handled_at := now();
    new.handled_by := auth.jwt() ->> 'email';
  end if;
  return new;
end;
$fn$;

revoke all on function public.stamp_message_handler() from public, anon, authenticated;

drop trigger if exists contact_messages_stamp_handler on public.contact_messages;
create trigger contact_messages_stamp_handler
  before update on public.contact_messages
  for each row execute function public.stamp_message_handler();

-- ==========================================================================
-- 2. A NOTICE, AND WHO POSTED IT
-- ==========================================================================

create or replace function public.stamp_notice_author()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if tg_op = 'UPDATE' then
    new.created_by := old.created_by;
    return new;
  end if;
  new.created_by := coalesce(auth.jwt() ->> 'email', new.created_by);
  return new;
end;
$fn$;

revoke all on function public.stamp_notice_author() from public, anon, authenticated;

drop trigger if exists notices_stamp_author on public.notices;
create trigger notices_stamp_author
  before insert or update on public.notices
  for each row execute function public.stamp_notice_author();

-- ==========================================================================
-- 3. A LOGO, AND WHO ADDED IT
-- ==========================================================================
--
-- added_at already defaults to now() and is left to the default on insert;
-- on update both are put back, since 015's whole-table grant would otherwise
-- let a later edit rewrite when and by whom the logo went up.

create or replace function public.stamp_logo_adder()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if tg_op = 'UPDATE' then
    new.added_by := old.added_by;
    new.added_at := old.added_at;
    return new;
  end if;
  new.added_by := coalesce(auth.jwt() ->> 'email', new.added_by);
  if auth.jwt() ->> 'email' is not null then
    new.added_at := now();
  end if;
  return new;
end;
$fn$;

revoke all on function public.stamp_logo_adder() from public, anon, authenticated;

drop trigger if exists client_logos_stamp_adder on public.client_logos;
create trigger client_logos_stamp_adder
  before insert or update on public.client_logos
  for each row execute function public.stamp_logo_adder();

-- ==========================================================================
-- Check it worked
-- ==========================================================================

-- Three triggers.
select c.relname as table_name, t.tgname
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
where t.tgname in ('contact_messages_stamp_handler', 'notices_stamp_author', 'client_logos_stamp_adder')
order by c.relname;

-- Who marked what, now that the token says so. The newest ten.
select id, handled_at, handled_by
from public.contact_messages
where handled_at is not null
order by handled_at desc
limit 10;

insert into public.schema_migrations (n) values (83) on conflict (n) do nothing;
