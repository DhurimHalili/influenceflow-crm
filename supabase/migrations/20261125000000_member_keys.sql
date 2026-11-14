-- Each member's own API keys for the lookup services (Clay, Hunter).
--
-- The key itself never reaches the browser again after it is typed: the brand-match edge function
-- checks it with the service, seals it with AES-256-GCM (a Vault key used for nothing else, the
-- member id + service bound in as associated data so a sealed value can't be moved to another
-- account) and stores only the sealed value plus its last 4 characters. The table has RLS with no
-- policy that grants anything and no table privileges for anon/authenticated: only the service
-- role (edge functions) can read or write it. Deleting a member deletes their keys (FK cascade).

do $$
begin
  if exists (select 1 from pg_extension where extname = 'supabase_vault') and not exists (select 1 from vault.secrets where name = 'member_key_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'member_key_secret', 'AES-256 key for members'' own lookup-service API keys in member_keys');
  end if;
end $$;

create or replace function public.member_key_secret()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'member_key_secret' limit 1;
$$;
revoke all on function public.member_key_secret() from public, anon, authenticated;
grant execute on function public.member_key_secret() to service_role;

create table if not exists public.member_keys (
  user_id uuid not null references auth.users(id) on delete cascade,
  service text not null check (service in ('hunter', 'clay')),
  -- "k1.<iv>.<ciphertext>" (base64url); never the plain key.
  sealed text not null check (sealed like 'k1.%' and length(sealed) between 20 and 2000),
  -- Last 4 characters, to recognise the key ("•••• tsJu").
  hint text not null default '' check (length(hint) <= 4),
  -- What the service said about the account when the key was checked (plan / workspace name).
  label text not null default '' check (length(label) <= 80),
  status text not null default 'ok' check (status in ('ok', 'refused', 'quota')),
  checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, service)
);

alter table public.member_keys enable row level security;
-- No permissive policy on purpose: the app can't select, insert, update or delete rows.
drop policy if exists approved_members_only on public.member_keys;
create policy approved_members_only on public.member_keys as restrictive for all to authenticated using ((select public.is_approved())) with check ((select public.is_approved()));
revoke all on public.member_keys from anon, authenticated;
grant all on public.member_keys to service_role;
