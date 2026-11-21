-- Database tune-up (Nov 2026, from Supabase's own advisors + the logs). Nothing here changes what anyone sees;
-- it makes the same work cheaper and closes a few loose ends.

-- 1. Match coverage counts: the status call counted a member's videos 7 times (7 scans); some timed out
--    ("canceling statement due to statement timeout", 60 a day) and the coverage strip showed gaps. Now one
--    pass with all seven counts, over an index on (member, date).
create index if not exists creator_videos_user_published on public.creator_videos (user_id, published_at);
create or replace function public.match_video_counts(p_user uuid, p_since timestamptz)
returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'videos', count(*),
    'paid', count(*) filter (where paid),
    'transcripts', count(*) filter (where transcript_status = 'ok'),
    'none', count(*) filter (where transcript_status = 'none'),
    'waiting', count(*) filter (where transcript_status = '' and secs > 60),
    'listened', count(*) filter (where listened_at is not null),
    'queue', count(*) filter (where listen is not null and listened_at is null and transcript_status is distinct from 'ok'))
  from public.creator_videos
  where user_id = p_user and published_at >= p_since
$$;
revoke all on function public.match_video_counts(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.match_video_counts(uuid, timestamptz) to service_role;

-- 2. Brands get a real change stamp. Nothing set brands.updated_at after a brand was made, so "has any brand
--    changed?" (Match's relink, the known-brands copy) could not see a rename or a new website. Same trigger as
--    the Match tables: an identical save keeps the stamp.
alter table public.brands alter column updated_at set default now();
drop trigger if exists match_touch on public.brands;
create trigger match_touch before insert or update on public.brands for each row execute function public.match_touch();
create index if not exists brands_user_changed on public.brands (user_id, updated_at);

-- 3. Row-level security asked "who is this?" once PER ROW: auth.uid() inside a policy is re-run for every row
--    a query touches (Supabase advisor "auth_rls_initplan", 40 policies). Wrapped as (select auth.uid()) it is
--    asked once per query. Same rule, same result — only cheaper. Idempotent: an already wrapped call is skipped.
do $$
declare
  p record;
  q text;
  c text;
  stmt text;
begin
  for p in
    select schemaname, tablename, policyname, cmd, qual, with_check from pg_policies
    where schemaname = 'public'
      and (coalesce(qual, '') ~ '(?<!SELECT )auth\.uid\(\)' or coalesce(with_check, '') ~ '(?<!SELECT )auth\.uid\(\)')
  loop
    q := regexp_replace(p.qual, '(?<!SELECT )auth\.uid\(\)', '(select auth.uid())', 'g');
    c := regexp_replace(p.with_check, '(?<!SELECT )auth\.uid\(\)', '(select auth.uid())', 'g');
    stmt := format('alter policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
    if q is not null then stmt := stmt || format(' using (%s)', q); end if;
    if c is not null then stmt := stmt || format(' with check (%s)', c); end if;
    execute stmt;
  end loop;
end $$;

-- 4. activities had the same rule three times (one for everything + a select-only and an insert-only copy):
--    each query ran all of them. The "everything" one stays.
drop policy if exists activities_owner_select on public.activities;
drop policy if exists activities_owner_insert on public.activities;

-- 5. Two identical indexes on activities (every insert wrote both).
drop index if exists public.activity_user_idx;

-- 6. Deleting a creator or brand cascades into these tables; without an index on the link the database read
--    each whole table to find the rows.
create index if not exists creator_brands_creator on public.creator_brands (creator_id);
create index if not exists creator_files_creator_fk on public.creator_files (creator_id);
create index if not exists campaign_creators_creator on public.campaign_creators (creator_id);
create index if not exists campaigns_brand on public.campaigns (brand_id);
create index if not exists invoices_brand on public.invoices (brand_id);
create index if not exists invoices_campaign on public.invoices (campaign_id);
create index if not exists media_kits_creator on public.media_kits (creator_id);
create index if not exists brand_people_brand_fk on public.brand_people (brand_id);
create index if not exists brand_pitches_brand on public.brand_pitches (brand_id);
create index if not exists brand_pitches_creator on public.brand_pitches (creator_id);
create index if not exists seen_brands_added_brand on public.seen_brands (added_brand_id) where added_brand_id is not null;
create index if not exists teams_owner on public.teams (owner);
create index if not exists oauth_states_user on public.oauth_states (user_id);

-- 7. Functions signed-out visitors could call: each already answered nothing without a sign-in, but there is
--    no reason to expose them. is_owner() / is_approved() stay callable by signed-in members (their row
--    policies use them — a policy's functions must be executable by whoever runs the query); no policy that
--    applies to signed-out visitors uses them. guard_profile_access() is a trigger (triggers don't need
--    EXECUTE). get_media_kit() stays public on purpose: it serves /kit/:slug pages shared with brands.
revoke execute on function public.admin_members() from public, anon;
revoke execute on function public.admin_set_access(uuid, text) from public, anon;
revoke execute on function public.guard_profile_access() from public, anon, authenticated;
revoke execute on function public.is_owner() from anon;
revoke execute on function public.is_approved() from anon;
