-- 1) Settings are merged, never replaced: a tab or device holding an older copy of
--    your preferences only writes the keys IT changed (templates saved in one tab
--    can no longer be wiped by turning on Autopilot in another).
create or replace function public.merge_preferences(patch jsonb, drop_keys text[] default '{}')
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  result jsonb;
begin
  if patch is null or jsonb_typeof(patch) <> 'object' then
    raise exception 'patch must be a JSON object';
  end if;
  update public.profiles
     set preferences = (coalesce(preferences, '{}'::jsonb) - coalesce(drop_keys, '{}'::text[])) || patch
   where id = auth.uid()
   returning preferences into result;
  return result;
end;
$$;
revoke all on function public.merge_preferences(jsonb, text[]) from public, anon;
grant execute on function public.merge_preferences(jsonb, text[]) to authenticated;

-- 2) Bounces: an email that came back ("Message not delivered") is kept but never
--    counts as sent or as a follow-up; the record is flagged "Wrong email".
alter table public.email_events
  add column if not exists bounced_at timestamptz,
  add column if not exists bounce_reason text not null default '',
  add column if not exists bounce_to text not null default '';
create index if not exists email_events_bounced on public.email_events (user_id, entity_id) where bounced_at is not null;

-- 3) A bounce changes the events fingerprint, so open apps pick it up at once.
create or replace function public.workspace_stamps()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'profile',   (select coalesce(md5(string_agg(p::text, '')), '') from profiles p where p.id = auth.uid()),
    'creators',  (select count(*) || '.' || coalesce(sum(hashtext(c::text)::bigint), 0) from creators c where c.user_id = auth.uid()),
    'brands',    (select count(*) || '.' || coalesce(sum(hashtext(b::text)::bigint), 0) from brands b where b.user_id = auth.uid()),
    'contacts',  (select count(*) || '.' || coalesce(sum(hashtext(x::text)::bigint), 0) from brand_contacts x where x.user_id = auth.uid()),
    'campaigns', (select count(*) || '.' || coalesce(sum(hashtext(x::text)::bigint), 0) from campaigns x where x.user_id = auth.uid()),
    'joins',     (select count(*) || '.' || coalesce(sum(hashtext(x::text)::bigint), 0) from campaign_creators x where x.user_id = auth.uid()),
    'meetings',  (select count(*) || '.' || coalesce(sum(hashtext(x::text)::bigint), 0) from meetings x where x.user_id = auth.uid()),
    'activities',(select count(*) || '.' || coalesce(sum(hashtext(x::text)::bigint), 0) from activities x where x.user_id = auth.uid()),
    'followups', (select count(*) || '.' || coalesce(sum(hashtext(x::text)::bigint), 0) from followups x where x.user_id = auth.uid()),
    'events',    (select count(*) || '.' || coalesce(sum(hashtext(concat_ws('|', e.id, e.gmail_id, e.thread_id, e.direction, e.entity_type, e.entity_id,
                    e.counterpart, e.subject, e.snippet, e.at, e.mailbox, e.message_key, e.scheduled, e.reply_kind, e.in_reply_to, e.gone, e.gone_at, e.bounced_at))::bigint), 0)
                  from email_events e where e.user_id = auth.uid())
  );
$$;


-- 4) A sixth theme: Sauce.
alter table public.profiles drop constraint if exists profiles_theme_check;
alter table public.profiles add constraint profiles_theme_check check (theme = any (array['agency', 'light', 'dark', 'honey', 'ocean', 'sauce']));
