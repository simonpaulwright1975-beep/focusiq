/**
 * Department heatmap (§174), individual heatmap (§175) and department
 * summary (§190).
 */
import { assertCanViewDirectorComparisons } from './audit.js';
import { absoluteBandFor, benchmarkFromPopulation, expectationLevelOf, type BenchmarkOptions } from './benchmark.js';
import { resolveConfig } from './config.js';
import {
  exclusionReasonFor,
  resolvePopulation,
  type BenchmarkDataset,
} from './population.js';
import { formatChange } from './progress.js';
import { mean, percentileRank, round } from './stats.js';
import {
  DEPARTMENTS,
  type Actor,
  type Assessment,
  type AbsoluteBand,
  type Department,
  type MetricDefinition,
  type PopulationDefinition,
} from './types.js';

/** §174 column order. */
export const CORE_DIMENSIONS = [
  'think',
  'absorb',
  'remember',
  'prioritise',
  'decide',
  'act',
  'own',
  'drive',
  'complete',
  'focus',
] as const;

export interface HeatmapCell {
  metricKey: string;
  median: number | null;
  n: number;
  available: boolean;
  /** Difference from the company median (only when company-comparable). */
  vsCompany: number | null;
  companyComparable: boolean;
}

export interface DepartmentHeatmap {
  rows: { department: Department; cells: HeatmapCell[] }[];
  company: HeatmapCell[];
  metrics: { key: string; label: string }[];
}

function coreMetrics(data: BenchmarkDataset, keys?: readonly string[]): MetricDefinition[] {
  const wanted = keys ?? data.metrics.filter((m) => m.coreDimension).map((m) => m.key);
  return wanted.map((k) => {
    const m = data.metrics.find((x) => x.key === k);
    if (!m) throw new Error(`Unknown metric: ${k}`);
    return m;
  });
}

export function departmentHeatmap(
  actor: Actor,
  data: BenchmarkDataset,
  base: Omit<PopulationDefinition, 'scope'>,
  options: BenchmarkOptions & { metricKeys?: readonly string[]; departments?: readonly Department[] } = {},
): DepartmentHeatmap {
  assertCanViewDirectorComparisons(actor);
  const config = resolveConfig(options.config);
  const metrics = coreMetrics(data, options.metricKeys);
  const cellFor = (def: PopulationDefinition, metric: MetricDefinition, companyMedian: number | null) => {
    const pop = resolvePopulation(data, def, { metricKey: metric.key, now: options.now });
    const b = benchmarkFromPopulation(pop, metric, config, options);
    // A single department is always "comparable" internally; the vsCompany delta needs company comparability.
    const med = b.stats?.median ?? null;
    return {
      metricKey: metric.key,
      median: med,
      n: b.explanation.sampleSize,
      available: b.available,
      vsCompany:
        metric.companyComparable && med !== null && companyMedian !== null ? med - companyMedian : null,
      companyComparable: metric.companyComparable,
    } satisfies HeatmapCell;
  };
  const company = metrics.map((m) => cellFor({ ...base, scope: { kind: 'company' } }, m, null));
  const rows = (options.departments ?? DEPARTMENTS).map((department) => ({
    department,
    cells: metrics.map((m, i) =>
      cellFor({ ...base, scope: { kind: 'department', department } }, m, company[i]!.median),
    ),
  }));
  return { rows, company, metrics: metrics.map((m) => ({ key: m.key, label: m.label })) };
}

// ---------------------------------------------------------------------------
// §175 Individual heatmap
// ---------------------------------------------------------------------------

export interface IndividualHeatmapRow {
  employeeId: string;
  label: string;
  department: Department;
  assessmentId: string;
  completedAt: string;
  excluded: boolean;
  exclusionReason: string | null;
  values: Record<string, number | null>;
  /** Cell shading = absolute band against FocusiQ expectations (no overall score is ever produced). */
  bands: Record<string, AbsoluteBand | null>;
  /** Relative context: percentile among the included rows shown, colleague removed. */
  percentiles: Record<string, number | null>;
}

export interface IndividualHeatmapOptions {
  department?: Department;
  /** Restrict to one assessment version (§175 "Select assessment"). */
  assessmentVersion?: string;
  hiddenEmployeeIds?: readonly string[];
  sortBy?: { metricKey: string; direction: 'asc' | 'desc' };
  showExcluded?: boolean;
  includeFormer?: boolean;
  metricKeys?: readonly string[];
}

