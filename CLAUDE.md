# Working rules for this repository

These are standing instructions from the owner (Dhurim). Follow them in every session.

## Ship it — always
- When a change is done and checks pass, **commit, push, open the pull request and merge it into `main`** — don't wait to be asked. Merging to `main` deploys the live site (GitHub Pages workflow).
- Before starting new work, pull the latest `main`. If the branch's previous pull request was merged, restart the branch from `main`.
- Database migrations go in `supabase/migrations/` (additive, idempotent) **and** are applied to the hosted Supabase project as part of the same change.
- Edge functions in `supabase/functions/` are deployed as part of the same change.

## Quality bar
- Every change must work on **phone (≈390px), tablet (≈820px) and desktop** — check all three, not just desktop.
- No regressions: run `npm run build` (includes `tsc -b`) and `npx oxlint` in `web/` before pushing.
- **Security is non-negotiable**: RLS on every table, server-only secrets, escape anything rendered as HTML, validate input at the edge, never trust client-provided ids for authorization.
- Design: not generic — considered, polished, consistent with the existing theme variables (all five themes, including dark).
- The app must never lose a user's work: unsaved edits survive reloads, updates and offline periods.

## Product notes
- Follow-up engine: `web/src/lib/followupEngine.ts` (business-day cadence, configurable in Settings → Follow-up rules). Denied, Signed and Roster are never chased.
- Gmail sync: `supabase/functions/gmail-sync` — several mailboxes per user (`gmail_tokens` row per mailbox); the email moves the pipeline forward; any status the user sets by hand wins until a newer email arrives. Shared code lives in `supabase/functions/_shared/` (deploy it with each function that imports it as `../_shared/...`).
- Google tokens are encrypted (`_shared/googleTokens.ts`, key in Vault via `gmail_token_key()`); never store or log them in plain text.
- Inbound lead scanner: `_shared/leadScanner.ts` + its test file — run the tests after any change to the rules.
- Gmail scheduled sends: stored with `email_events.scheduled = true` — they count as your touch (follow-up done) but show as "Scheduled" and are not counted as sent. Every sync re-checks them (`in:scheduled` + per-message labels): sent → flag clears; cancelled/deleted → row removed and a status only that email moved goes back.
- Outreach counts (dashboard tiles, 14-day chart, coach) all come from one log: `web/src/lib/outreach.ts` (Gmail from every mailbox + hand-logged touches + stamped contact dates, each once). Don't count `data.followups` alone.
- The coach slide-in shows at most once per 12 h across tabs (localStorage), never on the dashboard (the card is there) or on a profile page.
- Profile pictures: private `avatars` bucket, `<user id>/...` paths in `avatar_path` (creators, brands, profiles); cropped to 256 px WebP in the browser (`lib/avatars.ts`), shown via batched signed URLs.
- Influencer profiles have no email draft (users write in Gmail; sync tracks it). Brands keep the composer.
- Inbound leads are strict: only creator-wants-management, brand-wants-creators, influencer-agency partnership. Warm-up (TrulyInbox "Phone_N0:"), pitches and personal mail never count.
- Negotiation rules: `_shared/negotiation.ts` (shared by app + server via `web/src/lib/negotiation.ts`). Integrated ⇄ dedicated cascade by the same %; nothing else is inferred. Run its tests after any change.
- AI reading (`_shared/ai.ts`) treats emails/files as untrusted data: structured output only, values re-validated, nothing applied unless confident and about the right creator. Never trust a creator's typed audience claims as verified. Providers: Claude (`ANTHROPIC_API_KEY`) or Gemini (`GEMINI_API_KEYS`, one model, key failover, quota → queue). The owner will not add an Anthropic key — Gemini or rules only.
- Prices without AI: `_shared/priceReader.ts` (+ tests). Strict: money marker required, one price + one format per sentence, no ranges/CPM/questions. Older mail (backfill) never overwrites a hand-typed price.
- Creator mail is claimed per email (`email_events.intel_at`) so two syncs never process it twice; old mail is backfilled roster-first.
- Invoices (`invoices` table) chase on the follow-up business-day schedule; contracts live in `campaigns.contract`. Teams: `teams`/`team_members` + `team_leaderboard()` — teammates only ever see names and daily counts.
- Deal models: `web/src/lib/dealTerms.ts`; `agreed_payment` is derived from `brand_terms` for non-flat deals.
