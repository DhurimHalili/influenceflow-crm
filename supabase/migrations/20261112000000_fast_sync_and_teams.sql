-- Fast Gmail tracking + creators' teams (additive, idempotent).
--
-- gmail-sync now runs in two phases (see the function): "track" every minute
-- (headers only, committed in seconds) and "read" every few minutes (full
-- emails, AI, backlog). Leases keep two runs off the same mailbox.
alter table public.gmail_tokens add column if not exists lead_queue text[] not null default '{}';
alter table public.gmail_tokens add column if not exists read_at timestamptz;
alter table public.gmail_tokens add column if not exists track_lock_until timestamptz;
alter table public.gmail_tokens add column if not exists read_lock_until timestamptz;

-- A creator's manager / agent / agency / team addresses: mail with them counts
-- for the creator. [{email, role, name, source ('gmail'|'manual'), why, at, removed?}]
alter table public.creators add column if not exists team jsonb not null default '[]'::jsonb;
alter table public.creators drop constraint if exists creators_team_is_array;
alter table public.creators add constraint creators_team_is_array check (jsonb_typeof(team) = 'array' and jsonb_array_length(team) <= 30);

-- Every minute instead of every ten.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'influenceflow-gmail-sync') then
    perform cron.alter_job((select jobid from cron.job where jobname = 'influenceflow-gmail-sync'), schedule := '* * * * *');
  end if;
exception when undefined_table or undefined_function then
  raise notice 'pg_cron not available; schedule the gmail-sync cron by hand';
end $$;
