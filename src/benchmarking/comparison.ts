/**
 * Director-only employee comparison (§161–§164, §176–§177, §186, §191, §194).
 *
 * There is intentionally no "overall score" and no "best/worst" output:
 * every comparison shows the full dimension profile in context.
 */
import { assertCanViewDirectorComparisons } from './audit.js';
import { latestEligibleAssessment } from './benchmark.js';
import type { BenchmarkDataset } from './population.js';
import { percentileRank, round } from './stats.js';
import type { Actor, Assessment, MetricDefinition } from './types.js';

export interface ComparisonOptions {
  /** §164 – hide people from this view without touching benchmark eligibility. */
  hiddenEmployeeIds?: readonly string[];
  /** §186 – show "Employee A/B/C" until names are revealed. */
  blind?: boolean;
  /** Seed for the blind ordering so labels are stable but don't follow the selection order. */
  blindSeed?: string;
  /** Specific assessment per employee; defaults to latest valid one. */
  assessmentIds?: Readonly<Record<string, string>>;
}

export interface ComparisonColumn {
  /** Only populated when not blind. */
  employeeId: string | null;
  label: string;
  assessmentId: string | null;
  assessmentDate: string | null;
  values: Record<string, number | null>;
}

export interface EmployeeComparison {
  metrics: { key: string; label: string; unit: MetricDefinition['unit'] }[];
  columns: ComparisonColumn[];
  blind: boolean;
  /** Mapping kept server-side/in memory; used by `revealNames`. */
  readonly revealKey: ReadonlyMap<string, string>;
  /** §176 behavioural interpretation, only when exactly two people are compared. */
  interpretation: string[];
}

/** Deterministic string hash (FNV-1a) for seeded shuffling. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function blindLabel(index: number): string {
  let n = index;
  let s = '';
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return `Employee ${s}`;
}

/** §161 / §162 side-by-side and multi-employee comparison. */
export function compareEmployees(
  actor: Actor,
  data: BenchmarkDataset,
  employeeIds: readonly string[],
  metricKeys: readonly string[],
  options: ComparisonOptions = {},
): EmployeeComparison {
  assertCanViewDirectorComparisons(actor);
  const hidden = new Set(options.hiddenEmployeeIds ?? []);
  let ids = employeeIds.filter((id) => !hidden.has(id));
  const employeesById = new Map(data.employees.map((e) => [e.id, e]));
  const metrics = metricKeys.map((k) => {
    const m = data.metrics.find((x) => x.key === k);
    if (!m) throw new Error(`Unknown metric: ${k}`);
    return m;
  });

  if (options.blind) {
    const seed = options.blindSeed ?? 'focusiq';
    ids = [...ids].sort((a, b) => hash(seed + a) - hash(seed + b));
  }

  const revealKey = new Map<string, string>();
  const columns: ComparisonColumn[] = ids.map((id, i) => {
    const explicit = options.assessmentIds?.[id];
    const assessment: Assessment | undefined = explicit
      ? data.assessments.find((a) => a.id === explicit && a.employeeId === id)
      : latestEligibleAssessment(data.assessments, id, data.eligibility, true);
    const label = options.blind ? blindLabel(i) : (employeesById.get(id)?.displayName ?? id);
    revealKey.set(label, id);
    return {
      employeeId: options.blind ? null : id,
      label,
      assessmentId: assessment?.id ?? null,
      assessmentDate: assessment?.completedAt ?? null,
      values: Object.fromEntries(
        metrics.map((m) => {
          const v = assessment?.scores[m.key];
          return [m.key, Number.isFinite(v) ? v! : null];
        }),
      ),
    };
  });

  const interpretation =
    columns.length === 2 ? interpretBehaviours(columns[0]!, columns[1]!, metrics) : [];

  return {
    metrics: metrics.map((m) => ({ key: m.key, label: m.label, unit: m.unit })),
    columns,
    blind: options.blind === true,
    revealKey,
    interpretation,
  };
}

/** §186 – "Reveal Names". */
export function revealNames(actor: Actor, data: BenchmarkDataset, comparison: EmployeeComparison) {
  assertCanViewDirectorComparisons(actor);
  const employeesById = new Map(data.employees.map((e) => [e.id, e]));
  return {
    ...comparison,
    blind: false,
    columns: comparison.columns.map((c) => {
      const id = comparison.revealKey.get(c.label) ?? c.employeeId;
      const name = id ? (employeesById.get(id)?.displayName ?? id) : c.label;
      return { ...c, employeeId: id, label: comparison.blind ? `${name} (${c.label})` : name };
    }),
  };
}

// ---------------------------------------------------------------------------
// §176 Compare behaviours rather than just scores
// ---------------------------------------------------------------------------

/** Metric keys used for the behavioural interpretation, when present. */
export const BEHAVIOUR_KEYS = {
  accuracy: 'accuracy',
  responseTime: 'avg_response_seconds',
  recheckRate: 'recheck_rate',
} as const;

