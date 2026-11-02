-- 20261105000000_gemini_backfill_invoices_teams.sql
-- Additive and idempotent. No data is removed.
--   1. Creator files can also live in Gmail (big PDFs, no storage used) or be a
--      link (Canva / Drive / Dropbox kit) — plus a retry counter for AI reading.
--   2. Email events remember when their attachments/prices were checked, so the
--      server can go back through older mail (kits sent before this existed).
--   3. Gemini key pool cooldowns (server-only).
--   4. Invoices (chased on the follow-up schedule) and a contract per campaign.
--   5. Teams: opt-in leaderboard of coach numbers. Teammates see each other's
--      daily email counts and display names — nothing else from the CRM.

-- 1 ---------------------------------------------------------------------------
alter table public.creator_files add column if not exists storage text not null default 'bucket';
alter table public.creator_files add column if not exists url text not null default '';
alter table public.creator_files add column if not exists part_id text not null default '';
alter table public.creator_files add column if not exists ai_attempts integer not null default 0;
do $$ begin
  alter table public.creator_files add constraint creator_files_storage_check check (storage in ('bucket', 'gmail', 'link'));
exception when duplicate_object then null; end $$;
alter table public.creator_files drop constraint if exists creator_files_size_check;
alter table public.creator_files add constraint creator_files_size_check check (size >= 0 and size <= 26214400);
do $$ begin
  alter table public.creator_files add constraint creator_files_url_check check (url = '' or url ~ '^https://');
exception when duplicate_object then null; end $$;
create index if not exists creator_files_queue on public.creator_files (user_id, status, ai_attempts) where status = 'stored';

-- Hand uploads stay in the bucket; only the server records Gmail-kept files and links.
drop policy if exists creator_files_owner_insert on public.creator_files;
create policy creator_files_owner_insert on public.creator_files for insert with check (
  user_id = auth.uid() and source = 'upload' and status = 'stored' and analysis = '{}'::jsonb
  and storage = 'bucket' and url = '' and part_id = '' and ai_attempts = 0 and size <= 10485760
  and exists (select 1 from public.creators c where c.id = creator_id and c.user_id = auth.uid())
  and path like auth.uid()::text || '/' || creator_id::text || '/%'
);

-- 2 ---------------------------------------------------------------------------
alter table public.email_events add column if not exists intel_at timestamptz;
create index if not exists email_events_intel_todo on public.email_events (user_id, mailbox, at desc)
  where intel_at is null and direction = 'in' and entity_type = 'creator';

-- 3 ---------------------------------------------------------------------------
create table if not exists public.ai_key_state (
  key_hash text primary key check (key_hash ~ '^[0-9a-f]{24}$'),
  cooldown_until timestamptz,
  last_error text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.ai_key_state enable row level security;
-- No policies: only the edge functions (service role) read or write it.
revoke all on public.ai_key_state from anon, authenticated;

-- 4 ---------------------------------------------------------------------------
alter table public.campaigns add column if not exists contract jsonb not null default '{}'::jsonb;

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  brand_id uuid references public.brands(id) on delete set null,
  number text not null default '' check (char_length(number) <= 40),
  amount numeric(14, 2) not null default 0 check (amount >= 0 and amount <= 100000000),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  issued_on date not null default current_date,
  due_on date not null default (current_date + 14),
  paid_on date,
  status text not null default 'sent' check (status in ('draft', 'sent', 'paid', 'void')),
  notes text not null default '' check (char_length(notes) <= 2000),
  chases jsonb not null default '[]'::jsonb,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists invoices_user on public.invoices (user_id, status, due_on);
alter table public.invoices enable row level security;
drop policy if exists invoices_owner_select on public.invoices;
create policy invoices_owner_select on public.invoices for select using (user_id = auth.uid());
drop policy if exists invoices_owner_delete on public.invoices;
create policy invoices_owner_delete on public.invoices for delete using (user_id = auth.uid());
-- A campaign or brand can only be linked when it's yours.
drop policy if exists invoices_owner_insert on public.invoices;
create policy invoices_owner_insert on public.invoices for insert with check (
  user_id = auth.uid()
  and (campaign_id is null or exists (select 1 from public.campaigns c where c.id = campaign_id and c.user_id = auth.uid()))
  and (brand_id is null or exists (select 1 from public.brands b where b.id = brand_id and b.user_id = auth.uid()))
);
drop policy if exists invoices_owner_update on public.invoices;
create policy invoices_owner_update on public.invoices for update using (user_id = auth.uid()) with check (
  user_id = auth.uid()
  and (campaign_id is null or exists (select 1 from public.campaigns c where c.id = campaign_id and c.user_id = auth.uid()))
  and (brand_id is null or exists (select 1 from public.brands b where b.id = brand_id and b.user_id = auth.uid()))
);
grant select, insert, update, delete on public.invoices to authenticated;

-- 5 ---------------------------------------------------------------------------
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  owner uuid not null references auth.users(id) on delete cascade,
  invite_code text not null unique,
  created_at timestamptz not null default now()
);
create table if not exists public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
create index if not exists team_members_user on public.team_members (user_id);
alter table public.teams enable row level security;
alter table public.team_members enable row level security;

create or replace function public.is_team_member(p_team uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.team_members m where m.team_id = p_team and m.user_id = auth.uid());
$$;
revoke all on function public.is_team_member(uuid) from public, anon;
grant execute on function public.is_team_member(uuid) to authenticated;

