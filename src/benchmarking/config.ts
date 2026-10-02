import type { Confidence } from './types.js';

/**
 * Tunable benchmarking settings. All thresholds are configurable (§155) and
 * mirrored by the `benchmark_settings` table.
 */
export interface BenchmarkConfig {
  /** §155 – fewer eligible people than this ⇒ benchmark unavailable. */
  minimumCohortSize: number;
  /** §159 – population sizes at which confidence steps up. */
  confidenceThresholds: { moderate: number; high: number };
  /** §158 – performance-percentile cut-offs for the employee-friendly bands. */
  bands: { developmentBelow: number; aboveTypicalFrom: number };
  /** §181 – |z| at or above which a result is flagged as a Significant Outlier. */
  outlierZ: number;
  /** §197 – member overlap (Jaccard) below which a population change is "significant". */
  populationChangeWarningOverlap: number;
  /** §179–§180 – minimum paired observations before reporting a correlation. */
  minimumCorrelationPairs: number;
  /** §180 – significance level and minimum |r| for a "meaningful" relationship. */
  correlationAlpha: number;
  correlationMinimumR: number;
  /** §170 – responses needed before a question counts as calibrated. */
  minimumCalibrationResponses: number;
}

export const DEFAULT_CONFIG: BenchmarkConfig = {
  minimumCohortSize: 5,
  confidenceThresholds: { moderate: 10, high: 15 },
  bands: { developmentBelow: 25, aboveTypicalFrom: 75 },
  outlierZ: 3,
  populationChangeWarningOverlap: 0.8,
  minimumCorrelationPairs: 8,
  correlationAlpha: 0.05,
  correlationMinimumR: 0.3,
  minimumCalibrationResponses: 30,
};

export function resolveConfig(overrides?: Partial<BenchmarkConfig>): BenchmarkConfig {
  return { ...DEFAULT_CONFIG, ...overrides };
}

/** §159 */
export function confidenceFor(populationSize: number, config: BenchmarkConfig): Confidence {
  if (populationSize < config.minimumCohortSize) return 'Insufficient';
  if (populationSize >= config.confidenceThresholds.high) return 'High';
  if (populationSize >= config.confidenceThresholds.moderate) return 'Moderate';
  return 'Limited';
}
