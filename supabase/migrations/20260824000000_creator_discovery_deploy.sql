-- ===========================================================================
-- Creator Discovery — deploy step 2 (extensions + backfill existing users)
-- Run AFTER 20260823000000_creator_discovery.sql.
-- ===========================================================================

-- 1) Enable the scheduling extensions exactly as the Dashboard toggle does.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2) Backfill a settings row for every EXISTING user. The auto-seed trigger
--    on auth.users only fires at signup, so accounts created before the
--    migration would otherwise have no row (and "Run now" would not work).
insert into public.creator_discovery_settings (user_id)
select id from auth.users
on conflict (user_id) do nothing;