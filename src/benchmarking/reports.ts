/**
 * Report-time benchmark freeze (§171).
 *
 * When an employee report is generated, the benchmark population, the values
 * used and every version identifier are saved with it. The report never
 * changes afterwards, even if the team grows or someone is later excluded.
 * "Compare with current benchmark" is a separate, optional view.
 */
import { assertCanViewDirectorComparisons } from './audit.js';
import {
  computeBenchmark,
  expectationLevelOf,
  getMetric,
  positionAgainst,
  type BenchmarkOptions,
  type BenchmarkPosition,
} from './benchmark.js';
import type { BenchmarkDataset } from './population.js';
import { createSnapshot, deepFreeze, populationChange, type BenchmarkSnapshot, type PopulationChange } from './snapshots.js';
import type { Actor, PopulationDefinition } from './types.js';

export interface ReportVersions {
  /** Version of the report template / layout. */
  reportVersion: string;
  /** Version of the interpretation text rules. */
  interpretationVersion: string;
}

export interface EmployeeReportBenchmark extends ReportVersions {
  id: string;
  employeeId: string;
  assessmentId: string;
  assessmentDate: string;
  assessmentVersion: string;
  scoringVersion: string | null;
  generatedAt: string;
  generatedBy: string;
  /** Benchmark population and values as at the assessment date. */
  snapshot: BenchmarkSnapshot;
  /** Absolute band + percentile + comparison context per metric, as shown on the report. */
  results: Record<string, BenchmarkPosition>;
}

/** Population definitions are evaluated as at the assessment date. */
export type ReportPopulation = Omit<PopulationDefinition, 'asOf'>;

export function generateReportBenchmark(
  actor: Actor,
  data: BenchmarkDataset,
  input: {
    employeeId: string;
    assessmentId: string;
    population: ReportPopulation;
    metricKeys: readonly string[];
    versions: ReportVersions;
    id?: string;
  },
  options: BenchmarkOptions = {},
): EmployeeReportBenchmark {
  const assessment = data.assessments.find(
    (a) => a.id === input.assessmentId && a.employeeId === input.employeeId,
  );
  if (!assessment) throw new Error('Assessment not found for this employee.');
  const now = options.now ?? new Date();
  const definition: PopulationDefinition = { ...input.population, asOf: assessment.completedAt };
  const adjusted = data.eligibility.adjustments?.has(assessment.id) ?? false;

  const benchmarks = input.metricKeys.map((key) => computeBenchmark(data, definition, key, { ...options, now }));
  const results: Record<string, BenchmarkPosition> = {};
  benchmarks.forEach((b, i) => {
    const key = input.metricKeys[i]!;
    const value = assessment.scores[key];
    if (Number.isFinite(value)) {
      results[key] = positionAgainst(b, getMetric(data, key), value!, input.employeeId, options.config, adjusted, expectationLevelOf(data, input.employeeId));
    }
  });

  const id = input.id ?? globalThis.crypto.randomUUID();
  return deepFreeze({
    id,
    employeeId: input.employeeId,
    assessmentId: assessment.id,
    assessmentDate: assessment.completedAt,
    assessmentVersion: assessment.version,
    scoringVersion: assessment.scoringVersion ?? null,
    generatedAt: now.toISOString(),
    generatedBy: actor.id,
    ...input.versions,
    snapshot: createSnapshot(actor, `Report ${id} benchmark`, benchmarks, { id: `${id}-benchmark`, now }),
    results: structuredClone(results),
  });
}

export interface ReportVsCurrentRow {
  metricKey: string;
  atAssessmentDate: { median: number | null; percentile: number | null; comparisonPopulationSize: number };
  current: { median: number | null; percentile: number | null; comparisonPopulationSize: number };
}

export interface ReportVsCurrent {
  rows: ReportVsCurrentRow[];
  integrity: PopulationChange;
  note: string;
}

/** Optional "Compare with current benchmark" – the saved report itself is untouched. */
export function compareReportWithCurrent(
  actor: Actor,
  data: BenchmarkDataset,
  report: EmployeeReportBenchmark,
  options: BenchmarkOptions = {},
): ReportVsCurrent {
  assertCanViewDirectorComparisons(actor);
  const now = options.now ?? new Date();
  const { asOf: _asOf, ...rest } = report.snapshot.populationDefinition;
  const definition: PopulationDefinition = { ...rest, asOf: now.toISOString() };
  const memberIds = new Set<string>();
  const versions = new Set<string>();
  const rows: ReportVsCurrentRow[] = Object.entries(report.results).map(([key, frozen]) => {
    const b = computeBenchmark(data, definition, key, { ...options, now });
    b.values.forEach((v) => memberIds.add(v.employeeId));
    b.explanation.assessmentVersions.forEach((v) => versions.add(v));
    const pos = positionAgainst(b, getMetric(data, key), frozen.value, report.employeeId, options.config, false, frozen.absolute.level);
    return {
      metricKey: key,
      atAssessmentDate: {
        median: report.snapshot.metrics[key]?.stats?.median ?? null,
        percentile: frozen.percentile,
        comparisonPopulationSize: frozen.comparison.comparisonPopulationSize,
      },
      current: {
        median: b.stats?.median ?? null,
        percentile: pos.percentile,
        comparisonPopulationSize: pos.comparison.comparisonPopulationSize,
      },
    };
  });
  const integrity = populationChange(
    {
      definition: report.snapshot.populationDefinition,
      employeeIds: report.snapshot.members.map((m) => m.employeeId),
      versions: report.snapshot.assessmentVersions,
    },
    { definition, employeeIds: [...memberIds], versions: [...versions] },
    options.config,
  );
  return {
    rows,
    integrity,
    note:
      'The report shows the benchmark at the assessment date. This comparison uses the current benchmark and does not change the report.' +
      (integrity.warning ? ` ${integrity.warning}` : ''),
  };
}
