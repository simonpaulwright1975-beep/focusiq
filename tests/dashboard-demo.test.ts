import { describe as suite, expect, it } from 'vitest';
import { absoluteBandFor, computeBenchmark } from '../src/benchmarking/index.js';
import { organisationInsights } from '../src/insight/index.js';
import { buildDemoData, DEMO_DIRECTOR, DEMO_NOW, METRICS } from '../app/src/demo/dataset.js';
import { buildInsightReports } from '../app/src/insights.js';

suite('dashboard demo data', () => {
  const demo = buildDemoData();
  const data = { employees: demo.employees, assessments: demo.assessments, metrics: METRICS, eligibility: demo.ledger.state() };

  it('generates an insight report for every employee that passes the language safeguard', () => {
    const reports = buildInsightReports(demo, DEMO_NOW);
    expect(reports.size).toBe(demo.employees.length);
    for (const { report } of reports.values()) expect(report.directorSummary).toHaveLength(12);
  });

  it('shows Stock Control as unavailable and Customer Service escalation as a shared pattern', () => {
    const def = (d: 'Stock Control' | 'Customer Service') => ({
      scope: { kind: 'department' as const, department: d },
      include: { active: true, former: false, pilot: false, test: false },
      window: { kind: 'latest' as const },
      asOf: DEMO_NOW.toISOString(),
    });
    expect(computeBenchmark(data, def('Stock Control'), 'decide').available).toBe(false);
    const reports = buildInsightReports(demo, DEMO_NOW);
    const members = demo.employees
      .filter((e) => e.status === 'active' && e.department === 'Customer Service')
      .map((e) => ({ employeeId: e.id, group: e.department, findings: reports.get(e.id)!.report.findings }));
    expect(organisationInsights(DEMO_DIRECTOR, members).map((o) => o.patternKey)).toContain('high_escalation');
  });

  it('includes Stan, a sample Director on leader expectations who never counts towards benchmarks', () => {
    const stan = demo.employees.find((e) => e.id === 'stan')!;
    expect(stan).toMatchObject({ status: 'test', role: 'Director', expectations: 'leader' });
    const latest = demo.assessments.filter((a) => a.employeeId === 'stan').at(-1)!;
    const core = METRICS.filter((m) => m.coreDimension);
    const bands = core.map((m) => absoluteBandFor(m, latest.scores[m.key]!, 'leader').band);
    expect(bands.filter((b) => b === 'Strong')).toHaveLength(8);
    expect(bands.filter((b) => b === 'Expected / Typical')).toHaveLength(2);
  });

  it('live mode keeps only the sample profile: no fictional staff', () => {
    const sample = buildDemoData({ sampleOnly: true });
    expect(sample.employees.map((e) => e.id)).toEqual(['stan']);
    expect(new Set(sample.assessments.map((a) => a.employeeId))).toEqual(new Set(['stan']));
    expect([...sample.exercises.keys()].every((id) => id.startsWith('stan-'))).toBe(true);
    expect(sample.ledger.auditLog()).toEqual([]);
  });

  it('seeds an audited test-account exclusion, a technical failure and a pending adjustment', () => {
    expect(demo.ledger.auditLog().map((e) => e.action)).toEqual([
      'employee_excluded',
      'assessment_excluded',
      'assessment_adjustment_flagged',
    ]);
  });
});
