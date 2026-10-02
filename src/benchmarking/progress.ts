/**
 * Change over time: ME vs ME (§150, §172), re-test comparison (§187),
 * coaching effectiveness (§173), benchmark history (§188) and team
 * development before/after analysis (§189).
 */
import {
  computeBenchmark,
  positionAgainst,
  type BenchmarkOptions,
  type BenchmarkPosition,
  ordinal as ordinalOf,
} from './benchmark.js';
import { resolveConfig } from './config.js';
import { validityOf, type BenchmarkDataset } from './population.js';
import { cohensD, mean, median, round, welchTTest } from './stats.js';
import {
  RESULT_COMPROMISING_REASONS,
  type Assessment,
  type MetricDefinition,
  type PopulationDefinition,
} from './types.js';

function metricOf(data: BenchmarkDataset, key: string): MetricDefinition {
  const m = data.metrics.find((x) => x.key === key);
  if (!m) throw new Error(`Unknown metric: ${key}`);
  return m;
}

/**
 * Trend history = ALL valid assessments for the person, regardless of
 * benchmark eligibility. Benchmark exclusions (test account, pilot user,
 * reasonable adjustment…) do not hide someone's own history; only results
 * that are not genuine measurements are left out (incomplete, invalidated,
 * technical failure, duplicate).
 */
export function personalHistory(data: BenchmarkDataset, employeeId: string): Assessment[] {
  return data.assessments
    .filter((a) => a.employeeId === employeeId && a.complete)
    .filter((a) => validityOf(a, data.eligibility) !== 'invalidated')
    .filter((a) => {
      const exclusion = data.eligibility.assessments.get(a.id);
      return !exclusion || !RESULT_COMPROMISING_REASONS.includes(exclusion.reason);
    })
    .sort((x, y) => x.completedAt.localeCompare(y.completedAt));
}

