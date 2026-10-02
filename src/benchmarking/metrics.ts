/**
 * Default FocusiQ metric catalogue with comparability flags (§168).
 * Keys match the `metrics` table seed in supabase/migrations.
 */
import type { MetricDefinition } from './types.js';

const core = (key: string, label: string): MetricDefinition => ({
  key,
  label,
  unit: 'score',
  higherIsBetter: true,
  companyComparable: true,
  departmentComparable: true,
  coreDimension: true,
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
  { key: 'decision_efficiency', label: 'Decision Efficiency', unit: 'score', higherIsBetter: true, companyComparable: true, departmentComparable: true },
  { key: 'decision_confidence', label: 'Decision Confidence', unit: 'score', higherIsBetter: true, companyComparable: true, departmentComparable: true },
  { key: 'information_retention', label: 'Information Retention', unit: 'score', higherIsBetter: true, companyComparable: true, departmentComparable: true },
  { key: 'accuracy', label: 'Accuracy', unit: 'percent', higherIsBetter: true, companyComparable: true, departmentComparable: true },
  { key: 'avg_response_seconds', label: 'Average Response Time', unit: 'seconds', higherIsBetter: false, companyComparable: true, departmentComparable: true },
  { key: 'recheck_rate', label: 'Re-check Rate', unit: 'percent', higherIsBetter: false, companyComparable: true, departmentComparable: true },
  { key: 'unnecessary_recheck_rate', label: 'Unnecessary Re-checking', unit: 'percent', higherIsBetter: false, companyComparable: true, departmentComparable: true },
  { key: 'unnecessary_review_seconds', label: 'Unnecessary Review Time', unit: 'seconds', higherIsBetter: false, companyComparable: true, departmentComparable: true },
  { key: 'timed_performance', label: 'Timed Performance', unit: 'score', higherIsBetter: true, companyComparable: true, departmentComparable: true },
  { key: 'untimed_performance', label: 'Untimed Performance', unit: 'score', higherIsBetter: true, companyComparable: true, departmentComparable: true },
  { key: 'assessment_reliability', label: 'Assessment Reliability', unit: 'score', higherIsBetter: true, companyComparable: true, departmentComparable: true },
  // Department-specific measures – §168: not comparable across departments.
  { key: 'commercial_awareness', label: 'Commercial Awareness', unit: 'score', higherIsBetter: true, companyComparable: false, departmentComparable: true },
  { key: 'customer_judgement', label: 'Customer Judgement', unit: 'score', higherIsBetter: true, companyComparable: false, departmentComparable: true },
  { key: 'target_ownership', label: 'Target Ownership', unit: 'score', higherIsBetter: true, companyComparable: false, departmentComparable: true },
];
