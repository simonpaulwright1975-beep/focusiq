/**
 * Employee Insight & Business Support module (Insight spec §201–§235).
 *
 * FocusiQ's question is not "what score did this employee get?" but
 * "what does this person need to perform at their best?". Every statement
 * is generated from exercise-level evidence and stays traceable to it.
 */
import type { InterpretationConfidence } from '../benchmarking/evidence.js';

export type Modality = 'text' | 'visual' | 'numerical' | 'verbal' | 'scenario';

/**
 * Per-exercise facts derived from the response-event log (what the employee
 * saw and did). Optional fields apply only to exercises designed to measure them.
 */
export interface ExerciseEvidence {
  exerciseId: string;
  presentationId?: string;
  questionVersionId?: string;
  family: string;
  /** FocusiQ dimension the exercise contributes to (e.g. 'remember', 'prioritise'). */
  dimension: string;
  modality: Modality;
  /** Position in the assessment (1-based) – used for sustained attention. */
  sequence: number;
  timed: boolean;
  risk: 'low' | 'high';
  multiStage?: boolean;
  /** For prioritisation exercises: were priorities given, or competing? */
  priorityContext?: 'defined' | 'competing';

  correct: boolean;
  firstAnswerCorrect: boolean;
  reopened: boolean;
  answerChanged: boolean;
  responseSeconds: number;
  /** Time spent on the exercise after the first answer was given. */
  reviewSecondsAfterFirstAnswer: number;

  /** Scenario: an escalation/approval option was chosen although not required. */
  escalatedUnnecessarily?: boolean;
  /** Scenario: chose further action toward an unresolved outcome (vs completing planned activity). */
  choseOutcomeAction?: boolean;
  /** Scenario: identified a relevant next action without being directed. */
  identifiedNextAction?: boolean;
  /** Scenario: commercial-consequence item answered correctly. */
  commercialCorrect?: boolean;
  /** Sales scenario: prioritised routine admin (e.g. CRM) over a live commercial opportunity. */
  choseRoutineOverOpportunity?: boolean;
  /** Customer-impact / responsibility scenario. */
  customerImpactScenario?: boolean;
}

export type MotivatorKey =
  | 'progression'
  | 'recognition'
  | 'autonomy'
  | 'financial_reward'
  | 'security'
  | 'mastery'
  | 'team'
  | 'customer_impact';

export interface MotivationProfile {
  /** Ranked most → least motivating. */
  ranked: MotivatorKey[];
}

/** Optional benchmark context for patterns that are relative by nature (e.g. "slower than benchmark"). */
export interface InsightBenchmarkContext {
  /** Median response time of the comparison group, seconds. */
  responseSecondsMedian?: number;
  responseSecondsP75?: number;
  responseSecondsP25?: number;
  comparisonPopulationSize?: number;
}

/** Insight §229 */
export const RECOMMENDATION_CATEGORIES = [
  'Coaching',
  'Training',
  'Process Change',
  'Management Style',
  'Tools / Automation',
  'Work Prioritisation',
  'Role Clarity',
  'Decision Authority',
  'Commercial Education',
  'Recognition / Motivation',
  'Development Opportunity',
] as const;
export type RecommendationCategory = (typeof RECOMMENDATION_CATEGORIES)[number];

export type Level = 'High' | 'Medium' | 'Low';

/** Insight §228 – responsibility is never assumed to sit with the employee. */
export type Attribution = 'Individual Behaviour' | 'Management / Clarity' | 'Business Process';

export interface Recommendation {
  id: string;
  title: string;
  category: RecommendationCategory;
  /** Who/what the change applies to – employee development vs business change (§205). */
  target: 'employee' | 'management' | 'business';
  detail: string;
  example?: string;
  impact: Level;
  effort: Level;
}

/** Insight §207 */
export type ManagementStyle =
  | 'Give Clear Outcomes'
  | 'Provide Time Boundaries'
  | 'Increase Autonomy'
  | 'Provide More Structure'
  | 'Use Shorter Instructions'
  | 'Use Written Follow-Up'
  | 'Set Commercial Context'
  | 'Use Regular Check-ins'
  | 'Allow Independent Problem Solving';

export interface EvidenceItem {
  label: string;
  /** Exercises behind this item – the "View Evidence" drill-down (§203). */
  exerciseIds: string[];
}

export type PatternKey =
  | 'over_processing'
  | 'rushing'
  | 'slow_but_controlled'
  | 'high_initiative'
  | 'high_escalation'
  | 'efficient_under_pressure'
  | 'quality_drops_under_pressure'
  | 'needs_defined_priorities'
  | 'retention_support'
  | 'visual_processing'
  | 'verbal_processing'
  | 'sustained_attention'
  | 'task_orientation'
  | 'outcome_orientation'
  | 'commercial_understanding'
  | 'routine_over_opportunity'
  | 'strength_attention_to_detail'
  | 'strength_information_retention'
  | 'strength_decision_quality'
  | 'strength_customer_ownership';

export type PatternKind = 'strength' | 'development' | 'style';

/** A pattern detected from the evidence, with everything needed to trace it. */
export interface Finding {
  key: PatternKey;
  kind: PatternKind;
  /** e.g. "Employee appears to over-check lower-risk decisions." */
  insight: string;
  evidence: EvidenceItem[];
  evidenceCount: number;
  /** Exercises showing the pattern; null for comparison patterns (e.g. timed vs untimed). */
  consistentCount: number | null;
  confidence: InterpretationConfidence;
  /** Raw measures used by the rule (for audit / reproduction). */
  measures: Record<string, number>;
}

/** A pattern whose evidence was insufficient – reported honestly, never concluded. */
export interface NotConcluded {
  key: PatternKey;
  reason: string;
}

export interface Statement {
  text: string;
  /** Findings this sentence is generated from – every statement is traceable. */
  findingKeys: PatternKey[];
}
