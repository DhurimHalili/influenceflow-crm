-- 20260917000000_rebuild_parity_no_data_loss.sql
-- Purpose: bring the LIVE database up to the rebuild UI's expectations
-- WITHOUT losing any user data (influencers, brands, contacts, campaigns, meetings, activity).
--
-- Rules followed:
-- 1. ADDITIVE ONLY for columns/tables (no DROP COLUMN / DROP TABLE).
--    Legacy outreach/discovery columns (personalization, draft_subject/body,
--    gmail settings, send_jobs, discovery tables, external_links, etc.) are
--    LEFT IN PLACE and simply ignored by the new UI.
-- 2. Backfill new columns with safe defaults so old rows keep working.
-- 3. Intentional data mapping (requested by owner): reach_back workflow is
--    removed. reach_back / reach_back_1/2/3 -> contacted. Rows are preserved,
--    only the stage label moves to the closest rebuild stage.
-- 4. campaigns.deliverables stays untouched (text legacy). A new
--    campaigns.deliverables_items jsonb column carries the rebuild checklist.
--    Old text is backfilled line-by-line, never deleted.
-- 5. Idempotent: safe to run twice (IF NOT EXISTS / COALESCE guards).

create extension if not exists "pgcrypto";

-- ── 1. New UI columns (additive) ──────────────────────────────────────────
alter table public.creators
  add column if not exists engagement_rate numeric(7,3) not null default 0,
  add column if not exists next_action text not null default '';

alter table public.brands
  add column if not exists next_action text not null default '';

alter table public.campaigns
  add column if not exists next_action text not null default '',
  add column if not exists deliverables_items jsonb not null default '[]'::jsonb;

alter table public.meetings
  add column if not exists updated_at timestamptz not null default now();

-- ── 1b. Activity table naming: live uses singular `activity`, rebuild uses ──
-- plural `activities`. Normalize to plural WITHOUT data loss:
--   legacy-only  -> rename (rows preserved, same table OID family, RLS re-applied below)
--   both exist   -> copy missing rows into plural, keep singular as archive (never drop)
--   neither      -> create plural fresh with the rebuild shape
do $$
begin
  if to_regclass('public.activities') is null and to_regclass('public.activity') is not null then
    alter table public.activity rename to activities;
  elsif to_regclass('public.activities') is null and to_regclass('public.activity') is null then
    create table public.activities (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references auth.users(id) on delete cascade,
      text text not null,
      at timestamptz not null default now(),
      entity_type text check (entity_type in ('creator','brand','campaign','meeting','system')),
      entity_id uuid
    );
    alter table public.activities enable row level security;
  elsif to_regclass('public.activities') is not null and to_regclass('public.activity') is not null then
    insert into public.activities (id, user_id, text, at)
    select a.id, a.user_id, a.text, coalesce(a.at, now())
    from public.activity a
    where not exists (select 1 from public.activities x where x.id = a.id)
    on conflict (id) do nothing;
  end if;
end $$;

alter table public.activities
  add column if not exists entity_type text check (entity_type in ('creator','brand','campaign','meeting','system')),
  add column if not exists entity_id uuid;

alter table public.activities enable row level security;
drop policy if exists "activities_owner_select" on public.activities;
create policy "activities_owner_select" on public.activities for select using (user_id = auth.uid());
drop policy if exists "activities_owner_insert" on public.activities;
create policy "activities_owner_insert" on public.activities for insert with check (user_id = auth.uid());
revoke update, delete on public.activities from authenticated;

-- campaign_creators in the rebuild carries user_id for RLS isolation.
-- Older deploys may lack it: add + backfill from the parent campaign.
alter table public.campaign_creators
  add column if not exists user_id uuid;

-- ── 2. Backfill nulls / defaults (never overwrite real values) ────────────
update public.creators set engagement_rate = 0 where engagement_rate is null;
update public.creators set next_action = '' where next_action is null;
update public.creators set avg_views = 0 where avg_views is null;
update public.creators set contact_email = '' where contact_email is null;
update public.creators set channel_link = '' where channel_link is null;
update public.creators set niche = '' where niche is null;
update public.creators set notes = '' where notes is null;
update public.creators set status_updated_at = coalesce(updated_at, created_at, now()) where status_updated_at is null;

update public.brands set next_action = '' where next_action is null;
update public.brands set domain = '' where domain is null;
update public.brands set brand_type = '' where brand_type is null;
update public.brands set contact_email = '' where contact_email is null;
update public.brands set notes = '' where notes is null;

