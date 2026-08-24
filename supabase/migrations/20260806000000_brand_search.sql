-- Brand discovery / Search tab support
alter table public.creators
  add column if not exists last_brand_search_at timestamptz,
  add column if not exists gender_guess text;

alter table public.external_links
  add column if not exists creator_id uuid references public.creators(id) on delete set null,
  add column if not exists source_video_url text,
  add column if not exists discovered_at timestamptz default now(),
  add column if not exists domain text;

create table if not exists public.brand_search_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'running',
  brands_found int not null default 0,
  creators_scanned int not null default 0,
  youtube_scanned int not null default 0,
  target int not null default 50,
  phase text not null default 'crm',
  cursor_json jsonb not null default '{}'::jsonb,
  results jsonb not null default '[]'::jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists brand_search_runs_user_created_idx
  on public.brand_search_runs (user_id, created_at desc);

alter table public.brand_search_runs enable row level security;

drop policy if exists brand_search_runs_own on public.brand_search_runs;
create policy brand_search_runs_own on public.brand_search_runs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists creators_last_brand_search_idx
  on public.creators (user_id, last_brand_search_at);
