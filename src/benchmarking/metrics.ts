/**
 * Default FocusiQ metric catalogue – the seed for the `metrics` table.
 *
 * Comparability (§168) is a configurable property of every metric
 * (`companyComparable`, `departmentComparable`, `requiresSameRole`), so it can
 * be changed in the database later without touching the scoring engine.
 *
 * Absolute expectation bands below are PROVISIONAL starting points
 * (`validated: false`). Results using them are labelled provisional until
 * Directors confirm validated FocusiQ expectations for each measure.
 */
import type { AbsoluteBandThresholds, MetricDefinition } from './types.js';

export const PROVISIONAL_EXPECTATIONS_VERSION = 'expectations/provisional-2026-10';

const provisional = (development: number, strong: number): AbsoluteBandThresholds => ({
  development,
  strong,
  version: PROVISIONAL_EXPECTATIONS_VERSION,
  validated: false,
});

/** 0–100 scored measures: < 60 Development Opportunity, ≥ 75 Strong. */
const SCORE_BANDS = provisional(60, 75);
/** The same measures for leaders (Directors, managers, team leaders): < 70 Development Opportunity, ≥ 80 Strong. */
const LEADER_SCORE_BANDS = provisional(70, 80);

const core = (key: string, label: string): MetricDefinition => ({
  key,
  label,
  unit: 'score',
  higherIsBetter: true,
  companyComparable: true,
  departmentComparable: true,
  requiresSameRole: false,
  coreDimension: true,
  absoluteBands: SCORE_BANDS,
  leaderBands: LEADER_SCORE_BANDS,
});

const measure = (
  key: string,
  label: string,
  unit: MetricDefinition['unit'],
  higherIsBetter: boolean,
  absoluteBands: AbsoluteBandThresholds | null,
  companyComparable = true,
): MetricDefinition => ({
  key,
  label,
  unit,
  higherIsBetter,
  companyComparable,
  departmentComparable: true,
  requiresSameRole: false,
  absoluteBands,
  ...(absoluteBands === SCORE_BANDS ? { leaderBands: LEADER_SCORE_BANDS } : {}),
});

export const DEFAULT_METRICS: MetricDefinition[] = [
  // §174 core dimensions
  core('think', 'Think'),
  core('absorb', 'Absorb'),
  core('remember', 'Remember'),
  core('prioritise', 'Prioritise'),
  core('decide', 'Decide'),
  core('act', 'Act'),
  core('own', 'Own'),
  core('drive', 'Drive'),
  core('complete', 'Complete'),
  core('focus', 'Focus'),
  // Behavioural measures (§161, §176)
  measure('decision_efficiency', 'Decision Efficiency', 'score', true, SCORE_BANDS),
  measure('decision_confidence', 'Decision Confidence', 'score', true, SCORE_BANDS),
  measure('information_retention', 'Information Retention', 'score', true, SCORE_BANDS),
  measure('accuracy', 'Accuracy', 'percent', true, provisional(75, 90)),
  // Response time depends on the exercise mix – no absolute expectation yet.
  measure('avg_response_seconds', 'Average Response Time', 'seconds', false, null),
  measure('recheck_rate', 'Re-check Rate', 'percent', false, provisional(40, 15)),
  measure('unnecessary_recheck_rate', 'Unnecessary Re-checking', 'percent', false, provisional(35, 15)),
  measure('unnecessary_review_seconds', 'Unnecessary Review Time', 'seconds', false, null),
  measure('timed_performance', 'Timed Performance', 'score', true, SCORE_BANDS),
  measure('untimed_performance', 'Untimed Performance', 'score', true, SCORE_BANDS),
  measure('assessment_reliability', 'Assessment Reliability', 'score', true, null),
  // Department-specific measures – §168: not comparable across departments.
  measure('commercial_awareness', 'Commercial Awareness', 'score', true, SCORE_BANDS, false),
  measure('customer_judgement', 'Customer Judgement', 'score', true, SCORE_BANDS, false),
  measure('target_ownership', 'Target Ownership', 'score', true, SCORE_BANDS, false),
];
