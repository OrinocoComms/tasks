-- Run this in Supabase SQL Editor → New query → Run

create table if not exists tasks (
  id uuid primary key,
  title text not null,
  priority text not null default 'medium' check (priority in ('high', 'medium', 'low')),
  due_date date,
  estimated_minutes integer,
  tags text[] default '{}',
  project text,
  context text not null default 'orinoco' check (context in ('orinoco', 'personal')),
  completed boolean not null default false,
  archived boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

alter publication supabase_realtime add table tasks;