export function individualHeatmap(
  actor: Actor,
  data: BenchmarkDataset,
  options: IndividualHeatmapOptions = {},
): { metrics: { key: string; label: string }[]; rows: IndividualHeatmapRow[] } {
  assertCanViewDirectorComparisons(actor);
  const config = resolveConfig();
  const metrics = coreMetrics(data, options.metricKeys);
  const hidden = new Set(options.hiddenEmployeeIds ?? []);
  const rows: IndividualHeatmapRow[] = [];

  for (const e of data.employees) {
    if (hidden.has(e.id)) continue;
    if (options.department && e.department !== options.department) continue;
    if (e.status === 'former' && !options.includeFormer) continue;
    const latest = data.assessments
      .filter((a) => a.employeeId === e.id && a.complete)
      .filter((a) => !options.assessmentVersion || a.version === options.assessmentVersion)
      .sort((x, y) => x.completedAt.localeCompare(y.completedAt))
      .at(-1) as Assessment | undefined;
    if (!latest) continue;
    const reason = exclusionReasonFor(latest, data.eligibility) ?? (e.status === 'test' ? 'test_account' : null);
    if (reason && !options.showExcluded) continue;
    rows.push({
      employeeId: e.id,
      label: e.displayName,
      department: e.department,
      assessmentId: latest.id,
      completedAt: latest.completedAt,
      excluded: reason !== null,
      exclusionReason: reason,
      values: Object.fromEntries(
        metrics.map((m) => [m.key, Number.isFinite(latest.scores[m.key]) ? latest.scores[m.key]! : null]),
      ),
      bands: {},
      percentiles: {},
    });
  }

  const included = rows.filter((r) => !r.excluded);
  for (const m of metrics) {
    for (const r of rows) {
      const v = r.values[m.key];
      if (v === null || v === undefined) {
        r.bands[m.key] = null;
        r.percentiles[m.key] = null;
        continue;
      }
      r.bands[m.key] = absoluteBandFor(m, v, expectationLevelOf(data, r.employeeId)).band;
      const others = included
        .filter((x) => x.employeeId !== r.employeeId)
        .map((x) => x.values[m.key])
        .filter((x): x is number => x !== null && x !== undefined);
      r.percentiles[m.key] =
        others.length >= config.minimumCohortSize ? round(percentileRank(v, others), 0) : null;
    }
  }

  if (options.sortBy) {
    const { metricKey, direction } = options.sortBy;
    rows.sort((x, y) => {
      const a = x.values[metricKey];
      const b = y.values[metricKey];
      if (a == null) return 1;
      if (b == null) return -1;
      return direction === 'desc' ? b - a : a - b;
    });
  }
  return { metrics: metrics.map((m) => ({ key: m.key, label: m.label })), rows };
}

// ---------------------------------------------------------------------------
// §190 Department summary
// ---------------------------------------------------------------------------

export interface DepartmentSummary {
  department: Department;
  employeesAssessed: number;
  strongestCollectiveDimension: string | null;
  primaryDevelopmentOpportunity: string | null;
  averageAccuracy: number | null;
  averageUnnecessaryRecheckRate: number | null;
  /** Change in average accuracy since the previous period, if supplied. */
  changeSincePreviousPeriod: string | null;
  sampleSizeLabel: string;
}

export function departmentSummary(
  actor: Actor,
  data: BenchmarkDataset,
  department: Department,
  base: Omit<PopulationDefinition, 'scope'>,
  options: BenchmarkOptions & {
    metricKeys?: readonly string[];
    previousWindow?: PopulationDefinition['window'];
    accuracyKey?: string;
    recheckKey?: string;
  } = {},
): DepartmentSummary {
  assertCanViewDirectorComparisons(actor);
  const config = resolveConfig(options.config);
  const accuracyKey = options.accuracyKey ?? 'accuracy';
  const recheckKey = options.recheckKey ?? 'unnecessary_recheck_rate';
  const metrics = coreMetrics(data, options.metricKeys);
  const deptDef: PopulationDefinition = { ...base, scope: { kind: 'department', department } };
  const pop = resolvePopulation(data, deptDef, { now: options.now });
  const companyDef: PopulationDefinition = { ...base, scope: { kind: 'company' } };

  // Strength / opportunity = largest positive / negative gap against the company median,
  // using company-comparable dimensions only (§168), oriented so positive is desirable.
  const gaps: { label: string; gap: number }[] = [];
  for (const m of metrics) {
    if (!m.companyComparable) continue;
    const d = benchmarkFromPopulation(resolvePopulation(data, deptDef, { metricKey: m.key, now: options.now }), m, config);
    const c = benchmarkFromPopulation(resolvePopulation(data, companyDef, { metricKey: m.key, now: options.now }), m, config);
    if (!d.stats || !c.stats) continue;
    const gap = (d.stats.median - c.stats.median) * (m.higherIsBetter ? 1 : -1);
    gaps.push({ label: m.label, gap });
  }
  gaps.sort((a, b) => b.gap - a.gap);
  const enough = pop.counts.eligibleEmployees >= config.minimumCohortSize;

  const valuesOf = (key: string, window?: PopulationDefinition['window']) => {
    const p = window ? resolvePopulation(data, { ...deptDef, window }, { now: options.now }) : pop;
    return [...p.byEmployee.values()]
      .map((a) => a.scores[key])
      .filter((v): v is number => Number.isFinite(v));
  };
  const acc = valuesOf(accuracyKey);
  const rechecks = valuesOf(recheckKey);
  let change: string | null = null;
  if (options.previousWindow) {
    const prev = valuesOf(accuracyKey, options.previousWindow);
    const accuracyMetric = data.metrics.find((m) => m.key === accuracyKey);
    if (prev.length >= config.minimumCohortSize && acc.length >= config.minimumCohortSize && accuracyMetric) {
      change = `Accuracy ${formatChange(accuracyMetric, mean(acc) - mean(prev))} since previous period`;
    }
  }

  return {
    department,
    employeesAssessed: pop.counts.eligibleEmployees,
    strongestCollectiveDimension: enough && gaps.length ? gaps[0]!.label : null,
    primaryDevelopmentOpportunity: enough && gaps.length > 1 ? gaps.at(-1)!.label : null,
    averageAccuracy: enough && acc.length ? round(mean(acc), 1) : null,
    averageUnnecessaryRecheckRate: enough && rechecks.length ? round(mean(rechecks), 1) : null,
    changeSincePreviousPeriod: change,
    sampleSizeLabel: `Based on ${pop.counts.eligibleAssessments} eligible assessments from ${pop.counts.eligibleEmployees} employees.`,
  };
}

