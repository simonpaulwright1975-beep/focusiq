# FocusiQ – Benchmarking, Comparison & Cohort Management

Implementation notes for spec sections §149–§203.

> **Golden rule (§203):** keep the data · control the population · record the reason · make the decision auditable.

## Layout

| Path | Purpose |
|---|---|
| `src/benchmarking/types.ts` | Domain types. No protected characteristics exist in the model (§199). |
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
| `src/benchmarking/reports.ts` | Report-time benchmark freeze and "compare with current". |
| `src/benchmarking/evidence.ts` | Minimum question evidence per dimension. |
| `supabase/migrations/*_focusiq_core.sql` | People, roles, versioned content, metrics and expectations, assessments, versioned scores. |
| `supabase/migrations/*_focusiq_response_capture.sql` | Presentations, response events, and answer-change / revisit / timing views. |
| `supabase/migrations/*_focusiq_benchmarking.sql` | §202 tables, audit triggers, immutability guards, eligibility view, Director-only RLS. |

## Core principle

> **Absolute performance tells us whether the behaviour is effective.**
> **Benchmarking tells us whether the behaviour is unusual compared with colleagues.**

These are two separate outputs and are never merged:

| Output | Question | Based on | Shown to |
|---|---|---|---|
| Absolute band – *Development Opportunity / Expected / Typical / Strong* | Is the behaviour effective? | Versioned FocusiQ expectation thresholds per metric (`metric_expectations`) | Director and employee |
| Percentile – e.g. *41st* | How does it compare with the selected cohort? | The comparison population, with the subject removed | Director only |

Example: *"Decision Efficiency: 78 – Strong. Sales percentile: 41st (compared with 12 colleagues, Moderate confidence)."* When the two diverge, the engine adds context, such as *"the comparison group is also performing strongly overall"* or *"the group's overall level may need attention"*.

The expectation thresholds shipped today are **provisional** (`validated: false`), and every result using them is labelled as provisional. Replace them with validated versions in `metric_expectations`.

## How a benchmark is calculated (§192)

1. **Scope**: company, department, role, custom cohort (departments and/or tags) or an explicit list of employees.
2. **Filters**: employee status (active / former / test), pilot inclusion, assessment type, version, tenure band, and window (latest / last *n* months / custom dates).
3. **Eligibility**, at two levels:
   - **Employee**, e.g. *Simon Test Account – excluded completely*.
   - **Assessment**, e.g. *Katie – Assessment 2 excluded (technical failure)*.

   Every exclusion requires a reason and records who made it and when. Assessments are never deleted. Incomplete, `invalidated` and `review_required` assessments are also excluded.
4. **Adjusted assessments**: an assessment taken under legitimately different conditions is flagged *Adjusted*, which does **not** exclude it. While a Director's comparability decision is pending, it stays in the benchmark with a warning. If the Director decides *not comparable*, it is excluded with reason `reasonable_adjustment`. Either way it stays in the person's own history.
5. **One result per person**: the benchmark uses each employee's **latest eligible assessment** in the window. Earlier assessments are counted as `supersededAssessments` and remain available for:
   - personal trend analysis (all valid assessments);
   - before/after coaching comparisons;
   - historical benchmark snapshots (period windows).
6. **Comparability**: configurable per metric:
   - `company_comparable`
   - `department_comparable`
   - `requires_same_role`

   Commercial Awareness, Customer Judgement and Target Ownership are currently not comparable across departments.
7. **Minimum cohort (§155)**: fewer than 5 people gives *"Benchmark unavailable – insufficient comparison data."*
8. **Statistics**: mean, median, range, standard deviation, P25/P75, IQR and MAD.
9. **Comparison context**: each individual position stores:
   - comparison population size (the subject is excluded);
   - eligible employees;
   - exclusions by reason;
   - benchmark date;
   - engine version;
   - assessment and scoring versions.
10. **Confidence** (based on the comparison size):

    | Comparison size | Confidence |
    |---|---|
    | 1–4 | Insufficient |
    | 5–9 | Limited |
    | 10–19 | Moderate |
    | 20–29 | Good |
    | 30+ | High |

11. **Outliers (§181)**:
    - **Default method**: modified z-score using the Median Absolute Deviation, threshold 3.5. This falls back to IQR fences (2.2 × IQR) when the MAD is zero. IQR and SD methods are also available.
    - **Comparison**: each person is tested against the others, excluding themselves.
    - **Small groups**: detection is suppressed below 10 people.
    - **Meaning**: *Significant Outlier* means only "statistically unusual compared with the eligible comparison group". It never implies a poor employee or problematic behaviour.
    - **Standard deviation**: z-scores are still shown for analytics.
12. **Normalisation (§169)**: difficulty-normalised T-scores are used only when every assessment in the population has one.

## Minimum question evidence

Each dimension carries:
- an **evidence count**;
- a **consistency** measure (exercises agreeing with the majority pattern);
- an **interpretation confidence**:

| Evidence | Confidence |
|---|---|
| Fewer than 4 exercises | Insufficient – no conclusion drawn |
| 10 or more, at least 70 % consistent | High |
| 6 or more, at least 60 % consistent | Moderate |
| Anything else | Low – stated as tentative |