update public.brand_contacts set notes = '' where notes is null;

update public.campaigns set next_action = '' where next_action is null;
update public.campaigns set agreed_payment = 0 where agreed_payment is null;
update public.campaigns set agency_percent = 20 where agency_percent is null;
-- creator_payout is a plain column on live (rebuild uses generated).
-- Recompute where null. Skipped automatically if the column is generated.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'campaigns' and column_name = 'creator_payout'
      and (is_generated = 'NEVER' or is_generated is null)
  ) then
    update public.campaigns
    set creator_payout = coalesce(agreed_payment, 0) * coalesce(agency_percent, 0) / 100
    where creator_payout is null;
  end if;
end $$;

-- meetings: rebuild requires ends_at; live allowed null. Backfill +30min, keep nullable.
update public.meetings
set ends_at = starts_at + interval '30 minutes'
where ends_at is null;
update public.meetings set notes = '' where notes is null;
update public.meetings set updated_at = coalesce(updated_at, created_at, now());

-- campaign_creators.user_id backfill from parent campaign owner.
update public.campaign_creators cc
set user_id = c.user_id
from public.campaigns c
where cc.user_id is null and cc.campaign_id = c.id;

-- ── 3. campaigns.deliverables (text) -> deliverables_items (jsonb checklist) ──
-- Each non-empty line becomes {id, text, done:false}. Existing jsonb kept.
update public.campaigns
set deliverables_items = (
  select coalesce(jsonb_agg(jsonb_build_object('id', gen_random_uuid()::text, 'text', line, 'done', false)), '[]'::jsonb)
  from (
    select trim(both from v) as line
    from unnest(string_to_array(coalesce(deliverables, ''), chr(10))) as v
  ) s
  where line <> ''
)
where (deliverables_items is null or deliverables_items = '[]'::jsonb)
  and coalesce(trim(both from deliverables), '') <> '';

-- ── 4. Requested removal: reach_back workflow -> contacted (rows preserved) ──
update public.creators
set pipeline_status = 'contacted', status_updated_at = now()
where pipeline_status in ('reach_back', 'reach_back_1', 'reach_back_2', 'reach_back_3');

update public.brand_contacts
set pipeline_status = 'contacted', status_updated_at = coalesce(status_updated_at, now())
where pipeline_status in ('reach_back', 'reach_back_1', 'reach_back_2', 'reach_back_3');

update public.brands
set pipeline_status = 'contacted'
where pipeline_status in ('reach_back', 'reach_back_1', 'reach_back_2', 'reach_back_3');

-- ── 5. Align check constraints with rebuild statuses (after mapping) ──────
-- Safety net: any unexpected/NULL status becomes 'new' so the new CHECK
-- can never fail on legacy rows.
update public.creators set pipeline_status = 'new'
where pipeline_status is null or pipeline_status not in ('new','contacted','replied','negotiating','roster','signed','denied','no_reply');
update public.brand_contacts set pipeline_status = 'new'
where pipeline_status is null or pipeline_status not in ('new','contacted','replied','negotiating','roster','signed','denied','no_reply');
update public.brands set pipeline_status = 'new'
where pipeline_status is null or pipeline_status not in ('new','contacted','replied','negotiating','roster','signed','denied','no_reply');
alter table public.creators drop constraint if exists creators_pipeline_status_check;
alter table public.creators
  add constraint creators_pipeline_status_check
  check (pipeline_status = any (array['new','contacted','replied','negotiating','roster','signed','denied','no_reply']));

alter table public.brand_contacts drop constraint if exists brand_contacts_pipeline_status_check;
alter table public.brand_contacts
  add constraint brand_contacts_pipeline_status_check
  check (pipeline_status = any (array['new','contacted','replied','negotiating','roster','signed','denied','no_reply']));

alter table public.brands drop constraint if exists brands_pipeline_status_check;
alter table public.brands
  add constraint brands_pipeline_status_check
  check (pipeline_status = any (array['new','contacted','replied','negotiating','roster','signed','denied','no_reply']));

-- ── 6. Indexes for new access patterns (safe, idempotent) ─────────────────
create index if not exists creators_user_status_rebuild_idx on public.creators(user_id, pipeline_status) where archived_at is null;
create index if not exists brands_user_status_rebuild_idx on public.brands(user_id, pipeline_status) where archived_at is null;
create index if not exists campaign_creators_user_idx_rebuild on public.campaign_creators(user_id);
create index if not exists activities_user_at_rebuild_idx on public.activities(user_id, "at" desc);
