# Working rules for this repository

These are standing instructions from the owner (Dhurim). Follow them in every session.

## Release gate — do not publish without the word "push"
- **Nothing leaves this machine until the owner says "push"**: no `git commit`, no `git push`, no pull request, no merge, no GitHub Pages deploy, no GitHub release or repo setting change.
- This overrides every "ship it" instruction below and any standing habit of finishing a task by publishing it. Work is finished when it is verified locally, not when it is merged.
- When the owner does say **"push"**, run the whole release in one pass without asking again: pull the latest `main`, commit, push the branch, open the pull request, merge it, deploy the changed functions/migrations, then verify Pages and the live site.
- Never deploy Pages or update GitHub on your own initiative outside that release pass. Local builds, tests, lint and hosted-function smoke tests are allowed while working.

## Ship it — always
- When a change is done and checks pass, **commit, push, open the pull request and merge it into `main`** — don't wait to be asked. Merging to `main` deploys the live site (GitHub Pages workflow). **Unless the release gate above is in effect (it is, for this working session).**
- Before starting new work, pull the latest `main`. If the branch's previous pull request was merged, restart the branch from `main`.
- Database migrations go in `supabase/migrations/` (additive, idempotent) **and** are applied to the hosted Supabase project as part of the same change.
- Edge functions in `supabase/functions/` are deployed as part of the same change.

## Quality bar
- Every change must work on **phone (≈390px), tablet (≈820px) and desktop** — check all three, not just desktop.
- No regressions: run `npm run build` (includes `tsc -b`) and `npx oxlint` in `web/` before pushing.
- **Security is non-negotiable**: RLS on every table, server-only secrets, escape anything rendered as HTML, validate input at the edge, never trust client-provided ids for authorization.
- Design: see **Craft standard** below — never generic, never the minimum.
- The app must never lose a user's work: unsaved edits survive reloads, updates and offline periods.

## Craft standard — a sensitive CRM, not a demo

This product holds real relationships, negotiated money, contracts and personal data. "Works" is the floor, not the bar. Every change ships at the level below, or it doesn't ship.

**Design like the screen matters**
- Compose every screen deliberately: hierarchy, spacing, type scale, alignment, one obvious primary action. If it reads as a default component library, it isn't done.
- Reuse the existing patterns and tokens across all five themes (including dark). A new pattern needs a reason; novelty is not a feature. No one-off colors, no unstyled native controls.
- Design the full state matrix, not the happy path: first run, empty, loading, slow, offline, error, permission-denied, 1 record, 10,000 records, 200-character names, missing avatars, long amounts, phone width.
- Motion is quiet and purposeful (≈150 ms, ease-out) and respects `prefers-reduced-motion`.
- Copy is interface, not filler: specific, sentence case, says what happened and what to do next. No "Oops", "Something went wrong", "Lorem ipsum" or placeholder labels in shipped UI.

**Build the whole job**
- Done means the real task works end to end — undo, retry, cancel, edit, bulk actions, keyboard flow, and what happens after a reload.
- If you can't describe the flow in three sentences, it isn't designed yet.
- No dead ends: every button works or is removed. No fake toggles, inert tabs or "coming soon" in production.
- One excellent flow beats three half-made ones. Simplicity is the constraint: progressive disclosure, smart defaults, the common path first, advanced controls behind "More".
- Anticipate the next click: show the number they need, prefill what can be inferred, remember the last choice, never ask twice for data the app already has.
- Empty states point to the next action; errors explain the fix; success is visible without a modal.

**Creativity without clutter**
- Be inventive where it removes work: a sharper summary, a better shortcut, a calmer inbox, one screen that replaces a wizard. Never add a tab, badge, setting or panel unless it earns its place.
- Every new control must be worth its pixels. If removing it loses nothing, remove it.
- The product should feel deep when the user needs it and quiet when they don't. When in doubt, choose the simpler surface and the more considered interaction.

**Sensitive-data precision**
- Money, dates, statuses and contract terms are exact: no floating-point currency drift, no timezone surprises, no silent truncation.
- Never silently drop, overwrite or reorder a record. Optimistic UI rolls back visibly on failure; destructive actions get a real confirmation and undo where the data allows it.
- Personal data stays behind RLS and least privilege. Never log emails, tokens, prices or contract text. Never widen access to make a screen easier.
- A blocked sync is shown, not hidden. The user always knows if their last change is saved, syncing or failed.

**The finish check — all must be true before pushing**
- Phone ≈390 px, tablet ≈820 px and desktop checked by hand: no horizontal scroll, no clipped controls, no hover-only actions.
- All five themes checked; contrast ≥ WCAG AA; visible focus; full keyboard path; labels on icon-only buttons.
- Reload mid-edit, go offline, return, double-submit: nothing lost, nothing duplicated.
- `npm run build` and `npx oxlint` pass; relevant `node --experimental-strip-types` tests pass; console clean.
- Click every control and read the copy aloud. If a screen feels generic or a flow feels like the minimum, redesign it before shipping.

This standard overrides convenience and speed. Do the harder, more considered version.

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
- Reply reading: `_shared/replyReader.ts` (+ tests, shared via `web/src/lib/replyReader.ts`). Incoming mail gets `email_events.reply_kind`: auto-replies never count as replies; a manager/agency or autoresponder declining (`managed_no`) is never a Denied — the record shows "Managed · DM them". Replies from another address are matched by Gmail thread (never your own company domain).
- A scheduled follow-up that bumps your old email after they replied (`in_reply_to`, or the "On … wrote:" quote) is "crossed": flagged "Cancel scheduled email" (Gmail scopes can't cancel it for you) and never opens a follow-up round.
- Denied → one reach-back reminder after `followup_rules.reach_back_days` (default 30). An email sent 14+ days after the denial reopens them as Contacted.
- `contact_channel` / `email_followups` per record: off email with reminders off, emails still show and count but only the other channel's follow-ups set the clock.
- Inbound leads: your answers are stored on the lead (`my_replies`) and count as emails sent; a clear yes auto-adds them (app, once via `claimLead`), a clear no dismisses them; 24 h without an answer is flagged on the dashboard.
- Dashboard: "Emails sent" = every email (incl. follow-ups and lead answers), "Follow-ups" = only chasers on any channel; deltas compare with the whole previous period. App tests: `cd web && node --experimental-strip-types --import ./scripts/ts-hooks.mjs src/lib/followupEngine.test.ts`.
