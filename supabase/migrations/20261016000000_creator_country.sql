-- Where a creator is based. Free text so unlisted places still save; the app
-- suggests standard country names as you type.
alter table public.creators add column if not exists country text not null default '';
