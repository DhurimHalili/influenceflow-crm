-- Per-user YouTube API keys so each agency uses its own quota
-- Global YOUTUBE_API_KEYS secret remains as fallback for users who don't set their own
alter table public.creator_discovery_settings
  add column if not exists youtube_api_keys text[] not null default '{}';

comment on column public.creator_discovery_settings.youtube_api_keys is 'Per-user YouTube Data API v3 keys (up to 5). Stored per-user, RLS protected. If empty, Edge Function falls back to global YOUTUBE_API_KEYS secret.';
