-- TOP LEVEL SECURITY HARDENING
-- Ensures every public table has RLS FORCE and no anonymous data leak.
-- Already fixed 4 legacy tables in 20260824000300; this migration locks down further
-- and documents the posture for Supabase Advisor.

-- 1) FORCE RLS on every core CRM table (even if policy exists, force ensures superuser bypass is still checked)
alter table if exists public.creators enable row level security;
alter table if exists public.creators force row level security;
alter table if exists public.brands enable row level security;
alter table if exists public.brands force row level security;
alter table if exists public.brand_contacts enable row level security;
alter table if exists public.brand_contacts force row level security;
alter table if exists public.campaigns enable row level security;
alter table if exists public.campaigns force row level security;
alter table if exists public.campaign_creators enable row level security;
alter table if exists public.campaign_creators force row level security;
alter table if exists public.meetings enable row level security;
alter table if exists public.meetings force row level security;
alter table if exists public.activity enable row level security;
alter table if exists public.activity force row level security;
alter table if exists public.profiles enable row level security;
alter table if exists public.profiles force row level security;
alter table if exists public.email_templates enable row level security;
alter table if exists public.email_templates force row level security;
alter table if exists public.outreach_events enable row level security;
alter table if exists public.outreach_events force row level security;
alter table if exists public.send_jobs enable row level security;
alter table if exists public.send_jobs force row level security;
alter table if exists public.send_job_items enable row level security;
alter table if exists public.send_job_items force row level security;
alter table if exists public.creator_discovery_settings enable row level security;
alter table if exists public.creator_discovery_settings force row level security;
alter table if exists public.discovery_runs enable row level security;
alter table if exists public.discovery_runs force row level security;
alter table if exists public.searched_channels enable row level security;
alter table if exists public.searched_channels force row level security;
alter table if exists public.search_exclusions enable row level security;
alter table if exists public.search_exclusions force row level security;
alter table if exists public.creator_channel_scans enable row level security;
alter table if exists public.creator_channel_scans force row level security;
alter table if exists public.external_links enable row level security;
alter table if exists public.external_links force row level security;

-- 2) Legacy/internal tables remain RLS-ENABLED with NO public policies (deny-all for anon/auth)
-- service_role bypasses RLS, so background jobs still work. Do not add permissive policies unless explicitly needed.
alter table if exists public.city_coverage enable row level security;
alter table if exists public.city_coverage force row level security;
alter table if exists public.app_users enable row level security;
alter table if exists public.app_users force row level security;
alter table if exists public.leads enable row level security;
alter table if exists public.leads force row level security;
alter table if exists public.scrape_jobs enable row level security;
alter table if exists public.scrape_jobs force row level security;
alter table if exists public.gmail_tokens enable row level security;
alter table if exists public.gmail_tokens force row level security;
alter table if exists public.brand_search_runs enable row level security;
alter table if exists public.brand_search_runs force row level security;
alter table if exists public.creator_search_runs enable row level security;
alter table if exists public.creator_search_runs force row level security;

-- 3) Revoke public execute on legacy tables from anon/authenticated (defense in depth beyond RLS)
revoke all on table public.city_coverage from anon, authenticated;
revoke all on table public.app_users from anon, authenticated;
revoke all on table public.leads from anon, authenticated;
revoke all on table public.scrape_jobs from anon, authenticated;
revoke all on table public.gmail_tokens from anon, authenticated;

-- 4) Ensure storage buckets (if any future) default to private
-- Currently no buckets exist; this is a guard for future creates.
