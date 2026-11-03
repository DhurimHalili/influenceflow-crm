-- Retire the legacy YouTube discovery cron.
--
-- Discovery is no longer wired to the app (see README). The hosted project still
-- ran this job every five minutes with an anon key and the discovery secret
-- embedded in the cron command. Keep the removal idempotent so this migration is
-- safe on environments that never had the job.
do $$
declare
  legacy_job_id bigint;
begin
  if to_regclass('cron.job') is not null then
    select jobid into legacy_job_id
    from cron.job
    where jobname = 'influenceflow-discovery-tick'
    limit 1;

    if legacy_job_id is not null then
      perform cron.unschedule(legacy_job_id);
    end if;
  end if;
end;
$$;
