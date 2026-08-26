# Supabase migrations

SQL and notes for InfluenceFlow CRM (Auth, RLS, tables, Edge Function helpers).

**Who needs this? Only if you self-host.** Regular users at `https://dhurimhalili.github.io/influenceflow-crm/#/app` do NOT need a Supabase project — just sign up and use the app. The hosted DB, auth, and Discovery cron are already provisioned.

If you fork and want your **own** copy (local dev or your own deploy), then:

1. Create a free project at https://supabase.com
2. In **SQL Editor**, run the files in this folder in order (at least `20260823000000_creator_discovery.sql` for Discovery)
3. Set `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` in `web/.env` (see `web/.env.example`)
4. Deploy Edge Functions (`supabase/functions/*`) and set secrets — see root [README](../../README.md) → *Self-host (for developers)*

No action needed for hosted users.
