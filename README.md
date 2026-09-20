<p align="center">
  <img src="influenceflow-logo.png" alt="InfluenceFlow CRM" width="120" />
</p>

<h1 align="center">InfluenceFlow CRM</h1>

<p align="center">
  <strong>Free, open-source CRM for influencer agencies & freelancers.</strong><br />
  Stop juggling Notion + Sheets + Gmail. Manage influencers, brands, campaigns & calendar — in one private workspace.<br />
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
2. Add influencers manually, or **Bulk import** (`Name, channelUrl` paste or CSV file)
3. Track them: `New → Contacted → Replied → Negotiating → Roster → Signed` (plus `Denied` / `No reply`), table, Kanban board or cards
4. Create campaigns and schedule meetings in Calendar

That's it. Your data is private to your account — other users can't see it. Export anytime (CSV / JSON).

> **Do I need my own Supabase?** No — for regular use. The live app already runs on a hosted Supabase (by the maintainer). You only need your own Supabase if you **fork the repo and want to self-host** your own copy. See [Self-host (for developers)](#-self-host-for-developers) below.

---

## How it works (3 steps)

| Step | What you do | What InfluenceFlow does |
|------|-------------|------------------------|
| **1. Organize** | Add influencers and brands manually or via bulk import | Keeps pipeline clean — dedupes, merges duplicates, soft-deletes to trash |
| **2. Close** | Create a **Campaign** linking Brand + Influencers | Calculates agency cut, warns if influencer+brand already linked, moves influencers to **Roster** |
| **3. Stay on top** | Add **Calendar** meetings linked to influencer/brand/campaign | Browser reminders so follow-ups don't slip |

---

## What's inside today

| Area | How you'd explain it to a teammate |
|------|-------------------------------------|
| **Influencers CRM** | Table + Kanban board + mobile cards. Filter, bulk-change status, bulk-delete, merge duplicates by name, personal notes per influencer |
| **Brands & contacts** | Each brand has its own people (first/last name, title, email, LinkedIn). Same pipeline statuses |
| **Bulk import** | Paste `Rory Alexander, https://youtube.com/channel/UC...` or `Name, email, niche` — or **Attach CSV**. Auto-dedupes by name + link |
| **Campaigns** | Name, brand, platform, deliverables, payment + agency % → auto payout, status (negotiating/active/completed/cancelled), start/due dates, assign influencers, conflict warning |
| **Calendar** | Meetings with start/end, linked to influencer/brand/campaign, `remind_at` → browser notification |
| **Data & privacy** | Per-user Supabase Auth + RLS (no one sees your data), global search, CSV export, JSON backup export/import (v2 + legacy), Deleted list, activity log |
| **Polish** | Agency (default), Light, Dark, Honey, Ocean themes, fully responsive, larger readable type scale |

> Note: legacy discovery/outreach edge functions remain under `supabase/functions/` but are not wired to the UI.

---

## ❓ Do I need my own Supabase?

**Short answer: No.**

| You want to... | Do you need Supabase? |
|----------------|-----------------------|
| **Just use the CRM** at `dhurimhalili.github.io/influenceflow-crm` | **No.** Sign up and go. Database, auth and RLS — already hosted. |
| **Run it locally** or **deploy your own copy** (fork) | **Yes.** Clone the repo, create a free Supabase project, apply the `supabase/migrations/*.sql` files, set `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`. Details below. |

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

1. Create a project at [supabase.com](https://supabase.com) (free tier is fine).
2. In **SQL Editor**, run the files in `supabase/migrations/` in timestamp order (starting with the `20200101` bootstrap — it creates the core tables, RLS and policies). They create core CRM tables, RLS policies, and auto-seed for new users.
3. In **Auth → Configuration**, set the site URL and add your app URL + `/#/update-password` to **Redirect URLs** (password recovery links must be allowlisted).

</details>

<details>
<summary><strong>Deploy to GitHub Pages</strong></summary>

Push to `main` — the workflow in `.github/workflows/deploy-pages.yml` builds `web/` and deploys automatically. It reads `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` from **repo Settings → Secrets and variables → Actions** (never commit keys — set them as secrets in your fork too).

</details>

---

## Project layout

```text
influenceflow-crm/
├── web/                 ← Vite + React 19 + TypeScript app (source of truth)
│   ├── src/pages/       ← Influencers, Brands, Campaigns, Calendar, Settings ...
│   ├── src/components/  ← AppShell, ui kit
│   ├── src/contexts/    ← Auth, workspace data, toasts
│   ├── src/services/    ← Supabase sync (lossless load/persist)
│   ├── src/types/       ← workspace data model
│   ├── src/lib/         ← supabase client, utils, seed
│   └── public/          ← home.html copy etc.
├── supabase/
│   ├── migrations/      ← Postgres + RLS tables (for self-host)
│   └── functions/       ← backend functions (hidden modules preserved)
├── home.html            ← public marketing page
├── privacy.html / terms.html
├── LICENSE              ← MIT
└── README.md
```

**Stack:** React 19 · TypeScript · Vite · React Router · Supabase (Postgres + Auth + RLS)

---

## Roadmap

- **Done:** Influencers (table/kanban/cards), Brands + people, Campaigns + calendar, bulk import/export, follow-up tracking, true deal-loss tracking, outreach momentum stats, password recovery, notes, backup
- **Next:** Tighter calendar reminders, better analytics, team workspaces (optional)
- Track in [Issues](https://github.com/DhurimHalili/influenceflow-crm/issues) · ideas and PRs welcome

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
