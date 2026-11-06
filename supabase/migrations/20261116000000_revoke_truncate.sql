-- Defense in depth: TRUNCATE ignores row-level security, and nothing in the app
-- (PostgREST, edge functions) ever needs it from the API roles. Supabase grants
-- it to anon/authenticated by default; take it back on every public table and
-- for tables created later. Idempotent: revoking a missing privilege is a no-op.
revoke truncate on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke truncate on tables from anon, authenticated;

-- The activity log is append-only for signed-in users (UPDATE/DELETE revoked in
-- the core bootstrap); anon must not hold more than they do.
revoke update, delete on public.activities from anon;
