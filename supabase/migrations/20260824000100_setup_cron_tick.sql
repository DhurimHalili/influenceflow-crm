-- ===========================================================================
-- Creator Discovery — cron tick setup
-- Run AFTER 20260824000000_creator_discovery_deploy.sql (which enables
-- the pg_cron and pg_net extensions).
-- ===========================================================================

-- 5-minute pg_cron tick. Each tick is a near-no-op: the function checks every
-- enabled user's schedule (their chosen time + timezone) and only runs a full
-- discovery search for users whose slot is due today (within 5 min window)
-- and haven't already run today. Changing schedule_time or timezone in the
-- Discovery UI takes effect immediately — no cron edits.
--
-- Security: the function requires x-discovery-secret for unauthenticated ticks.
-- Replace <PROJECT_URL>, <ANON_KEY>, <DISCOVERY_SECRET> with your values.
--   PROJECT_URL: https://oyyuugucxqtenuqbbbur.supabase.co
--   ANON_KEY:    from Supabase Dashboard → API → anon key
--   DISCOVERY_SECRET: the value you set via `supabase secrets set DISCOVERY_SECRET=...`
--
-- The function also supports manual runs via the Discovery UI "Run now" button
-- which sends the user's JWT (Authorization header) and bypasses the secret.

-- Idempotency: cron.schedule with the same job name replaces the existing job.
select cron.schedule(
  'influenceflow-discovery-tick',
  '*/5 * * * *',
  $$select net.http_post(
       url := 'https://oyyuugucxqtenuqbbbur.supabase.co/functions/v1/discover-creators',
       headers := jsonb_build_object('Content-Type','application/json','apikey','<ANON_KEY>','x-discovery-secret','<DISCOVERY_SECRET>'),
       body := '{}'::jsonb
     ) as request_id;$$
);

-- Performance: index the enabled flag used by each tick to filter users.
create index if not exists idx_discovery_settings_enabled
  on public.creator_discovery_settings (user_id)
  where enabled = true;
