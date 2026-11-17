-- One person, many channels: the other channels of an influencer (second channel, clips, shorts,
-- podcast, other networks), their numbers, what kind each is, and channels found on their own
-- YouTube that are waiting for your yes / no. Written by the app (youtube-sync "channels" only
-- returns public YouTube data). Covered by the creators table's existing RLS + restrictive policy.
alter table public.creators add column if not exists channels jsonb not null default '{}'::jsonb;
