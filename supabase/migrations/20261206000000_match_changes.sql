-- Match loads only what changed (owner's rule, Nov 2026 — data transfer on the free plan).
-- Every open CRM tab used to download ALL deal links (with their evidence), found brands, brand research and
-- content mixes again each time the Match server finished a run (every ~4–10 min): ~376k rows in 3 hours,
-- more than every server job together. Now:
--   • each Match table carries an exact change stamp (`updated_at`, set by a trigger on every real change —
--     an identical rewrite or a server-only column keeps the old stamp, so nobody re-downloads it);
--   • deletes leave a small note in `match_gone` (also when a creator / brand delete cascades), kept 14 days;
--   • `match_changes(since)` returns, in ONE call, only the rows changed since then + what was deleted.
-- The app keeps a copy on the device and asks only for changes (web/src/lib/matchSync.ts).

-- 1. Change stamps -----------------------------------------------------------------------------------------
alter table public.brand_pitches add column if not exists updated_at timestamptz not null default now();
update public.creator_brands set updated_at = now() where updated_at is null;
update public.brand_intel set updated_at = now() where updated_at is null;
update public.creator_content set updated_at = now() where updated_at is null;
update public.seen_brands set updated_at = now() where updated_at is null;
alter table public.creator_brands alter column updated_at set default now();
alter table public.brand_intel alter column updated_at set default now();
alter table public.creator_content alter column updated_at set default now();
alter table public.seen_brands alter column updated_at set default now();

-- TG_ARGV = columns the app never reads (server bookkeeping): a change to only those keeps the stamp.
create or replace function public.match_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE'
     and (to_jsonb(new) - 'updated_at' - coalesce(tg_argv, '{}'::text[])) = (to_jsonb(old) - 'updated_at' - coalesce(tg_argv, '{}'::text[])) then
    new.updated_at := old.updated_at;
    return new;
  end if;
  new.updated_at := clock_timestamp();
  return new;
end $$;
revoke all on function public.match_touch() from public, anon, authenticated;

drop trigger if exists match_touch on public.creator_brands;
create trigger match_touch before insert or update on public.creator_brands for each row execute function public.match_touch('sig');
drop trigger if exists match_touch on public.brand_intel;
create trigger match_touch before insert or update on public.brand_intel for each row execute function public.match_touch();
drop trigger if exists match_touch on public.creator_content;
create trigger match_touch before insert or update on public.creator_content for each row execute function public.match_touch('backfill');
drop trigger if exists match_touch on public.seen_brands;
create trigger match_touch before insert or update on public.seen_brands for each row execute function public.match_touch();
drop trigger if exists match_touch on public.brand_pitches;
create trigger match_touch before insert or update on public.brand_pitches for each row execute function public.match_touch();

create index if not exists creator_brands_user_changed on public.creator_brands (user_id, updated_at);
create index if not exists brand_intel_user_changed on public.brand_intel (user_id, updated_at);
create index if not exists creator_content_user_changed on public.creator_content (user_id, updated_at);
create index if not exists seen_brands_user_changed on public.seen_brands (user_id, updated_at);
create index if not exists brand_pitches_user_changed on public.brand_pitches (user_id, updated_at);

-- 2. Deletes leave a note ----------------------------------------------------------------------------------
-- No foreign key on purpose: a member's deletion cascades into these tables, and a note pointing at the
-- account being deleted would stop the deletion. admin_purge_user() clears it (it walks every user_id table)
-- and the nightly prune drops notes older than 14 days.
create table if not exists public.match_gone (
  id bigserial primary key,
  user_id uuid not null,
  tbl text not null,
  key text not null,
  at timestamptz not null default clock_timestamp()
);
create index if not exists match_gone_user_at on public.match_gone (user_id, at);
alter table public.match_gone enable row level security;
alter table public.match_gone force row level security;
drop policy if exists match_gone_select_own on public.match_gone;
create policy match_gone_select_own on public.match_gone for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists approved_members_only on public.match_gone;
create policy approved_members_only on public.match_gone as restrictive for all to authenticated using ((select public.is_approved())) with check ((select public.is_approved()));
revoke all on public.match_gone from anon, authenticated;
grant select on public.match_gone to authenticated;
revoke all on sequence public.match_gone_id_seq from anon, authenticated;

-- TG_ARGV[0] = the column the app keys that table by.
create or replace function public.match_gone_log() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.match_gone (user_id, tbl, key) values (old.user_id, tg_table_name, to_jsonb(old) ->> tg_argv[0]);
  return old;
end $$;
revoke all on function public.match_gone_log() from public, anon, authenticated;

drop trigger if exists match_gone on public.creator_brands;
create trigger match_gone after delete on public.creator_brands for each row execute function public.match_gone_log('id');
drop trigger if exists match_gone on public.brand_intel;
create trigger match_gone after delete on public.brand_intel for each row execute function public.match_gone_log('brand_id');
drop trigger if exists match_gone on public.creator_content;
create trigger match_gone after delete on public.creator_content for each row execute function public.match_gone_log('creator_id');
drop trigger if exists match_gone on public.seen_brands;
create trigger match_gone after delete on public.seen_brands for each row execute function public.match_gone_log('brand_key');
drop trigger if exists match_gone on public.brand_pitches;
create trigger match_gone after delete on public.brand_pitches for each row execute function public.match_gone_log('id');

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'influenceflow-match-gone-prune') then
    perform cron.schedule('influenceflow-match-gone-prune', '23 3 * * *', $c$delete from public.match_gone where at < now() - interval '14 days'$c$);
  end if;
