/**
 * Core domain types for the FocusiQ benchmarking engine (spec §149–§203).
 *
 * Core principle:
 *   Absolute performance tells us whether the behaviour is effective.
 *   Benchmarking tells us whether the behaviour is unusual compared with colleagues.
 * The two are modelled separately (AbsoluteBandResult vs percentile) and never merged.
 *
 * Deliberately absent: age, sex, disability or any other protected
 * characteristic (§199). The engine has no way to rank or group people by them.
 */

export const DEPARTMENTS = [
  'Sales',
  'Marketing',
  'Customer Service',
  'Stock Control',
  'Finance',
] as const;
export type Department = (typeof DEPARTMENTS)[number];

/** §165 – Former employees keep their history; §163 – test users are a status. */
export type EmployeeStatus = 'active' | 'former' | 'test';

/** §163 */
export type AssessmentType = 'full' | 'micro' | 'pilot';

/** §202 assessment_validity.status */
export type AssessmentValidity = 'valid' | 'review_required' | 'invalidated' | 'pilot';

/** §152 */
export const EXCLUSION_REASONS = [
  'test_account',
  'pilot_user',
  'incomplete_assessment',
  'technical_failure',
  'duplicate_assessment',
  'assessment_invalidated',
  'reasonable_adjustment',
  'other',
] as const;
export type ExclusionReason = (typeof EXCLUSION_REASONS)[number];

export const EXCLUSION_REASON_LABELS: Record<ExclusionReason, string> = {
  test_account: 'Test Account',
  pilot_user: 'Pilot User',
  incomplete_assessment: 'Incomplete Assessment',
  technical_failure: 'Technical Failure',
  duplicate_assessment: 'Duplicate Assessment',
  assessment_invalidated: 'Assessment Invalidated',
  reasonable_adjustment: 'Reasonable Adjustment / Not Directly Comparable',
  other: 'Other',
};

/**
 * Exclusion reasons meaning the result itself is not a genuine measurement,
 * so it is also left out of the person's own trend history. Other reasons
 * (test account, pilot user, reasonable adjustment…) only remove the record
 * from *population* benchmarks; it stays in the person's history.
 */
export const RESULT_COMPROMISING_REASONS: readonly ExclusionReason[] = [
  'incomplete_assessment',
  'technical_failure',
  'duplicate_assessment',
  'assessment_invalidated',
];

export interface Employee {
  id: string;
  displayName: string;
  department: Department;
  /** §150 Role benchmark – e.g. "Salesperson". */
  role?: string;
  status: EmployeeStatus;
  /** ISO date. Used for tenure bands (§166–§167). */
  startDate: string;
  /** ISO date, set when status becomes 'former'. */
  leftDate?: string;
  /** §198 Director-controlled cohort tags. */
  cohortTags: string[];
  /**
   * Which FocusiQ expectations this person is measured against. 'leader'
   * (Directors, managers, team leaders) uses the stricter leader thresholds where
   * a measure has them. Set by a Director; defaults to 'standard'.
   */
  expectations?: ExpectationLevel;
}

export type ExpectationLevel = 'standard' | 'leader';

export interface Assessment {
  id: string;
  employeeId: string;
  /** Assessment version – only comparable versions are benchmarked together. */
  version: string;
  /** Version of the scoring rules that produced `scores`. */
  scoringVersion?: string;
  type: AssessmentType;
  /** ISO datetime. */
  completedAt: string;
  complete: boolean;
  validity: AssessmentValidity;
  /** Raw metric values keyed by metric key. */
  scores: Record<string, number>;
  /** Difficulty-normalised metric values (§169), when available. */
  normalisedScores?: Record<string, number>;
}

export type MetricUnit = 'score' | 'percent' | 'seconds' | 'rate';

/** Absolute performance bands – based on FocusiQ expectations, not the cohort. */
export type AbsoluteBand = 'Development Opportunity' | 'Expected / Typical' | 'Strong';

/**
 * Thresholds for the absolute band, expressed in the metric's own units.
 *  - higherIsBetter: value < development ⇒ Development Opportunity; value ≥ strong ⇒ Strong
 *  - lower is better: value > development ⇒ Development Opportunity; value ≤ strong ⇒ Strong
 */
export interface AbsoluteBandThresholds {
  development: number;
  strong: number;
  /** Version of the expectation set, stored with every result that uses it. */
  version: string;
  /** False until the thresholds have been validated against real evidence. */
  validated: boolean;
}

export interface MetricDefinition {
  key: string;
  label: string;
  unit: MetricUnit;
  /** False for e.g. re-check rate or response time, where lower is preferable. */
  higherIsBetter: boolean;
  /** §168 – may be compared across departments. Configurable per metric. */
  companyComparable: boolean;
  /** §168 – may be compared between people inside a department. Configurable per metric. */
  departmentComparable: boolean;
  /** Only comparable between people in the same job role. Configurable per metric. */
  requiresSameRole?: boolean;
  /** True for the ten core FocusiQ dimensions shown on heatmaps (§174). */
  coreDimension?: boolean;
  /** Absolute expectation thresholds; null/undefined = not yet configured. */
  absoluteBands?: AbsoluteBandThresholds | null;
  /** Stricter thresholds for people on leader expectations; absent = same as everyone. */
  leaderBands?: AbsoluteBandThresholds | null;
}

