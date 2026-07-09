# InfluenceFlow CRM

Free influencer marketing CRM by [Dhurim Halili](https://concepts-ew8.pages.dev/).

Private per-user workspaces (Supabase Auth + RLS), Gmail cloud send, campaigns, calendar, outreach personalization, dark/light themes.

## Quick start (local)

```powershell
cd web
copy .env.example .env
# fill VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173).

## Features

- Signup / login (private data per account)
- Creators (table + kanban), brands + people lists
- Outreach: new / reach-back / mixed, template + review/customize + custom write
- Campaigns with conflict warnings
- Calendar + browser reminders
- Soft archive, duplicate merge, CSV/JSON export, global search
- Help + Hire/Concepts (portfolio, WhatsApp, LinkedIn)
- Dark (default) / light themes
- Mobile / tablet responsive + PWA manifest

## Supabase

Project schema is applied via migrations. Edge Functions:

- `gmail-oauth-start` — begin Google OAuth
- `send-emails` — send a queued job via Gmail API

Set secrets: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GMAIL_OAUTH_REDIRECT_URI`.

## Contact

- Portfolio: https://concepts-ew8.pages.dev/
- LinkedIn: https://www.linkedin.com/in/dhurim-halili-9183b81a0/
- WhatsApp: +383 49 878 908
