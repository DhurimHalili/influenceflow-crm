-- Applied to the hosted project by an earlier (interrupted) session; kept here so the
-- repo matches the database history. The photo columns are unused (pictures live in
-- the private avatars bucket, see 20261106000000).
alter table public.email_events add column if not exists scheduled boolean not null default false;
update public.email_events set scheduled = true where direction = 'out' and at > now() + interval '1 minute' and scheduled = false;
create index if not exists email_events_scheduled_idx on public.email_events (user_id, mailbox) where scheduled;
alter table public.creators add column if not exists photo text not null default '';
alter table public.brands add column if not exists photo text not null default '';
alter table public.profiles add column if not exists photo text not null default '';
do $$
declare t text;
begin
  foreach t in array array['creators', 'brands', 'profiles'] loop
    if not exists (select 1 from pg_constraint where conname = t || '_photo_check') then
      execute format(
        'alter table public.%I add constraint %I check (photo = '''' or (length(photo) <= 60000 and photo ~ ''^data:image/(webp|jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$''))',
        t, t || '_photo_check');
    end if;
  end loop;
end $$;
