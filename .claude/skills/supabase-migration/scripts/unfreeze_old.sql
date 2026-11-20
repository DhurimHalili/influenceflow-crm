-- Rollback only: give the OLD project its writes + timed jobs back (then stop the new project's jobs).
do $$ declare t record; begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p') loop
    execute format('grant insert, update, delete on public.%I to authenticated', t.relname);
  end loop;
end $$;
select cron.alter_job(jobid, active := true) from cron.job;