/** An active exclusion from benchmarking (§151–§153). */
export interface ExclusionState {
  reason: ExclusionReason;
  note?: string;
  excludedBy: string;
  excludedAt: string;
}

/**
 * Adjusted Assessment – the person legitimately received different
 * conditions (e.g. a reasonable adjustment). Not an exclusion by itself:
 * a Director decides whether the result remains comparable.
 */
export interface AdjustmentState {
  description: string;
  recordedBy: string;
  recordedAt: string;
  comparability: 'pending_review' | 'comparable' | 'not_comparable';
  decidedBy?: string;
  decidedAt?: string;
  decisionReason?: string;
}

/** Current eligibility state, typically derived from the audited ledger. */
export interface EligibilityState {
  employees: ReadonlyMap<string, ExclusionState>;
  assessments: ReadonlyMap<string, ExclusionState>;
  /** Director-reviewed validity overrides (§202 assessment_validity). */
  validity?: ReadonlyMap<string, AssessmentValidity>;
  /** Adjusted assessments keyed by assessment id. */
  adjustments?: ReadonlyMap<string, AdjustmentState>;
}

export type PopulationScope =
  | { kind: 'company' }
  | { kind: 'department'; department: Department }
  | { kind: 'role'; role: string }
  /** §150 custom cohort – any of the departments and/or any of the tags. */
  | { kind: 'cohort'; name: string; departments?: Department[]; cohortTags?: string[] }
  | { kind: 'employees'; name: string; employeeIds: string[] };

export type AssessmentWindow =
  | { kind: 'latest' }
  | { kind: 'last_months'; months: number }
  | { kind: 'range'; from: string; to: string };

/**
 * §195 Custom comparison builder population definition.
 *
 * A benchmark always uses ONE result per person: their most recent eligible
 * assessment inside the window. Earlier assessments remain available for
 * trend history, coaching comparisons and historical snapshots.
 */
export interface PopulationDefinition {
  scope: PopulationScope;
  include: {
    active: boolean;
    /** §165 Historical benchmark optionally includes former employees. */
    former: boolean;
    /** Include pilot assessments / users. */
    pilot: boolean;
    test: boolean;
  };
  window: AssessmentWindow;
  assessmentVersions?: string[];
  assessmentTypes?: AssessmentType[];
  /** §166 tenure band keys (see TenureBand). */
  tenureBands?: string[];
  /** Reference date for windows/tenure (defaults to now). ISO date. */
  asOf?: string;
}

export type Confidence = 'Insufficient' | 'Limited' | 'Moderate' | 'Good' | 'High';

export interface DescriptiveStats {
  n: number;
  mean: number;
  median: number;
  min: number;
  max: number;
  range: number;
  standardDeviation: number;
  p25: number;
  p75: number;
  iqr: number;
  /** Median absolute deviation (unscaled). */
  mad: number;
}

export interface PopulationCounts {
  /** §154 – people contributing one result each. */
  eligibleEmployees: number;
  /** Assessments used in the calculation (one per eligible employee). */
  eligibleAssessments: number;
  /** Earlier eligible assessments in the window, superseded by a later one (kept for trends). */
  supersededAssessments: number;
  excludedAssessments: number;
  excludedEmployees: number;
  /** Count of excluded assessments by reason (for the explanation panel). */
  exclusionsByReason: Partial<Record<ExclusionReason | 'review_required', number>>;
  /** Adjusted assessments included in the calculation. */
  adjustedAssessments: number;
  /** Of those, how many still await a comparability decision. */
  adjustedPendingReview: number;
}

/** §192 "How is this benchmark calculated?" */
export interface BenchmarkExplanation {
  populationLabel: string;
  definition: PopulationDefinition;
  counts: PopulationCounts;
  assessmentVersions: string[];
  scoringVersions: string[];
  sampleSize: number;
  normalisation: NormalisationMethod;
  dateRange: { from: string | null; to: string | null };
  minimumCohortSize: number;
  statisticBasis: string;
  engineVersion: string;
}

export type NormalisationMethod = 'none' | 'difficulty_t_score';

export interface BenchmarkValue {
  employeeId: string;
  assessmentId: string;
  value: number;
  adjusted: boolean;
}

export interface BenchmarkResult {
  metricKey: string;
  metricLabel: string;
  available: boolean;
  /** Present when unavailable – e.g. "Benchmark unavailable – insufficient comparison data." */
  unavailableReason?: string;
  stats: DescriptiveStats | null;
  confidence: Confidence;
  /** §154 – always shown, e.g. "Benchmark based on 14 eligible assessments." */
  sampleSizeLabel: string;
  explanation: BenchmarkExplanation;
  /** Values per employee (Director-only use). */
  values: BenchmarkValue[];
  calculatedAt: string;
}

export type UserRole = 'director' | 'super_admin' | 'manager' | 'employee';

export interface Actor {
  id: string;
  name: string;
  role: UserRole;
  /** §184 – a manager may only alter inclusion when specifically authorised. */
  benchmarkAuthority?: boolean;
}
