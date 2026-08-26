-- 010 — messages from the contact form
--
-- Run after: 009
-- Safe to re-run: yes
-- Also needed: nothing in the dashboard.
--
-- Same shape as the two intake tables in 001: the public may write and may not
-- read. A contact form holds names, addresses and whatever somebody chose to
-- tell us, which is exactly the sort of thing that should not be one missing
-- policy away from being a public list.

create table if not exists public.contact_messages (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  -- Column names match the JSON keys the form sends. PostgREST rejects the
  -- whole insert over one unknown key, so a field added to the form has to be
  -- added here in the same commit.
  name    text,
  email   text,
  phone   text,
  reason  text,
  message text,
  page    text,

  -- Staff working the inbox, not shown to anyone else.
  handled_at timestamptz,
  handled_by text,

  constraint contact_messages_sane check (
    coalesce(length(name), 0)    <= 200 and
    coalesce(length(email), 0)   <= 320 and
    coalesce(length(phone), 0)   <= 60  and
    coalesce(length(reason), 0)  <= 100 and
    coalesce(length(message), 0) <= 5000 and
    coalesce(length(page), 0)    <= 500
  )
);

alter table public.contact_messages enable row level security;
revoke all on public.contact_messages from anon, authenticated;

grant insert (name, email, phone, reason, message, page)
  on public.contact_messages to anon;

drop policy if exists "public can write to us" on public.contact_messages;
create policy "public can write to us"
  on public.contact_messages for insert to anon with check (true);

-- Reading is staff only. There is deliberately no policy for anon: the form
-- posts and forgets, and the visitor's own copy of what they sent is the email
-- fallback the page offers when the write fails.
grant select, update on public.contact_messages to authenticated;

drop policy if exists "staff read messages" on public.contact_messages;
create policy "staff read messages"
  on public.contact_messages for select to authenticated
  using (public.has_permission('applications.view_all'));

drop policy if exists "staff mark messages handled" on public.contact_messages;
create policy "staff mark messages handled"
  on public.contact_messages for update to authenticated
  using (public.has_permission('applications.view_all'))
  with check (public.has_permission('applications.view_all'));

create index if not exists contact_messages_created_at_idx
  on public.contact_messages (created_at desc);
create index if not exists contact_messages_open_idx
  on public.contact_messages (handled_at, created_at desc);

-- ==========================================================================
-- Check it worked
-- ==========================================================================
--
-- anon must hold INSERT and nothing else. A SELECT here would publish every
-- message anybody has ever sent through the form.

select grantee, string_agg(distinct privilege_type, ',' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_name = 'contact_messages' and grantee in ('anon', 'authenticated')
group by grantee;

select c.relname as table_name,
       c.relrowsecurity as rls_enabled,
       coalesce(string_agg(distinct p.polcmd::text, ','), 'none') as policies
from pg_class c
left join pg_policy p on p.polrelid = c.oid
where c.relname = 'contact_messages'
group by c.relname, c.relrowsecurity;