Example: *"Evidence: 11 exercises · Consistent pattern: 8/11 · Interpretation confidence: High"*.

## Report freeze (§171)

`generateReportBenchmark` evaluates the benchmark **as at the assessment date** and freezes it. The saved record holds:
- the population and members;
- the values used;
- the absolute bands and percentiles;
- the comparison context;
- report, interpretation, scoring, assessment and engine versions.

In the database, `employee_reports` and `benchmark_snapshots` are immutable. `compareReportWithCurrent` is the optional *Compare with current benchmark* view, and it never changes the report.

## Reconstruction (data architecture)

| Need | Table |
|---|---|
| Assessment version | `assessment_versions` (immutable once published; may be retired) |
| Question & question version | `questions`, `question_versions` (immutable once published; answer keys Director-only) |
| Question family | `question_families` |
| What the employee saw | `assessment_presentations.rendered_content` (append-only, includes shuffled option order) |
| Response events | `response_events` (append-only, client sequence and client/server timestamps) |
| Answer-change history | view `answer_change_history` |
| Revisit history | view `revisit_history` |
| Timing events | `response_events` (timer / focus / dwell) and view `question_timing` |
| Scoring version | `scoring_versions`; `assessment_scores` keyed by scoring version and immutable (re-scoring adds rows) |
| Dimension evidence | `assessment_scores.evidence_count / consistent_count / interpretation_confidence` |
| Absolute expectations | `metric_expectations` (versioned, validation recorded) |
| Benchmark eligibility & exclusion reason | `benchmark_eligibility`, `assessment_validity`, `assessment_adjustments`, view `benchmark_assessment_status` |
| Benchmark snapshots | `benchmark_snapshots` |
| Interpretation version | `interpretation_versions` |
| Report version | `report_versions`; issued reports in `employee_reports` |
| Every decision | `benchmark_audit_log` (append-only) |

## Language rules

- Absolute bands are only *Development Opportunity*, *Expected / Typical* and *Strong*.
- Percentiles are Director-only context. Employees see the absolute band only (`employeeFacingResult`).
- There is no overall score and no best/worst output. `sortByDimension` sorts one dimension for analysis.
- Behaviour comparisons describe working styles rather than declaring a winner.
- Correlation analysis states plainly when no meaningful relationship has been found.

## Permissions

| Capability | Who |
|---|---|
| Alter benchmark inclusion / validity / adjustments / cohort tags | Director, Super Admin, or a Manager with `benchmark_authority` |
| Comparisons, heatmaps, percentiles, Focus Efficiency, KPI correlation, reports | Director, Super Admin |
| Own assessments, presentations, response events and scores | The employee (events only while the assessment is open) |

These rules are enforced in TypeScript and in Postgres RLS and triggers.

## Spec coverage

| § | Where |
|---|---|
| 149–150 Benchmark engine & types | `computeBenchmark` with `PopulationScope` (`company`, `department`, `role`, `cohort`, `employees`) and `personalImprovement` |
| 151–153 Eligibility, reasons, employee vs assessment | `EligibilityLedger`, `benchmark_eligibility` |
| 154 Population counter | `sampleSizeLabel`, `explanation.counts` |
| 155 Minimum cohort | `minimumCohortSize`, `INSUFFICIENT_DATA_MESSAGE` |
| 156 Mean/median/range/SD | `describe` |
| 157 Percentile | `positionAgainst().percentile` (relative context only) |
| 158 Bands | `absoluteBandFor` – absolute expectations, not percentiles |
| 159 Confidence | `confidenceFor` |
| 160 By dimension | `compareEmployeeByDimension` |
| 161–162 Side-by-side / multi | `compareEmployees` |
| 163 Filters | `PopulationDefinition`, `IndividualHeatmapOptions` |
| 164 Hide without changing eligibility | `hiddenEmployeeIds` |
| 165 Former employees | `CURRENT_WORKFORCE` / `HISTORICAL` |
| 166–167 New starter / tenure | `tenure.ts`, `tenureBands` |
| 168 Incomparable metrics | `metricComparableFor`, `metrics.company_comparable` / `department_comparable` |
| 169–170 Normalisation & calibration | `normalisedScore`, `calibrateQuestions` |
| 171 Benchmark freeze | `generateReportBenchmark`, `compareReportWithCurrent`, `employee_reports` |
| 172 ME vs ME | `personalImprovement` |
| 173 Coaching effectiveness | `coachingEffectiveness`, `development_actions` |
| 174–175 Heatmaps | `departmentHeatmap`, `individualHeatmap` |
| 176 Behaviours not scores | `compareEmployees().interpretation` |
| 177 Focus Efficiency | `focusEfficiency` |
| 178 High-performance cohort | `defineHighPerformanceCohort`, `high_performance_cohorts` |
| 179–180 KPI correlation | `correlateWithKpi`, `kpi_observations` |
| 181 Outliers | `assessOutlier` (MAD / IQR / SD), `detectOutliers` |
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
| 193 Employee visibility | `employeeFacingResult` |
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
