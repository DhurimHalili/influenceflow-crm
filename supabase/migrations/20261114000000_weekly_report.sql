-- Weekly report email (additive, idempotent).
--   weekly_reports — one row per report sent (or tried): which week, when,
--                    automatic or "send it now", and the verdict tone.
--                    No numbers, names or email content are stored.
-- The hourly job calls the weekly-report function with the same server-only
-- secret as the Gmail job (Vault); the function sends each member's report
-- at their chosen time in their own time zone, once per week.

create table if not exists public.weekly_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  week_start date not null,
  kind text not null default 'auto' check (kind in ('auto', 'manual')),
  status text not null default 'sent' check (status in ('sent', 'failed')),
  tone text not null default '' check (char_length(tone) <= 16),
  error text not null default '' check (char_length(error) <= 300),
  sent_at timestamptz not null default now()
);
create unique index if not exists weekly_reports_auto_once on public.weekly_reports (user_id, week_start) where kind = 'auto' and status = 'sent';
create index if not exists weekly_reports_user_idx on public.weekly_reports (user_id, sent_at desc);

alter table public.weekly_reports enable row level security;
-- Members read their own history; only the server (service role) writes.
drop policy if exists weekly_reports_select_own on public.weekly_reports;
create policy weekly_reports_select_own on public.weekly_reports for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists approved_members_only on public.weekly_reports;
create policy approved_members_only on public.weekly_reports as restrictive for all to authenticated using ((select public.is_approved())) with check ((select public.is_approved()));
revoke insert, update, delete on public.weekly_reports from anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'influenceflow-weekly-report') then
    perform cron.unschedule('influenceflow-weekly-report');
  end if;
  perform cron.schedule('influenceflow-weekly-report', '7 * * * *', $job$
    select net.http_post(
      url := replace((select coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'gmail_sync_url'), '')), '/gmail-sync', '/weekly-report'),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'gmail_cron_secret'), ''))),
      body := '{"action":"cron"}'::jsonb,
      timeout_milliseconds := 150000
    )
    where exists (select 1 from vault.decrypted_secrets where name = 'gmail_sync_url');
  $job$);
exception when undefined_table or invalid_schema_name then
  raise notice 'pg_cron / pg_net not available: weekly reports only go out with "Send it now"';
end $$;
