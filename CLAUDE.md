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
  - absolute bands use the validated ordinal green ramp `#72b88d → #2f8f5a → #0d5a3b`;
  - heatmaps use `#ddf2e4 → #0d5a3b`;
  - validate any new chart palette with the dataviz validator before use.
- **Theme:** light only. The house system defines no dark palette, so don't invent one without asking.

## Conventions

- Engine code lives in `src/` (pure TypeScript, tested with Vitest).
- Apps live in `app/` (Vite + React). There are separate entry points for Directors (`index.html`) and employees (`employee.html`). Employee bundles must not import Director or engine code.
- Never infer pronouns in generated text. Never add protected characteristics to the model.
- Run before committing: `npm run typecheck`, `npm test`, `npm run build:app`.
