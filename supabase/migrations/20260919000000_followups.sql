-- 20260919000000_followups.sql
-- Follow-up tracking for the outreach workflow. Additive only, no data loss.
-- history table (exact per-event timestamps for weekly stats) + cached
-- counters on creators for fast display. Legacy outreach columns untouched.

create table if not exists public.followups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  creator_id uuid not null references public.creators(id) on delete cascade,
  note text not null default '',
  at timestamptz not null default now()
);

alter table public.followups enable row level security;
drop policy if exists "followups_owner_all" on public.followups;
create policy "followups_owner_all" on public.followups
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create index if not exists followups_user_at_idx on public.followups(user_id, at desc);
create index if not exists followups_creator_idx on public.followups(creator_id);

alter table public.creators
  add column if not exists followup_count integer not null default 0,
  add column if not exists last_followup_at timestamptz;

-- Backfill cached counters from history (idempotent: recompute from table).
update public.creators c
set followup_count = coalesce(f.n, 0),
    last_followup_at = f.last_at
from (
  select creator_id, count(*) as n, max(at) as last_at
  from public.followups
  group by creator_id
) f
where f.creator_id = c.id;
