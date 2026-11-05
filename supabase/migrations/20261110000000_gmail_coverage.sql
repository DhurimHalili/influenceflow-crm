-- Tracking check (additive, idempotent).
--
-- gmail_tokens.coverage — per mailbox, written by gmail-sync on every run:
-- how many emails in Gmail's Sent folder over the last 2 days the CRM tracks,
-- and which ones went to people it doesn't know yet (recipient addresses,
-- send time, subject — the owner's own mail, shown only to them through the
-- status action). gmail_tokens stays service-role only.
alter table public.gmail_tokens add column if not exists coverage jsonb not null default '{}'::jsonb;
