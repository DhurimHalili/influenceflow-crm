# Roadmap

High-level plan for InfluenceFlow CRM. Details live in [GitHub Issues](https://github.com/DhurimHalili/influenceflow-crm/issues).

## Now (shipped)

- [x] Private workspaces (Supabase Auth + RLS)
- [x] Creators CRM (table + kanban, statuses, notes, archive, merge)
- [x] Brands + brand people
- [x] Outreach (new / reach-back / mixed) + Gmail send
- [x] Campaigns with conflict warnings
- [x] Calendar + browser reminders
- [x] Search, export, dark/light, PWA
- [x] Public live app on GitHub Pages

## Next — discovery + matching

- [ ] **Creator discovery** — filter by language, niche, avg views, engagement rate, subscriber/follower band, platform
- [ ] **Brand discovery** — find brands that sponsor creators in that profile band
- [ ] **Import to CRM** — one-click add shortlisted creators/brands into the workspace
- [ ] **Match view** — creators ↔ sponsoring brands for a campaign brief
- [ ] Rate limiting, dedupe, and safe defaults for public/self-hosted use

## Later

- [ ] Public API / webhooks for agency tooling
- [ ] Better analytics on outreach reply rates
- [ ] Team seats / shared agency workspaces (optional)
- [ ] Plugin adapters per platform (YouTube, Instagram, TikTok, …)

## Example discovery brief

> Find English-speaking male creators ≈50k avg views, ≈1% engagement, ≈50k subscribers → surface brands that already sponsor that band → add both to InfluenceFlow → outreach → campaign.

That’s the product north star: **discover → manage → close** in one open web app.
