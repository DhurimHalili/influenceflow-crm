-- Mail that disappeared from Gmail.
--
-- A tracked email can vanish from the mailbox after the CRM saw it: someone
-- (or a tool with access to the mailbox — a warm-up or sending tool, a
-- Workspace retention rule) moves it to Trash or deletes it for good. The CRM
-- never does this to sent mail: the only email it ever trashes is a
-- *scheduled* one you cancel, and that row is removed at the same moment.
--
--   gone            '' still in Gmail · 'trash' in Gmail's Trash · 'deleted' gone for good
--   gone_at         when the CRM first saw it gone
--   gone_checked_at when the read phase last looked (a slow sweep re-checks old mail)
--
-- A gone email still counts as sent / received — the other person got it.
-- Additive and idempotent.

alter table public.email_events add column if not exists gone text not null default '';
alter table public.email_events add column if not exists gone_at timestamptz;
alter table public.email_events add column if not exists gone_checked_at timestamptz;

alter table public.email_events drop constraint if exists email_events_gone_check;
alter table public.email_events add constraint email_events_gone_check check (gone in ('', 'trash', 'deleted'));

create index if not exists email_events_gone_sweep_idx
  on public.email_events (user_id, mailbox, gone_checked_at nulls first)
  where scheduled = false;
