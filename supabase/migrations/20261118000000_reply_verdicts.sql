-- Replies that say no.
--
-- 1. email_events.reply_kind gains two values:
--      'maybe_no' — reads like a no but isn't certain ("probably not", "maybe
--                   later"). Flagged in the app; the status doesn't move.
--      'ok'       — you confirmed a flagged reply was not a no. Read as a
--                   normal reply everywhere.
-- 2. email_events.kind_v — which version of the reply rules read the row.
--    gmail-sync reads older rows again with the current rules (so a rule fix
--    reaches mail that already arrived). 32767 = you decided; never re-read.
-- 3. confirm_reply(event, verdict) — your verdict on a flagged reply: 'no'
--    (they said no) or 'ok' (they didn't). Only your own incoming replies.
-- Additive and idempotent.

alter table public.email_events drop constraint if exists email_events_reply_kind_check;
alter table public.email_events add constraint email_events_reply_kind_check
  check (reply_kind in ('', 'no', 'maybe_no', 'ok', 'team', 'auto', 'managed_no'));

alter table public.email_events add column if not exists kind_v smallint not null default 0;

create index if not exists email_events_reread_idx
  on public.email_events (user_id, kind_v)
  where direction = 'in';

create or replace function public.confirm_reply(p_event uuid, p_verdict text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  done int := 0;
begin
  if uid is null or not public.is_approved() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_verdict not in ('no', 'ok') or p_event is null then
    raise exception 'bad verdict' using errcode = '22023';
  end if;
  update public.email_events
     set reply_kind = p_verdict, kind_v = 32767
   where id = p_event and user_id = uid and direction = 'in'
     and reply_kind in ('', 'no', 'maybe_no', 'ok');
  get diagnostics done = row_count;
  if done = 0 then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  return p_verdict;
end;
$$;

revoke all on function public.confirm_reply(uuid, text) from public, anon;
grant execute on function public.confirm_reply(uuid, text) to authenticated;
