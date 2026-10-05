/**
 * Builds the employee's own summary from the Director's insight report.
 * Director-side only (uses the engines); the employee app receives the frozen
 * result. Constructive, absolute bands only, never comparisons with colleagues.
 */
import { absoluteBandFor, assertCanViewDirectorComparisons, expectationLevelOf, personalImprovement, type Actor, type BenchmarkDataset } from '../benchmarking/index.js';
import type { EmployeeBand, EmployeeSummary, SummaryDimension, SupportAction } from '../participation/summary.js';
import { assertSafeLanguage } from './language.js';
import { MOTIVATORS } from './library.js';
import type { InsightReport } from './report.js';
import type { MotivationProfile } from './types.js';

/** Plain-English descriptions of the core dimensions for employees. */
export const DIMENSION_DESCRIPTIONS: Record<string, string> = {
  think: 'Working through problems logically',
  absorb: 'Taking in information accurately',
  remember: 'Keeping hold of key details',
  prioritise: 'Deciding what matters most',
  decide: 'Reaching decisions with confidence',
  act: 'Turning decisions into action',
  own: 'Taking ownership of outcomes',
  drive: 'Keeping momentum towards goals',
  complete: 'Finishing tasks to the right standard',
  focus: 'Staying focused through a task',
};
const CORE = Object.keys(DIMENSION_DESCRIPTIONS);

const EMPLOYEE_BANDS: Record<string, EmployeeBand> = {
  Strong: 'Strength',
  'Expected / Typical': 'Expected',
  'Development Opportunity': 'Development opportunity',
};

/** Rewrites Director-facing recommendation text to speak to the employee. */
export function toEmployeeVoice(text: string): string {
  return text
    .replace(/\bthe employee['’]s\b/gi, 'your')
    .replace(/\bthe employee\b/gi, 'you')
    .replace(/\s*\(see [^)]*\)/g, '')
    .trim();
}

/** Never shown to employees: comparative or ranking language. */
const COMPARATIVE = /\bpercentile|\brank(ed|ing)?\b|\bleague\b|\bcolleagues?['’]? (results|scores)|\btop \d+ ?%|\bbottom\b/i;

export class EmployeeSummaryError extends Error {}

export function assertEmployeeSafe(summary: EmployeeSummary, employeeName: string): void {
  assertSafeLanguage(summary, [employeeName]);
  const strings: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === 'string') strings.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(summary);
  const bad = strings.find((s) => COMPARATIVE.test(s));
  if (bad) throw new EmployeeSummaryError(`Employee summaries must not compare with colleagues: “${bad}”`);
}

export interface SummaryOptions {
  /** Show dimension bands (labelled provisional while expectations are unvalidated). */
  includeBands: boolean;
  /** Recommendation ids from the insight report to share as support actions. */
  supportRecommendationIds: string[];
  /** Optional edits to the shared support text, by recommendation id. */
  supportOverrides?: Record<string, Partial<SupportAction>>;
  personalMessage?: string;
  /** Points of change needed before "higher"/"lower" is shown (default 3). */
  changeThreshold?: number;
}

export function buildEmployeeSummary(input: {
  actor: Actor;
  data: BenchmarkDataset;
  employeeId: string;
  employeeName: string;
  assessmentId: string;
  report: InsightReport;
  motivation?: MotivationProfile;
  options: SummaryOptions;
  now: Date;
  id?: string;
}): EmployeeSummary {
  assertCanViewDirectorComparisons(input.actor);
  const { data, employeeId, options } = input;
  const assessment = data.assessments.find((a) => a.id === input.assessmentId && a.employeeId === employeeId);
  if (!assessment) throw new EmployeeSummaryError('Assessment not found for this employee.');
  const threshold = options.changeThreshold ?? 3;

  let provisional = false;
  let previousDate: string | null = null;
  const dimensions: SummaryDimension[] = [];
  if (options.includeBands) {
    for (const key of CORE) {
      const metric = data.metrics.find((m) => m.key === key);
      const value = assessment.scores[key];
      if (!metric || value === undefined) continue;
      const band = absoluteBandFor(metric, value, expectationLevelOf(data, employeeId));
      if (!band.band) continue;
      if (band.status !== 'validated') provisional = true;
      // "Since last time" only against this person's own previous assessment.
      const trend = personalImprovement(data, employeeId, key);
      const idx = trend.series.findIndex((p) => p.assessmentId === assessment.id);
      const prev = idx > 0 ? trend.series[idx - 1]! : null;
      let change: SummaryDimension['change'] = null;
      if (prev) {
        previousDate = prev.completedAt;
        const diff = (value - prev.value) * (metric.higherIsBetter ? 1 : -1);
        change = diff >= threshold ? 'higher' : diff <= -threshold ? 'lower' : 'similar';
      }
      dimensions.push({ key, label: metric.label, description: DIMENSION_DESCRIPTIONS[key]!, band: EMPLOYEE_BANDS[band.band]!, change });
    }
  }

  const recs = input.report.recommendations.filter((r) => options.supportRecommendationIds.includes(r.id));
  if (recs.length !== options.supportRecommendationIds.length) {
    throw new EmployeeSummaryError('Support actions must come from this employee’s report.');
  }
  const support: SupportAction[] = recs.map((r) => ({
    title: options.supportOverrides?.[r.id]?.title?.trim() || r.title,
    detail: options.supportOverrides?.[r.id]?.detail?.trim() || toEmployeeVoice(r.detail),
  }));

  const paragraphs = input.report.employeeFacing.paragraphs.length
    ? [...input.report.employeeFacing.paragraphs]
    : ['Thank you for completing FocusiQ. Your results will be discussed with you in a one-to-one conversation.'];

  const summary: EmployeeSummary = {
    id: input.id ?? globalThis.crypto.randomUUID(),
    employeeId,
    assessmentId: assessment.id,
    assessmentDate: assessment.completedAt,
    previousAssessmentDate: options.includeBands ? previousDate : null,
    interpretationVersion: input.report.interpretationVersion,
    paragraphs,
    dimensions,
    bandsProvisional: provisional,
    motivators: (input.motivation?.ranked ?? []).slice(0, 3).map((k) => MOTIVATORS[k].label),
    support,
    personalMessage: options.personalMessage?.trim() || null,
    releasedAt: input.now.toISOString(),
  };
  assertEmployeeSafe(summary, input.employeeName);
  return summary;
}
