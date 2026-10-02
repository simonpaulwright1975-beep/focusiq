import { describe as suite, expect, it } from 'vitest';
import { BenchmarkPermissionError } from '../src/benchmarking/index.js';
import { EmployeeSummaryError, buildEmployeeSummary, toEmployeeVoice } from '../src/insight/index.js';
import { currentRelease, markReleaseRead, withdrawRelease, type SummaryRelease } from '../src/participation/index.js';
import { DEMO_DIRECTOR, DEMO_NOW, METRICS, buildDemoData } from '../app/src/demo/dataset.js';
import { buildInsightReports } from '../app/src/insights.js';

const demo = buildDemoData();
const data = { employees: demo.employees, assessments: demo.assessments, metrics: METRICS, eligibility: demo.ledger.state() };
const reports = buildInsightReports(demo, DEMO_NOW);
const grace = reports.get('s4')!;

function build(overrides: Partial<Parameters<typeof buildEmployeeSummary>[0]['options']> = {}, actor = DEMO_DIRECTOR) {
  return buildEmployeeSummary({
    actor,
    data,
    employeeId: 's4',
    employeeName: 'Grace',
    assessmentId: grace.assessmentId,
    report: grace.report,
    motivation: demo.motivation.get(grace.assessmentId),
    options: { includeBands: true, supportRecommendationIds: grace.report.recommendations.slice(0, 2).map((r) => r.id), ...overrides },
    now: DEMO_NOW,
    id: 'sum-1',
  });
}

suite('employee summary', () => {
  it('is constructive and never comparative', () => {
    const s = build();
    expect(s.paragraphs).toEqual(grace.report.employeeFacing.paragraphs);
    const text = JSON.stringify(s);
    expect(text).not.toMatch(/percentile|rank|colleague|Director/i);
    expect(s.dimensions.every((d) => ['Strength', 'Expected', 'Development opportunity'].includes(d.band))).toBe(true);
    // No scores leak through – only bands and direction of change.
    expect(s.dimensions.every((d) => Object.keys(d).sort().join() === 'band,change,description,key,label')).toBe(true);
  });

  it('compares only with the person’s own previous assessment', () => {
    const s = build();
    expect(s.previousAssessmentDate).not.toBeNull();
    expect(s.dimensions.every((d) => d.change !== null)).toBe(true);
    const first = buildEmployeeSummary({
      actor: DEMO_DIRECTOR, data, employeeId: 's4', employeeName: 'Grace', assessmentId: 's4-r1', report: grace.report,
      options: { includeBands: true, supportRecommendationIds: [] }, now: DEMO_NOW,
    });
    expect(first.dimensions.every((d) => d.change === null)).toBe(true);
  });

  it('flags provisional bands and leaves bands out unless the Director includes them', () => {
    expect(build().bandsProvisional).toBe(true);
    const narrativeOnly = build({ includeBands: false });
    expect(narrativeOnly.dimensions).toEqual([]);
    expect(narrativeOnly.bandsProvisional).toBe(false);
  });

  it('shares chosen support actions in the employee’s voice, and the top motivators', () => {
    const s = build();
    expect(s.support).toHaveLength(2);
    expect(JSON.stringify(s.support)).not.toMatch(/the employee/i);
    expect(toEmployeeVoice('State clearly which decisions the employee can make. Remove steps from the employee’s workflows (see Strength Utilisation).')).toBe(
      'State clearly which decisions you can make. Remove steps from your workflows.',
    );
    expect(s.motivators).toHaveLength(3);
    expect(() => build({ supportRecommendationIds: ['not-in-report'] })).toThrow(EmployeeSummaryError);
  });

  it('refuses comparative wording added by a Director, and non-Directors', () => {
    const id = grace.report.recommendations[0]!.id;
    expect(() => build({ supportRecommendationIds: [id], supportOverrides: { [id]: { detail: 'You are in the 30th percentile of Sales.' } } })).toThrow(/compare with colleagues/);
    expect(() => build({ personalMessage: 'You were ranked 5th in the team.' })).toThrow(EmployeeSummaryError);
    expect(() => build({}, { id: 'e', name: 'Employee', role: 'employee' })).toThrow(BenchmarkPermissionError);
  });

  it('can be withdrawn, and the employee confirms reading their own summary', () => {
    const release: SummaryRelease = { summary: build(), releasedBy: DEMO_DIRECTOR.id, withdrawn: null, readAt: null };
    expect(currentRelease([release], 's4')).toBe(release);
    const read = markReleaseRead(release, 's4', DEMO_NOW);
    expect(read.readAt).toBe(DEMO_NOW.toISOString());
    expect(() => markReleaseRead(release, 'someone-else', DEMO_NOW)).toThrow(/your own summary/);
    const withdrawn = withdrawRelease(read, 'Released before the conversation took place', DEMO_NOW);
    expect(currentRelease([withdrawn], 's4')).toBeNull();
    expect(() => withdrawRelease(withdrawn, 'again', DEMO_NOW)).toThrow(/already been withdrawn/);
  });
});
