# InfluenceFlow CRM

A standalone influencer marketing CRM — your agency operating system. No subscriptions, no backend. All data stays in your browser (localStorage).

## Features

- **Creators & Brands Contacted** — pipeline tracking with status, search, filters, bulk CSV/text import, duplicate detection
- **Signed Creators & Brands** — promote from contacts OR add new (no re-entering info)
- **Quick Log Sponsorship** — log brand↔creator relationships from YouTube/TikTok research (creates external links, NOT campaigns)
- **Brand ↔ Creator conflict protection** — warns when creating campaigns that conflict with logged sponsorships
- **Campaigns** — full deal management with payment, agency %, creator payout, multi-creator assignment, delete
- **Brand & Creator detail pages** — external creators, safe-to-pitch list, campaign history, revenue
- **Dashboard** — counts, active campaigns, agency revenue, recent activity
- **Export / Import** — backup and restore your data as JSON

## Run locally

Open `index.html` in any modern browser, or serve the folder:

```powershell
# Python
python -m http.server 8080

# Then open http://localhost:8080
```

> ES modules require a local server (or opening via `file://` may work in some browsers — a server is recommended).

## Share with others (without your data)

1. Share the project folder (zip or GitHub) — it contains **no personal data**
2. Others open it fresh; their data stays in their browser
3. Use **Export data** to back up; **Import data** to restore

## Deploy free (optional)

Upload the folder to [Netlify Drop](https://app.netlify.com/drop) or [Vercel](https://vercel.com) for a public URL.
