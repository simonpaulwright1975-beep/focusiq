/**
 * Versioned interpretation rules. The version is stored with every report
 * (`interpretation_versions`), so any insight can be reproduced exactly.
 */
export const INTERPRETATION_VERSION = 'interpretation/1.0.0';

export interface InsightRules {
  version: string;
  overProcessing: { minReopenShare: number; minFirstCorrectShareOfReopened: number; maxImprovedShareOfReopened: number; minAccuracy: number };
  rushing: { minAccuracyGap: number };
  slowButControlled: { minAccuracy: number; maxAnswerChangeShare: number };
  highInitiative: { minShare: number };
  highEscalation: { minShare: number };
  pressure: { minGroupSize: number; fasterBy: number; maxAccuracyDrop: number; significantAccuracyDrop: number };
  priorities: { minGroupSize: number; minAccuracyGap: number };
  retention: { developmentBelow: number; strengthFrom: number };
  modality: { minGroupSize: number; minAccuracyGap: number };
  sustainedAttention: { minGroupSize: number; minAccuracyDrop: number };
  orientation: { taskAtOrBelow: number; outcomeFrom: number };
  commercial: { developmentBelow: number; minOverallAccuracy: number };
  routineOverOpportunity: { minCount: number; minShare: number };
  strengths: { detailAccuracy: number; decisionFirstCorrect: number; customerOwnership: number };
  /** Insight §230 – never more than this many prioritised recommendations. */
  maxRecommendations: number;
  /** Insight §226 – share of a group showing a pattern before it is treated as a possible process issue. */
  organisation: { minGroupSize: number; minShare: number; minCount: number };
}

export const DEFAULT_RULES: InsightRules = {
  version: INTERPRETATION_VERSION,
  overProcessing: { minReopenShare: 0.5, minFirstCorrectShareOfReopened: 0.6, maxImprovedShareOfReopened: 0.25, minAccuracy: 0.8 },
  rushing: { minAccuracyGap: 0.15 },
  slowButControlled: { minAccuracy: 0.85, maxAnswerChangeShare: 0.15 },
  highInitiative: { minShare: 0.7 },
  highEscalation: { minShare: 0.5 },
  pressure: { minGroupSize: 4, fasterBy: 0.2, maxAccuracyDrop: 0.05, significantAccuracyDrop: 0.1 },
  priorities: { minGroupSize: 4, minAccuracyGap: 0.15 },
  retention: { developmentBelow: 0.6, strengthFrom: 0.85 },
  modality: { minGroupSize: 4, minAccuracyGap: 0.2 },
  sustainedAttention: { minGroupSize: 4, minAccuracyDrop: 0.2 },
  orientation: { taskAtOrBelow: 0.35, outcomeFrom: 0.7 },
  commercial: { developmentBelow: 0.6, minOverallAccuracy: 0.75 },
  routineOverOpportunity: { minCount: 2, minShare: 0.5 },
  strengths: { detailAccuracy: 0.9, decisionFirstCorrect: 0.85, customerOwnership: 0.75 },
  maxRecommendations: 3,
  organisation: { minGroupSize: 5, minShare: 0.5, minCount: 3 },
};
