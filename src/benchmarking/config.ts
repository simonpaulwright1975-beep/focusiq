import type { Confidence } from './types.js';

/** Stored with every benchmark/report so a result can be reproduced exactly. */
export const BENCHMARK_ENGINE_VERSION = 'benchmark-engine/2.0.0';

export type OutlierMethod = 'mad' | 'iqr' | 'sd';

/**
 * Tunable benchmarking settings. All thresholds are configurable (§155) and
 * mirrored by the `benchmark_settings` table.
 */
export interface BenchmarkConfig {
  /** §155 – fewer eligible people than this ⇒ benchmark unavailable. */
  minimumCohortSize: number;
  /**
   * §159 – comparison sizes at which confidence steps up:
   * 1–4 Insufficient · 5–9 Limited · 10–19 Moderate · 20–29 Good · 30+ High.
   */
  confidenceThresholds: { moderate: number; good: number; high: number };
  /** §181 – robust outlier detection. */
  outliers: {
    method: OutlierMethod;
    /** Suppress detection entirely below this comparison-group size. */
    minimumCohortSize: number;
    /** Modified z-score cut-off (Iglewicz & Hoaglin recommend 3.5). */
    madThreshold: number;
    /** Tukey fence multiplier (Hoaglin & Iglewicz recommend 2.2 for labelling). */
    iqrMultiplier: number;
    /** Only used when method = 'sd'. */
    sdThreshold: number;
  };
  /** §197 – member overlap (Jaccard) below which a population change is "significant". */
  populationChangeWarningOverlap: number;
  /** §179–§180 – minimum paired observations before reporting a correlation. */
  minimumCorrelationPairs: number;
  /** §180 – significance level and minimum |r| for a "meaningful" relationship. */
  correlationAlpha: number;
  correlationMinimumR: number;
  /** §170 – responses needed before a question counts as calibrated. */
  minimumCalibrationResponses: number;
  /** Minimum question evidence within a dimension before drawing conclusions. */
  evidence: {
    minimumCount: number;
    moderate: { count: number; consistency: number };
    high: { count: number; consistency: number };
  };
}

export const DEFAULT_CONFIG: BenchmarkConfig = {
  minimumCohortSize: 5,
  confidenceThresholds: { moderate: 10, good: 20, high: 30 },
  outliers: {
    method: 'mad',
    minimumCohortSize: 10,
    madThreshold: 3.5,
    iqrMultiplier: 2.2,
    sdThreshold: 3,
  },
  populationChangeWarningOverlap: 0.8,
  minimumCorrelationPairs: 8,
  correlationAlpha: 0.05,
  correlationMinimumR: 0.3,
  minimumCalibrationResponses: 30,
  evidence: {
    minimumCount: 4,
    moderate: { count: 6, consistency: 0.6 },
    high: { count: 10, consistency: 0.7 },
  },
};

export function resolveConfig(overrides?: Partial<BenchmarkConfig>): BenchmarkConfig {
  return {
    ...DEFAULT_CONFIG,
    ...overrides,
    confidenceThresholds: { ...DEFAULT_CONFIG.confidenceThresholds, ...overrides?.confidenceThresholds },
    outliers: { ...DEFAULT_CONFIG.outliers, ...overrides?.outliers },
    evidence: { ...DEFAULT_CONFIG.evidence, ...overrides?.evidence },
  };
}

/** §159 – honest about the strength of a comparison. */
export function confidenceFor(populationSize: number, config: BenchmarkConfig): Confidence {
  if (populationSize < config.minimumCohortSize) return 'Insufficient';
  if (populationSize >= config.confidenceThresholds.high) return 'High';
  if (populationSize >= config.confidenceThresholds.good) return 'Good';
  if (populationSize >= config.confidenceThresholds.moderate) return 'Moderate';
  return 'Limited';
}
