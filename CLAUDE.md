# FocusiQ – project notes for Claude

FocusiQ is Walter Geering's behavioural assessment platform. See `README.md` and the `docs/` folder.

## Design system – applies to ALL apps (mandatory)

Every FocusiQ app and page uses the Walter Geering house design system. It is defined verbatim in
`app/src/design-system.css`. Import it first and build on its tokens and classes; never redefine them.

- **Tokens:** `--ink #17120e`, `--ink-soft #4a4038`, `--muted #8a7a6d`, `--accent #0d5a3b`, `--accent-lt #106b45`,
  `--accent-bg #eaf7ef`, `--bg-1 #f7efe9`, `--bg-2 #fbf4ef`, `--card #fff`, `--line #ede0d5`, `--track #f3e7dd`,
  `--green #1e7a46`/`--green-bg #ddf2e4`, `--amber #a2690e`/`--amber-bg #f9ecd2`, `--red #b13a2a`/`--red-bg #f9dfd9`.
- **Page:** body is Segoe UI / system sans on a `--bg-1 → --bg-2` vertical gradient.
- **Headings:** `h1`, `h2` use Georgia serif, weight 800, letter-spacing −0.4px. Stat numbers stay in the sans.
- **Cards:** `.card` – white, 1px `--line` border, 16px radius, 22px padding, soft warm shadow.
- **Labels:** `.lbl` – 0.74rem, 700, uppercase, 0.08em tracking, `--muted`. Use for field labels, stat labels and small section headings.
- **Buttons:** `.btn` is the primary dark ink pill (14px 30px padding). Secondary actions use `.btn.secondary` (outlined white pill); text actions use `.btn.link`.
- **Chips:** `.chip` is a selectable pill and `.chip.sel` is selected (accent green). Use it only for selectable options such as tabs. Static labels use `.tag`.
- **Inputs:** 1px `--line` border, 12px radius, `#fffdfb` background, `--accent-lt` focus outline. Selects and textareas match.
- **Status:** use the green / amber / red token pairs, always with an icon or text label, never colour alone.
- **Charts:**
  - single series in `--accent`, other context marks in `#cfc2b6`;
  - absolute bands in the Director app (score bars, donuts, % splits, People heatmap, band chips) use `--band-strong #1e7a46` / `--band-expected #5fb57f` / `--band-develop #e09a1f` (validated; amber, never red), always with the score or band name printed; line charts use their pale `--zone-*` tints. Shared pieces live in `app/src/bands.ts` and `app/src/components/bandCharts.tsx`. The employee summary's band chips keep the ordinal green ramp `#72b88d → #2f8f5a → #0d5a3b`;
  - lead Director reports with a plain-English headline (no pronouns) and keep detailed tables behind "Show full details";
  - heatmaps use `#ddf2e4 → #0d5a3b`;
  - validate any new chart palette with the dataviz validator before use.
- **Theme:** light only. The house system defines no dark palette, so don't invent one without asking.

## Conventions

- Database: the shared WG Main Supabase project, schema `focusiq` only (see `docs/database.md`). Never create or change anything in `public` (other apps' `public.employees` and `public.is_director()` live there). Sign-ins are shared across WG apps: gate access on `focusiq.is_focusiq_user()` / `focusiq.is_director()`, never on just being signed in.
- Engine code lives in `src/` (pure TypeScript, tested with Vitest).
- Apps live in `app/` (Vite + React). There are separate entry points for Directors (`index.html`) and employees (`employee.html`).
- The employee bundle may import only `src/participation`, `src/runner`, shared UI without engine imports (e.g. `components/Modal.tsx`), `app/src/shared/` and display-only demo content (`app/src/demo/assessment.ts`). Type-only imports are allowed anywhere. It must never import `src/benchmarking`, `src/insight`, Director views, or answer keys (`app/src/demo/scoring.ts`). `tests/runner.test.ts` enforces this.
- Answer keys and scoring metadata never reach an employee's browser.
- Adjustment requests may contain health information: Director-only, internal notes never on employee-readable rows, no request text copied into audit logs.
- Questions & data-rights requests: replies are sent as "Walter Geering" (no Director identities to employees); internal notes never reach employees; statutory deadlines (one calendar month, one extension of up to two months) live in `src/participation/requests.ts` and must stay in step with the SQL in `20261002090600_focusiq_rights_requests.sql`.
- Employee summaries reach employees only once a Director releases them (`summary_releases`, `my_summary()`). They never contain percentiles, rankings, comparisons with colleagues or Director identities. Bands are opt-in and compare only with the person's own previous assessment.
- Emails are a nudge to sign in, never a copy of the content: no request text, replies, adjustments, summaries, results, Director names or other people's names. Employee emails come from "Walter Geering"; the Director email is a daily summary of counts. Emails are sent through Resend (`supabase/functions/_shared/resend.ts`, tested in `tests/resend.test.ts`); never log email addresses or content, and keep open/click tracking off. FocusiQ's Edge Function secrets are prefixed `FOCUSIQ_` (WG Main's secrets are shared with the Hub's functions). The wording in `src/participation/notifications.ts` must stay in step with `20261002090900_focusiq_notifications.sql` (`tests/notifications.test.ts` checks this).
- Never infer pronouns in generated text. Never add protected characteristics to the model.
- Run before committing: `npm run typecheck`, `npm test`, `npm run build:app`.
