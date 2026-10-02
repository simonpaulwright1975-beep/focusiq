/**
 * Benchmark freeze (§171), saved snapshot reports (§196) and the population
 * change / data-integrity warning (§197).
 */
import type { BenchmarkComputation } from './benchmark.js';
import { resolveConfig, type BenchmarkConfig } from './config.js';
import { round } from './stats.js';
import type { Actor, PopulationDefinition } from './types.js';

/** Mirrors the `benchmark_snapshots` table (§202). */
export interface BenchmarkSnapshot {
  id: string;
  name: string;
  createdBy: string;
  createdAt: string;
  populationDefinition: PopulationDefinition;
  assessmentVersions: string[];
  /** Exact employees / assessments used, so the snapshot is reproducible. */
  members: { employeeId: string; assessmentIds: string[] }[];
  /** Exclusions in force at the time, by reason. */
  exclusions: BenchmarkComputation['explanation']['counts'];
  metrics: Record<
    string,
    {
      label: string;
      available: boolean;
      stats: BenchmarkComputation['stats'];
      confidence: BenchmarkComputation['confidence'];
      sampleSizeLabel: string;
      values: { employeeId: string; value: number }[];
    }
  >;
}

export function createSnapshot(
  actor: Actor,
  name: string,
  benchmarks: readonly BenchmarkComputation[],
  options: { id?: string; now?: Date } = {},
): BenchmarkSnapshot {
  if (benchmarks.length === 0) throw new Error('A snapshot needs at least one benchmark.');
  const first = benchmarks[0]!;
  const members = new Map<string, Set<string>>();
  const versions = new Set<string>();
  for (const b of benchmarks) {
    b.explanation.assessmentVersions.forEach((v) => versions.add(v));
    for (const v of b.values) {
      const set = members.get(v.employeeId) ?? new Set<string>();
      v.assessmentIds.forEach((id) => set.add(id));
      members.set(v.employeeId, set);
    }
  }
  const snapshot: BenchmarkSnapshot = {
    id: options.id ?? globalThis.crypto.randomUUID(),
    name,
    createdBy: actor.id,
    createdAt: (options.now ?? new Date()).toISOString(),
    populationDefinition: structuredClone(first.explanation.definition),
    assessmentVersions: [...versions].sort(),
    members: [...members].map(([employeeId, ids]) => ({ employeeId, assessmentIds: [...ids].sort() })),
    exclusions: structuredClone(first.explanation.counts),
    metrics: Object.fromEntries(
      benchmarks.map((b) => [
        b.metricKey,
        {
          label: b.metricLabel,
          available: b.available,
          stats: b.stats ? { ...b.stats } : null,
          confidence: b.confidence,
          sampleSizeLabel: b.sampleSizeLabel,
          values: b.values.map((v) => ({ employeeId: v.employeeId, value: v.value })),
        },
      ]),
    ),
  };
  return deepFreeze(snapshot);
}

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object') {
    Object.values(o as Record<string, unknown>).forEach(deepFreeze);
    Object.freeze(o);
  }
  return o;
}

/** §171 – "View Against Current Benchmark". */
export interface FrozenVsCurrent {
  metricKey: string;
  frozenMedian: number | null;
  currentMedian: number | null;
  change: number | null;
  integrity: PopulationChange;
  summary: string;
}

export function compareFrozenToCurrent(
  snapshot: BenchmarkSnapshot,
  current: BenchmarkComputation,
  configOverrides?: Partial<BenchmarkConfig>,
): FrozenVsCurrent {
  const frozen = snapshot.metrics[current.metricKey];
  const frozenMedian = frozen?.stats?.median ?? null;
  const currentMedian = current.stats?.median ?? null;
  const change =
    frozenMedian !== null && currentMedian !== null ? currentMedian - frozenMedian : null;
  const integrity = populationChange(
    {
      definition: snapshot.populationDefinition,
      employeeIds: snapshot.members.map((m) => m.employeeId),
      versions: snapshot.assessmentVersions,
    },
    {
      definition: current.explanation.definition,
      employeeIds: current.values.map((v) => v.employeeId),
      versions: current.explanation.assessmentVersions,
    },
    configOverrides,
  );
  const fmt = (v: number | null) => (v === null ? 'unavailable' : String(round(v, 1)));
  return {
    metricKey: current.metricKey,
    frozenMedian,
    currentMedian,
    change,
    integrity,
    summary:
      `Benchmark at time of report (${snapshot.createdAt.slice(0, 10)}): ${fmt(frozenMedian)}. ` +
      `Current benchmark: ${fmt(currentMedian)}.` +
      (integrity.warning ? ` ${integrity.warning}` : ''),
  };
}

// ---------------------------------------------------------------------------
// §197 Benchmark data integrity warning
// ---------------------------------------------------------------------------

export interface PopulationShape {
  definition: PopulationDefinition;
  employeeIds: readonly string[];
  versions: readonly string[];
}

export interface PopulationChange {
  /** Jaccard overlap of the people in each population (1 = identical). */
  memberOverlap: number;
  definitionChanged: boolean;
  versionsChanged: boolean;
  significant: boolean;
  warning: string | null;
}

export const POPULATION_CHANGED_WARNING =
  'Benchmark population changed. Historical comparisons may not be directly equivalent.';

/** Population definitions ignoring the time window and reference date. */
function comparableDefinition(d: PopulationDefinition): string {
  const { window: _w, asOf: _a, ...rest } = d;
  return JSON.stringify(sortDeep(rest));
}

export function populationChange(
  before: PopulationShape,
  after: PopulationShape,
  configOverrides?: Partial<BenchmarkConfig>,
): PopulationChange {
  const config = resolveConfig(configOverrides);
  const a = new Set(before.employeeIds);
  const b = new Set(after.employeeIds);
  const union = new Set([...a, ...b]);
  let shared = 0;
  for (const id of a) if (b.has(id)) shared++;
  const memberOverlap = union.size === 0 ? 1 : shared / union.size;
  const definitionChanged =
    comparableDefinition(before.definition) !== comparableDefinition(after.definition);
  const versionsChanged =
    [...before.versions].sort().join('|') !== [...after.versions].sort().join('|');
  const significant =
    definitionChanged || versionsChanged || memberOverlap < config.populationChangeWarningOverlap;
  return {
    memberOverlap: round(memberOverlap, 2),
    definitionChanged,
    versionsChanged,
    significant,
    warning: significant ? POPULATION_CHANGED_WARNING : null,
  };
}

function sortDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>)
        .sort(([x], [y]) => x.localeCompare(y))
        .map(([k, val]) => [k, sortDeep(val)]),
    );
  }
  return v;
}
