# FocusiQ – Benchmarking, Comparison & Cohort Management

Implementation notes for spec sections §149–§203.

> **Golden rule (§203):** keep the data · control the population · record the reason · make the decision auditable.

## Layout

| Path | Purpose |
|---|---|
| `src/benchmarking/types.ts` | Domain types (employees, assessments, metrics, population definitions, results). No protected characteristics exist in the model (§199). |
| `src/benchmarking/config.ts` | Configurable thresholds: minimum cohort size, confidence, bands, outliers, correlation, calibration. |
| `src/benchmarking/audit.ts` | `EligibilityLedger` (exclude / restore / validity) with reasons, permissions and an append-only audit log. |
| `src/benchmarking/population.ts` | Resolves a population definition into eligible assessments with counts of what was excluded and why. |
| `src/benchmarking/benchmark.ts` | Benchmark calculation, positioning, bands, outliers, dimension comparison, exclusion preview, employee-facing view. |
| `src/benchmarking/progress.ts` | ME vs ME, re-test comparison, coaching effectiveness, benchmark history, before/after initiatives. |
| `src/benchmarking/comparison.ts` | Director-only side-by-side / multi-employee comparison, blind mode, behaviour interpretation, sort-by-dimension, Focus Efficiency. |
| `src/benchmarking/heatmap.ts` | Department heatmap, individual heatmap, department summary. |
| `src/benchmarking/snapshots.ts` | Frozen benchmark snapshots, current-vs-frozen view, population-change warning. |
| `src/benchmarking/calibration.ts` | Question calibration statistics and difficulty-normalised (T-score) scoring. |
| `src/benchmarking/correlation.ts` | External KPI correlation and evidence-based high-performance cohorts. |
| `src/benchmarking/cohorts.ts` | Director-controlled cohort tags with protected-characteristic safeguard. |
| `supabase/migrations/*_focusiq_core.sql` | Minimal core tables (employees, assessments, scores, metrics, roles) + RLS. |
| `supabase/migrations/*_focusiq_benchmarking.sql` | §202 tables, audit triggers, immutability guards, eligibility view, Director-only RLS. |

## How a benchmark is calculated (§192)

1. **Scope**: company, department, role, custom cohort (departments and/or tags) or an explicit list of employees.
2. **Population filters**: employee status (active / former / test), pilot inclusion, assessment type, assessment version, tenure band, and the assessment window: latest, last *n* months, or custom dates.
3. **Eligibility**: an assessment is excluded when any of these apply:
   - the employee is excluded;
   - the assessment is excluded;
   - the assessment is incomplete;
   - the assessment is `invalidated` or `review_required`.

   Excluded records are counted by reason but never removed.
4. **One value per employee**: by default, the person's most recent eligible assessment in the window. Set `perEmployee: 'mean'` to use the average of their eligible assessments instead. This stops frequent test-takers from carrying extra weight.
5. **Comparability (§168)**: a metric is benchmarked across departments only if `companyComparable`, and between colleagues only if `departmentComparable`. A population counts as cross-department when any of these hold:
   - its scope is the company;
   - it is a cohort covering more than one department;
   - its members come from more than one department.
6. **Minimum cohort (§155)**: fewer than `minimumCohortSize` people (default 5) gives *"Benchmark unavailable – insufficient comparison data."* The raw values are still returned so a Director can compare manually.
7. **Statistics (§156)**: mean, median, range, standard deviation, P25/P75 and sample size.
8. **Confidence (§159)**:

   | Eligible people | Confidence |
   |---|---|
   | fewer than 5 | Insufficient |
   | 5–9 | Limited |
   | 10–14 | Moderate |
   | 15 or more | High |

9. **Position (§157–§158)**: percentile is computed against colleagues, with the subject removed, and is shown to Directors only. It is oriented so that lower-is-better metrics, such as re-check rate, are handled correctly. Bands:

   | Performance percentile | Band |
   |---|---|
   | below 25 | Development Range |
   | 25–74 | Typical Range |
   | 75 and above | Above Typical Range |

10. **Normalisation (§169)**: with `normalisation: 'difficulty_t_score'`, normalised scores are used when *every* assessment in the population has one. Otherwise the engine falls back to raw scores and adds a warning. Mixing assessment versions without normalisation also raises a warning.

Every result carries `sampleSizeLabel` (e.g. *"Benchmark based on 14 eligible assessments from 14 employees."*) and an `explanation` object for the "How is this benchmark calculated?" panel.

## Language rules

- Bands are only *Above Typical Range / Typical Range / Development Range*.
- Outliers are labelled *Significant Outlier*, with a prompt to review the context.
- The employee-facing view (`employeeFacingBenchmark`) exposes a band message only. It never shows a percentile, rank or position.
- There is no overall score and no best/worst output anywhere. `sortByDimension` sorts a single dimension for analysis.
- Behaviour comparisons describe working styles. For example: *"Both achieved similar accuracy. Donna reached comparable outcomes with substantially less additional review."*
- Correlation analysis states plainly when no meaningful relationship has been found, and always includes a "not causation" caveat.