drop policy if exists teams_member_select on public.teams;
create policy teams_member_select on public.teams for select using (public.is_team_member(id));
drop policy if exists team_members_member_select on public.team_members;
create policy team_members_member_select on public.team_members for select using (public.is_team_member(team_id));
-- Writes only through the functions below.
revoke insert, update, delete on public.teams, public.team_members from anon, authenticated;
grant select on public.teams, public.team_members to authenticated;

create or replace function public.create_team(p_name text, p_display text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t public.teams;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if (select count(*) from public.teams where owner = auth.uid()) >= 3 then raise exception 'You can own up to 3 teams'; end if;
  insert into public.teams (name, owner, invite_code)
  values (left(btrim(coalesce(p_name, '')), 60), auth.uid(), upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)))
  returning * into t;
  insert into public.team_members (team_id, user_id, display_name) values (t.id, auth.uid(), left(coalesce(nullif(btrim(p_display), ''), 'Me'), 40));
  return jsonb_build_object('id', t.id, 'invite_code', t.invite_code);
end; $$;

create or replace function public.join_team(p_code text, p_display text)
returns uuid language plpgsql security definer set search_path = public as $$
declare t public.teams;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into t from public.teams where invite_code = upper(btrim(coalesce(p_code, '')));
  if t.id is null then raise exception 'That invite code doesn''t exist'; end if;
  if (select count(*) from public.team_members where team_id = t.id) >= 25 then raise exception 'This team is full (25 people)'; end if;
  insert into public.team_members (team_id, user_id, display_name) values (t.id, auth.uid(), left(coalesce(nullif(btrim(p_display), ''), 'Teammate'), 40))
  on conflict (team_id, user_id) do update set display_name = excluded.display_name;
  return t.id;
end; $$;

create or replace function public.leave_team(p_team uuid)
returns void language plpgsql security definer set search_path = public as $$
declare next_owner uuid;
begin
  delete from public.team_members where team_id = p_team and user_id = auth.uid();
  if exists (select 1 from public.teams where id = p_team and owner = auth.uid()) then
    select user_id into next_owner from public.team_members where team_id = p_team order by joined_at limit 1;
    if next_owner is null then delete from public.teams where id = p_team;
    else update public.teams set owner = next_owner where id = p_team; end if;
  end if;
end; $$;

create or replace function public.remove_team_member(p_team uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.teams where id = p_team and owner = auth.uid()) then raise exception 'Only the team owner can remove people'; end if;
  if p_user = auth.uid() then raise exception 'Use leave instead'; end if;
  delete from public.team_members where team_id = p_team and user_id = p_user;
end; $$;

create or replace function public.rotate_team_invite(p_team uuid)
returns text language plpgsql security definer set search_path = public as $$
declare code text := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
begin
  update public.teams set invite_code = code where id = p_team and owner = auth.uid();
  if not found then raise exception 'Only the team owner can change the invite code'; end if;
  return code;
end; $$;

-- Daily outreach per teammate, counted on the server from their own records
-- (emails sent through Gmail once per message, plus follow-ups logged by hand
-- on a day with no Gmail email to that person) — nobody can type in a score.
create or replace function public.team_leaderboard(p_team uuid, p_tz text default 'UTC', p_days integer default 14)
returns table (user_id uuid, display_name text, goal integer, day date, sent integer)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  tz text := case when exists (select 1 from pg_timezone_names where name = p_tz) then p_tz else 'UTC' end;
  n_days integer := greatest(1, least(coalesce(p_days, 14), 31));
  since timestamptz := (date_trunc('day', now() at time zone tz) - make_interval(days => n_days - 1)) at time zone tz;
begin
  if not public.is_team_member(p_team) then raise exception 'not a member of this team'; end if;
  return query
  with members as (
    select m.user_id, m.display_name, case when p.preferences->>'daily_email_goal' ~ '^[0-9]{1,4}$' then (p.preferences->>'daily_email_goal')::integer else 50 end as goal
    from public.team_members m left join public.profiles p on p.id = m.user_id
    where m.team_id = p_team
  ),
  mail as (
    select e.user_id, (e.at at time zone tz)::date as d, e.gmail_id, e.entity_id
    from public.email_events e join members mm on mm.user_id = e.user_id
    where e.direction = 'out' and e.at >= since
  ),
  manual as (
    select f.user_id, (f.at at time zone tz)::date as d, coalesce(f.creator_id, f.brand_id) as entity_id
    from public.followups f join members mm on mm.user_id = f.user_id
    where f.at >= since and coalesce(f.kind, 'followup') <> 'reply'
  ),
  counts as (
    select x.user_id, x.d, count(distinct x.gmail_id)::integer as n from mail x group by 1, 2
    union all
    select y.user_id, y.d, count(*)::integer from manual y
    where not exists (select 1 from mail z where z.user_id = y.user_id and z.d = y.d and z.entity_id = y.entity_id)
    group by 1, 2
  )
  select mm.user_id, mm.display_name, mm.goal, c.d, coalesce(sum(c.n), 0)::integer
  from members mm left join counts c on c.user_id = mm.user_id
  group by mm.user_id, mm.display_name, mm.goal, c.d;
end; $$;

do $$ declare f text; begin
  foreach f in array array['create_team(text,text)', 'join_team(text,text)', 'leave_team(uuid)', 'remove_team_member(uuid,uuid)', 'rotate_team_invite(uuid)', 'team_leaderboard(uuid,text,integer)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
