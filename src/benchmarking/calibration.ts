/**
 * Question calibration (§170) and difficulty normalisation (§169).
 */
import { resolveConfig, type BenchmarkConfig } from './config.js';
import { mean, median, pearson, round } from './stats.js';
import type { Department } from './types.js';

export interface QuestionResponse {
  questionId: string;
  /** Question family – equivalent questions share a family. */
  family: string;
  assessmentId: string;
  employeeId: string;
  department: Department;
  correct: boolean;
  timeSeconds: number;
  /** How many times the question was re-opened after first viewing. */
  reviews: number;
  answerChanged: boolean;
}

export interface QuestionCalibration {
  questionId: string;
  family: string;
  responses: number;
  calibrated: boolean;
  averageAccuracy: number;
  medianCompletionSeconds: number;
  reViewRate: number;
  answerChangeRate: number;
  /** 0 (everyone correct) – 1 (no one correct). */
  difficulty: number;
  /** Corrected item–total correlation (point-biserial). Low/negative ⇒ review the question. */
  discrimination: number | null;
  /** Accuracy by department (departments with enough responses only). */
  departmentAccuracy: Partial<Record<Department, number>>;
  /** Max − min department accuracy. */
  departmentVariation: number | null;
  flags: string[];
}

export function calibrateQuestions(
  responses: readonly QuestionResponse[],
  configOverrides?: Partial<BenchmarkConfig>,
): QuestionCalibration[] {
  const config = resolveConfig(configOverrides);
  const byQuestion = groupBy(responses, (r) => r.questionId);
  // Assessment totals for the item–total correlation.
  const totals = new Map<string, { correct: number; count: number }>();
  for (const r of responses) {
    const t = totals.get(r.assessmentId) ?? { correct: 0, count: 0 };
    t.correct += r.correct ? 1 : 0;
    t.count += 1;
    totals.set(r.assessmentId, t);
  }

  return [...byQuestion].map(([questionId, rs]) => {
    const acc = mean(rs.map((r) => (r.correct ? 1 : 0)));
    const item = rs.map((r) => (r.correct ? 1 : 0));
    const restScore = rs.map((r) => {
      const t = totals.get(r.assessmentId)!;
      return t.count > 1 ? (t.correct - (r.correct ? 1 : 0)) / (t.count - 1) : NaN;
    });
    const validPairs = item
      .map((x, i) => [x, restScore[i]!] as const)
      .filter(([, y]) => Number.isFinite(y));
    const r = pearson(
      validPairs.map(([x]) => x),
      validPairs.map(([, y]) => y),
    );
    const discrimination = Number.isFinite(r) ? round(r, 2) : null;

    const deptMin = Math.max(5, Math.floor(config.minimumCalibrationResponses / 5));
    const departmentAccuracy: Partial<Record<Department, number>> = {};
    for (const [dept, drs] of groupBy(rs, (x) => x.department)) {
      if (drs.length >= deptMin) {
        departmentAccuracy[dept] = round(mean(drs.map((x) => (x.correct ? 1 : 0))) * 100, 1);
      }
    }
    const deptValues = Object.values(departmentAccuracy) as number[];
    const departmentVariation =
      deptValues.length >= 2 ? round(Math.max(...deptValues) - Math.min(...deptValues), 1) : null;

    const calibrated = rs.length >= config.minimumCalibrationResponses;
    const flags: string[] = [];
    if (calibrated) {
      if (acc > 0.95) flags.push('Very easy – little discriminating value');
      if (acc < 0.2) flags.push('Very difficult – check wording and answer key');
      if (discrimination !== null && discrimination < 0.1) flags.push('Low discrimination – review question');
      if (departmentVariation !== null && departmentVariation >= 30) {
        flags.push('Large department variation – may favour particular roles');
      }
    }

    return {
      questionId,
      family: rs[0]!.family,
      responses: rs.length,
      calibrated,
      averageAccuracy: round(acc * 100, 1),
      medianCompletionSeconds: median(rs.map((x) => x.timeSeconds)),
      reViewRate: round(mean(rs.map((x) => (x.reviews > 0 ? 1 : 0))) * 100, 1),
      answerChangeRate: round(mean(rs.map((x) => (x.answerChanged ? 1 : 0))) * 100, 1),
      difficulty: round(1 - acc, 3),
      discrimination,
      departmentAccuracy,
      departmentVariation,
      flags,
    };
  });
}

/**
 * §169 – Difficulty-normalised score on a T-score scale (mean 50, SD 10).
 *
 * Each answered question contributes (correct − expected), where "expected"
 * is the calibrated accuracy for that question. The sum is standardised by
 * its binomial standard error, so two people who received different but
 * equivalent question sets land on the same scale. Returns null when any
 * question in the set is not yet calibrated.
 */
export function normalisedScore(
  answers: readonly { questionId: string; correct: boolean }[],
  calibration: ReadonlyMap<string, Pick<QuestionCalibration, 'averageAccuracy' | 'calibrated'>>,
): number | null {
  let observedMinusExpected = 0;
  let variance = 0;
  for (const a of answers) {
    const c = calibration.get(a.questionId);
    if (!c || !c.calibrated) return null;
    // Clamp so trivially easy/hard items don't give zero variance.
    const p = Math.min(0.99, Math.max(0.01, c.averageAccuracy / 100));
    observedMinusExpected += (a.correct ? 1 : 0) - p;
    variance += p * (1 - p);
  }
  if (answers.length === 0 || variance === 0) return null;
  return round(50 + 10 * (observedMinusExpected / Math.sqrt(variance)), 1);
}

function groupBy<T, K>(items: readonly T[], key: (t: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const it of items) {
    const k = key(it);
    const list = m.get(k) ?? [];
    list.push(it);
    m.set(k, list);
  }
  return m;
}
