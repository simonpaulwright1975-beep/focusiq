/**
 * External performance correlation (§178–§180).
 *
 * FocusiQ analyses association, never causation, and must be willing to say
 * when a measure does NOT appear to relate to real workplace outcomes.
 */
import { assertCanViewDirectorComparisons } from './audit.js';
import { resolveConfig, type BenchmarkConfig } from './config.js';
import { correlationPValue, mean, pearson, round, spearman } from './stats.js';
import type { Actor, Department } from './types.js';

/** §179 – suggested KPIs per department. */
export const SUGGESTED_KPIS: Record<Department, string[]> = {
  Sales: ['Target achievement', 'Calls', 'Meetings', 'Pipeline conversion', 'Margin', 'New business'],
  'Customer Service': ['Response time', 'Error rate', 'Customer issues', 'Order accuracy'],
  'Stock Control': ['Stock accuracy', 'Variances', 'Shortages', 'Fulfilment issues'],
  Finance: ['Reconciliation accuracy', 'Query ageing', 'Debtor days'],
  Marketing: ['Project delivery', 'Campaign performance', 'Deadlines', 'Lead generation'],
};

export interface PairedObservation {
  employeeId: string;
  focusValue: number;
  kpiValue: number;
}

export interface CorrelationFinding {
  metricLabel: string;
  kpiLabel: string;
  n: number;
  pearsonR: number | null;
  spearmanRho: number | null;
  pValue: number | null;
  strength: 'none' | 'weak' | 'moderate' | 'strong' | null;
  meaningful: boolean;
  /** Plain-English Director insight. */
  insight: string;
  caveat: string;
}

const CAVEAT =
  'Correlation does not show causation. Other factors (territory, tenure, workload, role) may explain the pattern.';

function strengthOf(r: number): CorrelationFinding['strength'] {
  const a = Math.abs(r);
  if (a < 0.1) return 'none';
  if (a < 0.3) return 'weak';
  if (a < 0.5) return 'moderate';
  return 'strong';
}

/**
 * §180 – Correlate one FocusiQ measure with one operational KPI. Spearman is
 * used for the significance decision because it is robust to outliers and
 * non-linear but monotonic relationships in small samples.
 */
export function correlateWithKpi(
  actor: Actor,
  metricLabel: string,
  kpiLabel: string,
  pairs: readonly PairedObservation[],
  options: { kpiHigherIsBetter?: boolean; config?: Partial<BenchmarkConfig> } = {},
): CorrelationFinding {
  assertCanViewDirectorComparisons(actor);
  const config = resolveConfig(options.config);
  const valid = pairs.filter((p) => Number.isFinite(p.focusValue) && Number.isFinite(p.kpiValue));
  const n = valid.length;
  const base = { metricLabel, kpiLabel, n, caveat: CAVEAT };

  if (n < config.minimumCorrelationPairs) {
    return {
      ...base,
      pearsonR: null,
      spearmanRho: null,
      pValue: null,
      strength: null,
      meaningful: false,
      insight: `Not enough paired data yet to assess whether ${metricLabel} relates to ${kpiLabel} (${n} of ${config.minimumCorrelationPairs} needed).`,
    };
  }

  const xs = valid.map((p) => p.focusValue);
  const ys = valid.map((p) => p.kpiValue);
  const r = pearson(xs, ys);
  const rho = spearman(xs, ys);
  if (!Number.isFinite(rho)) {
    return {
      ...base,
      pearsonR: null,
      spearmanRho: null,
      pValue: null,
      strength: null,
      meaningful: false,
      insight: `No meaningful relationship can be assessed: one of the measures does not vary across the group.`,
    };
  }
  const p = correlationPValue(rho, n);
  const meaningful = p < config.correlationAlpha && Math.abs(rho) >= config.correlationMinimumR;
  const kpiGood = options.kpiHigherIsBetter ?? true;
  const favourable = (rho > 0) === kpiGood;

  // Describe with a median split so the insight is concrete.
  const sorted = [...valid].sort((a, b) => a.focusValue - b.focusValue);
  const half = Math.floor(n / 2);
  const lowerKpi = mean(sorted.slice(0, half).map((v) => v.kpiValue));
  const upperKpi = mean(sorted.slice(n - half).map((v) => v.kpiValue));

  const insight = meaningful
    ? `Employees demonstrating stronger ${metricLabel} scores currently show ${
        favourable ? 'better' : 'weaker'
      } ${kpiLabel} on average (${round(upperKpi, 1)} vs ${round(lowerKpi, 1)}; ρ = ${round(rho, 2)}, n = ${n}).`
    : `No meaningful relationship has yet been found between ${metricLabel} and ${kpiLabel} (ρ = ${round(rho, 2)}, n = ${n}).`;

  return {
    ...base,
    pearsonR: Number.isFinite(r) ? round(r, 2) : null,
    spearmanRho: round(rho, 2),
    pValue: round(p, 3),
    strength: strengthOf(rho),
    meaningful,
    insight,
  };
}

/**
 * §178 – A high-performance cohort must be chosen from *external* evidence.
 * Membership is validated so it can't be derived from FocusiQ scores (which
 * would make the comparison circular).
 */
export interface HighPerformanceCohort {
  name: string;
  employeeIds: string[];
  evidenceSource: 'external_kpi' | 'manager_review' | 'documented_outcomes';
  evidenceDescription: string;
  createdBy: string;
}

export function defineHighPerformanceCohort(
  actor: Actor,
  cohort: Omit<HighPerformanceCohort, 'createdBy' | 'evidenceSource'> & { evidenceSource: string },
): HighPerformanceCohort {
  assertCanViewDirectorComparisons(actor);
  const allowed = ['external_kpi', 'manager_review', 'documented_outcomes'];
  if (!allowed.includes(cohort.evidenceSource)) {
    throw new Error(
      'High-performance cohorts must be based on external job-performance evidence, not FocusiQ scores.',
    );
  }
  if (!cohort.evidenceDescription.trim()) {
    throw new Error('Describe the external evidence used to select the cohort.');
  }
  return { ...cohort, evidenceSource: cohort.evidenceSource as HighPerformanceCohort['evidenceSource'], createdBy: actor.id };
}
