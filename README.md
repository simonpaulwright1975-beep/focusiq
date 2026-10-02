# FocusiQ

Behavioural assessment platform for Walter Geering.

This repository currently contains the **benchmarking, comparison & cohort management** engine (spec §149–§203) and its Supabase schema. See [`docs/benchmarking.md`](docs/benchmarking.md).

```bash
npm install
npm test          # vitest
npm run typecheck # tsc
```

Database migrations live in `supabase/migrations/`.
