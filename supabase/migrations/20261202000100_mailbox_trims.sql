-- Mailbox guard: what the CRM took back to keep a mailbox at its daily limit (who, what, when it would have gone,
-- the mailbox's numbers at that moment). Written by gmail-sync only; members read their own rows.
create table if not exists public.mailbox_trims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  mailbox text not null,
  source text not null check (source in ('autopilot', 'gmail')),
  role text not null default 'followup' check (role in ('followup', 'new', 'reply')),
  round int,
  entity_type text not null default '',
  entity_id uuid,
  ref text not null default '',
  send_at timestamptz,
  used int not null default 0,
  cap int not null default 0,
  status text not null default 'cancelled' check (status in ('cancelled', 'blocked')),
  note text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists mailbox_trims_user_day on public.mailbox_trims (user_id, day desc);
create unique index if not exists mailbox_trims_once on public.mailbox_trims (user_id, source, ref);
alter table public.mailbox_trims enable row level security;
drop policy if exists mailbox_trims_select_own on public.mailbox_trims;
create policy mailbox_trims_select_own on public.mailbox_trims for select to authenticated using (user_id = auth.uid());
drop policy if exists approved_members_only on public.mailbox_trims;
create policy approved_members_only on public.mailbox_trims as restrictive for all to authenticated using ((select public.is_approved())) with check ((select public.is_approved()));
revoke insert, update, delete on public.mailbox_trims from anon, authenticated;
grant select on public.mailbox_trims to authenticated;
