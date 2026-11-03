-- Several Gmail mailboxes per user, per-mailbox stats, encrypted Google tokens
-- and the inbound lead scanner. Additive and idempotent.

-- ---------------------------------------------------------------------------
-- 1. gmail_tokens: one row per connected mailbox (was: one per user).
-- ---------------------------------------------------------------------------
alter table public.gmail_tokens add column if not exists id uuid not null default gen_random_uuid();
alter table public.gmail_tokens add column if not exists send_day date;
alter table public.gmail_tokens add column if not exists send_count integer not null default 0;
alter table public.gmail_tokens add column if not exists leads_scanned_at timestamptz;
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'gmail_tokens_pkey' and conrelid = 'public.gmail_tokens'::regclass
             and pg_get_constraintdef(oid) = 'PRIMARY KEY (user_id)') then
    alter table public.gmail_tokens drop constraint gmail_tokens_pkey;
    alter table public.gmail_tokens add constraint gmail_tokens_pkey primary key (id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'gmail_tokens_user_email_key') then
    alter table public.gmail_tokens add constraint gmail_tokens_user_email_key unique (user_id, email);
  end if;
end $$;
create index if not exists gmail_tokens_user on public.gmail_tokens (user_id);
alter table public.gmail_tokens enable row level security;
-- Still no policies: tokens are only ever touched by the edge functions.

-- What the app may know about its mailboxes — never the tokens.
drop function if exists public.gmail_status();
create function public.gmail_status()
returns table (id uuid, email text, scopes text, last_sync_at timestamptz, sync_error text, connected_at timestamptz)
language sql
security definer
set search_path = public
stable
as $$
  select t.id, t.email, t.scopes, t.last_sync_at, t.sync_error, t.connected_at
  from public.gmail_tokens t
  where t.user_id = auth.uid()
  order by t.connected_at nulls first;
$$;
revoke all on function public.gmail_status() from public, anon;
grant execute on function public.gmail_status() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Email events remember which of your mailboxes they came through, and the
--    message's RFC Message-ID so a mail seen in two of your inboxes counts once.
-- ---------------------------------------------------------------------------
alter table public.email_events add column if not exists mailbox text not null default '';
alter table public.email_events add column if not exists message_key text not null default '';
create index if not exists email_events_user_message on public.email_events (user_id, message_key) where message_key <> '';
update public.email_events e set mailbox = lower(t.email)
from public.gmail_tokens t
where e.mailbox = '' and t.user_id = e.user_id and t.email is not null
  and (select count(*) from public.gmail_tokens x where x.user_id = e.user_id) = 1;

-- ---------------------------------------------------------------------------
-- 3. PKCE for the Google sign-in step.
-- ---------------------------------------------------------------------------
alter table public.oauth_states add column if not exists code_verifier text;

-- ---------------------------------------------------------------------------
-- 4. Google tokens are encrypted (AES-256-GCM) by the edge functions with a key
--    that lives only in Vault. A copy of the table alone is useless.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'supabase_vault') and not exists (select 1 from vault.secrets where name = 'gmail_token_key') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'gmail_token_key', 'AES-256 key for Google tokens in gmail_tokens');
  end if;
end $$;

create or replace function public.gmail_token_key()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'gmail_token_key' limit 1;
$$;
revoke all on function public.gmail_token_key() from public, anon, authenticated;
grant execute on function public.gmail_token_key() to service_role;

-- ---------------------------------------------------------------------------
-- 5. Inbound leads: people who wrote to one of your mailboxes first and look
--    like a real brand or creator enquiry (not newsletters, warm-up mail,
--    receipts or personal mail). You decide: add to the CRM or dismiss.
-- ---------------------------------------------------------------------------
create table if not exists public.inbound_leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  name text not null default '',
  company text not null default '',
  mailbox text not null default '',
  kind text not null default 'unknown' check (kind in ('brand', 'creator', 'unknown')),
  score integer not null default 0,
  reasons text[] not null default '{}',
  subject text not null default '',
  snippet text not null default '',
  gmail_id text not null default '',
  thread_id text not null default '',
  via_form boolean not null default false,
  messages integer not null default 1,
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  status text not null default 'new' check (status in ('new', 'added', 'dismissed')),
  entity_type text check (entity_type in ('creator', 'brand')),
  entity_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, email)
);
create index if not exists inbound_leads_user_status on public.inbound_leads (user_id, status, last_at desc);
alter table public.inbound_leads enable row level security;
drop policy if exists inbound_leads_owner_select on public.inbound_leads;
create policy inbound_leads_owner_select on public.inbound_leads for select using (user_id = auth.uid());
drop policy if exists inbound_leads_owner_update on public.inbound_leads;
create policy inbound_leads_owner_update on public.inbound_leads for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists inbound_leads_owner_delete on public.inbound_leads;
create policy inbound_leads_owner_delete on public.inbound_leads for delete using (user_id = auth.uid());
-- The app may only change the decision fields; the scanner writes the rest.
revoke insert, update on public.inbound_leads from anon, authenticated;
grant select, delete on public.inbound_leads to authenticated;
grant update (status, kind, entity_type, entity_id, updated_at) on public.inbound_leads to authenticated;
