-- Blocklist so Search never re-surfaces hard-deleted creators/brands
create table if not exists public.search_exclusions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('creator', 'brand')),
  -- Normalized fingerprint: YouTube channel id (UC…) or brand domain
  exclusion_key text not null,
  label text,
  channel_link text,
  domain text,
  created_at timestamptz not null default now(),
  unique (user_id, kind, exclusion_key)
);

create index if not exists search_exclusions_user_kind_idx
  on public.search_exclusions (user_id, kind);

alter table public.search_exclusions enable row level security;

drop policy if exists search_exclusions_own on public.search_exclusions;
create policy search_exclusions_own on public.search_exclusions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
