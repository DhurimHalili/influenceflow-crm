-- Private access (additive, idempotent): the CRM is a closed circle.
--
-- Anyone can ask for access by signing up, but nothing in the workspace opens
-- until the owner approves them.
--   profiles.access  — 'pending' (asked, waiting) · 'approved' · 'revoked'
--   profiles.role    — 'owner' (runs the circle) · 'member'
-- Enforced in three places, so one mistake never opens the door:
--   1. a RESTRICTIVE row-level policy on every table: only approved members
--      (or the owner) read or write anything — a pending account sees nothing
--      but its own profile row;
--   2. access/role can only be changed by the owner's functions below (or the
--      service role) — a member can never approve themselves;
--   3. custom_access_token_hook: once enabled in Authentication → Hooks, a
--      pending or revoked account can't even get a session.

alter table public.profiles add column if not exists access text not null default 'pending';
alter table public.profiles add column if not exists role text not null default 'member';
alter table public.profiles add column if not exists access_changed_at timestamptz;
alter table public.profiles add column if not exists access_changed_by uuid;
alter table public.profiles drop constraint if exists profiles_access_check;
alter table public.profiles add constraint profiles_access_check check (access in ('pending', 'approved', 'revoked'));
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('owner', 'member'));

-- Every account that exists gets a profile row (older accounts may lack one).
insert into public.profiles (id) select u.id from auth.users u where not exists (select 1 from public.profiles p where p.id = u.id);

-- The people already working in the CRM keep their access; the owner is set once.
update public.profiles set role = 'owner', access = 'approved', access_changed_at = coalesce(access_changed_at, now())
  where id = '16674a1c-c22d-487b-80d7-b9c11f083f8d' and (role <> 'owner' or access <> 'approved');
update public.profiles set access = 'approved', access_changed_at = coalesce(access_changed_at, now())
  where id in ('d7f83076-2154-49ed-9ad5-f70386d8ff9c', '124c8054-f567-4e6e-b558-0390e27dec34') and access = 'pending' and access_changed_at is null;

create or replace function public.is_approved() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and access = 'approved');
$$;
create or replace function public.is_owner() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'owner' and access = 'approved');
$$;
revoke all on function public.is_approved() from public;
revoke all on function public.is_owner() from public;
grant execute on function public.is_approved() to authenticated;
grant execute on function public.is_owner() to authenticated;

-- Members can't change access or role — not on insert, not on update.
create or replace function public.guard_profile_access() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('app.access_change', true), '') = 'owner' or auth.role() = 'service_role' or auth.uid() is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.access := 'pending';
    new.role := 'member';
  elsif new.access is distinct from old.access or new.role is distinct from old.role then
    new.access := old.access;
    new.role := old.role;
  end if;
  return new;
end $$;
drop trigger if exists guard_profile_access on public.profiles;
create trigger guard_profile_access before insert or update on public.profiles for each row execute function public.guard_profile_access();

-- The gate: a restrictive policy on every table with row-level security.
do $$
declare t record;
begin
  for t in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity and c.relname <> 'profiles'
  loop
    execute format('drop policy if exists approved_members_only on public.%I', t.relname);
    execute format('create policy approved_members_only on public.%I as restrictive for all to authenticated using (public.is_approved()) with check (public.is_approved())', t.relname);
  end loop;
end $$;
drop policy if exists approved_members_only on public.profiles;
create policy approved_members_only on public.profiles as restrictive for all to authenticated
  using (public.is_approved() or id = auth.uid()) with check (public.is_approved() or id = auth.uid());

-- Private files (avatars, media kits) follow the same rule.
do $$
begin
  execute 'drop policy if exists approved_members_only on storage.objects';
  execute 'create policy approved_members_only on storage.objects as restrictive for all to authenticated using (public.is_approved()) with check (public.is_approved())';
exception when insufficient_privilege then
  raise notice 'storage.objects policy needs the storage owner; files stay private to their owner either way';
end $$;

-- ---- the owner's controls -----------------------------------------------------

create or replace function public.admin_members()
  returns table (id uuid, email text, display_name text, access text, role text, created_at timestamptz, last_sign_in_at timestamptz, email_confirmed boolean, access_changed_at timestamptz, creators bigint, brands bigint, mailboxes bigint)
  language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_owner() then raise exception 'Only the owner can see members' using errcode = '42501'; end if;
  return query
    select u.id, u.email::text, coalesce(p.display_name, ''), coalesce(p.access, 'pending'), coalesce(p.role, 'member'), u.created_at, u.last_sign_in_at,
      u.email_confirmed_at is not null, p.access_changed_at,
      (select count(*) from public.creators c where c.user_id = u.id),
      (select count(*) from public.brands b where b.user_id = u.id),
      (select count(*) from public.gmail_tokens g where g.user_id = u.id)
    from auth.users u left join public.profiles p on p.id = u.id
    order by (coalesce(p.access, 'pending') = 'pending') desc, u.created_at desc;
end $$;

create or replace function public.admin_set_access(p_user uuid, p_access text)
  returns text language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_owner() then raise exception 'Only the owner can change access' using errcode = '42501'; end if;
  if p_access not in ('approved', 'revoked', 'pending') then raise exception 'Unknown access level'; end if;
  if p_user = auth.uid() then raise exception 'You can''t change your own access'; end if;
  perform set_config('app.access_change', 'owner', true);
  insert into public.profiles (id) values (p_user) on conflict (id) do nothing;
  update public.profiles set access = p_access, access_changed_at = now(), access_changed_by = auth.uid() where id = p_user and role <> 'owner';
  -- Revoked: their refresh token stops working at once; approved: lifted again.
  update auth.users set banned_until = case when p_access = 'revoked' then 'infinity'::timestamptz else null end where id = p_user;
  if p_access = 'revoked' then delete from auth.sessions where user_id = p_user; end if;
  return p_access;
end $$;

revoke all on function public.admin_members() from public;
revoke all on function public.admin_set_access(uuid, text) from public;
grant execute on function public.admin_members() to authenticated;
grant execute on function public.admin_set_access(uuid, text) to authenticated;

-- ---- no session for a pending or revoked account (enable in Auth → Hooks) ----

create or replace function public.custom_access_token_hook(event jsonb) returns jsonb
  language plpgsql stable security definer set search_path = public as $$
declare v_access text;
begin
  select access into v_access from public.profiles where id = (event ->> 'user_id')::uuid;
  if coalesce(v_access, 'pending') <> 'approved' then
    return jsonb_build_object('error', jsonb_build_object('http_code', 403,
      'message', case when v_access = 'revoked' then 'Your access to this CRM was removed. Ask the owner if you think this is a mistake.'
                      else 'Your request to join is waiting for the owner''s approval. You''ll get an email when you''re in.' end));
  end if;
  return event;
end $$;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;
grant select on public.profiles to supabase_auth_admin;
drop policy if exists auth_hook_reads_access on public.profiles;
create policy auth_hook_reads_access on public.profiles as permissive for select to supabase_auth_admin using (true);
