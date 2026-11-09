-- STEP 3 of setup — run AFTER you have signed in to the new app once
-- (signing in creates your user account, which the imported tasks are attached to).
-- SQL Editor → New query → paste → Run. Running it twice does nothing the second time.

do $$
declare
  me uuid := (select id from auth.users order by created_at limit 1);
  sort_zone uuid;
  t record;
  new_id uuid;
begin
  if me is null then
    raise exception 'No user yet: sign in to the app first, then run this again.';
  end if;
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'tasks_legacy') then
    raise notice 'No old tasks table found, nothing to import.';
    return;
  end if;
  if exists (select 1 from public.zones where user_id = me and name = 'To sort') then
    raise notice 'Already imported.';
    return;
  end if;

  insert into public.zones (user_id, name, emoji, position)
  values (me, 'To sort', '📥', 99) returning id into sort_zone;

  -- Open, top-level tasks become tasks; their open subtasks become steps
  for t in
    execute 'select * from public.tasks_legacy where coalesce(completed,false) = false and coalesce(archived,false) = false and parent_id is null order by created_at'
  loop
    insert into public.tasks (user_id, zone_id, title, notes, deadline_type, due_date, status, created_at, touched_at)
    values (
      me, sort_zone, t.title,
      nullif(concat_ws(' · ',
        case when t.context = 'orinoco' then 'Was an Orinoco task' end,
        nullif(t.project, '')), ''),
      case when t.due_date is not null then 'target' else 'someday' end,
      t.due_date, 'designing', t.created_at, now()
    ) returning id into new_id;

    execute 'insert into public.steps (user_id, task_id, title, position, done, done_at)
             select $1, $2, title, row_number() over (order by created_at), coalesce(completed,false),
                    case when completed then completed_at end
             from public.tasks_legacy where parent_id = $3'
      using me, new_id, t.id;
  end loop;
end $$;
