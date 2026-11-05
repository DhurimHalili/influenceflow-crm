-- Conversations that read right (additive, idempotent).
--
-- 1. email_events.reply_kind — what a message from their side really was:
--      ''           a normal reply
--      'no'         they said no themselves
--      'team'       someone else on their side answered (manager / agency), matched by thread
--      'auto'       an automatic answer (out of office) — not a reply
--      'managed_no' their management or an autoresponder declined; reach them elsewhere
--    email_events.in_reply_to — the Message-ID this email answers, so a scheduled
--    follow-up that bumps your own old email after they replied can be spotted.
-- 2. creators/brands.contact_channel — where you talk to them (email, WhatsApp…);
--    email_followups = false stops email follow-up reminders for that record
--    (their replies are still tracked).
-- 3. inbound_leads.my_replies / my_intent / replied_at — your answers to people
--    who emailed you first: they count as emails sent, and a clear yes or no
--    decides the lead for you.

alter table public.email_events add column if not exists reply_kind text not null default '';
alter table public.email_events add column if not exists in_reply_to text not null default '';
alter table public.email_events drop constraint if exists email_events_reply_kind_check;
alter table public.email_events add constraint email_events_reply_kind_check check (reply_kind in ('', 'no', 'team', 'auto', 'managed_no'));
create index if not exists email_events_user_thread on public.email_events (user_id, thread_id) where thread_id <> '';

alter table public.creators add column if not exists contact_channel text not null default 'email';
alter table public.creators add column if not exists email_followups boolean not null default true;
alter table public.brands add column if not exists contact_channel text not null default 'email';
alter table public.brands add column if not exists email_followups boolean not null default true;
alter table public.creators drop constraint if exists creators_contact_channel_check;
alter table public.creators add constraint creators_contact_channel_check check (contact_channel in ('email', 'whatsapp', 'dm', 'tiktok', 'call', 'linkedin', 'other'));
alter table public.brands drop constraint if exists brands_contact_channel_check;
alter table public.brands add constraint brands_contact_channel_check check (contact_channel in ('email', 'whatsapp', 'dm', 'tiktok', 'call', 'linkedin', 'other'));

alter table public.inbound_leads add column if not exists my_replies jsonb not null default '[]'::jsonb;
alter table public.inbound_leads add column if not exists my_intent text not null default '';
alter table public.inbound_leads add column if not exists replied_at timestamptz;
alter table public.inbound_leads drop constraint if exists inbound_leads_my_intent_check;
alter table public.inbound_leads add constraint inbound_leads_my_intent_check check (my_intent in ('', 'yes', 'no'));
-- The app still only decides status/kind/link; the scanner writes the rest.
grant update (status, kind, entity_type, entity_id, updated_at) on public.inbound_leads to authenticated;
