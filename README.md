<p align="center">
  <img src="influenceflow-logo.png" alt="InfluenceFlow CRM" width="120" />
</p>

<h1 align="center">InfluenceFlow CRM</h1>

<p align="center">
  <strong>Free, open-source CRM for influencer agencies & freelancers.</strong><br />
  Stop juggling Notion + Sheets + Gmail. Manage creators, brands, campaigns & calendar — in one private workspace.<br />
  Now with <strong>automated YouTube discovery</strong> that finds creators while you sleep.
</p>

<p align="center">
  <a href="https://dhurimhalili.github.io/influenceflow-crm/#/signup"><strong>→ Create free account (30s)</strong></a> ·
  <a href="https://dhurimhalili.github.io/influenceflow-crm/#/app">Live app</a> ·
  <a href="https://dhurimhalili.github.io/influenceflow-crm/home.html">About</a> ·
  <a href="#-do-i-need-my-own-supabase">Supabase FAQ</a>
</p>

<p align="center">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-blue.svg" />
  <img alt="Stack" src="https://img.shields.io/badge/stack-React%20%7C%20Vite%20%7C%20Supabase-7c5cff.svg" />
  <img alt="Status" src="https://img.shields.io/badge/status-live%20%2B%20active%20dev-3d9cf0.svg" />
</p>

---

## Use it in 30 seconds — no setup

**You do NOT need your own Supabase. Just sign up.**

