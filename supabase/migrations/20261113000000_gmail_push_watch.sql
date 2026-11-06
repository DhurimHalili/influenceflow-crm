-- Instant Gmail (additive, idempotent): when each mailbox's Gmail watch
-- (users.watch → Pub/Sub) lapses; renewed by the cron a day before.
alter table public.gmail_tokens add column if not exists watch_expires_at timestamptz;
