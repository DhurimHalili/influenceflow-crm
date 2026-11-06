-- Deleting a member (Members page → admin-users "delete") must leave nothing
-- behind and must not fail half way:
--  * Supabase refuses to delete an auth user who still OWNS storage objects
--    (e.g. a profile picture they uploaded), so their files go first —
--    admin_user_files() lists every object in their folder or owned by them.
--  * A few old tables carry user_id without a foreign key, so the account's
--    ON DELETE CASCADE never reached them — admin_purge_user() clears every
--    public table that has a user_id column, after the account is gone.
-- Both are service-role only (the admin-users function checks the caller is
-- the owner first). Idempotent.

create or replace function public.admin_user_files(p_user uuid)
returns table (bucket_id text, name text)
language sql
stable
security definer
set search_path = public, storage
as $$
  select o.bucket_id, o.name
  from storage.objects o
  where p_user is not null
    and (o.owner_id = p_user::text or o.owner = p_user or o.name like p_user::text || '/%')
  order by o.bucket_id, o.name
  limit 20000;
$$;

create or replace function public.admin_purge_user(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  n bigint;
  total bigint := 0;
begin
  if p_user is null then raise exception 'bad user' using errcode = '22023'; end if;
  -- Never the owner, and never someone who still has an account.
  if exists (select 1 from public.profiles where id = p_user and role = 'owner') then
    raise exception 'owner' using errcode = '42501';
  end if;
  if exists (select 1 from auth.users where id = p_user) then
    raise exception 'account still exists' using errcode = '55000';
  end if;
  for r in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public' and t.table_type = 'BASE TABLE' and c.column_name = 'user_id' and c.data_type = 'uuid'
  loop
    execute format('delete from public.%I where user_id = $1', r.table_name) using p_user;
    get diagnostics n = row_count;
    total := total + n;
  end loop;
  delete from public.profiles where id = p_user;
  return jsonb_build_object('rows', total);
end;
$$;

revoke all on function public.admin_user_files(uuid) from public, anon, authenticated;
revoke all on function public.admin_purge_user(uuid) from public, anon, authenticated;
grant execute on function public.admin_user_files(uuid) to service_role;
grant execute on function public.admin_purge_user(uuid) to service_role;
