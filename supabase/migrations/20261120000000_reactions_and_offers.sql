-- Reactions, and the path of a negotiation.
--
-- 1. email_events.reply_kind gains 'reaction': an emoji reaction sent as an
--    email ("👌 Sam reacted via Gmail"). They saw your email, but there are no
--    words — it is never a reply (not counted, nothing to answer, the
--    follow-up clock keeps running). gmail-sync re-reads older rows with the
--    new rule (READER_VERSION 4).
-- 2. Your own offers ("we can offer $3,500…") are now kept in a creator's
--    price history, so the card shows the whole path: asked → you offered →
--    they came down → agreed. Emails you sent in the last 90 days to creators
--    you are negotiating with (or already won) are read once more to fill
--    that path in. Nothing else about those emails changes: prices already on
--    the card are never overwritten by older mail, and a status only moves
--    forward. Creators whose history already has an offer are left alone, so
--    running this again does nothing new.
-- Additive and idempotent.

alter table public.email_events drop constraint if exists email_events_reply_kind_check;
alter table public.email_events add constraint email_events_reply_kind_check
  check (reply_kind in ('', 'no', 'maybe_no', 'ok', 'team', 'auto', 'managed_no', 'reaction'));

update public.email_events e
   set intel_at = null
  from public.creators c
 where e.entity_type = 'creator'
   and e.entity_id = c.id
   and e.user_id = c.user_id
   and e.direction = 'out'
   and e.scheduled = false
   and e.intel_at is not null
   and e.at > now() - interval '90 days'
   and c.archived_at is null
   and c.pipeline_status in ('negotiating', 'roster', 'signed')
   and coalesce(c.rate_history, '[]'::jsonb) <> '[]'::jsonb
   and coalesce(c.rate_history, '[]'::jsonb)::text not like '%"offer"%';
