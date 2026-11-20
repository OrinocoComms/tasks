-- STEP 3 of setup (optional) — run AFTER you've signed in to the new app once.
-- Copies open tasks from the old app into Unallocated, so nothing is lost.
-- SQL Editor → New query → paste → Run. Running it twice does nothing the second time.

do $$
declare
  me uuid := (select id from auth.users order by created_at limit 1);
  src text;
begin
  if me is null then
    raise exception 'No user yet: sign in to the app first, then run this again.';
  end if;
  if exists (select 1 from public.items where user_id = me and description = 'Imported from the old app') then
    raise notice 'Already imported.';
    return;
  end if;

  -- The old table is "tasks_legacy" if an interim version renamed it, otherwise "tasks"
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'tasks_legacy') then
    src := 'tasks_legacy';
  elsif exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'tasks' and column_name = 'completed') then
    src := 'tasks';
  else
    raise notice 'No old tasks found.';
    return;
  end if;

  execute format($q$
    insert into public.items (user_id, title, description, created_at)
    select $1, title, 'Imported from the old app', coalesce(created_at, now())
    from public.%I
    where coalesce(completed, false) = false
      and coalesce(archived, false) = false
      and parent_id is null
  $q$, src) using me;
end $$;
