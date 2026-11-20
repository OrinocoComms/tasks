-- STEP 1 of setup. Supabase dashboard → SQL Editor → New query → paste all of this → Run.
-- Creates the app's tables. Nothing existing is deleted: older tables (tasks, zones, steps...) are left alone.

-- Areas of focus: House, Health, Kids...
create table if not exists public.areas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  icon text not null default 'general',
  position int not null default 0,
  created_at timestamptz not null default now()
);

-- Outcomes: bigger goals with tasks under them
create table if not exists public.outcomes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  area_id uuid references public.areas on delete set null,
  title text not null,
  description text,
  due_date date,
  achieved_at timestamptz,
  created_at timestamptz not null default now()
);

-- Items: tasks and their subtasks (a subtask has parent_id set)
create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  parent_id uuid references public.items on delete cascade,
  outcome_id uuid references public.outcomes on delete set null,
  area_id uuid references public.areas on delete set null,
  title text not null,
  description text,
  priority text not null default 'could' check (priority in ('must', 'could')),
  start_date date,             -- the day it lands on Today (or the start of a range)
  due_date date,               -- finish date when it's a range
  est_mins int,                -- the item's own time (not counting its subtasks)
  repeat jsonb,                -- e.g. {"freq":"weekly","days":[5]}
  moved_count int not null default 0,
  from_voice boolean not null default false,
  position int not null default 0,
  done boolean not null default false,
  done_at timestamptz,
  created_at timestamptz not null default now()
);

-- Timer sessions (how long things actually took)
create table if not exists public.timer_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  item_id uuid references public.items on delete cascade,
  seconds int not null default 0,
  finished_at timestamptz not null default now()
);

-- One row of settings per person
create table if not exists public.settings (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  daily_limit_mins int not null default 60
);

create index if not exists items_user_idx on public.items (user_id, done);
create index if not exists items_parent_idx on public.items (parent_id);
create index if not exists outcomes_user_idx on public.outcomes (user_id);

-- Only you can see or change your own data
alter table public.areas enable row level security;
alter table public.outcomes enable row level security;
alter table public.items enable row level security;
alter table public.timer_sessions enable row level security;
alter table public.settings enable row level security;

drop policy if exists "own areas" on public.areas;
create policy "own areas" on public.areas for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "own outcomes" on public.outcomes;
create policy "own outcomes" on public.outcomes for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "own items" on public.items;
create policy "own items" on public.items for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "own sessions" on public.timer_sessions;
create policy "own sessions" on public.timer_sessions for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "own settings" on public.settings;
create policy "own settings" on public.settings for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Lock down any older tables from earlier versions of the app
do $$
declare t text;
begin
  foreach t in array array['tasks', 'tasks_legacy', 'zones', 'steps', 'sessions'] loop
    if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = t) then
      execute format('alter table public.%I enable row level security', t);
    end if;
  end loop;
end $$;

-- Live sync between phone and desktop
do $$
begin
  begin alter publication supabase_realtime add table public.areas; exception when others then null; end;
  begin alter publication supabase_realtime add table public.outcomes; exception when others then null; end;
  begin alter publication supabase_realtime add table public.items; exception when others then null; end;
end $$;
