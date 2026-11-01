-- Signup trigger functions don't belong on the public API. Triggers keep
-- firing (EXECUTE is only checked when a trigger is created).
revoke execute on function public.handle_new_user_profile() from public, anon, authenticated;
revoke execute on function public.seed_discovery_settings() from public, anon, authenticated;
