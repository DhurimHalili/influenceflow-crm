-- Brand ⇄ creator matching and "who works with whom".
--
-- Server-owned (the brand-match function writes them; you only read):
--   creator_videos   every video read per creator: title, topics, YouTube's
--                    paid-promotion label, SponsorBlock segments, the brands
--                    found in it (with the line that shows it). The full
--                    description is kept only when something was found.
--   creator_content  a creator's content mix (share of their recent videos per
--                    topic) — what matching compares with a brand's catalog.
--   creator_brands   one row per creator × brand they work with: sponsored /
--                    seeded (brand sent the product) / affiliate, confidence,
--                    and the videos + quotes that show it. Your verdict
--                    (set_brand_link) is kept forever; a rescan never undoes it.
--   seen_brands      brands found in videos that aren't in your CRM yet: the
--                    domain from the creator's own link, whether the site
--                    really is that brand, what it sells. hide_seen_brand()
--                    hides one ("not a brand" / not interested).
--   brand_intel      what a brand's site says: what they sell, price range,
--                    affiliate / creator program, socials, markets.
-- Yours (the app writes them):
--   brand_pitches    which creators you pitched to which brand, so you never
--                    pitch the same creator twice.
--   brands.match_topics  "what they sell", set by you — wins over the site.
--   brands.discovered    set when a brand was added from a creator's video.
-- Server only (no client access): ai_budget (daily AI spend per route, pauses
-- on quota), link_cache (short link → real shop, so each is followed once).
-- Cron: brand-match every 3 minutes.
-- Additive and idempotent.

alter table public.brands add column if not exists match_topics text[] not null default '{}';
alter table public.brands add column if not exists discovered jsonb;

create table if not exists public.creator_videos (
  user_id uuid not null references auth.users(id) on delete cascade,
  creator_id uuid not null references public.creators(id) on delete cascade,
  video_id text not null check (video_id ~ '^[A-Za-z0-9_-]{11}$'),
  title text not null default '',
  published_at timestamptz,
  secs integer not null default 0,
  views bigint not null default 0,
  paid boolean not null default false,
  tags text[] not null default '{}',
  description text not null default '',
  topics jsonb not null default '[]'::jsonb,
  topics_by text not null default 'rules',
  mentions jsonb not null default '[]'::jsonb,
  segments jsonb not null default '[]'::jsonb,
  listen jsonb,
  listened_at timestamptz,
  sb_at timestamptz,
  reader_v smallint not null default 0,
  judged_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, creator_id, video_id)
);
create index if not exists creator_videos_recent_idx on public.creator_videos (creator_id, published_at desc);
create index if not exists creator_videos_listen_idx on public.creator_videos (user_id, published_at desc) where listen is not null and listened_at is null;

