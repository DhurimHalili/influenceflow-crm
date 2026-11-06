-- ===========================================================================
-- Creator Discovery — cron tick setup
-- Run AFTER 20260824000000_creator_discovery_deploy.sql (which enables
-- the pg_cron and pg_net extensions).
-- ===========================================================================

-- RETIRED. This file used to schedule a 5-minute pg_cron tick that POSTed to a
-- hard-coded production URL (functions/v1/discover-creators). Every project
-- that replayed the migrations (forks, copies) kept calling production with a
-- foreign key, and the Discovery function no longer exists. It now only removes
-- that job if a database still has it. Idempotent.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and exists (select 1 from cron.job where jobname = 'influenceflow-discovery-tick') then
    perform cron.unschedule('influenceflow-discovery-tick');
  end if;
end $$;

-- Performance: index the enabled flag used by each tick to filter users.
create index if not exists idx_discovery_settings_enabled
  on public.creator_discovery_settings (user_id)
  where enabled = true;