end $$;

-- 3. One call: what changed since ---------------------------------------------------------------------------
-- Same columns the app loads (MatchContext). `at` = the database's own clock, so a device's wrong clock never
-- skips a change; the app asks again from `at` minus an overlap. `full` = too old to answer from the notes
-- (kept 14 days): load everything once.
create or replace function public.match_changes(p_since timestamptz)
returns jsonb
language sql stable security invoker set search_path = '' as $$
  with me as (select auth.uid() as id)
  select case when p_since is null or p_since < now() - interval '13 days' then jsonb_build_object('at', statement_timestamp(), 'full', true)
  else jsonb_build_object(
    'at', statement_timestamp(),
    'full', false,
    'links', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select id, creator_id, brand_key, brand_name, domain, brand_id, kind, confidence, store, videos, first_at, last_at, evidence, by_ai, manual, verdict, verdict_kind, verdict_at, updated_at, video_ids
      from public.creator_brands where user_id = (select id from me) and updated_at >= p_since) x), '[]'::jsonb),
    'intel', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select brand_id, intel, status, researched_at, updated_at
      from public.brand_intel where user_id = (select id from me) and updated_at >= p_since) x), '[]'::jsonb),
    'content', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select creator_id, content, status, note, scanned_at, updated_at
      from public.creator_content where user_id = (select id from me) and updated_at >= p_since) x), '[]'::jsonb),
    'seen', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select brand_key, name, domain, domain_check, site, checked_at, hidden, added_brand_id, updated_at
      from public.seen_brands where user_id = (select id from me) and updated_at >= p_since) x), '[]'::jsonb),
    'pitches', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select id, brand_id, creator_id, at, source, updated_at
      from public.brand_pitches where user_id = (select id from me) and updated_at >= p_since) x), '[]'::jsonb),
    'gone', coalesce((select jsonb_agg(jsonb_build_object('tbl', tbl, 'key', key, 'at', at)) from public.match_gone
      where user_id = (select id from me) and at >= p_since), '[]'::jsonb)
  ) end
$$;
revoke all on function public.match_changes(timestamptz) from public, anon;
grant execute on function public.match_changes(timestamptz) to authenticated;
