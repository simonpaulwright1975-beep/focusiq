# FocusiQ – Director dashboard

A Vite + React app in `app/` that runs the benchmarking and insight engines directly in the browser.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build:app  # static build in app/dist
```

> **Demo data.** No FocusiQ Supabase project exists yet, so the dashboard uses a seeded demo dataset
> (`app/src/demo/dataset.ts`).
> - Every name is fictional and every result is generated.
> - A banner on every page says so.
> - Exclusions made in the demo live only in memory and reset on reload.

## Layout

One filter row scopes every tab (§201):
- Department
- Assessment version
- Date range (latest / 6 months / 12 months / custom)
- Benchmark population (current workforce / historical including former employees)
- **Hide staff from view** – this removes people from comparison views only, never from benchmark eligibility (§164).

| Tab | Contents |
|---|---|
| **Overview** | Stat cards (eligible employees, excluded, assessments, benchmark reliability); dimension comparison (department vs company medians, with a table view and "How is this calculated?"); organisation insight (shared patterns as possible process issues); department heatmap (unavailable cells hatched, "n<5"); accuracy vs speed scatter (click to open a report); unnecessary re-checking by department; motivation distribution |
| **People** | Individual heatmap coloured by **absolute band** (percentile on hover), sort by dimension, show/hide excluded records, no overall score; side-by-side comparison with **blind mode** and **Reveal names**; behaviour interpretation |
| **Employee report** | See below |
| **Eligibility & audit** | See below |

**Employee report:**
- Results table: score, absolute band, department percentile (subject removed), comparison size with confidence, outlier flag, and context note.
- ME vs ME trend.
- The full insight report:
  - FocusiQ summary;
  - the four questions;
  - evidence with **View evidence** drill-down to the exercises;
  - coaching conversation and questions;
  - strengths, motivation and role fit;
  - the 12-section *Summary of the person*;
  - what to monitor at next review;
  - **Preview employee version**.

**Eligibility & audit:**
- Exclude or restore an employee or a single assessment, with a required reason. Choosing "Other" also requires a note.
- An **exclusion preview** shows the benchmark before and after for the chosen dimension.
- Flag an assessment as *Adjusted* and record the comparability decision.
- The append-only **audit log** shows who, what, when and why.

## Design

- **Palette:** colours use the validated reference palette (`app/src/styles.css`), with light and dark tokens and a theme toggle.
  - Absolute bands use a 3-step ordinal blue ramp.
  - Heatmap medians use a single-hue sequential ramp.
  - The confidence status uses an icon and a label, never colour alone.
- **Charts:** hand-built SVG. One axis, hairline grid, hover tooltips, legends for two or more series, and a table view where values aren't otherwise listed.
- **Phone width:** works at 390px with no horizontal page scroll.

## Next steps

1. **Supabase data source.** Replace `buildDemoData()` with queries against a FocusiQ project. Read `benchmark_assessment_status`, `assessment_scores`, `insight_findings`, etc. Write exclusions to `benchmark_eligibility` so they persist and are audited in the database.
2. **Director sign-in.** Use Supabase Auth so that RLS (Director-only access) is enforced server-side.
3. **Employee-facing app.** This covers the privacy notice and acknowledgement form, the assessment runner that records response events, and the employee's own summary.