1. Go to **[Sign up free](https://dhurimhalili.github.io/influenceflow-crm/#/signup)** → create account
2. Add creators manually, or **Bulk import** (`Name, channelUrl` paste or CSV file)
3. Track them: `New → Contacted → Negotiating → Roster` (table or drag-and-drop board)
4. Optional: open **Discovery** → paste your YouTube API keys → get 25–50 new creators every night automatically

That's it. Your data is private to your account — other users can't see it. Export anytime (CSV / JSON).

> **Do I need my own Supabase?** No — for regular use. The live app already runs on a hosted Supabase (by the maintainer). You only need your own Supabase if you **fork the repo and want to self-host** your own copy. See [Self-host (for developers)](#-self-host-for-developers) below.

---

## How it works (4 steps)

| Step | What you do | What InfluenceFlow does |
|------|-------------|------------------------|
| **1. Discover** | Paste keywords (or use the 520 defaults) + your YouTube API keys in **Discovery** | Nightly at your chosen time (e.g. 08:00 Berlin) it searches YouTube, filters by your rules, and adds fits to **Creators** |
| **2. Organize** | Review newcomers, add notes, save a draft email (yellow dot) | Keeps pipeline clean — dedupes by channel, merges duplicates, soft-deletes to trash |
| **3. Close** | Create a **Campaign** linking Brand + Creators | Calculates agency cut, warns if creator+brand already linked, moves creators to **Roster** |
| **4. Stay on top** | Add **Calendar** meetings linked to creator/brand/campaign | Browser reminders so follow-ups don't slip |

**Outreach (Gmail):** Sending directly from the CRM is **coming soon** — UI is ready and code is preserved, you can already draft per-creator and manage templates in Settings. Flip `SOON_MODE` in `OutreachPage.tsx` to re-enable when Gmail OAuth secrets are set.

---

## What's inside today

| Area | How you'd explain it to a teammate |
|------|-------------------------------------|
| **Creators CRM** | Table + Kanban board + mobile cards. Filter, bulk-change status, bulk-delete, merge duplicates by name, draft email per creator (yellow dot), personalization snippet for `{{personal_note}}` |
| **Brands & contacts** | Each brand has its own people (first/last name, title, email, LinkedIn). Same pipeline statuses |
| **Discovery (auto)** | YouTube search on autopilot: 520 keyword pool, 40 negatives, 17 bio-boost terms. Searches **10 keywords per night** (52-day rotation) so you don't burn quota. 7-day cooldown per channel, batched API calls, 3 longform-video check, bio ranking boost |
| **Bulk import** | Paste `Rory Alexander, https://youtube.com/channel/UC...` or `Name, email, niche` — or **Attach CSV** (`influencer_creators_ready.csv` 7-col). Auto-dedupes by name + link |
| **Campaigns** | Name, brand, platform, deliverables, payment + agency % → auto payout, status (negotiating/active/completed/cancelled), start/due dates, assign creators, conflict warning |
| **Calendar** | Meetings with start/end, linked to creator/brand/campaign, `remind_at` → browser notification |
| **Data & privacy** | Per-user Supabase Auth + RLS (no one sees your data), global search, CSV export, JSON backup export/import (v2 + legacy), Deleted list, activity log |
| **Polish** | Dark (default) / light, fully responsive, PWA, Obsidian Flow premium UI |

### Discovery — in plain English

You add 1–5 **YouTube Data API v3** keys (from Google Cloud Console) in `Discovery → Your YouTube API keys` — one key per line, blurred by default. Each agency uses **its own quota**; the maintainer's 5 global keys are private and not shared.

The system:
- Rotates keywords (10/night, no duplicates in one run)
- Skips channels seen in the last 7 days
- Filters: `50k subs / 50k avg views / 1% engagement / 21 days since upload` (you can loosen to 30K/0.7% or 20K/0.5% with one click)
- Ranks higher if channel **About** contains your niche bio terms
- Logs every run (found / skipped / shortlisted / inserted / keys used / errors) — visible in **Recent runs**

No YouTube keys? Discovery will tell you it can't run until you add them (except owner fallback). Adding keys and saving → next auto-run or **Run now** uses them immediately.

**Don't have 500 keywords?** Discovery has a **“How to get keywords with AI”** card: copy 3 prompts (500 search / 40 negative / 15–20 bio), paste into ChatGPT/Claude with your niche, paste lists back, Save — 30 seconds.

---

## ❓ Do I need my own Supabase?

**Short answer: No.**

| You want to... | Do you need Supabase? |
|----------------|-----------------------|
| **Just use the CRM** at `dhurimhalili.github.io/influenceflow-crm` | **No.** Sign up and go. Database, auth, RLS, Discovery cron — already hosted. Only Discovery needs *your YouTube keys*, not a new Supabase. |
| **Run it locally** or **deploy your own copy** (fork) | **Yes.** Clone the repo, create a free Supabase project, apply the `supabase/migrations/*.sql` files, set `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`, deploy Edge Functions and set secrets. Details below. |

If you saw old instructions saying “apply migration or table etc.” — that was the **self-host path** written as if it were for everyone. It's not. For normal users it's already done.

---

## Self-host (for developers)

Only follow this if you're forking / running your own instance. Regular users skip it.

<details>
<summary><strong>Local dev — 3 commands</strong></summary>

```powershell
cd web
copy .env.example .env
# edit .env → set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from your Supabase project
npm install
npm run dev
# open http://localhost:5173
```

</details>

<details>
<summary><strong>Your Supabase project — one-time setup</strong></summary>

1. Create a project at [supabase.com](https://supabase.com) (free tier is fine — note free projects pause after ~1 week of inactivity; the daily Discovery cron counts as activity once live).
2. In **SQL Editor**, run the files in `supabase/migrations/` in order (or at least `20260823000000_creator_discovery.sql` for Discovery). They create `creator_discovery_settings`, `searched_channels`, `discovery_runs`, RLS policies, and the auto-seed trigger for new users.
3. In **Auth → Configuration** set site URL / redirect for `/#/login` if needed.

</details>

<details>
<summary><strong>Edge Functions & secrets (only if you want Gmail + Discovery cron)</strong></summary>

Functions in `supabase/functions/`:

- `discover-creators` — the nightly YouTube discovery (required for Discovery auto-run)
- `gmail-oauth-start`, `gmail-oauth-callback`, `send-emails` — Gmail OAuth + sending

```powershell
# 1. Secrets
supabase secrets set YOUTUBE_API_KEYS=key1,key2,key3,key4,key5 DISCOVERY_SECRET=some-long-random-string GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... GMAIL_OAUTH_REDIRECT_URI=https://<your-project>.supabase.co/functions/v1/gmail-oauth-callback

# 2. Deploy
supabase functions deploy discover-creators
supabase functions deploy gmail-oauth-start
supabase functions deploy gmail-oauth-callback
supabase functions deploy send-emails

# 3. Enable extensions in Database → Extensions
#    pg_cron + pg_net

# 4. Add the 5-minute tick (paste the cron.schedule block from the bottom of supabase/migrations/20260823000000_creator_discovery.sql)
#    Replace <PROJECT_URL>, <ANON_KEY>, <DISCOVERY_SECRET>
#    The function only runs a user's search at THEIR chosen time/timezone, once per day.
```

Per-user YouTube keys are stored in `creator_discovery_settings.youtube_api_keys` (RLS isolated, never shown to others). The global `YOUTUBE_API_KEYS` secret is the owner's fallback — other self-host users would add their own per-user keys in the Discovery UI.

</details>

<details>
<summary><strong>Deploy to GitHub Pages</strong></summary>

From `web/`:

```powershell
npm run deploy:pages
```

The workflow in `.github/workflows/deploy-pages.yml` builds `web/` with `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` baked in and publishes `dist` to `gh-pages`.

</details>

---

## Project layout

```text
influenceflow-crm/
├── web/                 ← Vite + React 19 + TypeScript app (source of truth)
│   ├── src/pages/       ← Creators, Brands, Campaigns, Calendar, Discovery, Outreach, Settings ...
│   ├── src/lib/         ← supabase client, types, utils
│   └── public/          ← home.html copy etc.
├── supabase/
│   ├── migrations/      ← Postgres + RLS + Discovery tables (for self-host)
│   └── functions/       ← discover-creators, gmail-oauth-*, send-emails
├── home.html            ← public marketing page
├── privacy.html / terms.html
├── LICENSE              ← MIT
└── README.md
```

**Stack:** React 19 · TypeScript · Vite · React Router · Supabase (Postgres + Auth + RLS) · Gmail OAuth via Edge Functions

---

## Roadmap

- **Done:** Creators (table/kanban), Brands + people, Campaigns + calendar, bulk import, draft emails, backup, Discovery auto-search
- **Coming soon:** Outreach re-enable (Gmail send + reach-backs), brand discovery (find sponsoring brands by the same filters), tighter Gmail sync
- Track in [Issues](https://github.com/DhurimHalili/influenceflow-crm/issues) · ideas and PRs welcome (especially discovery filters, ranking, docs)

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Bug reports, ideas, and PRs are welcome.

---

## License

[MIT](LICENSE) © Dhurim Halili

---

## Contact

- Portfolio: [concepts-ew8.pages.dev](https://concepts-ew8.pages.dev/)
- LinkedIn: [dhurim-halili](https://www.linkedin.com/in/dhurim-halili-9183b81a0/)
- WhatsApp: [+383 49 878 908](https://wa.me/38349878908)
