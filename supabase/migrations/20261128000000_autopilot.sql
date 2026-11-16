-- Autopilot: follow-ups the CRM sends for you (only to influencers who never
-- answered), from your own templates, at human times, never past your midnight.
--
-- autosend_queue — one row per follow-up the CRM will send / sent / didn't send.
--   Written ONLY by the gmail-sync function (service role); you can read your
--   own rows. One waiting follow-up per influencer at most. Right before a row
--   is sent, the function checks Gmail again: any answer from their side, a
--   follow-up you sent yourself, or the day being over cancels it.
-- autosend_days — per member per day: did you allow "fill the rest too", did
--   you say "not today", and what the night fill last found.
-- The cron job calls gmail-sync {"action":"autopilot_tick"} every minute — only when a
-- follow-up is due or someone has the night fill on (no call otherwise).

create table if not exists public.autosend_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  creator_id uuid not null references public.creators (id) on delete cascade,
  mailbox text not null,
  thread_id text not null,
  round smallint not null check (round between 1 and 4),
  template_id text not null default '',
  template_name text not null default '',
  body text not null check (char_length(body) between 1 and 2000),
  send_at timestamptz not null,
  day date not null,
  origin text not null check (origin in ('manual', 'batch', 'fill')),
  batch_id uuid,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'cancelled', 'failed')),
  reason text not null default '',
  attempts smallint not null default 0,
  gmail_id text not null default '',
  fit jsonb,
  their_zone text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz
);
create unique index if not exists autosend_one_waiting on public.autosend_queue (creator_id) where status in ('pending', 'sending');
create index if not exists autosend_due on public.autosend_queue (send_at) where status = 'pending';
create index if not exists autosend_user_day on public.autosend_queue (user_id, day desc);
create index if not exists autosend_user_status on public.autosend_queue (user_id, status);

alter table public.autosend_queue enable row level security;
drop policy if exists "read own autosend" on public.autosend_queue;
create policy "read own autosend" on public.autosend_queue for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists approved_members_only on public.autosend_queue;
create policy approved_members_only on public.autosend_queue as restrictive for all to authenticated using ((select public.is_approved())) with check ((select public.is_approved()));
revoke all on public.autosend_queue from anon, authenticated;
grant select on public.autosend_queue to authenticated;

create table if not exists public.autosend_days (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  extra_ok boolean not null default false,
  declined boolean not null default false,
  checked_at timestamptz,
  need int not null default 0,
  short int not null default 0,
  available int not null default 0,
  note text not null default '',
  primary key (user_id, day)
);
alter table public.autosend_days enable row level security;
drop policy if exists "read own autosend days" on public.autosend_days;
create policy "read own autosend days" on public.autosend_days for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists approved_members_only on public.autosend_days;
create policy approved_members_only on public.autosend_days as restrictive for all to authenticated using ((select public.is_approved())) with check ((select public.is_approved()));
revoke all on public.autosend_days from anon, authenticated;
grant select on public.autosend_days to authenticated;

-- Every minute: send what's due, cancel what can't go, run the night fill.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'influenceflow-autopilot';
    perform cron.schedule('influenceflow-autopilot', '* * * * *', $cron$
      select net.http_post(
        url := (select coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'gmail_sync_url'), '')),
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'gmail_cron_secret'), ''))),
        body := '{"action":"autopilot_tick"}'::jsonb,
        timeout_milliseconds := 120000
      )
      where exists (select 1 from vault.decrypted_secrets where name = 'gmail_cron_secret')
        and (exists (select 1 from public.autosend_queue where status = 'pending' and send_at <= now() + interval '90 seconds')
          or exists (select 1 from public.autosend_queue where status = 'sending' and updated_at < now() - interval '10 minutes')
          or exists (select 1 from public.profiles where preferences -> 'autopilot' ->> 'fill' = 'true'));
    $cron$);
  end if;
end $$;
