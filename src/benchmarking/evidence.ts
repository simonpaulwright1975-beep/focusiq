/**
 * Minimum question evidence within a dimension.
 *
 * The same honesty rule as population benchmarks applies inside a single
 * assessment: no strong conclusion (e.g. "High re-checking tendency") from
 * only two questions. Each dimension carries an evidence count, a
 * consistency measure and an interpretation confidence.
 */
import { resolveConfig, type BenchmarkConfig } from './config.js';

export interface EvidenceObservation {
  exerciseId: string;
  questionVersionId?: string;
  /** Did this exercise show the behavioural pattern being interpreted? */
  showsPattern: boolean;
}

export type InterpretationConfidence = 'Insufficient' | 'Low' | 'Moderate' | 'High';

export interface DimensionEvidence {
  dimension: string;
  pattern: string;
  evidenceCount: number;
  /** Exercises agreeing with the majority direction. */
  consistentCount: number;
  consistency: number;
  /** Whether the majority of exercises show the pattern. */
  patternObserved: boolean | null;
  confidence: InterpretationConfidence;
  /** e.g. "Evidence: 11 exercises · Consistent pattern: 8/11 · Interpretation confidence: High" */
  evidenceLabel: string;
  /** Safe wording for the report, scaled to the confidence. */
  interpretation: string;
}

export function assessDimensionEvidence(
  dimension: string,
  pattern: string,
  observations: readonly EvidenceObservation[],
  configOverrides?: Partial<BenchmarkConfig>,
): DimensionEvidence {
  const { evidence } = resolveConfig(configOverrides);
  const n = observations.length;
  const showing = observations.filter((o) => o.showsPattern).length;
  const notShowing = n - showing;
  const consistentCount = Math.max(showing, notShowing);
  const consistency = n === 0 ? 0 : consistentCount / n;
  const patternObserved = n === 0 || showing === notShowing ? null : showing > notShowing;

  let confidence: InterpretationConfidence;
  if (n < evidence.minimumCount || patternObserved === null) confidence = 'Insufficient';
  else if (n >= evidence.high.count && consistency >= evidence.high.consistency) confidence = 'High';
  else if (n >= evidence.moderate.count && consistency >= evidence.moderate.consistency) confidence = 'Moderate';
  else confidence = 'Low';

  const lower = pattern.charAt(0).toLowerCase() + pattern.slice(1);
  let interpretation: string;
  if (confidence === 'Insufficient') {
    interpretation = `Not enough consistent evidence to draw a conclusion about ${lower}.`;
  } else if (!patternObserved) {
    interpretation =
      confidence === 'Low'
        ? `Little indication of ${lower}, based on limited evidence.`
        : `No ${lower} was observed.`;
  } else if (confidence === 'Low') {
    interpretation = `Some indication of ${lower}; evidence is limited, so treat this as tentative.`;
  } else if (confidence === 'Moderate') {
    interpretation = `A pattern of ${lower} was observed in most exercises.`;
  } else {
    interpretation = `A consistent pattern of ${lower} was observed.`;
  }

  return {
    dimension,
    pattern,
    evidenceCount: n,
    consistentCount,
    consistency: Math.round(consistency * 100) / 100,
    patternObserved,
    confidence,
    evidenceLabel: `Evidence: ${n} exercise${n === 1 ? '' : 's'} · Consistent pattern: ${consistentCount}/${n} · Interpretation confidence: ${confidence}`,
    interpretation,
  };
}

/** True when a conclusion may be stated as a firm finding (not merely tentative). */
export function supportsFirmConclusion(e: DimensionEvidence): boolean {
  return e.confidence === 'Moderate' || e.confidence === 'High';
}
