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
- Gmail sync: `supabase/functions/gmail-sync` — the email moves the pipeline forward; any status the user sets by hand wins until a newer email arrives.
