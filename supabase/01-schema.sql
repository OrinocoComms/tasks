-- STEP 1 of setup. Supabase dashboard → SQL Editor → New query → paste all of this → Run.
-- Safe to run once. It keeps your old tasks (renamed to tasks_legacy) so nothing is lost.

-- Keep the old table out of the way
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'tasks')
     and not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'tasks' and column_name = 'zone_id') then
    alter table public.tasks rename to tasks_legacy;
  end if;
end $$;

-- Zones: House, Garden, Kids...
create table if not exists public.zones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  emoji text,
  position int not null default 0,
  created_at timestamptz not null default now()
);

-- Tasks
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  zone_id uuid references public.zones on delete set null,
  title text not null,
  notes text,
  deadline_type text not null default 'someday' check (deadline_type in ('hard', 'target', 'someday')),
  due_date date,
  consequence text,               -- "what happens if it isn't done?"
  status text not null default 'designing' check (status in ('designing', 'ready', 'done')),
  created_at timestamptz not null default now(),
  touched_at timestamptz not null default now(),  -- last real progress or redesign
  completed_at timestamptz
);

-- Steps: the digestible sub-tasks
create table if not exists public.steps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  task_id uuid not null references public.tasks on delete cascade,
  title text not null,
  position int not null default 0,
  done boolean not null default false,
  done_at timestamptz,
  created_at timestamptz not null default now()
);

-- Daily sessions
create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  started_at timestamptz not null default now(),
  planned_minutes int not null default 15,
  actual_seconds int not null default 0,
  steps_done int not null default 0
);

create index if not exists tasks_user_idx on public.tasks (user_id);
create index if not exists steps_task_idx on public.steps (task_id);
create index if not exists sessions_user_idx on public.sessions (user_id, started_at);

-- Only you can see your own data
alter table public.zones enable row level security;
alter table public.tasks enable row level security;
alter table public.steps enable row level security;
alter table public.sessions enable row level security;

drop policy if exists "own zones" on public.zones;
create policy "own zones" on public.zones for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "own tasks" on public.tasks;
create policy "own tasks" on public.tasks for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "own steps" on public.steps;
create policy "own steps" on public.steps for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "own sessions" on public.sessions;
create policy "own sessions" on public.sessions for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Lock the old table too (the app no longer uses it)
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'tasks_legacy') then
    execute 'alter table public.tasks_legacy enable row level security';
  end if;
end $$;

-- Live sync between phone and desktop
do $$
begin
  begin alter publication supabase_realtime add table public.zones; exception when others then null; end;
  begin alter publication supabase_realtime add table public.tasks; exception when others then null; end;
  begin alter publication supabase_realtime add table public.steps; exception when others then null; end;
end $$;