create table if not exists public.creator_content (
  creator_id uuid primary key references public.creators(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  content jsonb,
  status text not null default '' check (status in ('', 'ok', 'no_channel', 'quota', 'error', 'empty')),
  note text not null default '',
  scanned_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists creator_content_user_idx on public.creator_content (user_id, scanned_at);

create table if not exists public.creator_brands (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  creator_id uuid not null references public.creators(id) on delete cascade,
  brand_key text not null check (char_length(brand_key) between 2 and 120),
  brand_name text not null default '',
  domain text not null default '',
  brand_id uuid references public.brands(id) on delete set null,
  kind text not null check (kind in ('sponsored', 'seeded', 'affiliate')),
  confidence real not null default 0 check (confidence >= 0 and confidence <= 1),
  store boolean not null default false,
  videos integer not null default 0,
  first_at timestamptz,
  last_at timestamptz,
  evidence jsonb not null default '[]'::jsonb,
  by_ai boolean not null default false,
  manual boolean not null default false,
  verdict text not null default '' check (verdict in ('', 'yes', 'no')),
  verdict_kind text check (verdict_kind is null or verdict_kind in ('sponsored', 'seeded', 'affiliate')),
  verdict_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (user_id, creator_id, brand_key)
);
create index if not exists creator_brands_user_idx on public.creator_brands (user_id, brand_key);
create index if not exists creator_brands_brand_idx on public.creator_brands (brand_id) where brand_id is not null;

create table if not exists public.seen_brands (
  user_id uuid not null references auth.users(id) on delete cascade,
  brand_key text not null check (char_length(brand_key) between 2 and 120),
  name text not null default '',
  domain text not null default '',
  domain_check text not null default '' check (domain_check in ('', 'site', 'link', 'mismatch', 'guess', 'none', 'blocked')),
  site jsonb,
  checked_at timestamptz,
  hidden boolean not null default false,
  added_brand_id uuid references public.brands(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (user_id, brand_key)
);

create table if not exists public.brand_intel (
  brand_id uuid primary key references public.brands(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  intel jsonb,
  status text not null default '' check (status in ('', 'ok', 'blocked', 'unreachable', 'no_domain', 'error')),
  researched_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists brand_intel_user_idx on public.brand_intel (user_id, researched_at);

create table if not exists public.brand_pitches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  creator_id uuid not null references public.creators(id) on delete cascade,
  at timestamptz not null default now(),
  source text not null default 'manual' check (source in ('manual', 'pitch', 'email')),
  unique (user_id, brand_id, creator_id)
);

create table if not exists public.ai_budget (
  route text not null,
  day date not null default (now() at time zone 'utc')::date,
  units numeric not null default 0,
  calls integer not null default 0,
  paused_until timestamptz,
  note text not null default '',
  primary key (route, day)
);
create table if not exists public.link_cache (
  url_hash text primary key,
  final text not null default '',
  at timestamptz not null default now()
);

-- ---- row level security ----------------------------------------------------------
alter table public.creator_videos enable row level security;
alter table public.creator_content enable row level security;
alter table public.creator_brands enable row level security;
alter table public.seen_brands enable row level security;
alter table public.brand_intel enable row level security;
alter table public.brand_pitches enable row level security;
alter table public.ai_budget enable row level security;
alter table public.link_cache enable row level security;

do $$
declare t text;
begin
  foreach t in array array['creator_videos', 'creator_content', 'creator_brands', 'seen_brands', 'brand_intel'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select_own', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select auth.uid()) = user_id)', t || '_select_own', t);
    execute format('drop policy if exists approved_members_only on public.%I', t);
    execute format('create policy approved_members_only on public.%I as restrictive for all to authenticated using ((select public.is_approved())) with check ((select public.is_approved()))', t);
    execute format('revoke insert, update, delete, truncate on public.%I from anon, authenticated', t);
  end loop;
end $$;

drop policy if exists brand_pitches_select_own on public.brand_pitches;
create policy brand_pitches_select_own on public.brand_pitches for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists brand_pitches_insert_own on public.brand_pitches;
create policy brand_pitches_insert_own on public.brand_pitches for insert to authenticated with check (
  (select auth.uid()) = user_id
  and exists (select 1 from public.brands b where b.id = brand_id and b.user_id = (select auth.uid()))
  and exists (select 1 from public.creators c where c.id = creator_id and c.user_id = (select auth.uid()))
);
drop policy if exists brand_pitches_delete_own on public.brand_pitches;
create policy brand_pitches_delete_own on public.brand_pitches for delete to authenticated using ((select auth.uid()) = user_id);
drop policy if exists approved_members_only on public.brand_pitches;
create policy approved_members_only on public.brand_pitches as restrictive for all to authenticated using ((select public.is_approved())) with check ((select public.is_approved()));
revoke update, truncate on public.brand_pitches from anon, authenticated;
revoke all on public.brand_pitches from anon;

revoke all on public.ai_budget from anon, authenticated;
revoke all on public.link_cache from anon, authenticated;

-- ---- your verdicts ----------------------------------------------------------------

-- "Yes, they work with them" / "No, wrong" on a found link (optionally with the right kind).
create or replace function public.set_brand_link(p_id uuid, p_verdict text, p_kind text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare uid uuid := auth.uid(); n int;
begin
  if uid is null or not public.is_approved() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_verdict not in ('', 'yes', 'no') or (p_kind is not null and p_kind not in ('sponsored', 'seeded', 'affiliate')) then raise exception 'bad verdict' using errcode = '22023'; end if;
  update public.creator_brands
     set verdict = p_verdict, verdict_kind = p_kind, verdict_at = case when p_verdict = '' then null else now() end, updated_at = now()
   where id = p_id and user_id = uid;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'not found' using errcode = 'P0002'; end if;
  return p_verdict;
end $$;

-- A deal you know about that isn't in their videos (or before the CRM looked).
create or replace function public.add_brand_link(p_creator uuid, p_brand uuid, p_kind text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare uid uuid := auth.uid(); b record; k text; out_id uuid;
begin
  if uid is null or not public.is_approved() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_kind not in ('sponsored', 'seeded', 'affiliate') then raise exception 'bad kind' using errcode = '22023'; end if;
  if not exists (select 1 from public.creators where id = p_creator and user_id = uid) then raise exception 'not found' using errcode = 'P0002'; end if;
  select id, name, domain into b from public.brands where id = p_brand and user_id = uid;
  if b.id is null then raise exception 'not found' using errcode = 'P0002'; end if;
  -- Same key the scanner uses for that brand (its domain), so a later scan joins this row.
  k := lower(regexp_replace(regexp_replace(coalesce(b.domain, ''), '^[a-z]+://', '', 'i'), '[/?#].*$', ''));
  k := regexp_replace(k, '^www\d?\.', '');
  if k !~ '^[a-z0-9.-]+\.[a-z]{2,}$' then k := 'b:' || b.id::text; end if;
  insert into public.creator_brands (user_id, creator_id, brand_key, brand_name, domain, brand_id, kind, confidence, manual, verdict, verdict_kind, verdict_at)
  values (uid, p_creator, k, b.name, case when k like 'b:%' then '' else k end, b.id, p_kind, 1, true, 'yes', p_kind, now())
  on conflict (user_id, creator_id, brand_key) do update
    set brand_id = excluded.brand_id, verdict = 'yes', verdict_kind = excluded.verdict_kind, verdict_at = now(), updated_at = now()
  returning id into out_id;
  return out_id;
end $$;

-- Hide (or show again) a brand found in videos.
create or replace function public.hide_seen_brand(p_key text, p_hidden boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare uid uuid := auth.uid();
begin
  if uid is null or not public.is_approved() then raise exception 'not allowed' using errcode = '42501'; end if;
  update public.seen_brands set hidden = coalesce(p_hidden, true), updated_at = now() where user_id = uid and brand_key = p_key;
  return found;
end $$;

-- Server: add AI spend for today and return the day's total.
create or replace function public.ai_budget_use(p_route text, p_units numeric)
returns numeric
language sql
security definer
set search_path = public
as $$
  insert into public.ai_budget (route, day, units, calls) values (p_route, (now() at time zone 'utc')::date, greatest(p_units, 0), 1)
  on conflict (route, day) do update set units = public.ai_budget.units + greatest(excluded.units, 0), calls = public.ai_budget.calls + 1
  returning units;
$$;

revoke all on function public.set_brand_link(uuid, text, text) from public, anon;
revoke all on function public.add_brand_link(uuid, uuid, text) from public, anon;
revoke all on function public.hide_seen_brand(text, boolean) from public, anon;
revoke all on function public.ai_budget_use(text, numeric) from public, anon, authenticated;
grant execute on function public.set_brand_link(uuid, text, text) to authenticated;
grant execute on function public.add_brand_link(uuid, uuid, text) to authenticated;
grant execute on function public.hide_seen_brand(text, boolean) to authenticated;
grant execute on function public.ai_budget_use(text, numeric) to service_role;

-- ---- cron ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') and exists (select 1 from pg_extension where extname = 'pg_net') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'influenceflow-brand-match';
    perform cron.schedule('influenceflow-brand-match', '*/3 * * * *', $job$
      select net.http_post(
        url := replace((select coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'gmail_sync_url'), '')), '/gmail-sync', '/brand-match'),
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'gmail_cron_secret'), ''))),
        body := '{"action":"cron"}'::jsonb,
        timeout_milliseconds := 150000
      )
      where exists (select 1 from vault.decrypted_secrets where name = 'gmail_sync_url');
    $job$);
  end if;
end $$;
