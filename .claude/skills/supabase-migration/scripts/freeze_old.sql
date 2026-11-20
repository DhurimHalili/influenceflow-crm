-- Run on the OLD project at cutover: nothing lands there after the final copy.
select cron.alter_job(jobid, active := false) from cron.job;
do $$ declare t record; begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p') loop
    execute format('revoke insert, update, delete, truncate on public.%I from anon, authenticated', t.relname);
  end loop;
end $$;
select count(*) filter (where active) as active_jobs_left from cron.job;
