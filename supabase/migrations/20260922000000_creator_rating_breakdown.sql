-- 20260922000000_creator_rating_breakdown.sql
-- Break the single star rating into three agency dimensions:
-- posting consistency, audience demographics, niche alignment (each 0-5,
-- 0 = unrated). Overall stars = average of rated dimensions, computed by
-- the app on every write. Existing overall ratings are distributed evenly
-- so no one's current rating changes. Additive only.

alter table public.creators add column if not exists stars_consistency integer not null default 0;
alter table public.creators add column if not exists stars_demographics integer not null default 0;
alter table public.creators add column if not exists stars_niche integer not null default 0;

-- Preserve current overalls: spread them across the three dimensions.
update public.creators
set stars_consistency = stars,
    stars_demographics = stars,
    stars_niche = stars
where stars > 0
  and stars_consistency = 0
  and stars_demographics = 0
  and stars_niche = 0;

update public.creators
set stars_consistency = greatest(0, least(5, stars_consistency)),
    stars_demographics = greatest(0, least(5, stars_demographics)),
    stars_niche = greatest(0, least(5, stars_niche));

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'creators_stars_breakdown_check') then
    alter table public.creators add constraint creators_stars_breakdown_check
      check (stars_consistency between 0 and 5 and stars_demographics between 0 and 5 and stars_niche between 0 and 5);
  end if;
end $$;
