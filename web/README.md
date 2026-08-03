# InfluenceFlow web app

Source for **InfluenceFlow CRM** — React + TypeScript + Vite.

- **Live:** https://dhurimhalili.github.io/influenceflow-crm/#/app
- **Docs / roadmap:** see the [root README](../README.md)

## Develop

```powershell
copy .env.example .env
# VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Local Vite server |
| `npm run build` | Production build → `dist/` |
| `npm run preview` | Preview production build |
| `npm run lint` | Oxlint |
| `npm run deploy:pages` | Build + publish to GitHub Pages |

## Env

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Never commit real `.env` files.
