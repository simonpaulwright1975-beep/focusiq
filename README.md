# FocusiQ

Behavioural assessment platform for Walter Geering.

This repository currently contains:

- **Benchmarking, comparison & cohort management** (spec §149–§203) – [`docs/benchmarking.md`](docs/benchmarking.md)
- **Employee Insight & Business Support** (Insight spec §201–§235) – [`docs/insight.md`](docs/insight.md)
- **Director dashboard** (React, demo data) – [`docs/dashboard.md`](docs/dashboard.md)
- The Supabase schema, including full response capture so any result can be reconstructed.

```bash
npm install
npm test          # vitest
npm run typecheck # tsc (engine + app)
npm run dev       # Director dashboard on http://localhost:5173 (demo data)
```

Database migrations live in `supabase/migrations/`.
