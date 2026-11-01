-- Gmail sync, the follow-up engine and shareable media kits.
-- Additive and idempotent. Secrets (the cron secret) are NOT stored here —
-- see the README "Gmail sync" section.

-- ---------------------------------------------------------------------------
-- OAuth state: a one-time nonce per "Connect Gmail" click. The callback only
-- accepts a state it issued (≤ 15 min old) and deletes it on use, so nobody
-- can attach their Gmail to someone else's account (login CSRF).
-- ---------------------------------------------------------------------------
create table if not exists public.oauth_states (
  nonce text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  purpose text not null default 'gmail',
  created_at timestamptz not null default now()
);
alter table public.oauth_states enable row level security;
-- No policies: only the service role (edge functions) can touch it.

-- ---------------------------------------------------------------------------
-- Gmail connection bookkeeping (tokens stay server-only: RLS on, no policies).
-- ---------------------------------------------------------------------------
alter table public.gmail_tokens add column if not exists scopes text not null default '';
alter table public.gmail_tokens add column if not exists history_id text;
alter table public.gmail_tokens add column if not exists last_sync_at timestamptz;
alter table public.gmail_tokens add column if not exists sync_error text not null default '';
alter table public.gmail_tokens add column if not exists backfilled text[] not null default '{}';
alter table public.gmail_tokens add column if not exists connected_at timestamptz;
alter table public.gmail_tokens enable row level security;

-- What the app may know about the connection — never the tokens.
create or replace function public.gmail_status()
returns table (connected boolean, email text, scopes text, last_sync_at timestamptz, sync_error text, connected_at timestamptz)
language sql
security definer
set search_path = public
stable
as $$
  select true, t.email, t.scopes, t.last_sync_at, t.sync_error, t.connected_at
  from public.gmail_tokens t
  where t.user_id = auth.uid();
$$;
revoke all on function public.gmail_status() from public, anon;
grant execute on function public.gmail_status() to authenticated;

-- ---------------------------------------------------------------------------
-- Email events: one row per Gmail message per CRM record it involves.
-- Metadata only (who, when, subject, Gmail's short preview) — never bodies.
-- Written by the gmail-sync function; the owner can read (and clear) them.
-- ---------------------------------------------------------------------------
create table if not exists public.email_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  gmail_id text not null,
  thread_id text not null default '',
  direction text not null check (direction in ('out', 'in')),
  entity_type text not null check (entity_type in ('creator', 'brand')),
  entity_id uuid not null,
  counterpart text not null default '',
  subject text not null default '',
  snippet text not null default '',
  at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (user_id, gmail_id, entity_id)
);
create index if not exists email_events_user_entity_at on public.email_events (user_id, entity_id, at desc);
create index if not exists email_events_user_at on public.email_events (user_id, at desc);
alter table public.email_events enable row level security;
drop policy if exists email_events_owner_select on public.email_events;
create policy email_events_owner_select on public.email_events for select using (user_id = auth.uid());
drop policy if exists email_events_owner_delete on public.email_events;
create policy email_events_owner_delete on public.email_events for delete using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Manual touches now cover brands too, record the channel (email, Instagram
-- DM, WhatsApp, call…) and can log a reply that came in outside Gmail.
-- ---------------------------------------------------------------------------
alter table public.followups alter column creator_id drop not null;
alter table public.followups add column if not exists brand_id uuid references public.brands(id) on delete cascade;
alter table public.followups add column if not exists kind text not null default 'followup';
alter table public.followups add column if not exists channel text not null default '';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'followups_kind_check') then
    alter table public.followups add constraint followups_kind_check check (kind in ('followup', 'reply'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'followups_target_check') then
    alter table public.followups add constraint followups_target_check check (creator_id is not null or brand_id is not null);
  end if;
end $$;
create index if not exists followups_brand on public.followups (brand_id) where brand_id is not null;

-- Follow-up reminders per record: snoozed until a date ('9999-12-31' = off),
-- and where the current status came from ('manual' or 'gmail').
alter table public.creators add column if not exists followup_snooze_until date;
alter table public.brands add column if not exists followup_snooze_until date;
alter table public.creators add column if not exists status_source text not null default 'manual';
alter table public.brands add column if not exists status_source text not null default 'manual';
alter table public.brands add column if not exists followup_count integer not null default 0;
alter table public.brands add column if not exists last_followup_at timestamptz;

-- ---------------------------------------------------------------------------
-- Media kits: a snapshot the user chose to publish, readable by anyone with
-- the unguessable link, through one function that returns only the snapshot.
-- ---------------------------------------------------------------------------
create table if not exists public.media_kits (
  slug text primary key check (slug ~ '^[A-Za-z0-9]{10,32}$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  creator_id uuid not null references public.creators(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  views integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, creator_id)
);
alter table public.media_kits enable row level security;
drop policy if exists media_kits_owner_all on public.media_kits;
create policy media_kits_owner_all on public.media_kits for all using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (select 1 from public.creators c where c.id = creator_id and c.user_id = auth.uid()));

create or replace function public.get_media_kit(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if p_slug is null or p_slug !~ '^[A-Za-z0-9]{10,32}$' then
    return null;
  end if;
  update public.media_kits set views = views + 1 where slug = p_slug returning data into result;
  return result;
end;
$$;
revoke all on function public.get_media_kit(text) from public;
grant execute on function public.get_media_kit(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Background sync every 10 minutes for everyone who connected Gmail. The
-- shared secret lives in Vault ('gmail_cron_secret') and in the function's
-- GMAIL_CRON_SECRET, never in this file.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') and exists (select 1 from pg_extension where extname = 'pg_net') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'influenceflow-gmail-sync';
    perform cron.schedule(
      'influenceflow-gmail-sync',
      '*/10 * * * *',
      $cron$
        select net.http_post(
          url := (select coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'gmail_sync_url'), '')),
          headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'gmail_cron_secret'), ''))),
          body := '{"action":"cron"}'::jsonb,
          timeout_milliseconds := 120000
        )
        where exists (select 1 from vault.decrypted_secrets where name = 'gmail_cron_secret')
          and exists (select 1 from public.gmail_tokens);
      $cron$
    );
  end if;
end $$;
