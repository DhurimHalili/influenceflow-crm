# Contributing to InfluenceFlow CRM

Thanks for helping make open influencer ops better.

## Ways to contribute

- **Bugs** — open an [issue](https://github.com/DhurimHalili/influenceflow-crm/issues) with steps to reproduce
- **Docs** — README, setup, or in-app Help clarifications
- **Features** — especially CRM import UX, pipeline, campaigns and calendar
- **UI polish** — mobile layout, accessibility, empty states

## Dev setup

```powershell
cd web
copy .env.example .env
npm install
npm run dev
```

You need a Supabase project with migrations from `supabase/migrations/` applied.

## Pull requests

1. Fork the repo and create a branch: `fix/…` or `feat/…`
2. Keep changes focused — one concern per PR
3. Don’t commit `.env` or secrets
4. Describe **what** and **why** in the PR body
5. Link related issues when applicable

## Code style

- TypeScript + React in `web/src`
- Prefer clear names and small components over clever abstractions
- Match existing patterns in nearby files

## License

By contributing, you agree your contributions are licensed under the MIT License.
