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
| **Adjustments**, **Questions & concerns** | See `docs/employee.md` §3–§4 |
| **Assessment day** | See below |
| **Notifications** | The email outbox with previews, the Director daily summary, and the list of what employees are emailed about. See `docs/notifications.md` |

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

**Assessment day** (hash route `#day`) – plan one office day for everyone and follow it live:
- **Settings:**
  - date, first session, finish-by time;
  - seats in the main room and in the quiet room;
  - assessment length;
  - under *More settings*: session length (automatic by default), gaps, settling-in time, rest-break allowance and lunch.
- **Readiness for each active employee** (former and test accounts are left out). These stop a person starting:
  - the current privacy notice is not acknowledged (waiting on the employee);
  - an adjustment request is still pending (for a Director);
  - an objection is open (for a Director).

  A requested correction to record details is listed as a follow-up but doesn't block.
- **Needs on the day:** agreed arrangements only, never the employee's own words or internal notes.
  - Expected time = settling in + assessment length × agreed extra time + rest-break allowance.
  - Quiet-room and paper or assisted arrangements go to the quiet room.
- **Session plan:**
  - People are dealt into sessions department by department, so each team keeps cover.
  - Lunch is skipped.
  - Warnings appear when a session takes more than half of a department of 3 or more, someone's expected time is longer than a session, a room is over capacity, or the day runs past the finish-by time.
  - Move anyone with the Session column. **Fix sessions** locks the whole plan, so automatic sessions stop changing once it has been shared.
- **On the day:** each person shows *Not started*, *Not arrived* (10 minutes after their session starts), *In progress* (with questions answered), *Check in* (no activity for 10 minutes) or *Finished*.
- **Print day sheet:** a print layout of the stats, sessions and list.
- **Code and database:**
  - engine: `src/participation/readiness.ts`;
  - database: `20261002090800_focusiq_assessment_day.sql`, which has `assessment_days`, `assessment_day_assignments` and the Director-only `assessment_day_readiness()`;
  - demo: Grace Okafor's row is live from the employee page, and the other rows are generated.

## Design

- **House style:** both apps use the Walter Geering design system (`app/src/design-system.css`); see `CLAUDE.md` for the rules.
- **Charts:** the accent green is the single series colour and warm grey is used for context marks.
  - Absolute bands use a validated 3-step green ordinal ramp.
  - Heatmap medians use a single-hue green ramp.
  - The confidence status uses the house green, amber and red with an icon and label.
- **Chart construction:** hand-built SVG. One axis, hairline grid, hover tooltips, legends for two or more series, and a table view where values aren't otherwise listed.
- **Theme:** light only, matching the house system.
- **Phone width:** works at 390px with no horizontal page scroll.

## Next steps

1. **Supabase data source.** Replace `buildDemoData()` with queries against a FocusiQ project. Read `benchmark_assessment_status`, `assessment_scores`, `insight_findings`, etc. Write exclusions to `benchmark_eligibility` so they persist and are audited in the database.
2. **Director sign-in.** Use Supabase Auth so that RLS (Director-only access) is enforced server-side.
3. **Employee-facing app.** This covers the privacy notice and acknowledgement form, the assessment runner that records response events, and the employee's own summary.
