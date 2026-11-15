-- Sign-up gate: Supabase Auth's "Before User Created" hook. Runs inside the
-- auth server for EVERY new account — the website's form and anyone calling the
-- auth API directly (bots skip websites) — and refuses:
--   * throwaway inboxes (disposable email services),
--   * more than 3 new accounts from one connection in 24 hours,
--   * more than 15 new accounts in an hour across everyone (a private circle
--     never sees that; a bot run does).
-- Only a hash of the connection's address is kept, for 2 days. Sign-in is not
-- affected. Enable: Authentication → Hooks → Before User Created →
-- public.before_user_created (done through the management API for this project).

create table if not exists public.signup_attempts (
  id bigserial primary key,
  ip_hash text not null,
  at timestamptz not null default now()
);
create index if not exists signup_attempts_ip_at on public.signup_attempts (ip_hash, at desc);
create index if not exists signup_attempts_at on public.signup_attempts (at desc);
alter table public.signup_attempts enable row level security;
-- No permissive policy: nobody reads or writes it through the API.
drop policy if exists approved_members_only on public.signup_attempts;
create policy approved_members_only on public.signup_attempts as restrictive for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.access = 'approved'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.access = 'approved'));
revoke all on public.signup_attempts from anon, authenticated;
grant select, insert, delete on public.signup_attempts to supabase_auth_admin;
grant usage, select on sequence public.signup_attempts_id_seq to supabase_auth_admin;

create or replace function public.before_user_created(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  email text := lower(coalesce(event->'user'->>'email', ''));
  domain text := split_part(lower(coalesce(event->'user'->>'email', '')), '@', 2);
  ip text := coalesce(event->'metadata'->>'ip_address', '');
  v_hash text := encode(extensions.digest('signup:' || coalesce(event->'metadata'->>'ip_address', ''), 'sha256'), 'hex');
  same_ip int;
  last_hour int;
begin
  -- Throwaway inboxes: nobody joins a private CRM with one.
  if domain = any (array[
    'mailinator.com','guerrillamail.com','guerrillamail.net','guerrillamail.org','sharklasers.com','grr.la','10minutemail.com','10minutemail.net',
    'tempmail.com','temp-mail.org','temp-mail.io','tempmail.net','tempmailo.com','tempail.com','throwawaymail.com','yopmail.com','yopmail.net',
    'trashmail.com','trashmail.de','getnada.com','nada.email','dispostable.com','maildrop.cc','mailnesia.com','mintemail.com','mohmal.com',
    'emailondeck.com','burnermail.io','spamgourmet.com','fakeinbox.com','mailcatch.com','moakt.com','tempinbox.com','discard.email',
    'spambox.us','33mail.com','getairmail.com','inboxkitten.com','mail.tm','tmpmail.org','emailfake.com','fakemail.net','luxusmail.org',
    'byom.de','harakirimail.com','mytemp.email','tempr.email','dropmail.me','minuteinbox.com','emltmp.com','correotemporal.org'
  ]) or domain like '%.mailinator.com' or domain = '' then
    return jsonb_build_object('error', jsonb_build_object('http_code', 400, 'message', 'Please use your real work or personal email — throwaway inboxes can''t join.'));
  end if;

  delete from public.signup_attempts where at < now() - interval '2 days';

  if ip <> '' then
    select count(*) into same_ip from public.signup_attempts where signup_attempts.ip_hash = v_hash and at > now() - interval '24 hours';
    if same_ip >= 3 then
      return jsonb_build_object('error', jsonb_build_object('http_code', 429, 'message', 'Too many sign-ups from this connection today. Try again tomorrow, or use Need help? on the sign-in page.'));
    end if;
  end if;
  select count(*) into last_hour from public.signup_attempts where at > now() - interval '1 hour';
  if last_hour >= 15 then
    return jsonb_build_object('error', jsonb_build_object('http_code', 429, 'message', 'Sign-ups are paused for a moment. Try again in an hour.'));
  end if;

  insert into public.signup_attempts (ip_hash) values (case when ip = '' then 'unknown' else v_hash end);
  return '{}'::jsonb;
end;
$$;

revoke all on function public.before_user_created(jsonb) from public, anon, authenticated;
grant execute on function public.before_user_created(jsonb) to supabase_auth_admin;
