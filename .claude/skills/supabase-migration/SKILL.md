---
name: supabase-migration
description: Move the InfluenceFlow CRM to a new Supabase project/organization (the free plan's egress runs out, so the owner moves the whole backend every week or so). Use whenever the owner says migrate / move / new project / new organization, or egress is about to hit the limit. A living runbook: after every move, update the "Lessons log" and fix any step that was wrong.
---

# Moving the CRM to a new Supabase project

This is a living runbook. **Read it all before starting, follow it in order, and update it at the end**:
anything that went wrong, anything slow, any better way → change the step itself AND add a line to the
Lessons log. A future move must never repeat a mistake that is written here.

Scripts are in `scripts/` (run them from a scratch folder, never commit outputs). They read the owner's
Supabase personal access token from `$PAT_FILE` (default `~/.supabase-pat`, `chmod 600`). Never print,
log or commit a token, key, password, row content or email. Only names, counts and checksums go to the chat.

## 0. Before anything

- The release gate (CLAUDE.md) still holds: nothing is pushed/merged/deployed for the app until the owner
  says "push". The migration itself is the owner's request, but the cutover moment (step 6) needs the
  owner's go — users get signed out once.
- Ask the owner for: the new organization + project (or create it: same region **eu-central-1**), and a
  personal access token that can see BOTH organizations (save it with `request_credential` for host
  `api.supabase.io`, or into `$PAT_FILE`). The session proxy's own token for api.supabase.com is another
  account → 401: always use `api.supabase.io` (`scripts/api.sh`, `scripts/q.py`).
- Check the egress numbers first (Usage page or the edge logs): if one bug is burning egress, fix it
  before moving, or the new project burns out just as fast (Nov 2026: ~800 MB/day was three cron reads,
  see Lessons log).
- Note OLD and NEW refs. Everything below takes them as arguments.

## 1. Schema = migrations, then prove it is identical

1. `scripts/migrate.py NEW` applies every `supabase/migrations/*.sql` in order (recorded in history).
2. `scripts/q.py OLD scripts/fingerprint.sql > old.fp`, same for NEW, then `diff old.fp new.fp`.
   It covers columns, constraints, indexes, policies (incl. storage), RLS + force, functions (+ grants,
   security definer, search_path), triggers (public, auth, storage), views, grants, enums, sequences,
   extensions, cron jobs. **Every line must match** — hand-made changes on the old project that never went
   into a migration show up here (Nov 2026: constraint names, a policy, `force row level security`, a
   trigger on auth.users, function grants). Fix them on NEW with SQL **and** add a migration file so the
   repo matches reality.
3. Enable the auth hooks on NEW (custom access token hook, before-user-created) through the management API
   (`PATCH /v1/projects/NEW/config/auth`), and the `pg_cron` / `pg_net` / `vault` extensions if the
   migrations didn't.

## 2. Secrets (never printed)

- **Function secrets**: names from `api.sh GET /v1/projects/OLD/secrets`. Values can't be read through
  the API, so deploy `scripts/env_handoff.ts.tmpl` (filled-in nonce + names) to OLD as `env-handoff`,
  POST to it with the service key + nonce from a script, pipe the JSON straight into
  `POST /v1/projects/NEW/secrets`, then **delete the function** (`functions delete env-handoff`) and the
  nonce file. Change what must change: `GMAIL_OAUTH_REDIRECT_URI` → the NEW callback.
- **Vault secrets** (`gmail_token_key`, `member_key_secret`, cron secret, `gmail_sync_url` …): copy with SQL
  from `vault.decrypted_secrets` on OLD into `vault.create_secret` on NEW inside one script, values never
  echoed. **`gmail_token_key` must be the same** or every Gmail login stops decrypting. `gmail_sync_url`
  (and any URL secret) must point at NEW.
- **Auth settings**: `GET /config/auth` from OLD → PATCH NEW (SMTP password comes through the same
  hand-off). The free plan refuses Pro-only fields (pool size, request duration, password/MFA verification
  hooks) — drop them, they were defaults. Compare GET of both afterwards: only those may differ.
- PostgREST settings (`/config/database/postgrest`) and storage buckets (public flag, limits, mime types):
  copy and compare.

## 3. Functions

Deploy every folder in `supabase/functions/` that is live on OLD (`api.sh GET /v1/projects/OLD/functions`
lists them, with `verify_jwt`) to NEW with the same verify_jwt (ours: `--no-verify-jwt`):
`SUPABASE_ACCESS_TOKEN=<from PAT_FILE> npx supabase functions deploy <fn> --project-ref NEW --use-api --no-verify-jwt`.
Old/unused folders (find-brands, find-creators) are NOT deployed. Smoke test: `OPTIONS` → 200 each.

## 4. Rehearsal copy (old keeps running)

`scripts/copydata.py OLD NEW` copies auth users + identities (same ids + password hashes; sessions are
NOT moved) and every public table, then verifies row count + checksum per table. Must end `ALL MATCH`.
`scripts/files.py OLD NEW` copies Storage objects and owners; must end `MATCH`. NEW's cron jobs stay
**off** (`select cron.alter_job(jobid, active := false) from cron.job` on NEW) until cutover.

## 5. App switch, prepared but not shipped

- `.github/workflows/deploy-pages.yml`: NEW URL + NEW **publishable** key (`sb_publishable_…`, from
  `GET /api-keys`). Never the legacy anon JWT or a secret key (GitGuardian flagged the JWT once).
- Every other place the old ref appears: `grep -rn OLDREF` (README, CLAUDE.md "Supabase home", docs).

## 6. Cutover (owner says go)

1. `q.py OLD scripts/freeze_old.sql` — old timed jobs off, the app's roles can't write: nothing lands in
   OLD after the snapshot.
2. Final `copydata.py OLD NEW` + `files.py OLD NEW` → `ALL MATCH` / `MATCH`.
3. NEW cron jobs on: `select cron.alter_job(jobid, active := true) from cron.job` — compare names +
   schedules with OLD's list.
4. Ship the app switch (the owner's "push" → PR, merge, Pages), verify the live site loads data from NEW.
5. Owner's manual steps (tell them exactly, with links): Google Cloud → OAuth client → add redirect URI
   `https://NEW.supabase.co/functions/v1/gmail-oauth-callback`; Pub/Sub push subscription endpoint AND
   audience → `https://NEW.supabase.co/functions/v1/gmail-sync`. Everyone signs in once (sessions don't
   move).
6. Watch for an hour: edge logs (4xx/5xx per function), cron runs, a Gmail sync, Autopilot tick, the
   weekly report `status`. Keep OLD frozen (not deleted) as the fallback for at least two weeks.
   Rollback = `q.py OLD scripts/unfreeze_old.sql`, NEW jobs off, switch the workflow back.

## 7. After the move

- Update CLAUDE.md "Supabase home" (refs, org, what changed), and the deploy command if needed.
- If a member lost data in the move (see Lessons log), `scripts/restore.py OLD NEW USER_ID --dry` first,
  then without `--dry`: only rows missing on NEW are inserted, their own deal verdicts re-applied.
- **Update this skill**: fix any step that was wrong, add Lessons log lines, commit with the next push.

## Rules that came from real incidents

- **Deletes are never inferred.** A device whose saved copy was empty once read every record as
  "deleted" and wiped a member's workspace; DB cascades took follow-ups, files, Match data, Autopilot
  history (Nov 19, Granit). Fixed in the app (`lib/sync.ts` deletion log, `staleProfile`, restrictive
  delete policy: only archived rows) — before a move, check these guards are still in place, because a
  move signs everyone out and every device then starts from the cloud.
- **A missing profile is an error, never "defaults".** A blank profile once wrote default settings over
  real ones (templates, time zone, goal). Restore from OLD with `restore.py` if it happens.
- **Never `signOut()` with the default scope in a test** — it is GLOBAL and logged the owner out of every
  device. Use `signOut({ scope: "local" })` or delete only your own `auth.sessions` row.
- A session that ended on the server still reads tables (signature only) but every function says 401;
  the app signs out locally on that (`watchedFetch`). After cutover the old project's sessions are dead
  — that's expected.
- Never paste the publishable key as a JWT, never commit secrets; the hand-off function must be deleted
  the same minute.
- The data copy runs with `session_replication_role = replica` (no triggers re-stamping `updated_at`, no
  FK order problems); a partial `--only` copy uses `delete`, never `truncate … cascade`.

## Lessons log (add a dated line after every move)

- 2026-11-19 · oyyuugucxqtenuqbbbur ("Dhurim" org) → sqofkahywzjpkgtzvoaz ("Professional", eu-central-1).
  Schema drift found by fingerprint (constraint names, activities policy + force RLS, auth.users trigger,
  handle_new_user grants) → fixed on NEW. 20 function secrets + 4 vault secrets via hand-off. Pro-only
  auth fields refused on free plan (harmless). Proxy token 401 on the new org → owner PAT via
  api.supabase.io. After the move: global sign-out from a test (fixed: local scope), Granit's workspace
  wiped by an empty-copy device (fixed: explicit deletes + restore.py).
- 2026-11-20 · PAT expired mid-session → deploys 401 → new token through `request_credential`
  (host api.supabase.io). Keep the token in the proxy, not in a file, when possible.
- 2026-11-20 · Egress ~800 MB/day on the new project (5 GB lasts ~6 days). Causes, all background reads:
  brand-match read every creator's full YouTube data each 3-min run to find unread ones (~700 MB raw/day),
  every brand's research each run to find a few old ones (~330 MB raw), relink read all open deal links +
  brands + found brands each run (~300 MB raw), each helper transcript batch re-read whole video lists.
  Fixed (ids first, server-side filters, relink only when brands/links changed, rebuild only when a
  transcript changed something). Lesson: before a move, rank edge_logs GET requests by count ×
  (row size × rows) — `request.search` per path — and kill whole-table reads on timers.
- 2026-11-21 · Supabase warned "depleting Disk IO budget" (free compute). Causes were WRITES: every deal-link rebuild rewrote every link (~117k row updates), unchanged videos re-saved whole, pg_cron run log never pruned. Fixed (link fingerprints, stamp-only updates, nightly log prune, timers 5/10 min). Lesson: check `pg_stat_all_tables` n_tup_upd/ins per table, not only reads, after a move.
- 2026-11-21 · Index names are global per schema: `create index if not exists X` silently SKIPS when another
  table already has an index called X (two FK indexes never got made). Name indexes `<table>_<cols>_<purpose>`
  and re-run the advisors after every migration. Also: the app now keeps Match data in IndexedDB and pulls only
  changes (`match_changes(since)`). Devices keep their copy across a move ONLY because the copy carries every
  row's `updated_at` and `match_gone` notes: copydata.py must copy both unchanged (it does: it runs with
  `session_replication_role = replica`, so the `match_touch` trigger doesn't re-stamp rows). Never skip
  match_gone, or deletes made just before cutover linger on devices until their copy is 12 days old. New
  triggers/functions in this round (`match_touch`, `match_gone_log`, `match_changes`, `match_video_counts`,
  cron `influenceflow-match-gone-prune`) are in migrations and covered by the fingerprint diff.
