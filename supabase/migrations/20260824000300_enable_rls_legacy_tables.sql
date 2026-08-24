-- Fix Supabase Advisor CRITICAL: RLS Disabled in Public
-- These 4 legacy tables were public without RLS. Enable RLS to block anon/auth.
-- No permissive policies = deny all for PostgREST roles; service_role bypasses RLS and keeps working.
-- If you need to expose any of these later, add a targeted policy instead of disabling RLS.

alter table if exists public.city_coverage enable row level security;
alter table if exists public.app_users enable row level security;
alter table if exists public.leads enable row level security;
alter table if exists public.scrape_jobs enable row level security;

-- Ensure no accidental public access via existing grants is usable without a policy
-- (RLS enabled + no policy = default DENY for anon/authenticated)
