-- 110 — a notice can be corrected, or removed
--
-- Run after: 109
-- Safe to re-run: yes
-- Also needed: /admin's notice list given Edit and Delete (CONTRACT.md).
--   Edit needs nothing from this file — see below.
--
-- ==========================================================================
-- PUBLISH, UNPUBLISH, PIN — AND NOTHING ELSE (F42)
-- ==========================================================================
--
-- The notice board (026) lets staff write a notice, publish it, take it down
-- and pin it. A typo means taking it down and writing it again, and old
-- drafts and taken-down notices stay in the admin list for ever.
--
-- Editing was never the database's to refuse: 026 granted UPDATE on title and
-- body alongside pinned and published_at, under the same staff-only policy.
-- Only the page never offered it. So /admin can PATCH title and body today,
-- exactly as it PATCHes published_at.
--
-- Deleting was never granted, and is here: staff (applications.edit, the
-- permission every other notice write asks for) may delete a notice. Nothing
-- hangs off a notice — no foreign key points at it, nobody is emailed about
-- one — so removing one takes nothing else with it. A published notice can be
-- deleted too; it simply disappears from /hub, which is what taking it down
-- does already, without the row left behind.

do $pre$
begin
  if to_regclass('public.notices') is null then
    raise exception 'sql/026 has not been run on this database.';
  end if;
end
$pre$;

grant delete on public.notices to authenticated;

drop policy if exists "staff remove notices" on public.notices;
create policy "staff remove notices"
  on public.notices for delete to authenticated
  using (public.has_permission('applications.edit'));

insert into public.schema_migrations (n) values (110) on conflict (n) do nothing;

-- ==========================================================================
-- Check it worked
-- ==========================================================================
--
-- Every policy on notices, one per action. Expect four: read (the hired see
-- published ones, staff see all), insert, update and — new — delete, each of
-- the three writes asking for applications.edit.

select polname as policy,
       case polcmd when 'r' then 'read' when 'a' then 'insert'
                   when 'w' then 'update' when 'd' then 'delete' else polcmd::text end as action,
       pg_get_expr(coalesce(polqual, polwithcheck), polrelid) as who
from pg_policy
where polrelid = 'public.notices'::regclass
order by 2;
