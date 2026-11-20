-- Egress + Disk IO (free plan, Nov 2026): the background timers run less often. Nothing is lost:
--   • Gmail safety net every 5 min (was 2). New mail still arrives in seconds through the Gmail push
--     (users.watch); this timer only catches what a push missed. Upkeep windows (15/30/60 min) still line up.
--   • Match (brand-match) every 10 min (was 3): reading new creators' videos, brand research, free company
--     facts and re-checks take a little longer to finish; nothing is skipped.
-- And creator_videos.tx_v: which version of the rules for what was HEARD in a video (captions) judged it, so
-- rows read by older rules are judged again from their stored caption lines (brand-match step 3c).
do $$
begin
  if exists (select 1 from cron.job where jobname = 'influenceflow-gmail-sync') then
    perform cron.alter_job((select jobid from cron.job where jobname = 'influenceflow-gmail-sync'), schedule := '*/5 * * * *');
  end if;
  if exists (select 1 from cron.job where jobname = 'influenceflow-brand-match') then
    perform cron.alter_job((select jobid from cron.job where jobname = 'influenceflow-brand-match'), schedule := '*/10 * * * *');
  end if;
end $$;

alter table public.creator_videos add column if not exists tx_v smallint not null default 0;
create index if not exists creator_videos_tx_v on public.creator_videos (user_id, tx_v);
-- Step 3c asks "any row read by older rules?" every run: these keep that an index lookup, never a table scan.
create index if not exists creator_videos_reader_v on public.creator_videos (user_id, reader_v);
alter table public.creator_brands add column if not exists sig text;
-- creator_brands.sig: a fingerprint of each deal link as brand-match last wrote it. A rebuild writes only the
-- links whose fingerprint changed (it rewrote every link every time: most of the database's disk I/O).

-- pg_cron keeps a row per run forever (thousands a day): keep one week, cleaned nightly.
do $$
begin
  if not exists (select 1 from cron.job where jobname = 'influenceflow-cron-log-cleanup') then
    perform cron.schedule('influenceflow-cron-log-cleanup', '17 3 * * *', $c$delete from cron.job_run_details where end_time < now() - interval '7 days'$c$);
  end if;
end $$;
