-- People finder (Nov 2026): Apollo joins the lookup keys, and the people found at a brand are kept per
-- member in brand_people (one row per person) — read only when a brand's profile asks, written only by the
-- brand-match function. Additive and idempotent.

-- 1. Apollo keys in member_keys.
do $$ begin
  alter table public.member_keys drop constraint if exists member_keys_service_check;
  alter table public.member_keys add constraint member_keys_service_check
    check (service in ('youtube', 'gemini', 'groq', 'cloudflare', 'openrouter', 'apollo', 'hunter', 'clay'));
end $$;

-- 2. The people found at a brand.
create table if not exists public.brand_people (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  -- Where the person came from, and their id there (Apollo person id; Hunter/Clay: email or LinkedIn).
  source text not null check (source in ('apollo', 'hunter', 'clay')),
  ext_id text not null check (char_length(ext_id) between 1 and 200),
  first_name text not null default '' check (char_length(first_name) <= 80),
  last_name text not null default '' check (char_length(last_name) <= 80),
  -- What a free search shows of the last name before it's unlocked ("K." / "Ko***i").
  last_hint text not null default '' check (char_length(last_hint) <= 40),
  title text not null default '' check (char_length(title) <= 160),
  -- 0 entry … 6 owner / founder / C-suite (lib/peopleFinder.ts seniorityOf).
  seniority smallint not null default 0 check (seniority between 0 and 6),
  has_email boolean not null default false,
  email text not null default '' check (char_length(email) <= 160),
  email_status text not null default '' check (char_length(email_status) <= 30),
  linkedin_url text not null default '' check (char_length(linkedin_url) <= 300),
  -- The brand contact made from this person (the app adds it; null until then).
  contact_id uuid,
  found_at timestamptz not null default now(),
  unlocked_at timestamptz,
  unlock_via text not null default '' check (unlock_via in ('', 'apollo', 'hunter', 'search')),
  unique (user_id, brand_id, source, ext_id)
);
create index if not exists brand_people_brand on public.brand_people (user_id, brand_id);

alter table public.brand_people enable row level security;
drop policy if exists "brand_people select own" on public.brand_people;
create policy "brand_people select own" on public.brand_people for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists approved_members_only on public.brand_people;
create policy approved_members_only on public.brand_people as restrictive for all to authenticated using ((select public.is_approved())) with check ((select public.is_approved()));
revoke insert, update, delete on public.brand_people from anon, authenticated;
grant select on public.brand_people to authenticated;
grant all on public.brand_people to service_role;
