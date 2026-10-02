/**
 * Benchmark calculation (§149–§160, §168, §181–§182, §192–§193).
 */
import { confidenceFor, resolveConfig, type BenchmarkConfig } from './config.js';
import {
  isCrossDepartment,
  metricComparableFor,
  resolvePopulation,
  type BenchmarkDataset,
  type ResolvedPopulation,
} from './population.js';
import { describe, mean, percentileRank, round, zScore } from './stats.js';
import type { TenureBand } from './tenure.js';
import type {
  Assessment,
  BenchmarkBand,
  BenchmarkResult,
  EligibilityState,
  MetricDefinition,
  NormalisationMethod,
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

function scoreOf(a: Assessment, key: string, normalised: boolean): number | undefined {
  const v = normalised ? a.normalisedScores?.[key] : a.scores[key];
  return Number.isFinite(v) ? v : undefined;
}

/** Combine one employee's eligible assessments into a single comparison value. */
function employeeValue(
  list: readonly Assessment[],
  key: string,
  perEmployee: PopulationDefinition['perEmployee'],
  normalised: boolean,
): number | undefined {
  const vals = list.map((a) => scoreOf(a, key, normalised)).filter((v) => v !== undefined);
  if (vals.length === 0) return undefined;
  return perEmployee === 'mean' ? mean(vals) : vals[vals.length - 1];
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
  return benchmarkFromPopulation(population, metric, config, options);
}

export function benchmarkFromPopulation(
  population: ResolvedPopulation,
  metric: MetricDefinition,
  config: BenchmarkConfig,
  options: Pick<BenchmarkOptions, 'normalisation' | 'now'> = {},
): BenchmarkComputation {
  const warnings: string[] = [];
  const all = [...population.byEmployee.values()].flat();

  let normalisation: NormalisationMethod = options.normalisation ?? 'none';
  if (normalisation !== 'none' && !all.every((a) => scoreOf(a, metric.key, true) !== undefined)) {
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

  const values: BenchmarkResult['values'] = [];
  for (const [employeeId, list] of population.byEmployee) {
    const v = employeeValue(list, metric.key, population.definition.perEmployee, useNormalised);
    if (v !== undefined) values.push({ employeeId, assessmentIds: list.map((a) => a.id), value: v });
  }

  const people = values.length;
  const comparability = metricComparableFor(metric, isCrossDepartment(population));
  const enough = people >= config.minimumCohortSize;
  const available = comparability.comparable && enough;
  const unavailableReason = !comparability.comparable
    ? comparability.reason
    : !enough
      ? INSUFFICIENT_DATA_MESSAGE
      : undefined;

  const assessments = population.counts.eligibleAssessments;
  const sampleSizeLabel =
    `Benchmark based on ${assessments} eligible assessment${assessments === 1 ? '' : 's'} ` +
    `from ${people} employee${people === 1 ? '' : 's'}.`;

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
      sampleSize: people,
      normalisation,
      dateRange: population.dateRange,
      minimumCohortSize: config.minimumCohortSize,
      statisticBasis:
        population.definition.perEmployee === 'mean'
          ? "One value per employee: the mean of their eligible assessments in the window."
          : "One value per employee: their most recent eligible assessment in the window.",
    },
    values,
    calculatedAt: (options.now ?? new Date()).toISOString(),
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Individual position against a benchmark (§157–§158, §181)
// ---------------------------------------------------------------------------

export interface BenchmarkPosition {
  value: number;
  /** §157 Director-only: share of the comparison population this result is above. */
  percentile: number | null;
  /** Percentile oriented so higher always means "more of the desired behaviour". */
  performancePercentile: number | null;
  band: BenchmarkBand | null;
  differenceFromMedian: number | null;
  zScore: number | null;
  outlier: OutlierFlag | null;
  /** People in the comparison population (excluding the subject). */
  comparisonSize: number;
}

export interface OutlierFlag {
  /** §181 – always "Significant Outlier", never "Problem Employee". */
  label: 'Significant Outlier';
  direction: 'above' | 'below';
  zScore: number;
  description: string;
}

export function bandFor(performancePercentile: number, config: BenchmarkConfig): BenchmarkBand {
  if (performancePercentile >= config.bands.aboveTypicalFrom) return 'Above Typical Range';
  if (performancePercentile < config.bands.developmentBelow) return 'Development Range';
  return 'Typical Range';
}

/**
 * Position a value against a benchmark. The subject's own record is removed
 * from the comparison population so they are compared with colleagues.
 */
export function positionAgainst(
  benchmark: BenchmarkResult,
  metric: MetricDefinition,
  value: number,
  subjectEmployeeId?: string,
  configOverrides?: Partial<BenchmarkConfig>,
): BenchmarkPosition {
  const config = resolveConfig(configOverrides);
  const others = benchmark.values
    .filter((v) => v.employeeId !== subjectEmployeeId)
    .map((v) => v.value);
  const base: BenchmarkPosition = {
    value,
    percentile: null,
    performancePercentile: null,
    band: null,
    differenceFromMedian: null,
    zScore: null,
    outlier: null,
    comparisonSize: others.length,
  };
  // When the subject is part of the population, colleagues number n − 1.
  const subjectInPopulation = benchmark.values.some((v) => v.employeeId === subjectEmployeeId);
  const needed = subjectInPopulation ? config.minimumCohortSize - 1 : config.minimumCohortSize;
  if (!benchmark.available || others.length === 0 || others.length < needed) {
    return base;
  }
  const stats = describe(others)!;
  const percentile = percentileRank(value, others);
  const performancePercentile = metric.higherIsBetter ? percentile : 100 - percentile;
  const z = zScore(value, stats.mean, stats.standardDeviation);
  return {
    ...base,
    percentile: round(percentile, 0),
    performancePercentile: round(performancePercentile, 0),
    band: bandFor(performancePercentile, config),
    differenceFromMedian: value - (benchmark.stats?.median ?? stats.median),
    zScore: round(z, 2),
    outlier: outlierFlag(metric, z, config),
  };
}

function outlierFlag(metric: MetricDefinition, z: number, config: BenchmarkConfig): OutlierFlag | null {
  if (Math.abs(z) < config.outlierZ) return null;
  const direction = z > 0 ? 'above' : 'below';
  return {
    label: 'Significant Outlier',
    direction,
    zScore: round(z, 1),
    description:
      `${metric.label}: ${round(Math.abs(z), 1)} standard deviations ${direction} ` +
      'the eligible cohort. Review the context before drawing conclusions.',
  };
}

/** §181 – every Significant Outlier inside a benchmark population. */
export function detectOutliers(
  benchmark: BenchmarkResult,
  metric: MetricDefinition,
  configOverrides?: Partial<BenchmarkConfig>,
): { employeeId: string; value: number; flag: OutlierFlag }[] {
  const config = resolveConfig(configOverrides);
  if (!benchmark.available || !benchmark.stats) return [];
  const { mean: m, standardDeviation: sd } = benchmark.stats;
  const out: { employeeId: string; value: number; flag: OutlierFlag }[] = [];
  for (const v of benchmark.values) {
    const flag = outlierFlag(metric, zScore(v.value, m, sd), config);
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
  benchmarkMean: number | null;
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
    const raw = subject ? scoreOf(subject, key, benchmark.explanation.normalisation !== 'none') : undefined;
    const value = raw ?? null;
    return {
      metricKey: key,
      metricLabel: metric.label,
      employeeValue: value,
      benchmarkMedian: benchmark.stats?.median ?? null,
      benchmarkMean: benchmark.stats?.mean ?? null,
      position:
        value === null ? null : positionAgainst(benchmark, metric, value, employeeId, options.config),
      benchmark,
    };
  });
}

/**
 * Most recent assessment for an employee. With `ignoreEmployeeExclusion` the
 * person's own (non-invalid) result is still shown even if they are excluded
 * from *population* benchmarks – exclusion never hides someone's own history.
 */
export function latestEligibleAssessment(
  assessments: readonly Assessment[],
  employeeId: string,
  eligibility: EligibilityState,
  ignoreEmployeeExclusion = false,
): Assessment | undefined {
  return assessments
    .filter((a) => a.employeeId === employeeId && a.complete)
    .filter((a) => (eligibility.validity?.get(a.id) ?? a.validity) !== 'invalidated')
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
  /** True when excluding the record moves the median by ≥ 1 point or the band cut-offs materially. */
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
// §193 Employee-facing benchmark (no percentiles, ranks or league tables)
// ---------------------------------------------------------------------------

export interface EmployeeFacingBenchmark {
  metricLabel: string;
  /** e.g. "Within typical range" */
  message: string | null;
  band: BenchmarkBand | null;
}

const EMPLOYEE_BAND_MESSAGES: Record<BenchmarkBand, string> = {
  'Above Typical Range': 'Above the typical range',
  'Typical Range': 'Within the typical range',
  'Development Range': 'A development opportunity compared with the typical range',
};

export function employeeFacingBenchmark(
  metric: MetricDefinition,
  position: BenchmarkPosition | null,
): EmployeeFacingBenchmark {
  const band = position?.band ?? null;
  return {
    metricLabel: metric.label,
    band,
    message: band ? EMPLOYEE_BAND_MESSAGES[band] : null,
  };
}
