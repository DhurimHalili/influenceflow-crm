-- 20200101000000_core_schema_bootstrap.sql
-- Fork bootstrap: creates the exact production schema for a FRESH project.
-- Sorts first so dated migrations build on top of it. Every statement is
-- idempotent (IF NOT EXISTS / DROP IF EXISTS), so applying it on an
-- existing project is a safe no-op. Mirrors production verified 2026-09-20:
-- nullable columns stay nullable, legacy outreach columns included, final
-- check constraints (no reach_back), per-user RLS everywhere.

create extension if not exists "pgcrypto";

-- ── profiles (id = auth.users.id) ─────────────────────────────────────────
create table if not exists public.profiles (
  id uuid not null primary key references auth.users(id) on delete cascade,
  display_name text,
  theme text not null default 'agency'::text check (theme = any (array['agency'::text, 'light'::text, 'dark'::text, 'honey'::text, 'ocean'::text])),
  gmail_connected boolean not null default false,
  sender_name text,
  daily_send_limit integer not null default 50,
  send_delay_min integer not null default 60,
  send_delay_max integer not null default 150,
  reach_back_days integer not null default 3,
  max_reach_backs integer not null default 3,
  reminder_prefs text not null default 'browser'::text check (reminder_prefs = any (array['browser'::text, 'email'::text, 'both'::text, 'off'::text])),
  onboarding_done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── creators (influencers) ────────────────────────────────────────────────
create table if not exists public.creators (
  id uuid not null primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  contact_email text,
  channel_link text,
  niche text,
  avg_views numeric,
  platform text default 'youtube'::text,
  pipeline_status text not null default 'new'::text check (pipeline_status = any (array['new'::text, 'contacted'::text, 'replied'::text, 'negotiating'::text, 'roster'::text, 'signed'::text, 'denied'::text, 'no_reply'::text])),
  on_roster boolean not null default false,
  date_contacted date,
  last_sent_at timestamptz,
  reach_back_count integer not null default 0,
  message_id text,
  notes text default ''::text,
  personalization text default ''::text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_brand_search_at timestamptz,
  gender_guess text,
  draft_subject text,
  draft_body text,
  status_updated_at timestamptz,
  engagement_rate numeric(7,3) not null default 0,
  next_action text not null default '',
  stars integer not null default 0 check (stars between 0 and 5),
  stars_consistency integer not null default 0 check (stars_consistency between 0 and 5),
  stars_demographics integer not null default 0 check (stars_demographics between 0 and 5),
  stars_niche integer not null default 0 check (stars_niche between 0 and 5),
  priority text not null default 'none' check (priority in ('none', 'soon', 'urgent')),
  next_action_date date,
  followup_count integer not null default 0,
  last_followup_at timestamptz,
  lost_reason text not null default '',
  lost_at timestamptz
);

-- ── brands ────────────────────────────────────────────────────────────────
create table if not exists public.brands (
  id uuid not null primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  domain text,
  contact_email text,
  pipeline_status text not null default 'new'::text check (pipeline_status = any (array['new'::text, 'contacted'::text, 'replied'::text, 'negotiating'::text, 'roster'::text, 'signed'::text, 'denied'::text, 'no_reply'::text])),
  date_contacted date,
  notes text default ''::text,
  personalization text default ''::text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  brand_type text,
  next_action text not null default '',
  priority text not null default 'none' check (priority in ('none', 'soon', 'urgent')),
  next_action_date date,
  lost_reason text not null default '',
  lost_at timestamptz
);

-- ── brand_contacts (people) ───────────────────────────────────────────────
create table if not exists public.brand_contacts (
  id uuid not null primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  first_name text,
  last_name text,
  title text,
  email text not null,
  linkedin_url text,
  pipeline_status text not null default 'new'::text check (pipeline_status = any (array['new'::text, 'contacted'::text, 'replied'::text, 'negotiating'::text, 'roster'::text, 'signed'::text, 'denied'::text, 'no_reply'::text])),
  date_contacted date,
  last_sent_at timestamptz,
  reach_back_count integer not null default 0,
  message_id text,
  notes text default ''::text,
  personalization text default ''::text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status_updated_at timestamptz,
  lost_reason text not null default '',
  lost_at timestamptz
);

-- ── campaigns ─────────────────────────────────────────────────────────────
create table if not exists public.campaigns (
  id uuid not null primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  brand_id uuid references public.brands(id) on delete set null,
  platform text,
  deliverables text,
  agreed_payment numeric,
  agency_percent numeric default 20,
  creator_payout numeric,
  status text not null default 'negotiating'::text check (status = any (array['negotiating'::text, 'active'::text, 'completed'::text, 'cancelled'::text])),
  start_date date,
  due_date date,
  notes text default ''::text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  next_action text not null default '',
  deliverables_items jsonb not null default '[]'::jsonb,
  lost_reason text not null default '',
  lost_at timestamptz
);

-- ── campaign_creators (join) ──────────────────────────────────────────────
create table if not exists public.campaign_creators (
  id uuid not null primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  creator_id uuid not null references public.creators(id) on delete cascade,
  unique (campaign_id, creator_id)
);

-- ── meetings ──────────────────────────────────────────────────────────────
create table if not exists public.meetings (
  id uuid not null primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  related_type text check (related_type = any (array['creator'::text, 'brand'::text, 'campaign'::text])),
  related_id uuid,
  notes text default ''::text,
  remind_at timestamptz,
  reminder_sent boolean not null default false,
  kind text not null default 'meeting' check (kind in ('meeting', 'task', 'reminder')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── activities (append-only log) ──────────────────────────────────────────
create table if not exists public.activities (
  id uuid not null primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  text text not null,
  at timestamptz not null default now(),
  entity_type text check (entity_type = any (array['creator'::text, 'brand'::text, 'campaign'::text, 'meeting'::text, 'system'::text])),
  entity_id uuid
);

-- ── RLS + per-user policies (idempotent) ───────────────────────────────────
alter table public.profiles enable row level security;
alter table public.creators enable row level security;
alter table public.brands enable row level security;
alter table public.brand_contacts enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_creators enable row level security;
alter table public.meetings enable row level security;
alter table public.activities enable row level security;

drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles for select using (id = auth.uid());
drop policy if exists "profiles_insert" on public.profiles;
create policy "profiles_insert" on public.profiles for insert with check (id = auth.uid());
drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_update" on public.profiles for update using (id = auth.uid());

drop policy if exists "creators_all" on public.creators;
create policy "creators_all" on public.creators for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "brands_all" on public.brands;
create policy "brands_all" on public.brands for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "brand_contacts_all" on public.brand_contacts;
create policy "brand_contacts_all" on public.brand_contacts for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "campaigns_all" on public.campaigns;
create policy "campaigns_all" on public.campaigns for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "campaign_creators_all" on public.campaign_creators;
create policy "campaign_creators_all" on public.campaign_creators for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "meetings_all" on public.meetings;
create policy "meetings_all" on public.meetings for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "activities_owner_select" on public.activities;
create policy "activities_owner_select" on public.activities for select using (user_id = auth.uid());
drop policy if exists "activities_owner_insert" on public.activities;
create policy "activities_owner_insert" on public.activities for insert with check (user_id = auth.uid());
revoke update, delete on public.activities from authenticated;

-- ── helpful indexes ───────────────────────────────────────────────────────
create index if not exists brands_user_idx on public.brands(user_id);
create index if not exists creators_user_idx on public.creators(user_id);
create index if not exists creators_status_idx on public.creators(user_id, pipeline_status);
create index if not exists brand_contacts_user_idx on public.brand_contacts(user_id);
create index if not exists brand_contacts_brand_idx on public.brand_contacts(brand_id);
create index if not exists brand_contacts_email_idx on public.brand_contacts(user_id, email);
create index if not exists campaigns_user_idx on public.campaigns(user_id);
create index if not exists meetings_user_idx on public.meetings(user_id, starts_at);
create index if not exists activity_user_idx on public.activities(user_id, at desc);

-- ── profile auto-create on signup (conflict-safe: survives double firing) ──
create or replace function public.handle_new_user_profile()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_profile_bootstrap on auth.users;
create trigger on_auth_user_profile_bootstrap after insert on auth.users
  for each row execute function public.handle_new_user_profile();
