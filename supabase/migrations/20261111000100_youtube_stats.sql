-- YouTube numbers on influencers (additive, idempotent).
--   creators.youtube           — the channel facts last read (id, handle, subscribers,
--                                average views of the latest long videos, engagement…)
--   creators.youtube_synced_at — when they were read; the hourly refresh goes oldest first
-- The hourly job calls the youtube-sync function with the same server-only
-- secret as the Gmail job (Vault), only for members with the setting on.

alter table public.creators add column if not exists youtube jsonb not null default '{}'::jsonb;
alter table public.creators add column if not exists youtube_synced_at timestamptz;
create index if not exists creators_youtube_synced_idx on public.creators (youtube_synced_at nulls first) where archived_at is null;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'influenceflow-youtube-refresh') then
    perform cron.unschedule('influenceflow-youtube-refresh');
  end if;
  perform cron.schedule('influenceflow-youtube-refresh', '23 * * * *', $job$
    select net.http_post(
      url := replace((select coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'gmail_sync_url'), '')), '/gmail-sync', '/youtube-sync'),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'gmail_cron_secret'), ''))),
      body := '{"action":"cron"}'::jsonb,
      timeout_milliseconds := 120000
    )
    where exists (select 1 from vault.decrypted_secrets where name = 'gmail_sync_url');
  $job$);
exception when undefined_table or invalid_schema_name then
  raise notice 'pg_cron / pg_net not available: the hourly YouTube refresh is off (the buttons still work)';
end $$;
