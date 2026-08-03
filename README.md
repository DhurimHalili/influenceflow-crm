# InfluenceFlow CRM

Free influencer marketing CRM for agencies and freelancers — track creators, brands, outreach, campaigns, and calendar in one private workspace.

Built by [Dhurim Halili](https://concepts-ew8.pages.dev/).

**Live:** deploy `web/` (Vite) + Supabase Auth/RLS. Each user gets an isolated workspace.

---

## Who it's for

Marketing agencies and solo operators who need to:

- Track **influencers / creators** (table + kanban)
- Manage **brands** and brand contacts
- Run **outreach** (new / reach-back / mixed) with templates
- Plan **campaigns** with conflict warnings
- Keep a **calendar** + browser reminders
- Export data and search everything quickly

---

## Features

| Area | What you get |
|------|----------------|
| Auth | Signup / login — private data per account (Supabase Auth + RLS) |
| Creators | Table + kanban boards, soft archive, duplicate merge |
| Brands | Brand + people lists |
| Outreach | New / reach-back / mixed · template · review/customize · custom write |
| Campaigns | Campaign tracking with conflict warnings |
| Calendar | Schedule + browser reminders |
| Data | CSV/JSON export, global search |
| UI | Dark (default) / light themes · mobile/tablet · PWA manifest |
| Email | Gmail cloud send via Edge Functions |

---

## Quick start (local)

```powershell
cd web
copy .env.example .env
# fill VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173).

---

## Supabase

Apply migrations under `supabase/`. Edge Functions:

- `gmail-oauth-start` — begin Google OAuth
- `send-emails` — send a queued job via Gmail API

Set secrets: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GMAIL_OAUTH_REDIRECT_URI`.

Public pages (`privacy.html`, `terms.html`) support Google OAuth branding verification.

---

## License

MIT — see [LICENSE](LICENSE).

---

## Contact

- Portfolio: https://concepts-ew8.pages.dev/
- LinkedIn: https://www.linkedin.com/in/dhurim-halili-9183b81a0/
- WhatsApp: +383 49 878 908
