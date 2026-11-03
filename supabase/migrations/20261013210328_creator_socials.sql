-- Every social profile an influencer has (Instagram, TikTok, YouTube, X, ...),
-- each { platform, url, handle, followers }. channel_link / platform keep
-- mirroring the main one, so older clients and exports keep working.
-- Additive only: no existing data is touched.
alter table public.creators
  add column if not exists socials jsonb not null default '[]'::jsonb;
