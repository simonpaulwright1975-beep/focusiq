/**
 * DEMO scoring metadata (answer keys + insight tags) – server-side only.
 * In production this is `question_versions.answer_key` / `scoring_meta`,
 * readable only by Directors. The employee app must never import this file.
 */
import type { ExerciseMeta } from '../../../src/insight/index.js';
import { ABSTRACT_SCORING } from './abstractScoring.js';

export const DEMO_SCORING: Record<string, ExerciseMeta> = {
  'demo-q01': { family: 'routine-request', dimension: 'decide', modality: 'text', risk: 'low', correctAnswer: 'a', unnecessaryEscalationOptions: ['b'] },
  'demo-q02': { family: 'quote-check', dimension: 'absorb', modality: 'text', risk: 'high', multiStage: true, correctAnswer: 'b' },
  'demo-q03': { family: 'recall', dimension: 'remember', modality: 'text', risk: 'high', multiStage: true, correctAnswer: 'a' },
  'demo-q04': { family: 'stock-variance', dimension: 'decide', modality: 'text', risk: 'low', correctAnswer: 'a', unnecessaryEscalationOptions: ['c'] },
  'demo-q05': { family: 'pattern', dimension: 'think', modality: 'visual', risk: 'low', correctAnswer: 'd' },
  'demo-q06': { family: 'pack-quantity', dimension: 'think', modality: 'numerical', risk: 'low', correctAnswer: 'b' },
  'demo-q07': { family: 'shipping-rule', dimension: 'prioritise', modality: 'text', risk: 'low', priorityContext: 'defined', correctAnswer: 'b' },
  'demo-q08': { family: 'margin', dimension: 'prioritise', modality: 'numerical', risk: 'low', commercial: true, correctAnswer: 'b' },
  'demo-q09': { family: 'morning-priorities', dimension: 'prioritise', modality: 'scenario', risk: 'high', priorityContext: 'competing', correctAnswer: 'call>quote>crm>drive' },
  'demo-q10': { family: 'ownership', dimension: 'own', modality: 'scenario', risk: 'high', correctAnswer: 'b', outcomeActionOptions: ['b'] },
  'demo-q11': { family: 'next-action', dimension: 'act', modality: 'scenario', risk: 'high', correctAnswer: 'a', nextActionOptions: ['a'], unnecessaryEscalationOptions: ['c'] },
  'demo-q12': { family: 'customer-impact', dimension: 'own', modality: 'scenario', risk: 'high', customerImpactScenario: true, correctAnswer: 'a', outcomeActionOptions: ['a'], unnecessaryEscalationOptions: ['d'] },
  ...ABSTRACT_SCORING,
  // Crack the code: deduction from several clues held in mind together.
  'cc-01': { family: 'code-deduction', dimension: 'think', modality: 'text', risk: 'low', correctAnswer: 'e' },
  'cc-02': { family: 'code-deduction', dimension: 'think', modality: 'text', risk: 'low', correctAnswer: 'b' },
  'cc-03': { family: 'code-deduction', dimension: 'think', modality: 'text', risk: 'low', correctAnswer: 'c' },
  'cc-04': { family: 'code-deduction', dimension: 'think', modality: 'text', risk: 'low', correctAnswer: 'e' },
  // Sales figures: numerical reasoning with commercial figures.
  'sm-01': { family: 'sales-maths', dimension: 'think', modality: 'numerical', risk: 'low', commercial: true, correctAnswer: 'e' },
  'sm-02': { family: 'sales-maths', dimension: 'think', modality: 'numerical', risk: 'low', commercial: true, correctAnswer: 'd' },
  'sm-03': { family: 'sales-maths', dimension: 'think', modality: 'numerical', risk: 'low', commercial: true, correctAnswer: 'c' },
  'sm-04': { family: 'sales-maths', dimension: 'think', modality: 'numerical', risk: 'low', commercial: true, correctAnswer: 'c' },
  'sm-05': { family: 'sales-maths', dimension: 'think', modality: 'numerical', risk: 'low', commercial: true, correctAnswer: 'c' },
  'sm-06': { family: 'sales-maths', dimension: 'think', modality: 'numerical', risk: 'low', commercial: true, correctAnswer: 'b' },
  'sm-07': { family: 'sales-maths', dimension: 'think', modality: 'numerical', risk: 'low', commercial: true, correctAnswer: 'b' },
  'sm-08': { family: 'sales-maths', dimension: 'think', modality: 'numerical', risk: 'low', commercial: true, correctAnswer: 'a' },
  'sm-09': { family: 'sales-maths', dimension: 'think', modality: 'numerical', risk: 'low', commercial: true, correctAnswer: 'b' },
  'sm-10': { family: 'sales-maths', dimension: 'think', modality: 'numerical', risk: 'low', commercial: true, correctAnswer: 'c' },
  // More scenarios
  'demo-q14': { family: 'bespoke-request', dimension: 'decide', modality: 'scenario', risk: 'low', correctAnswer: 'a', unnecessaryEscalationOptions: ['b'] },
  'demo-q15': { family: 'next-action', dimension: 'act', modality: 'scenario', risk: 'high', correctAnswer: 'a', nextActionOptions: ['a'], unnecessaryEscalationOptions: ['d'] },
  'demo-q16': { family: 'customer-impact', dimension: 'own', modality: 'scenario', risk: 'high', customerImpactScenario: true, correctAnswer: 'a', outcomeActionOptions: ['a'], unnecessaryEscalationOptions: ['d'] },
  'demo-q17': { family: 'sales-priority', dimension: 'prioritise', modality: 'scenario', risk: 'high', priorityContext: 'competing', correctAnswer: 'a', routineOverOpportunityOptions: ['b'] },
};
