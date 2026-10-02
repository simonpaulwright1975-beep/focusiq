/**
 * Benchmark calculation (§149–§160, §168, §181–§182, §192–§193).
 *
 * Two separate questions, never merged:
 *  - Absolute band  – is the behaviour effective? (FocusiQ expectations per metric)
 *  - Percentile     – is the behaviour unusual compared with colleagues? (context only)
 */
import {
  BENCHMARK_ENGINE_VERSION,
  confidenceFor,
  resolveConfig,
  type BenchmarkConfig,
} from './config.js';
import {
  isCrossDepartment,
  isCrossRole,
  metricComparableFor,
  resolvePopulation,
  validityOf,
  type BenchmarkDataset,
  type ResolvedPopulation,
} from './population.js';
import { describe, mean, median, medianAbsoluteDeviation, percentileRank, quantile, round, standardDeviation, zScore } from './stats.js';
import type { TenureBand } from './tenure.js';
import type {
  AbsoluteBand,
  Assessment,
  BenchmarkResult,
  BenchmarkValue,
  Confidence,
  EligibilityState,
  MetricDefinition,
  NormalisationMethod,
  PopulationCounts,
  PopulationDefinition,
} from './types.js';

export const INSUFFICIENT_DATA_MESSAGE = 'Benchmark unavailable – insufficient comparison data.';

export interface BenchmarkOptions {
  config?: Partial<BenchmarkConfig>;
  /** §169 – use difficulty-normalised scores where every assessment has one. */
  normalisation?: NormalisationMethod;
  tenureBands?: readonly TenureBand[];
  now?: Date;
}

export interface BenchmarkComputation extends BenchmarkResult {
  warnings: string[];
}

export function getMetric(data: BenchmarkDataset, metricKey: string): MetricDefinition {
  const metric = data.metrics.find((m) => m.key === metricKey);
  if (!metric) throw new Error(`Unknown metric: ${metricKey}`);
  return metric;
}

export function scoreOf(a: Assessment, key: string, normalised: boolean): number | undefined {
  const v = normalised ? a.normalisedScores?.[key] : a.scores[key];
  return Number.isFinite(v) ? v : undefined;
}

/** Core benchmark calculation for one metric over one population definition. */
export function computeBenchmark(
  data: BenchmarkDataset,
  definition: PopulationDefinition,
  metricKey: string,
  options: BenchmarkOptions = {},
): BenchmarkComputation {
  const config = resolveConfig(options.config);
  const metric = getMetric(data, metricKey);
  const population = resolvePopulation(data, definition, {
    metricKey,
    tenureBands: options.tenureBands,
    now: options.now,
  });
  return benchmarkFromPopulation(population, metric, config, {
    ...options,
    eligibility: data.eligibility,
  });
}

