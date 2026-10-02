import { quantile } from '../../src/benchmarking/index.js';
import { generateInsightReport, type InsightReport } from '../../src/insight/index.js';
import type { DemoData } from './demo/dataset.js';

/** Insight report per employee, for the latest assessment with exercise evidence. */
export function buildInsightReports(demo: DemoData, now: Date): Map<string, { assessmentId: string; report: InsightReport }> {
  // Relative context for "slow but controlled": P75 of employees' median exercise time.
  const medians = [...demo.exercises.values()].map((xs) => quantile(xs.map((x) => x.responseSeconds), 0.5));
  const p75 = quantile(medians, 0.75);
  const out = new Map<string, { assessmentId: string; report: InsightReport }>();
  for (const [assessmentId, exercises] of demo.exercises) {
    const a = demo.assessments.find((x) => x.id === assessmentId)!;
    const e = demo.employees.find((x) => x.id === a.employeeId)!;
    const report = generateInsightReport({
      employee: { id: e.id, name: e.displayName.split(' ')[0]! },
      assessmentId,
      exercises,
      motivation: demo.motivation.get(assessmentId),
      benchmark: { responseSecondsP75: p75 },
      roleDemands:
        e.department === 'Sales'
          ? ['rapid commercial prioritisation', 'outcome ownership', 'commercial prioritisation']
          : ['independent prioritisation of competing tasks', 'independent decision-making'],
      now,
    });
    out.set(e.id, { assessmentId, report });
  }
  return out;
}
