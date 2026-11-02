-- Scheduled Gmail sends + profile pictures. Additive and idempotent.

-- 1 ---------------------------------------------------------------------------
-- A message waiting in Gmail's "Scheduled" folder is stored with scheduled =
-- true: it counts as your touch (the follow-up is done) but is shown and
-- counted as scheduled, not sent. Each sync re-checks these rows: sent → the
-- flag clears; cancelled (back to Drafts) or deleted → the row is removed.
alter table public.email_events add column if not exists scheduled boolean not null default false;
create index if not exists email_events_scheduled on public.email_events (user_id, mailbox) where scheduled;

-- 2 ---------------------------------------------------------------------------
-- Profile pictures: a path in the private "avatars" bucket, under the owner's
-- own folder ("<user id>/..."). The app reads them through short-lived
-- signed URLs; nobody else can list or read them.
alter table public.creators add column if not exists avatar_path text not null default '';
alter table public.brands add column if not exists avatar_path text not null default '';
alter table public.profiles add column if not exists avatar_path text not null default '';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 524288, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists avatars_owner_select on storage.objects;
create policy avatars_owner_select on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists avatars_owner_insert on storage.objects;
create policy avatars_owner_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists avatars_owner_update on storage.objects;
create policy avatars_owner_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists avatars_owner_delete on storage.objects;
create policy avatars_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- A path is only ever one of the owner's own files (never someone else's folder).
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'creators_avatar_path_own') then
    alter table public.creators add constraint creators_avatar_path_own check (avatar_path = '' or (avatar_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,120}$' and split_part(avatar_path, '/', 1) = user_id::text)) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'brands_avatar_path_own') then
    alter table public.brands add constraint brands_avatar_path_own check (avatar_path = '' or (avatar_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,120}$' and split_part(avatar_path, '/', 1) = user_id::text)) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_avatar_path_own') then
    alter table public.profiles add constraint profiles_avatar_path_own check (avatar_path = '' or (avatar_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,120}$' and split_part(avatar_path, '/', 1) = id::text)) not valid;
  end if;
end $$;

-- 3 ---------------------------------------------------------------------------
-- Team leaderboard: a scheduled email counts on the day it actually goes out.
-- Daily outreach per teammate, counted on the server from their own records
-- (emails sent through Gmail once per message, plus follow-ups logged by hand
-- on a day with no Gmail email to that person) — nobody can type in a score.
create or replace function public.team_leaderboard(p_team uuid, p_tz text default 'UTC', p_days integer default 14)
returns table (user_id uuid, display_name text, goal integer, day date, sent integer)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  tz text := case when exists (select 1 from pg_timezone_names where name = p_tz) then p_tz else 'UTC' end;
  n_days integer := greatest(1, least(coalesce(p_days, 14), 31));
  since timestamptz := (date_trunc('day', now() at time zone tz) - make_interval(days => n_days - 1)) at time zone tz;
begin
  if not public.is_team_member(p_team) then raise exception 'not a member of this team'; end if;
  return query
  with members as (
    select m.user_id, m.display_name, case when p.preferences->>'daily_email_goal' ~ '^[0-9]{1,4}$' then (p.preferences->>'daily_email_goal')::integer else 50 end as goal
    from public.team_members m left join public.profiles p on p.id = m.user_id
    where m.team_id = p_team
  ),
  mail as (
    select e.user_id, (e.at at time zone tz)::date as d, e.gmail_id, e.entity_id
    from public.email_events e join members mm on mm.user_id = e.user_id
    where e.direction = 'out' and not e.scheduled and e.at >= since
  ),
  manual as (
    select f.user_id, (f.at at time zone tz)::date as d, coalesce(f.creator_id, f.brand_id) as entity_id
    from public.followups f join members mm on mm.user_id = f.user_id
    where f.at >= since and coalesce(f.kind, 'followup') <> 'reply'
  ),
  counts as (
    select x.user_id, x.d, count(distinct x.gmail_id)::integer as n from mail x group by 1, 2
    union all
    select y.user_id, y.d, count(*)::integer from manual y
    where not exists (select 1 from mail z where z.user_id = y.user_id and z.d = y.d and z.entity_id = y.entity_id)
    group by 1, 2
  )
  select mm.user_id, mm.display_name, mm.goal, c.d, coalesce(sum(c.n), 0)::integer
  from members mm left join counts c on c.user_id = mm.user_id
  group by mm.user_id, mm.display_name, mm.goal, c.d;
end; $$;

revoke all on function public.team_leaderboard(uuid, text, integer) from public, anon;
grant execute on function public.team_leaderboard(uuid, text, integer) to authenticated;
