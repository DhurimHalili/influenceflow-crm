-- Data transfer (free plan 5.5 GB): the Gmail safety-net cron runs every 2 minutes instead of every minute.
-- New mail still arrives in seconds through the Gmail push (users.watch); the cron only catches what a push missed.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'influenceflow-gmail-sync') then
    perform cron.alter_job((select jobid from cron.job where jobname = 'influenceflow-gmail-sync'), schedule := '*/2 * * * *');
  end if;
end $$;
