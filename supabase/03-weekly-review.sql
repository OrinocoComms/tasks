-- Run once if you set up the database before the weekly review was added.
alter table public.settings add column if not exists review_day int not null default 0;
alter table public.settings add column if not exists last_review date;
