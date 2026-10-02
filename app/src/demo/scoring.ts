/**
 * DEMO scoring metadata (answer keys + insight tags) – server-side only.
 * In production this is `question_versions.answer_key` / `scoring_meta`,
 * readable only by Directors. The employee app must never import this file.
 */
import type { ExerciseMeta } from '../../../src/insight/index.js';

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
};