function interpretBehaviours(
  a: ComparisonColumn,
  b: ComparisonColumn,
  metrics: readonly MetricDefinition[],
): string[] {
  const has = (k: string) => metrics.some((m) => m.key === k);
  const acc = BEHAVIOUR_KEYS.accuracy;
  const time = BEHAVIOUR_KEYS.responseTime;
  const recheck = BEHAVIOUR_KEYS.recheckRate;
  const out: string[] = [];

  const accA = a.values[acc];
  const accB = b.values[acc];
  const similarAccuracy =
    has(acc) && accA != null && accB != null && Math.abs(accA - accB) <= 3;
  if (similarAccuracy) out.push('Both achieved similar accuracy.');
  else if (has(acc) && accA != null && accB != null) {
    const [hi, lo] = accA > accB ? [a, b] : [b, a];
    out.push(
      `${hi.label} achieved higher accuracy (${hi.values[acc]}% vs ${lo.values[acc]}%).`,
    );
  }

  const tA = a.values[time];
  const tB = b.values[time];
  const rA = a.values[recheck];
  const rB = b.values[recheck];
  if (has(time) && has(recheck) && tA != null && tB != null && rA != null && rB != null) {
    const aLeaner = tA <= tB && rA <= rB;
    const bLeaner = tB <= tA && rB <= rA;
    const leaner = aLeaner && !bLeaner ? a : bLeaner && !aLeaner ? b : null;
    const other = leaner === a ? b : a;
    if (aLeaner && bLeaner) {
      // Identical speed and review behaviour – nothing to add.
    } else if (leaner) {
      const timeGap = (other.values[time]! - leaner.values[time]!) / other.values[time]!;
      const recheckGap = other.values[recheck]! - leaner.values[recheck]!;
      if (timeGap >= 0.25 || recheckGap >= 15) {
        out.push(
          similarAccuracy
            ? `${leaner.label} reached comparable outcomes with substantially less additional review.`
            : `${leaner.label} worked faster with less re-checking; ${other.label} spent more time reviewing.`,
        );
      }
    } else {
      out.push('The two employees balance speed and review differently; neither pattern is simply better.');
    }
  }
  if (out.length > 0) {
    out.push('These describe different working styles; review the full profile before drawing conclusions.');
  }
  return out;
}

// ---------------------------------------------------------------------------
// §194 Sort by dimension (analysis, not a ranking)
// ---------------------------------------------------------------------------

export function sortByDimension<T extends { values: Record<string, number | null> }>(
  rows: readonly T[],
  metric: MetricDefinition,
  direction: 'asc' | 'desc' = 'desc',
): T[] {
  return [...rows].sort((x, y) => {
    const a = x.values[metric.key];
    const b = y.values[metric.key];
    if (a == null && b == null) return 0;
    if (a == null) return 1;
    if (b == null) return -1;
    return direction === 'desc' ? b - a : a - b;
  });
}

// ---------------------------------------------------------------------------
// §177 Focus Efficiency (optional, Director-only, never the sole score)
// ---------------------------------------------------------------------------

export interface FocusEfficiencyComponent {
  metricKey: string;
  weight: number;
}

export const DEFAULT_FOCUS_EFFICIENCY: FocusEfficiencyComponent[] = [
  { metricKey: 'accuracy', weight: 1 },
  { metricKey: 'appropriate_speed', weight: 1 },
  { metricKey: 'recheck_efficiency', weight: 1 },
  { metricKey: 'prioritisation', weight: 1 },
  { metricKey: 'task_completion', weight: 1 },
  { metricKey: 'risk_judgement', weight: 1 },
];

export interface FocusEfficiencyResult {
  employeeId: string;
  /** 0–100: weighted mean of the person's percentile on each component. */
  value: number | null;
  components: { metricKey: string; percentile: number | null }[];
  caveat: string;
}

export function focusEfficiency(
  actor: Actor,
  data: BenchmarkDataset,
  employeeIds: readonly string[],
  components: readonly FocusEfficiencyComponent[] = DEFAULT_FOCUS_EFFICIENCY,
): FocusEfficiencyResult[] {
  assertCanViewDirectorComparisons(actor);
  const latest = new Map(
    employeeIds.map((id) => [id, latestEligibleAssessment(data.assessments, id, data.eligibility)]),
  );
  const metrics = new Map(data.metrics.map((m) => [m.key, m]));
  return employeeIds.map((id) => {
    let total = 0;
    let weights = 0;
    const parts = components.map((c) => {
      const metric = metrics.get(c.metricKey);
      const own = latest.get(id)?.scores[c.metricKey];
      const pop = [...latest.values()]
        .map((a) => a?.scores[c.metricKey])
        .filter((v): v is number => Number.isFinite(v));
      if (!metric || !Number.isFinite(own) || pop.length < 2) {
        return { metricKey: c.metricKey, percentile: null };
      }
      const p = percentileRank(own!, pop);
      const oriented = metric.higherIsBetter ? p : 100 - p;
      total += oriented * c.weight;
      weights += c.weight;
      return { metricKey: c.metricKey, percentile: round(oriented, 0) };
    });
    return {
      employeeId: id,
      value: weights > 0 ? round(total / weights, 0) : null,
      components: parts,
      caveat:
        'Focus Efficiency is a supporting indicator only and must not be used as a sole performance score.',
    };
  });
}
