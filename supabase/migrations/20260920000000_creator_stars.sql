-- 20260920000000_creator_stars.sql
-- Star ratings (0-5) for influencers: agency-style priority at a glance.
-- 0 = unrated. Additive only.

alter table public.creators add column if not exists stars integer not null default 0;

-- Clamp any out-of-range values, then enforce 0-5 going forward.
update public.creators set stars = greatest(0, least(5, stars)) where stars < 0 or stars > 5;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'creators_stars_check') then
    alter table public.creators add constraint creators_stars_check check (stars between 0 and 5);
  end if;
end $$;

create index if not exists creators_stars_idx on public.creators(user_id, stars desc) where archived_at is null;
