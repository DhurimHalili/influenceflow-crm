-- A fingerprint of each part of the signed-in member's workspace, so the app re-downloads
-- only what changed (it used to pull every table every 45 s while a tab was open — most of the
-- project's egress). Runs as the caller: RLS (incl. approved_members_only) still applies.
-- email_events leaves out the server's bookkeeping columns (intel_at, kind_v, reply_ai_at,
-- gone_checked_at) so housekeeping never triggers a download the app wouldn't show.
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
                    e.counterpart, e.subject, e.snippet, e.at, e.mailbox, e.message_key, e.scheduled, e.reply_kind, e.in_reply_to, e.gone, e.gone_at))::bigint), 0)
                  from email_events e where e.user_id = auth.uid())
  );
$$;

revoke all on function public.workspace_stamps() from public, anon;
grant execute on function public.workspace_stamps() to authenticated;
