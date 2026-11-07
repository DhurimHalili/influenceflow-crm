-- When the AI last gave its second opinion on a reply (said no? who wrote
-- it — the creator, their team, an autoresponder?). Null = not read yet.
-- Read once per reply by gmail-sync; nothing of the email is stored here.
alter table public.email_events add column if not exists reply_ai_at timestamptz;
