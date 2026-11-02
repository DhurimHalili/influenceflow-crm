-- Deal models, rate negotiation history, creator files (media kits) with
-- proof-aware audience data, strict inbound categories and an AI usage cap.
-- Additive and idempotent.

-- ---------------------------------------------------------------------------
-- 1. How the brand pays (flat, CPM with a window, CPA, rev share, hybrid…).
-- ---------------------------------------------------------------------------
alter table public.campaigns add column if not exists brand_terms jsonb not null default '{}'::jsonb;

-- ---------------------------------------------------------------------------
-- 2. Rates remember their list price and every negotiation; audience data is
--    split into what was proven (media kit / screenshot) and what the creator
--    only said.
-- ---------------------------------------------------------------------------
alter table public.creators add column if not exists rate_meta jsonb not null default '{}'::jsonb;
alter table public.creators add column if not exists rate_history jsonb not null default '[]'::jsonb;
alter table public.creators add column if not exists audience jsonb not null default '{}'::jsonb;

-- ---------------------------------------------------------------------------
-- 3. Inbound leads: the three strict categories (+ agencies).
-- ---------------------------------------------------------------------------
alter table public.inbound_leads add column if not exists category text not null default '';
alter table public.inbound_leads drop constraint if exists inbound_leads_kind_check;
alter table public.inbound_leads add constraint inbound_leads_kind_check check (kind in ('brand', 'creator', 'agency', 'unknown'));
grant update (status, kind, entity_type, entity_id, updated_at) on public.inbound_leads to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Creator files: media kits, rate cards and stats screenshots — saved from
--    Gmail automatically or uploaded by hand. Private bucket, 10 MB per file,
--    PDFs and images only, 300 MB per user.
-- ---------------------------------------------------------------------------
create table if not exists public.creator_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  creator_id uuid not null references public.creators(id) on delete cascade,
  path text not null,
  filename text not null default '',
  mime text not null,
  size integer not null default 0 check (size >= 0 and size <= 10485760),
  sha256 text not null default '',
  source text not null default 'upload' check (source in ('gmail', 'upload')),
  gmail_id text not null default '',
  mailbox text not null default '',
  received_at timestamptz not null default now(),
  kind text not null default 'unknown' check (kind in ('media_kit', 'rate_card', 'stats_screenshot', 'other', 'unknown')),
  status text not null default 'stored' check (status in ('stored', 'analyzed', 'rejected')),
  verdict text not null default '',
  analysis jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, creator_id, sha256)
);
create index if not exists creator_files_creator on public.creator_files (user_id, creator_id, received_at desc);
alter table public.creator_files enable row level security;
drop policy if exists creator_files_owner_select on public.creator_files;
create policy creator_files_owner_select on public.creator_files for select using (user_id = auth.uid());
drop policy if exists creator_files_owner_delete on public.creator_files;
create policy creator_files_owner_delete on public.creator_files for delete using (user_id = auth.uid());
drop policy if exists creator_files_owner_insert on public.creator_files;
create policy creator_files_owner_insert on public.creator_files for insert with check (
  user_id = auth.uid() and source = 'upload' and status = 'stored' and analysis = '{}'::jsonb
  and exists (select 1 from public.creators c where c.id = creator_id and c.user_id = auth.uid())
  and path like auth.uid()::text || '/' || creator_id::text || '/%'
);
revoke update on public.creator_files from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('creator-files', 'creator-files', false, 10485760, array['application/pdf', 'image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists creator_files_read on storage.objects;
create policy creator_files_read on storage.objects for select to authenticated
  using (bucket_id = 'creator-files' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists creator_files_delete on storage.objects;
create policy creator_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'creator-files' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists creator_files_upload on storage.objects;
create policy creator_files_upload on storage.objects for insert to authenticated
  with check (
    bucket_id = 'creator-files'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (select 1 from public.creators c where c.user_id = auth.uid() and c.id::text = (storage.foldername(name))[2])
    and (select coalesce(sum((o.metadata->>'size')::bigint), 0) from storage.objects o where o.bucket_id = 'creator-files' and o.owner = auth.uid()) < 314572800
  );

-- ---------------------------------------------------------------------------
-- 5. AI reading: a hard daily cap per user, kept server-side.
-- ---------------------------------------------------------------------------
create table if not exists public.ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  calls integer not null default 0,
  primary key (user_id, day)
);
alter table public.ai_usage enable row level security;
-- No policies: only the edge functions touch it.

create or replace function public.ai_take(p_user uuid, p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare used integer;
begin
  insert into public.ai_usage (user_id, day, calls) values (p_user, current_date, 1)
  on conflict (user_id, day) do update set calls = ai_usage.calls + 1
  returning calls into used;
  return used <= p_limit;
end;
$$;
revoke all on function public.ai_take(uuid, integer) from public, anon, authenticated;
grant execute on function public.ai_take(uuid, integer) to service_role;