export function benchmarkFromPopulation(
  population: ResolvedPopulation,
  metric: MetricDefinition,
  config: BenchmarkConfig,
  options: Pick<BenchmarkOptions, 'normalisation' | 'now'> & { eligibility?: EligibilityState } = {},
): BenchmarkComputation {
  const warnings: string[] = [];
  const used = [...population.byEmployee.values()];

  let normalisation: NormalisationMethod = options.normalisation ?? 'none';
  if (normalisation !== 'none' && !used.every((a) => scoreOf(a, metric.key, true) !== undefined)) {
    warnings.push(
      'Normalised scores are not yet available for every assessment; raw scores have been used.',
    );
    normalisation = 'none';
  }
  const useNormalised = normalisation !== 'none';

  if (population.versions.size > 1 && !useNormalised) {
    warnings.push(
      `Population spans assessment versions ${[...population.versions].sort().join(', ')} ` +
        'without difficulty normalisation; differences may partly reflect version.',
    );
  }
  if (population.scoringVersions.size > 1) {
    warnings.push(
      `Population spans scoring versions ${[...population.scoringVersions].sort().join(', ')}.`,
    );
  }
  if (population.counts.adjustedPendingReview > 0) {
    warnings.push(
      `${population.counts.adjustedPendingReview} adjusted assessment(s) await a comparability decision.`,
    );
  }

  const values: BenchmarkValue[] = [];
  for (const [employeeId, a] of population.byEmployee) {
    const v = scoreOf(a, metric.key, useNormalised);
    if (v !== undefined) {
      values.push({
        employeeId,
        assessmentId: a.id,
        value: v,
        adjusted: options.eligibility?.adjustments?.has(a.id) ?? false,
      });
    }
  }

  const people = values.length;
  const comparability = metricComparableFor(metric, {
    crossDepartment: isCrossDepartment(population),
    crossRole: isCrossRole(population),
  });
  const enough = people >= config.minimumCohortSize;
  const available = comparability.comparable && enough;
  const unavailableReason = !comparability.comparable
    ? comparability.reason
    : !enough
      ? INSUFFICIENT_DATA_MESSAGE
      : undefined;

  const sampleSizeLabel =
    `Benchmark based on ${people} eligible assessment${people === 1 ? '' : 's'} ` +
    `(latest per employee, ${people} employee${people === 1 ? '' : 's'}).`;

  return {
    metricKey: metric.key,
    metricLabel: metric.label,
    available,
    ...(unavailableReason ? { unavailableReason } : {}),
    stats: available ? describe(values.map((v) => v.value)) : null,
    confidence: confidenceFor(people, config),
    sampleSizeLabel,
    explanation: {
      populationLabel: population.label,
      definition: population.definition,
      counts: population.counts,
      assessmentVersions: [...population.versions].sort(),
      scoringVersions: [...population.scoringVersions].sort(),
      sampleSize: people,
      normalisation,
      dateRange: population.dateRange,
      minimumCohortSize: config.minimumCohortSize,
      statisticBasis:
        'One value per employee: their most recent eligible assessment in the window. ' +
        'Earlier assessments are kept for trend history but do not count towards the benchmark.',
      engineVersion: BENCHMARK_ENGINE_VERSION,
    },
    values,
    calculatedAt: (options.now ?? new Date()).toISOString(),
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Absolute band – based on FocusiQ expectations, never on the cohort
// ---------------------------------------------------------------------------

export interface AbsoluteBandResult {
  band: AbsoluteBand | null;
  /** 'not_configured' until expectation thresholds exist for the metric. */
  status: 'validated' | 'provisional' | 'not_configured';
  thresholdsVersion: string | null;
}

export function absoluteBandFor(metric: MetricDefinition, value: number): AbsoluteBandResult {
  const t = metric.absoluteBands;
  if (!t) return { band: null, status: 'not_configured', thresholdsVersion: null };
  let band: AbsoluteBand;
  if (metric.higherIsBetter) {
    band = value >= t.strong ? 'Strong' : value < t.development ? 'Development Opportunity' : 'Expected / Typical';
  } else {
    band = value <= t.strong ? 'Strong' : value > t.development ? 'Development Opportunity' : 'Expected / Typical';
  }
  return { band, status: t.validated ? 'validated' : 'provisional', thresholdsVersion: t.version };
}

// ---------------------------------------------------------------------------
// Relative position (§157) and robust outliers (§181)
// ---------------------------------------------------------------------------

/** Everything needed to reproduce / explain a comparison, stored with each result. */
export interface ComparisonContext {
  populationLabel: string;
  /** People the subject was compared against (subject removed). */
  comparisonPopulationSize: number;
  /** Eligible employees in the benchmark (including the subject, if eligible). */
  eligibleEmployees: number;
  counts: PopulationCounts;
  confidence: Confidence;
  benchmarkCalculatedAt: string;
  engineVersion: string;
  assessmentVersions: string[];
  scoringVersions: string[];
}

export interface OutlierFlag {
  /** Internal label. Means ONLY "statistically unusual compared with the eligible comparison group". */
  label: 'Significant Outlier';
  method: 'mad' | 'iqr' | 'sd';
  direction: 'above' | 'below';
  /** Modified z (MAD), fence distance in IQRs (IQR) or z (SD). */
  score: number;
  description: string;
}

export const OUTLIER_MEANING =
  'Statistically unusual compared with the eligible comparison group. ' +
  'This does not indicate poor performance or problematic behaviour – review the context.';

export interface BenchmarkPosition {
  metricKey: string;
  value: number;
  /** Is the behaviour effective? */
  absolute: AbsoluteBandResult;
  /** How does it compare with the selected cohort? Director-only context. */
  percentile: number | null;
  differenceFromMedian: number | null;
  /** Shown for analytics only; not used for outlier decisions. */
  zScore: number | null;
  outlier: OutlierFlag | null;
  /** Why outlier detection did not run, if it didn't. */
  outlierSuppressed?: string;
  adjustedAssessment: boolean;
  comparison: ComparisonContext;
  /** e.g. "Decision Efficiency: 78 – Strong. Sales percentile: 41st." */
  summary: string;
  /** Extra context when absolute and relative positions diverge. */
  context: string | null;
}

export function ordinal(n: number): string {
  const r = Math.round(n);
  const mod100 = r % 100;
  const suffix =
    mod100 >= 11 && mod100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[r % 10] ?? 'th';
  return `${r}${suffix}`;
}

/**
 * Robust outlier test of `value` against a comparison group (subject excluded).
 * Default method is the modified z-score using the Median Absolute Deviation;
 * when MAD is zero it falls back to IQR fences. Suppressed for small groups.
 */
export function assessOutlier(
  metric: MetricDefinition,
  value: number,
  comparison: readonly number[],
  config: BenchmarkConfig,
): { flag: OutlierFlag | null; suppressed?: string } {
  const o = config.outliers;
  if (comparison.length < o.minimumCohortSize) {
    return {
      flag: null,
      suppressed: `Outlier detection needs at least ${o.minimumCohortSize} people in the comparison group.`,
    };
  }
  const med = median(comparison);
  const build = (method: OutlierFlag['method'], score: number): OutlierFlag => {
    const direction = value > med ? 'above' : 'below';
    return {
      label: 'Significant Outlier',
      method,
      direction,
      score: round(score, 1),
      description: `${metric.label}: statistically unusual (${direction} the eligible comparison group). ${OUTLIER_MEANING}`,
    };
  };
  const iqrTest = () => {
    const q1 = quantile(comparison, 0.25);
    const q3 = quantile(comparison, 0.75);
    const iqr = q3 - q1;
    if (iqr === 0) return { flag: null, suppressed: 'Too little variation in the group to assess unusual results.' };
    const lo = q1 - o.iqrMultiplier * iqr;
    const hi = q3 + o.iqrMultiplier * iqr;
    if (value >= lo && value <= hi) return { flag: null };
    const distance = (value > hi ? value - q3 : q1 - value) / iqr;
    return { flag: build('iqr', distance) };
  };

  if (o.method === 'sd') {
    const z = zScore(value, mean(comparison), standardDeviation(comparison));
    return { flag: Math.abs(z) >= o.sdThreshold ? build('sd', Math.abs(z)) : null };
  }
  if (o.method === 'iqr') return iqrTest();
  const mad = medianAbsoluteDeviation(comparison);
  if (mad === 0) return iqrTest();
  const modifiedZ = (0.6745 * (value - med)) / mad;
  return { flag: Math.abs(modifiedZ) >= o.madThreshold ? build('mad', Math.abs(modifiedZ)) : null };
}

/**
 * Position a value. The subject's own result is removed from the comparison
 * population so they are compared with colleagues only.
 */
export function positionAgainst(
  benchmark: BenchmarkResult,
  metric: MetricDefinition,
  value: number,
  subjectEmployeeId?: string,
  configOverrides?: Partial<BenchmarkConfig>,
  subjectAssessmentAdjusted = false,
): BenchmarkPosition {
  const config = resolveConfig(configOverrides);
  const others = benchmark.values
    .filter((v) => v.employeeId !== subjectEmployeeId)
    .map((v) => v.value);
  const absolute = absoluteBandFor(metric, value);
  const comparison: ComparisonContext = {
    populationLabel: benchmark.explanation.populationLabel,
    comparisonPopulationSize: others.length,
    eligibleEmployees: benchmark.explanation.counts.eligibleEmployees,
    counts: benchmark.explanation.counts,
    confidence: confidenceFor(others.length, config),
    benchmarkCalculatedAt: benchmark.calculatedAt,
    engineVersion: benchmark.explanation.engineVersion,
    assessmentVersions: benchmark.explanation.assessmentVersions,
    scoringVersions: benchmark.explanation.scoringVersions,
  };
  const comparable = benchmark.available && others.length >= config.minimumCohortSize;

  let percentile: number | null = null;
  let differenceFromMedian: number | null = null;
  let z: number | null = null;
  let outlier: OutlierFlag | null = null;
  let outlierSuppressed: string | undefined;
  if (comparable) {
    percentile = round(percentileRank(value, others), 0);
    differenceFromMedian = value - median(others);
    z = round(zScore(value, mean(others), standardDeviation(others)), 2);
    const o = assessOutlier(metric, value, others, config);
    outlier = o.flag;
    outlierSuppressed = o.suppressed;
  } else {
    outlierSuppressed = 'No valid comparison group.';
  }

  const bandText = absolute.band
    ? `${absolute.band}${absolute.status === 'provisional' ? ' (provisional expectations)' : ''}`
    : 'no expectation band configured';
  const pctText =
    percentile !== null
      ? `${comparison.populationLabel} percentile: ${ordinal(percentile)} (compared with ${others.length} colleagues, ${comparison.confidence} confidence).`
      : `${comparison.populationLabel} comparison: ${benchmark.unavailableReason ?? INSUFFICIENT_DATA_MESSAGE}`;
  const summary = `${metric.label}: ${round(value, 1)} – ${bandText}. ${pctText}`;

  let context: string | null = null;
  if (percentile !== null && absolute.band) {
    // "Better than colleagues" in the metric's own direction.
    const favourable = metric.higherIsBetter ? percentile : 100 - percentile;
    if (absolute.band === 'Strong' && favourable < 50) {
      context = 'Strong result in absolute terms; the comparison group is also performing strongly overall.';
    } else if (absolute.band === 'Development Opportunity' && favourable >= 50) {
      context =
        "Above most colleagues, but below FocusiQ expectations – the group's overall level may need attention.";
    }
  }

  return {
    metricKey: metric.key,
    value,
    absolute,
    percentile,
    differenceFromMedian,
    zScore: z,
    outlier,
    ...(outlierSuppressed ? { outlierSuppressed } : {}),
    adjustedAssessment: subjectAssessmentAdjusted,
    comparison,
    summary,
    context,
  };
}

/** §181 – every Significant Outlier in a benchmark, each tested against the others (leave-one-out). */
export function detectOutliers(
  benchmark: BenchmarkResult,
  metric: MetricDefinition,
  configOverrides?: Partial<BenchmarkConfig>,
): { employeeId: string; value: number; flag: OutlierFlag }[] {
  const config = resolveConfig(configOverrides);
  if (!benchmark.available) return [];
  const out: { employeeId: string; value: number; flag: OutlierFlag }[] = [];
  for (const v of benchmark.values) {
    const others = benchmark.values.filter((x) => x.employeeId !== v.employeeId).map((x) => x.value);
    const { flag } = assessOutlier(metric, v.value, others, config);
    if (flag) out.push({ employeeId: v.employeeId, value: v.value, flag });
  }
  return out;
}

// ---------------------------------------------------------------------------
// §160 Benchmark by dimension
// ---------------------------------------------------------------------------

export interface DimensionComparisonRow {
  metricKey: string;
  metricLabel: string;
  employeeValue: number | null;
  benchmarkMedian: number | null;
  position: BenchmarkPosition | null;
  benchmark: BenchmarkComputation;
}

export function compareEmployeeByDimension(
  data: BenchmarkDataset,
  employeeId: string,
  definition: PopulationDefinition,
  metricKeys: readonly string[],
  options: BenchmarkOptions = {},
): DimensionComparisonRow[] {
  const subject = latestEligibleAssessment(data.assessments, employeeId, data.eligibility, true);
  return metricKeys.map((key) => {
    const metric = getMetric(data, key);
    const benchmark = computeBenchmark(data, definition, key, options);
    const value =
      (subject ? scoreOf(subject, key, benchmark.explanation.normalisation !== 'none') : undefined) ?? null;
    return {
      metricKey: key,
      metricLabel: metric.label,
      employeeValue: value,
      benchmarkMedian: benchmark.stats?.median ?? null,
      position:
        value === null
          ? null
          : positionAgainst(
              benchmark,
              metric,
              value,
              employeeId,
              options.config,
              subject ? (data.eligibility.adjustments?.has(subject.id) ?? false) : false,
            ),
      benchmark,
    };
  });
}

/**
 * Most recent valid assessment for an employee. With `ignoreEmployeeExclusion`
 * the person's own result is still shown even if they are excluded from
 * *population* benchmarks – exclusion never hides someone's own history.
 */
export function latestEligibleAssessment(
  assessments: readonly Assessment[],
  employeeId: string,
  eligibility: EligibilityState,
  ignoreEmployeeExclusion = false,
): Assessment | undefined {
  return assessments
    .filter((a) => a.employeeId === employeeId && a.complete)
    .filter((a) => validityOf(a, eligibility) !== 'invalidated')
    .filter((a) => !eligibility.assessments.has(a.id))
    .filter((a) => ignoreEmployeeExclusion || !eligibility.employees.has(employeeId))
    .sort((x, y) => x.completedAt.localeCompare(y.completedAt))
    .at(-1);
}

// ---------------------------------------------------------------------------
// §182 Benchmark exclusion preview
// ---------------------------------------------------------------------------

export interface ExclusionPreview {
  current: BenchmarkComputation;
  withoutSelected: BenchmarkComputation;
  medianChange: number | null;
  meanChange: number | null;
  /** True when excluding the record moves the median by ≥ 1 point or changes availability. */
  material: boolean;
  summary: string;
}

export function previewExclusion(
  data: BenchmarkDataset,
  definition: PopulationDefinition,
  metricKey: string,
  selection: { employeeIds?: string[]; assessmentIds?: string[] },
  options: BenchmarkOptions = {},
): ExclusionPreview {
  const current = computeBenchmark(data, definition, metricKey, options);
  const placeholder = {
    reason: 'other' as const,
    note: 'Exclusion preview',
    excludedBy: 'preview',
    excludedAt: new Date(0).toISOString(),
  };
  const employees = new Map(data.eligibility.employees);
  const assessments = new Map(data.eligibility.assessments);
  for (const id of selection.employeeIds ?? []) employees.set(id, placeholder);
  for (const id of selection.assessmentIds ?? []) assessments.set(id, placeholder);
  const withoutSelected = computeBenchmark(
    { ...data, eligibility: { ...data.eligibility, employees, assessments } },
    definition,
    metricKey,
    options,
  );
  const medianChange =
    current.stats && withoutSelected.stats ? withoutSelected.stats.median - current.stats.median : null;
  const meanChange =
    current.stats && withoutSelected.stats ? withoutSelected.stats.mean - current.stats.mean : null;
  const material =
    current.available !== withoutSelected.available ||
    (medianChange !== null && Math.abs(medianChange) >= 1);

  const fmt = (b: BenchmarkComputation) => (b.stats ? String(round(b.stats.median, 1)) : 'unavailable');
  let summary = `Current benchmark (median): ${fmt(current)}. Without selected record: ${fmt(withoutSelected)}.`;
  if (current.available && !withoutSelected.available) {
    summary += ' Excluding this record would leave too few people for a meaningful benchmark.';
  } else if (material) {
    summary += ' This record materially affects the benchmark.';
  }
  return { current, withoutSelected, medianChange, meanChange, material, summary };
}

// ---------------------------------------------------------------------------
// §193 Employee-facing result (absolute band only – no percentiles or ranks)
// ---------------------------------------------------------------------------

export interface EmployeeFacingResult {
  metricLabel: string;
  band: AbsoluteBand | null;
  message: string | null;
}

const EMPLOYEE_BAND_MESSAGES: Record<AbsoluteBand, string> = {
  Strong: 'A strength',
  'Expected / Typical': 'Within the expected range',
  'Development Opportunity': 'A development opportunity',
};

export function employeeFacingResult(metric: MetricDefinition, value: number): EmployeeFacingResult {
  const { band } = absoluteBandFor(metric, value);
  return { metricLabel: metric.label, band, message: band ? EMPLOYEE_BAND_MESSAGES[band] : null };
}