## Permissions

| Capability | Who |
|---|---|
| Alter benchmark inclusion / validity / cohort tags | Director, Super Admin, or a Manager with `benchmark_authority` |
| Comparisons, heatmaps, percentiles, Focus Efficiency, KPI correlation | Director, Super Admin |
| Own assessments and scores | The employee |

These rules are enforced in TypeScript (`BenchmarkPermissionError`) and in Postgres RLS. The database also enforces:

- exclusion rows cannot be deleted, only restored;
- the audit log is append-only;
- snapshots are immutable;
- "Other" exclusions need a note;
- restorations need a reason;
- cohort names that describe protected characteristics are rejected.

## Spec coverage

| § | Where |
|---|---|
| 149–150 Benchmark engine & types | `computeBenchmark` with `PopulationScope` (`company`, `department`, `role`, `cohort`, `employees`) and `personalImprovement` |
| 151–153 Eligibility, reasons, employee vs assessment | `EligibilityLedger`, `benchmark_eligibility` |
| 154 Population counter | `sampleSizeLabel`, `explanation.counts` |
| 155 Minimum cohort | `minimumCohortSize`, `INSUFFICIENT_DATA_MESSAGE` |
| 156 Mean/median/range/SD | `describe` |
| 157 Percentile | `positionAgainst().percentile` |
| 158 Bands | `bandFor`, `BenchmarkBand` |
| 159 Confidence | `confidenceFor` |
| 160 By dimension | `compareEmployeeByDimension` |
| 161–162 Side-by-side / multi | `compareEmployees` |
| 163 Filters | `PopulationDefinition`, `IndividualHeatmapOptions` |
| 164 Hide without changing eligibility | `hiddenEmployeeIds` |
| 165 Former employees | `CURRENT_WORKFORCE` / `HISTORICAL` |
| 166–167 New starter / tenure | `tenure.ts`, `tenureBands` |
| 168 Incomparable metrics | `metricComparableFor`, `metrics.company_comparable` / `department_comparable` |
| 169–170 Normalisation & calibration | `normalisedScore`, `calibrateQuestions` |
| 171 Benchmark freeze | `createSnapshot`, `compareFrozenToCurrent`, `report_benchmarks` |
| 172 ME vs ME | `personalImprovement` |
| 173 Coaching effectiveness | `coachingEffectiveness`, `development_actions` |
| 174–175 Heatmaps | `departmentHeatmap`, `individualHeatmap` |
| 176 Behaviours not scores | `compareEmployees().interpretation` |
| 177 Focus Efficiency | `focusEfficiency` |
| 178 High-performance cohort | `defineHighPerformanceCohort`, `high_performance_cohorts` |
| 179–180 KPI correlation | `correlateWithKpi`, `kpi_observations` |
| 181 Outliers | `detectOutliers`, `positionAgainst().outlier` |
| 182 Exclusion preview | `previewExclusion` |
| 183 Restore | `restoreEmployee` / `restoreAssessment` |
| 184 Locking | `canAlterBenchmarkInclusion`, RLS |
| 185 Audit log | `auditLog()`, `benchmark_audit_log` |
| 186 Blind mode | `compareEmployees({ blind: true })`, `revealNames` |
| 187 Re-test comparison | `retestComparison` |
| 188 Benchmark history | `benchmarkHistory` |
| 189 Team development | `initiativeComparison` |
| 190 Department summary | `departmentSummary` |
| 191 Context always | Comparisons return full dimension profiles; no single number |
| 192 Explanation | `BenchmarkResult.explanation` |
| 193 Employee visibility | `employeeFacingBenchmark` |
| 194 Sort by dimension | `sortByDimension`, `individualHeatmap({ sortBy })` |
| 195 Comparison builder | `PopulationDefinition` |
| 196 Snapshots | `benchmark_snapshots` |
| 197 Integrity warning | `populationChange`, `POPULATION_CHANGED_WARNING` |
| 198 Cohort tags | `addCohortTag`, `cohorts` / `employee_cohorts` |
| 199 Protected characteristics | Absent from the model; `assertNotProtectedCharacteristic`; DB check |
| 201 Director dashboard | All data APIs are in place. The UI is not built yet (see below). |
| 202 Database additions | `20261002090100_focusiq_benchmarking.sql` |

## Not yet built

- **Director dashboard UI (§201).** The engine returns everything the dashboard needs:
  - cards: eligible employees, excluded, assessments, reliability;
  - department and individual heatmaps;
  - individual vs benchmark;
  - personal improvement;
  - snapshots and history.
- **Server-side benchmark queries.** These should use `benchmark_assessment_status` together with this engine, for example in a Supabase Edge Function.
- **Normalisation job.** A job that writes `assessment_scores.normalised_value` once questions are calibrated.
