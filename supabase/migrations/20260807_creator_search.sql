-- Creator discovery / Search → Find Creators
create table if not exists public.creator_search_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'running',
  creators_found int not null default 0,
  youtube_scanned int not null default 0,
  target int not null default 50,
  phase text not null default 'youtube',
  cursor_json jsonb not null default '{}'::jsonb,
  results jsonb not null default '[]'::jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists creator_search_runs_user_created_idx
  on public.creator_search_runs (user_id, created_at desc);

alter table public.creator_search_runs enable row level security;

drop policy if exists creator_search_runs_own on public.creator_search_runs;
create policy creator_search_runs_own on public.creator_search_runs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
