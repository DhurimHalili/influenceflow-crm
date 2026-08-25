-- Draft email for creators: subject + body, yellow dot in list when draft exists
alter table public.creators add column if not exists draft_subject text;
alter table public.creators add column if not exists draft_body text;
-- Keep RLS: creators already has RLS, new columns inherit
