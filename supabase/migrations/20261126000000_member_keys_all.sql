-- Members' own keys for every outside service: YouTube (up to 3 — each must be a project with its own approved
-- quota), AI (Gemini, Groq, Cloudflare Workers AI, OpenRouter) and lookups (Clay, Hunter). Same lock as before:
-- RLS with no permissive policy, no browser grants, sealed values only (see 20261125000000_member_keys.sql).

alter table public.member_keys add column if not exists slot smallint not null default 0;

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'member_keys_slot_check') then
    alter table public.member_keys drop constraint member_keys_slot_check;
  end if;
  alter table public.member_keys add constraint member_keys_slot_check check (slot between 0 and 2 and (slot = 0 or service = 'youtube'));

  if exists (select 1 from pg_constraint where conname = 'member_keys_service_check') then
    alter table public.member_keys drop constraint member_keys_service_check;
  end if;
  alter table public.member_keys add constraint member_keys_service_check check (service in ('youtube', 'gemini', 'groq', 'cloudflare', 'openrouter', 'hunter', 'clay'));

  -- One row per member × service × slot (was member × service).
  if exists (select 1 from pg_constraint where conname = 'member_keys_pkey' and pg_get_constraintdef(oid) not like '%slot%') then
    alter table public.member_keys drop constraint member_keys_pkey;
    alter table public.member_keys add constraint member_keys_pkey primary key (user_id, service, slot);
  end if;

  if exists (select 1 from pg_constraint where conname = 'member_keys_status_check') then
    alter table public.member_keys drop constraint member_keys_status_check;
  end if;
  alter table public.member_keys add constraint member_keys_status_check check (status in ('ok', 'refused', 'quota', 'not_enabled'));
end $$;

revoke all on public.member_keys from anon, authenticated;