export function formatChange(metric: MetricDefinition, change: number): string {
  const sign = change > 0 ? '+' : change < 0 ? '−' : '±';
  const abs = round(Math.abs(change), 1);
  if (metric.unit === 'percent' || metric.unit === 'rate') return `${sign}${abs} percentage points`;
  if (metric.unit === 'seconds') return `${sign}${formatDuration(Math.abs(change))}`;
  return `${sign}${abs}`;
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`;
}

export interface PersonalTrendPoint {
  assessmentId: string;
  completedAt: string;
  version: string;
  value: number;
}

export interface PersonalImprovement {
  metricKey: string;
  metricLabel: string;
  series: PersonalTrendPoint[];
  previous: number | null;
  current: number | null;
  change: number | null;
  changeLabel: string | null;
  /** Change oriented so positive is always an improvement. */
  improvement: number | null;
  direction: 'improved' | 'declined' | 'unchanged' | null;
  /** Warns when previous and current used different assessment versions. */
  versionWarning?: string;
}

/** §172 – ME vs ME. */
export function personalImprovement(
  data: BenchmarkDataset,
  employeeId: string,
  metricKey: string,
): PersonalImprovement {
  const metric = metricOf(data, metricKey);
  const series = personalHistory(data, employeeId)
    .filter((a) => Number.isFinite(a.scores[metricKey]))
    .map((a) => ({
      assessmentId: a.id,
      completedAt: a.completedAt,
      version: a.version,
      value: a.scores[metricKey]!,
    }));
  const cur = series.at(-1);
  const prev = series.at(-2);
  if (!cur || !prev) {
    return {
      metricKey,
      metricLabel: metric.label,
      series,
      previous: prev?.value ?? null,
      current: cur?.value ?? null,
      change: null,
      changeLabel: null,
      improvement: null,
      direction: null,
    };
  }
  const change = cur.value - prev.value;
  const improvement = metric.higherIsBetter ? change : -change;
  return {
    metricKey,
    metricLabel: metric.label,
    series,
    previous: prev.value,
    current: cur.value,
    change,
    changeLabel: formatChange(metric, change),
    improvement,
    direction: improvement > 0 ? 'improved' : improvement < 0 ? 'declined' : 'unchanged',
    ...(prev.version !== cur.version
      ? {
          versionWarning: `Previous (${prev.version}) and current (${cur.version}) assessments used different versions.`,
        }
      : {}),
  };
}

export interface RetestComparison extends PersonalImprovement {
  benchmarkMedian: number | null;
  benchmarkDifference: number | null;
  /** Absolute band, percentile and comparison context for the current result. */
  position: BenchmarkPosition | null;
  interpretation: string;
}

/** §187 – Previous / Current / Difference / Benchmark Difference. */
export function retestComparison(
  data: BenchmarkDataset,
  employeeId: string,
  metricKey: string,
  benchmarkDefinition: PopulationDefinition,
  options: BenchmarkOptions = {},
): RetestComparison {
  const metric = metricOf(data, metricKey);
  const base = personalImprovement(data, employeeId, metricKey);
  const benchmark = computeBenchmark(data, benchmarkDefinition, metricKey, options);
  const position =
    base.current === null
      ? null
      : positionAgainst(benchmark, metric, base.current, employeeId, options.config);
  const benchmarkMedian = benchmark.stats?.median ?? null;

  const parts: string[] = [];
  if (base.change !== null) {
    const amount = formatChange(metric, Math.abs(base.change)).replace(/^[+−±]/, '');
    if (base.direction === 'improved') parts.push(`Improvement of ${amount}`);
    else if (base.direction === 'declined') parts.push(`Decrease of ${amount}`);
    else parts.push('No change since the previous assessment');
  } else {
    parts.push('No previous assessment to compare against');
  }
  if (position?.absolute.band) parts.push(`current result is ${position.absolute.band}`);
  if (position?.percentile !== null && position?.percentile !== undefined) {
    parts.push(`${position.comparison.populationLabel} percentile ${ordinalOf(position.percentile)}`);
  } else if (!benchmark.available) {
    parts.push(benchmark.unavailableReason ?? 'benchmark unavailable');
  }

  return {
    ...base,
    benchmarkMedian,
    benchmarkDifference:
      base.current !== null && benchmarkMedian !== null ? base.current - benchmarkMedian : null,
    position,
    interpretation: `${parts.join('; ')}.`,
  };
}

// ---------------------------------------------------------------------------
// §173 Coaching effectiveness
// ---------------------------------------------------------------------------

export interface DevelopmentAction {
  id: string;
  employeeId: string;
  /** e.g. "Reduce unnecessary checking" */
  focus: string;
  metricKey: string;
  /** ISO date coaching started. */
  assignedAt: string;
}

export interface CoachingEffectiveness {
  action: DevelopmentAction;
  before: { assessmentId: string; value: number; completedAt: string } | null;
  after: { assessmentId: string; value: number; completedAt: string } | null;
  change: number | null;
  relativeChange: number | null;
  /** Change in units of the cohort SD (if a reference SD is supplied). */
  standardisedChange: number | null;
  verdict:
    | 'Significant behavioural improvement observed.'
    | 'Moderate behavioural improvement observed.'
    | 'No material change observed.'
    | 'Behaviour has moved away from the development focus.'
    | 'Insufficient evidence – a before and after assessment are both required.';
}

export function coachingEffectiveness(
  data: BenchmarkDataset,
  action: DevelopmentAction,
  referenceSd?: number,
): CoachingEffectiveness {
  const metric = metricOf(data, action.metricKey);
  const history = personalHistory(data, action.employeeId).filter((a) =>
    Number.isFinite(a.scores[action.metricKey]),
  );
  const pick = (a: Assessment | undefined) =>
    a ? { assessmentId: a.id, value: a.scores[action.metricKey]!, completedAt: a.completedAt } : null;
  const before = pick(history.filter((a) => a.completedAt < action.assignedAt).at(-1));
  const after = pick(history.filter((a) => a.completedAt >= action.assignedAt).at(-1));
  if (!before || !after) {
    return {
      action,
      before,
      after,
      change: null,
      relativeChange: null,
      standardisedChange: null,
      verdict: 'Insufficient evidence – a before and after assessment are both required.',
    };
  }
  const change = after.value - before.value;
  const improvement = metric.higherIsBetter ? change : -change;
  const relativeChange = before.value === 0 ? null : improvement / Math.abs(before.value);
  const standardisedChange = referenceSd && referenceSd > 0 ? improvement / referenceSd : null;
  const strength = standardisedChange ?? (relativeChange !== null ? relativeChange * 4 : 0);
  // Thresholds: ≥ 1 SD (or ≥ 25 % relative) significant; ≥ 0.4 SD (or ≥ 10 %) moderate.
  let verdict: CoachingEffectiveness['verdict'];
  if (strength >= 1) verdict = 'Significant behavioural improvement observed.';
  else if (strength >= 0.4) verdict = 'Moderate behavioural improvement observed.';
  else if (strength <= -0.4) verdict = 'Behaviour has moved away from the development focus.';
  else verdict = 'No material change observed.';
  return { action, before, after, change, relativeChange, standardisedChange, verdict };
}

// ---------------------------------------------------------------------------
// §188 Benchmark history
// ---------------------------------------------------------------------------

export interface BenchmarkPeriod {
  label: string;
  from: string;
  to: string;
}

export interface BenchmarkHistoryPoint {
  period: BenchmarkPeriod;
  available: boolean;
  median: number | null;
  mean: number | null;
  sampleSize: number;
  confidence: string;
}

export function benchmarkHistory(
  data: BenchmarkDataset,
  base: Omit<PopulationDefinition, 'window'>,
  metricKey: string,
  periods: readonly BenchmarkPeriod[],
  options: BenchmarkOptions = {},
): BenchmarkHistoryPoint[] {
  return periods.map((period) => {
    const b = computeBenchmark(
      data,
      { ...base, window: { kind: 'range', from: period.from, to: period.to } },
      metricKey,
      options,
    );
    return {
      period,
      available: b.available,
      median: b.stats?.median ?? null,
      mean: b.stats?.mean ?? null,
      sampleSize: b.explanation.sampleSize,
      confidence: b.confidence,
    };
  });
}

// ---------------------------------------------------------------------------
// §189 Team development effectiveness (before vs after an initiative)
// ---------------------------------------------------------------------------

export interface InitiativeComparison {
  initiative: string;
  metricKey: string;
  before: { n: number; median: number | null; mean: number | null };
  after: { n: number; median: number | null; mean: number | null };
  /** Positive = improvement in the desired direction. */
  medianImprovement: number | null;
  effectSize: number | null;
  pValue: number | null;
  summary: string;
}

export function initiativeComparison(
  data: BenchmarkDataset,
  base: Omit<PopulationDefinition, 'window'>,
  metricKey: string,
  initiative: { name: string; before: BenchmarkPeriod; after: BenchmarkPeriod },
  options: BenchmarkOptions = {},
): InitiativeComparison {
  const config = resolveConfig(options.config);
  const metric = metricOf(data, metricKey);
  const run = (p: BenchmarkPeriod) =>
    computeBenchmark(data, { ...base, window: { kind: 'range', from: p.from, to: p.to } }, metricKey, options);
  const b = run(initiative.before);
  const a = run(initiative.after);
  const bv = b.values.map((v) => v.value);
  const av = a.values.map((v) => v.value);
  const sign = metric.higherIsBetter ? 1 : -1;
  const enough = bv.length >= config.minimumCohortSize && av.length >= config.minimumCohortSize;
  const medianImprovement = enough ? sign * (median(av) - median(bv)) : null;
  const effectSize = enough ? sign * cohensD(bv, av) : null;
  const pValue = enough ? welchTTest(bv, av).p : null;

  let summary: string;
  if (!enough) {
    summary = 'Insufficient comparison data before and/or after the initiative.';
  } else if (pValue !== null && pValue < config.correlationAlpha && medianImprovement! > 0) {
    summary = `${metric.label} improved after ${initiative.name} (median ${formatChange(metric, sign * medianImprovement!)}).`;
  } else if (pValue !== null && pValue < config.correlationAlpha && medianImprovement! < 0) {
    summary = `${metric.label} declined after ${initiative.name}.`;
  } else {
    summary = `No clear change in ${metric.label} has yet been observed after ${initiative.name}.`;
  }
  summary += ' Other factors may also have changed over the same period.';

  return {
    initiative: initiative.name,
    metricKey,
    before: { n: bv.length, median: bv.length ? median(bv) : null, mean: bv.length ? mean(bv) : null },
    after: { n: av.length, median: av.length ? median(av) : null, mean: av.length ? mean(av) : null },
    medianImprovement,
    effectSize,
    pValue,
    summary,
  };
}
