-- 076 — the address a caller cannot type
--
-- Run after: 075
-- Safe to re-run: yes
-- Also needed: nothing in the dashboard. But read WHAT TO CHECK AFTER RUNNING
-- at the bottom: whether this changes anything depends on a header only the
-- live project can show, and the file is written to behave exactly as 047 did
-- when that header is not there.
--
-- ==========================================================================
-- THE FIRST HOP IS WHATEVER THE CALLER SAID IT WAS
-- ==========================================================================
--
-- 047's caller_ip() takes the first entry of x-forwarded-for and calls it the
-- client. That header is a list each proxy APPENDS to, and the first entry is
-- the one the request arrived carrying — which means the caller wrote it.
-- Send `x-forwarded-for: 1.2.3.4` and every proxy after you adds its own view
-- to the end; the first hop is still 1.2.3.4. Change it on every request and
-- 052's throttle counts every request as a different visitor, so the limit on
-- the three public forms is a limit only on people who do not know this.
--
-- Supabase's API sits behind Cloudflare. Cloudflare sets cf-connecting-ip to
-- the address that actually opened the connection, and overwrites any value
-- the caller sent under that name — it is the one header in the list a caller
-- cannot choose. So it goes first.
--
-- ==========================================================================
-- WHY THE FALLBACK IS STILL THE FIRST HOP
-- ==========================================================================
--
-- If cf-connecting-ip is missing, this falls back to 047's behaviour exactly,
-- first hop and all. The tempting alternative — take the LAST hop, which the
-- nearest proxy wrote — is only right if we know how many proxies there are,
-- and we do not. If the last hop is a Cloudflare or gateway address shared by
-- every visitor, the throttle then counts the whole internet as one caller and
-- starts refusing real leads after the tenth. 047 chose to fail open for the
-- same reason and that reasoning has not changed: a bot let through costs a
-- little, every lead refused costs the business.
--
-- So on a project where the header is absent, this file changes nothing and
-- the finding stands. The diagnostic below is how to tell which you have.

do $pre$
begin
  if to_regprocedure('public.caller_ip()') is null then
    raise exception
      'sql/047 has not been run on this database. It defines caller_ip(), which this file replaces.';
  end if;
end
$pre$;

-- ==========================================================================
-- WHO IS ASKING, AGAIN
-- ==========================================================================
--
-- This replaces 047's caller_ip(). 047 already carries a DO NOT RE-RUN block
-- (for throttle_intake); it needs one more line naming this file for
-- caller_ip. The contract has the exact text.

create or replace function public.caller_ip()
returns text
language plpgsql
stable
as $fn$
declare
  hdrs json;
  raw  text;
begin
  begin
    hdrs := current_setting('request.headers', true)::json;
  exception when others then
    return null;
  end;
  if hdrs is null then
    return null;
  end if;

  -- The one a caller cannot forge. See the header.
  raw := btrim(coalesce(hdrs ->> 'cf-connecting-ip', ''));
  if raw <> '' then
    return raw;
  end if;

  -- 047's answer, kept deliberately. See WHY THE FALLBACK IS STILL THE FIRST
  -- HOP above before changing it.
  raw := hdrs ->> 'x-forwarded-for';
  if raw is null or btrim(raw) = '' then
    return null;
  end if;
  return btrim(split_part(raw, ',', 1));
end;
$fn$;

revoke all on function public.caller_ip() from public, anon, authenticated;

-- ==========================================================================
-- A WAY TO LOOK
-- ==========================================================================
--
-- request.headers only exists inside an API request, so the SQL editor cannot
-- show what this function sees. This can: it returns the three headers as
-- they arrived on the CALLER'S OWN request, and nothing else — no other row,
-- no other person. Signed-in only, and SECURITY INVOKER, so it borrows no
-- rights to do it.
--
-- To use it, sign in to /admin, open the browser console, and run:
--
--   fetch(SB + "/rest/v1/rpc/caller_ip_sources", { method: "POST",
--     headers: { apikey: ANON, Authorization: "Bearer " +
--       JSON.parse(localStorage[KEY]).access_token,
--       "Content-Type": "application/json" }, body: "{}" })
--   .then(r => r.json()).then(console.log)
--
-- (SB, ANON and KEY are names /admin already declares at the top of its
-- script; if they have moved, the project URL, the publishable key and the
-- stored session from the page do the same job.)

create or replace function public.caller_ip_sources()
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $fn$
declare
  hdrs json;
begin
  if auth.uid() is null then
    raise exception 'sign in first';
  end if;
  begin
    hdrs := current_setting('request.headers', true)::json;
  exception when others then
    hdrs := null;
  end;
  -- caller_ip() itself is not called from here: it is granted to nobody, and
  -- an invoker function runs with the caller's rights, so asking it would be
  -- refused. The three raw headers are what caller_ip() chooses between, which
  -- is the thing worth seeing.
  return jsonb_build_object(
    'cf-connecting-ip', hdrs ->> 'cf-connecting-ip',
    'x-real-ip',        hdrs ->> 'x-real-ip',
    'x-forwarded-for',  hdrs ->> 'x-forwarded-for');
end;
$fn$;

revoke all on function public.caller_ip_sources() from public, anon;
grant execute on function public.caller_ip_sources() to authenticated;

-- ==========================================================================
-- WHAT TO CHECK AFTER RUNNING
-- ==========================================================================
--
-- Run the console snippet above and read the answer:
--
--   cf-connecting-ip is your address        The fix is live. Every form is
--                                           now counted by an address the
--                                           caller cannot choose.
--   cf-connecting-ip is null                Nothing changed; the throttle is
--                                           still keyed on the first hop and
--                                           P8 is still open. Say so rather
--                                           than believing this file.
--
-- Also worth a look: if x-forwarded-for shows more than one entry, the last
-- entries are the proxies. Knowing how many there are is what it would take
-- to trust a hop from the end instead — a later file, with evidence.

-- The function is still callable by nobody. Empty is the pass.
select r.rolname
from pg_proc p
cross join lateral (values ('anon'), ('authenticated')) as r(rolname)
where p.proname = 'caller_ip' and p.pronamespace = 'public'::regnamespace
  and has_function_privilege(r.rolname, p.oid, 'EXECUTE');

-- Counting is still happening. The same query 047 ends with: a row means the
-- address is visible and the limit is live.
select bucket, window_start, n
from public.intake_throttle
order by window_start desc
limit 10;

insert into public.schema_migrations (n) values (76) on conflict (n) do nothing;
