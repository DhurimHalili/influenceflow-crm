-- Channels already evaluated by Find Creators stay on cooldown for 3 weeks
create table if not exists public.creator_channel_scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  channel_id text not null,
  last_scanned_at timestamptz not null default now(),
  unique (user_id, channel_id)
);

create index if not exists creator_channel_scans_user_scanned_idx
  on public.creator_channel_scans (user_id, last_scanned_at desc);

alter table public.creator_channel_scans enable row level security;

drop policy if exists creator_channel_scans_own on public.creator_channel_scans;
create policy creator_channel_scans_own on public.creator_channel_scans
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
