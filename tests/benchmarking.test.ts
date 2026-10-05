import { describe as suite, expect, it } from 'vitest';
import {
  BenchmarkPermissionError,
  BenchmarkValidationError,
  CURRENT_WORKFORCE,
  HISTORICAL,
  INSUFFICIENT_DATA_MESSAGE,
  NEW_STARTER_BANDS,
  POPULATION_CHANGED_WARNING,
  ProtectedCharacteristicError,
  addCohortTag,
  benchmarkHistory,
  calibrateQuestions,
  coachingEffectiveness,
  compareEmployeeByDimension,
  compareEmployees,
  compareFrozenToCurrent,
  computeBenchmark,
  correlateWithKpi,
  createSnapshot,
  defineHighPerformanceCohort,
  departmentHeatmap,
  departmentSummary,
  detectOutliers,
  employeeFacingResult,
  absoluteBandFor,
  confidenceFor,
  resolveConfig,
  DEFAULT_CONFIG,
  DEFAULT_METRICS,
  BENCHMARK_ENGINE_VERSION,
  PROVISIONAL_EXPECTATIONS_VERSION,
  assessDimensionEvidence,
  supportsFirmConclusion,
  generateReportBenchmark,
  compareReportWithCurrent,
  type BenchmarkResult,
  focusEfficiency,
  individualHeatmap,
  median,
  normalisedScore,
  percentileRank,
  personalImprovement,
  populationChange,
  positionAgainst,
  previewExclusion,
  quantile,
  retestComparison,
  revealNames,
  spearman,
  correlationPValue,
  type Assessment,
  type Employee,
  type QuestionResponse,
} from '../src/benchmarking/index.js';
import { NOW, assessment, buildDataset, director, employeeActor, manager, salesCurrent } from './fixtures.js';

const metric = (data: ReturnType<typeof buildDataset>, key: string) =>
  data.metrics.find((m) => m.key === key)!;

/** A ready-made available benchmark over arbitrary values, labelled "Sales". */
function fakeBenchmark(values: number[]): BenchmarkResult {
  const data = buildDataset();
  const b = computeBenchmark(data, salesCurrent, 'decision_efficiency', { now: NOW });
  return {
    ...b,
    available: true,
    values: values.map((value, i) => ({ employeeId: `x${i}`, assessmentId: `ax${i}`, value, adjusted: false })),
  };
}

suite('statistics', () => {
  it('computes median, quantiles and percentile rank', () => {
    expect(median([1, 3, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(quantile([1, 2, 3, 4, 5], 0.25)).toBe(2);
    expect(percentileRank(74, [60, 65, 70, 80])).toBe(75);
  });

  it('computes correlation significance', () => {
    expect(spearman([1, 2, 3, 4], [10, 20, 30, 40])).toBeCloseTo(1);
    // r = 0.5, n = 20 ⇒ p ≈ 0.0248
    expect(correlationPValue(0.5, 20)).toBeCloseTo(0.0248, 3);
  });
});

suite('benchmark population (§151–§156, §165)', () => {
  it('benchmarks active, eligible employees only and reports the sample size', () => {
    const data = buildDataset();
    const b = computeBenchmark(data, salesCurrent, 'decision_efficiency', { now: NOW });
    expect(b.available).toBe(true);
    expect(b.explanation.counts.eligibleEmployees).toBe(6); // no test account, no former employee
    expect(b.explanation.counts.excludedAssessments).toBe(1); // incomplete attempt
    expect(b.stats!.median).toBe(71);
    expect(b.sampleSizeLabel).toBe('Benchmark based on 6 eligible assessments (latest per employee, 6 employees).');
    expect(b.confidence).toBe('Limited');
  });

  it('includes former employees only in the historical benchmark', () => {
    const data = buildDataset();
    const hist = computeBenchmark(
      data,
      { ...salesCurrent, include: HISTORICAL, window: { kind: 'last_months', months: 12 } },
      'decision_efficiency',
    );
    expect(hist.values.map((v) => v.employeeId)).toContain('former');
    const cur = computeBenchmark(data, { ...salesCurrent, include: CURRENT_WORKFORCE }, 'decision_efficiency');
    expect(cur.values.map((v) => v.employeeId)).not.toContain('former');
  });

  it('refuses tiny cohorts (§155)', () => {
    const data = buildDataset();
    const b = computeBenchmark(
      data,
      { ...salesCurrent, scope: { kind: 'department', department: 'Stock Control' } },
      'decision_efficiency',
    );
    expect(b.available).toBe(false);
    expect(b.unavailableReason).toBe(INSUFFICIENT_DATA_MESSAGE);
    expect(b.stats).toBeNull();
    expect(b.confidence).toBe('Insufficient');
    // Director can still see the raw values for a manual comparison.
    expect(b.values).toHaveLength(3);
  });

  it('does not benchmark department-specific metrics across departments (§168)', () => {
    const data = buildDataset();
    const b = computeBenchmark(
      data,
      { ...salesCurrent, scope: { kind: 'cohort', name: 'Customer-facing', cohortTags: ['Customer-facing'] } },
      'commercial_awareness',
    );
    expect(b.available).toBe(false);
    expect(b.unavailableReason).toMatch(/not designed to be compared across departments/);
  });

  it('builds custom cohorts from departments (§150)', () => {
    const data = buildDataset();
    const b = computeBenchmark(
      data,
      { ...salesCurrent, scope: { kind: 'cohort', name: 'Commercial Team', departments: ['Sales', 'Marketing'] } },
      'decision_efficiency',
    );
    expect(b.explanation.populationLabel).toBe('Commercial Team');
    expect(b.explanation.sampleSize).toBe(11);
    expect(b.confidence).toBe('Moderate');
  });

  it('compares new starters with established employees (§166)', () => {
    const data = buildDataset();
    const b = computeBenchmark(
      data,
      { ...salesCurrent, tenureBands: ['new_starter'] },
      'decision_efficiency',
      { tenureBands: NEW_STARTER_BANDS },
    );
    expect(b.values.map((v) => v.employeeId)).toEqual(['sam']);
  });
});

suite('eligibility ledger & audit (§151–§153, §182–§185)', () => {
  it('excludes an assessment without deleting it and records who/when/why', () => {
    const data = buildDataset();
    data.ledger.excludeAssessment(director, 'raj-sep', 'technical_failure', 'Browser crashed');
    const b = computeBenchmark(data, salesCurrent, 'decision_efficiency');
    expect(b.values.map((v) => v.employeeId)).not.toContain('raj');
    expect(data.assessments.find((a) => a.id === 'raj-sep')).toBeDefined();
    const [event] = data.ledger.historyFor('raj-sep');
    expect(event).toMatchObject({
      action: 'assessment_excluded',
      actorId: director.id,
      reason: 'technical_failure',
      note: 'Browser crashed',
      at: NOW.toISOString(),
    });
  });

  it('employee exclusion removes all their assessments; restoration is reversible and audited', () => {
    const data = buildDataset();
    data.ledger.excludeEmployee(director, 'derry', 'pilot_user');
    let b = computeBenchmark(data, { ...salesCurrent, window: { kind: 'last_months', months: 12 } }, 'decision_efficiency');
    expect(b.explanation.counts.excludedEmployees).toBe(1);
    expect(b.explanation.counts.exclusionsByReason.pilot_user).toBe(3);
    data.ledger.restoreEmployee(director, 'derry', 'Pilot confirmed comparable');
    b = computeBenchmark(data, salesCurrent, 'decision_efficiency');
    expect(b.values.map((v) => v.employeeId)).toContain('derry');
    expect(data.ledger.historyFor('derry').map((e) => e.action)).toEqual([
      'employee_excluded',
      'employee_restored',
    ]);
  });

  it('requires a note for "Other" and a reason for restoration', () => {
    const data = buildDataset();
    expect(() => data.ledger.excludeAssessment(director, 'katie-sep', 'other')).toThrow(BenchmarkValidationError);
    expect(() => data.ledger.restoreAssessment(director, 'katie-sep', 'x')).toThrow(/not currently excluded/);
    data.ledger.excludeAssessment(director, 'katie-sep', 'duplicate_assessment');
    expect(() => data.ledger.restoreAssessment(director, 'katie-sep', ' ')).toThrow(BenchmarkValidationError);
  });

  it('locks inclusion changes to Directors / authorised users (§184)', () => {
    const data = buildDataset();
    expect(() => data.ledger.excludeEmployee(manager, 'sam', 'other', 'drags our average')).toThrow(
      BenchmarkPermissionError,
    );
    data.ledger.excludeEmployee({ ...manager, benchmarkAuthority: true }, 'sam', 'test_account');
    expect(data.ledger.isEmployeeExcluded('sam')).toBe(true);
  });

  it('invalidating an assessment removes it from benchmarks', () => {
    const data = buildDataset();
    data.ledger.setAssessmentValidity(director, 'ola-sep', 'invalidated', 'Different test conditions');
    const b = computeBenchmark(data, salesCurrent, 'decision_efficiency');
    expect(b.explanation.counts.exclusionsByReason.assessment_invalidated).toBe(1);
  });

  it('previews the effect of an exclusion (§182)', () => {
    const data = buildDataset();
    const p = previewExclusion(data, salesCurrent, 'decision_efficiency', { employeeIds: ['sam'] });
    expect(p.current.stats!.median).toBe(71);
    expect(p.withoutSelected.stats!.median).toBe(72);
    expect(p.material).toBe(true);
    // The preview never touches the real ledger.
    expect(data.ledger.isEmployeeExcluded('sam')).toBe(false);
  });
});

suite('absolute band vs relative percentile (§157–§160, §193)', () => {
  it('keeps the absolute band separate from the percentile', () => {
    const data = buildDataset();
    const m = metric(data, 'decision_efficiency');
    const b = computeBenchmark(data, salesCurrent, 'decision_efficiency');
    const derry = positionAgainst(b, m, 76, 'derry');
    expect(derry.absolute).toEqual({
      band: 'Strong',
      level: 'standard',
      status: 'provisional',
      thresholdsVersion: PROVISIONAL_EXPECTATIONS_VERSION,
    });
    expect(derry.percentile).toBe(100);
    expect(derry.summary).toBe(
      'Decision Efficiency: 76 – Strong (provisional expectations). Sales percentile: 100th (compared with 5 colleagues, Limited confidence).',
    );
  });

  it('a strong result in a strong team is still Strong, with a low percentile', () => {
    const m = { ...DEFAULT_METRICS.find((x) => x.key === 'decision_efficiency')!, absoluteBands: { development: 60, strong: 75, version: 'v-test', validated: true } };
    const strongTeam = fakeBenchmark([80, 82, 84, 85, 88, 90]);
    const p = positionAgainst(strongTeam, m, 78);
    expect(p.absolute.band).toBe('Strong');
    expect(p.percentile).toBe(0);
    expect(p.summary).toBe('Decision Efficiency: 78 – Strong. Sales percentile: 0th (compared with 6 colleagues, Limited confidence).');
    expect(p.context).toMatch(/comparison group is also performing strongly/);
  });

  it('a weak result in a weak team is still a Development Opportunity, with a high percentile', () => {
    const m = metric(buildDataset(), 'decision_efficiency');
    const weakTeam = fakeBenchmark([40, 42, 45, 48, 50, 52]);
    const p = positionAgainst(weakTeam, m, 54);
    expect(p.absolute.band).toBe('Development Opportunity');
    expect(p.percentile).toBe(100);
    expect(p.context).toMatch(/group's overall level may need attention/);
  });

  it('applies absolute bands in the metric direction (lower is better)', () => {
    const m = metric(buildDataset(), 'recheck_rate'); // provisional: > 40 development, ≤ 15 strong
    expect(absoluteBandFor(m, 12).band).toBe('Strong');
    expect(absoluteBandFor(m, 25).band).toBe('Expected / Typical');
    expect(absoluteBandFor(m, 47).band).toBe('Development Opportunity');
    expect(absoluteBandFor(metric(buildDataset(), 'avg_response_seconds'), 30)).toEqual({
      band: null,
      level: 'standard',
      status: 'not_configured',
      thresholdsVersion: null,
    });
  });

  it('stores the comparison context with every position', () => {
    const data = buildDataset();
    data.ledger.excludeAssessment(director, 'ola-sep', 'technical_failure');
    const b = computeBenchmark(data, salesCurrent, 'decision_efficiency', { now: NOW });
    const p = positionAgainst(b, metric(data, 'decision_efficiency'), 68, 'katie');
    expect(p.comparison).toMatchObject({
      populationLabel: 'Sales',
      comparisonPopulationSize: 4,
      eligibleEmployees: 5,
      confidence: 'Insufficient',
      benchmarkCalculatedAt: NOW.toISOString(),
      engineVersion: BENCHMARK_ENGINE_VERSION,
      assessmentVersions: ['v1'],
    });
    expect(p.comparison.counts.exclusionsByReason).toEqual({ incomplete_assessment: 1, technical_failure: 1 });
    // Only 4 colleagues – no percentile is given.
    expect(p.percentile).toBeNull();
    expect(p.absolute.band).toBe('Expected / Typical');
  });

  it('measures leaders against the stricter leader expectations', () => {
    const data = buildDataset();
    const m = metric(data, 'decision_efficiency'); // everyone: < 60 / ≥ 75; leaders: < 70 / ≥ 80
    expect([59, 60, 75].map((v) => absoluteBandFor(m, v).band)).toEqual(['Development Opportunity', 'Expected / Typical', 'Strong']);
    expect([69, 70, 79, 80].map((v) => absoluteBandFor(m, v, 'leader').band)).toEqual([
      'Development Opportunity',
      'Expected / Typical',
      'Expected / Typical',
      'Strong',
    ]);
    expect(absoluteBandFor(m, 80, 'leader').level).toBe('leader');
    // Measures without leader thresholds use the everyone thresholds.
    const recheck = absoluteBandFor(metric(data, 'recheck_rate'), 12, 'leader');
    expect(recheck).toMatchObject({ band: 'Strong', level: 'standard' });
    // A position for a leader says so.
    const b = computeBenchmark(data, salesCurrent, 'decision_efficiency');
    const p = positionAgainst(b, m, 76, 'derry', undefined, false, 'leader');
    expect(p.absolute.band).toBe('Expected / Typical');
    expect(p.summary).toMatch(/^Decision Efficiency: 76 – Expected \/ Typical against leader expectations \(provisional expectations\)\./);
    expect(employeeFacingResult(m, 76, 'leader').band).toBe('Expected / Typical');
  });

  it('employee-facing results show the absolute band only', () => {
    const r = employeeFacingResult(metric(buildDataset(), 'decision_efficiency'), 78);
    expect(r).toEqual({ metricLabel: 'Decision Efficiency', band: 'Strong', message: 'A strength' });
  });

  it('compares an employee by dimension against a department benchmark (§160)', () => {
    const data = buildDataset();
    const rows = compareEmployeeByDimension(data, 'katie', salesCurrent, ['absorb', 'prioritise', 'decision_efficiency']);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ metricLabel: 'Absorb', employeeValue: 73 });
    expect(rows[0]!.position!.comparison.comparisonPopulationSize).toBe(5);
  });
});

suite('confidence levels (§159)', () => {
  it('uses 1–4 / 5–9 / 10–19 / 20–29 / 30+', () => {
    const c = resolveConfig();
    expect([0, 4, 5, 9, 10, 19, 20, 29, 30, 80].map((n) => confidenceFor(n, c))).toEqual([
      'Insufficient', 'Insufficient', 'Limited', 'Limited', 'Moderate', 'Moderate', 'Good', 'Good', 'High', 'High',
    ]);
  });
});

suite('robust outliers (§181)', () => {
  const m = () => metric(buildDataset(), 'decision_efficiency');
  const group = [68, 69, 70, 70, 71, 71, 72, 72, 73, 74, 75];

  it('uses MAD by default and flags only statistically unusual results', () => {
    const big = fakeBenchmark([...group, 140]);
    const out = detectOutliers(big, m());
    expect(out.map((o) => o.value)).toEqual([140]);
    expect(out[0]!.flag).toMatchObject({ label: 'Significant Outlier', method: 'mad', direction: 'above' });
    expect(out[0]!.flag.description).toContain('does not indicate poor performance or problematic behaviour');
  });

  it('is not masked by the outlier inflating the standard deviation', () => {
    // Three extreme values inflate the SD so neither is 3 SDs from the mean, but MAD still flags them.
    const values = [...group, 115, 120, 125];
    const sdOut = detectOutliers(fakeBenchmark(values), m(), { outliers: { ...DEFAULT_CONFIG.outliers, method: 'sd' } });
    const madOut = detectOutliers(fakeBenchmark(values), m());
    expect(sdOut).toHaveLength(0);
    expect(madOut.map((o) => o.value).sort()).toEqual([115, 120, 125]);
  });

  it('supports IQR fences', () => {
    const out = detectOutliers(fakeBenchmark([...group, 140]), m(), {
      outliers: { ...DEFAULT_CONFIG.outliers, method: 'iqr' },
    });
    expect(out[0]!.flag.method).toBe('iqr');
  });

  it('suppresses detection for small cohorts', () => {
    const small = fakeBenchmark([70, 71, 72, 73, 74, 200]);
    expect(detectOutliers(small, m())).toEqual([]);
    const p = positionAgainst(small, m(), 200);
    expect(p.outlier).toBeNull();
    expect(p.outlierSuppressed).toMatch(/at least 10 people/);
    expect(p.zScore).not.toBeNull(); // SD-based z still shown for analytics
  });
});

suite('ME vs ME and change over time (§172–§173, §187–§189)', () => {
  it('tracks personal improvement', () => {
    const data = buildDataset();
    const p = personalImprovement(data, 'derry', 'decision_efficiency');
    expect(p.series.map((s) => s.value)).toEqual([61, 69, 76]);
    expect(p).toMatchObject({ previous: 69, current: 76, change: 7, changeLabel: '+7', direction: 'improved' });
    const r = personalImprovement(data, 'derry', 'recheck_rate');
    expect(r.changeLabel).toBe('−10 percentage points');
    expect(r.direction).toBe('improved'); // lower re-check rate is better
  });

  it('keeps an excluded employee’s own history visible', () => {
    const data = buildDataset();
    data.ledger.excludeEmployee(director, 'derry', 'reasonable_adjustment');
    expect(personalImprovement(data, 'derry', 'decision_efficiency').current).toBe(76);
  });

  it('interprets a re-test against the department', () => {
    const data = buildDataset();
    const r = retestComparison(data, 'derry', 'decision_efficiency', salesCurrent);
    expect(r.benchmarkMedian).toBe(71);
    expect(r.interpretation).toBe(
      'Improvement of 7; current result is Strong; Sales percentile 100th.',
    );
  });

  it('measures coaching effectiveness', () => {
    const data = buildDataset();
    (data.assessments as Assessment[]).push(
      assessment('katie', '2026-03-01T10:00:00Z', { unnecessary_review_seconds: 582 }),
      assessment('katie', '2026-09-25T10:00:00Z', { unnecessary_review_seconds: 258 }),
    );
    const c = coachingEffectiveness(data, {
      id: 'dev1',
      employeeId: 'katie',
      focus: 'Reduce unnecessary checking',
      metricKey: 'unnecessary_review_seconds',
      assignedAt: '2026-04-01',
    });
    expect(c.before!.value).toBe(582);
    expect(c.after!.value).toBe(258);
    expect(c.verdict).toBe('Significant behavioural improvement observed.');
  });

  it('builds benchmark history by period', () => {
    const data = buildDataset();
    const { window: _w, ...base } = salesCurrent;
    const h = benchmarkHistory(data, { ...base, include: HISTORICAL }, 'decision_efficiency', [
      { label: 'Q1', from: '2026-01-01', to: '2026-03-31' },
      { label: 'Q3', from: '2026-07-01', to: '2026-09-30' },
    ]);
    expect(h[0]!.available).toBe(false); // only 2 people in Q1
    expect(h[1]!.median).toBe(71);
  });
});

suite('Director comparisons (§161–§164, §176–§177, §186, §194)', () => {
  it('is Director-only', () => {
    const data = buildDataset();
    expect(() => compareEmployees(employeeActor, data, ['katie', 'donna'], ['accuracy'])).toThrow(
      BenchmarkPermissionError,
    );
  });

  it('hides staff from the view without changing eligibility (§164)', () => {
    const data = buildDataset();
    const c = compareEmployees(director, data, ['derry', 'katie', 'donna', 'dirtest'], ['accuracy'], {
      hiddenEmployeeIds: ['dirtest'],
    });
    expect(c.columns.map((col) => col.label)).toEqual(['Derry', 'Katie', 'Donna']);
    expect(data.ledger.isEmployeeExcluded('dirtest')).toBe(false);
  });

  it('describes behaviours rather than declaring a winner (§176)', () => {
    const data = buildDataset();
    const c = compareEmployees(director, data, ['katie', 'donna'], ['accuracy', 'avg_response_seconds', 'recheck_rate']);
    expect(c.interpretation).toContain('Both achieved similar accuracy.');
    expect(c.interpretation).toContain('Donna reached comparable outcomes with substantially less additional review.');
    expect(c.interpretation.join(' ')).not.toMatch(/better employee|best|worst/i);
  });

  it('supports blind comparison and name reveal (§186)', () => {
    const data = buildDataset();
    const c = compareEmployees(director, data, ['katie', 'donna', 'derry'], ['decide'], { blind: true });
    expect(c.columns.map((col) => col.label)).toEqual(['Employee A', 'Employee B', 'Employee C']);
    expect(c.columns.every((col) => col.employeeId === null)).toBe(true);
    const revealed = revealNames(director, data, c);
    expect(revealed.columns.map((col) => col.employeeId).sort()).toEqual(['derry', 'donna', 'katie']);
  });

  it('computes Focus Efficiency with a caveat (§177)', () => {
    const data = buildDataset();
    const [r] = focusEfficiency(director, data, ['katie', 'donna', 'derry'], [
      { metricKey: 'accuracy', weight: 1 },
      { metricKey: 'prioritise', weight: 1 },
    ]);
    expect(r!.value).not.toBeNull();
    expect(r!.caveat).toMatch(/must not be used as a sole performance score/);
  });
});

suite('heatmaps & summaries (§174–§175, §190)', () => {
  it('builds a department heatmap with availability per cell', () => {
    const data = buildDataset();
    const { scope: _s, ...base } = salesCurrent;
    const h = departmentHeatmap(director, data, base);
    expect(h.metrics).toHaveLength(10);
    const stock = h.rows.find((r) => r.department === 'Stock Control')!;
    expect(stock.cells.every((c) => !c.available)).toBe(true);
    const sales = h.rows.find((r) => r.department === 'Sales')!;
    expect(sales.cells[0]!.median).toBe(71);
  });

  it('builds an individual heatmap that can show/hide excluded records and sort', () => {
    const data = buildDataset();
    let h = individualHeatmap(director, data, { department: 'Sales' });
    expect(h.rows.map((r) => r.employeeId)).not.toContain('dirtest');
    h = individualHeatmap(director, data, {
      department: 'Sales',
      showExcluded: true,
      sortBy: { metricKey: 'decide', direction: 'desc' },
    });
    expect(h.rows[0]!.employeeId).toBe('dirtest');
    expect(h.rows[0]!.excluded).toBe(true);
    expect(Object.keys(h.rows[0]!)).not.toContain('overall');
  });

  it('summarises a department', () => {
    const data = buildDataset();
    const { scope: _s, ...base } = salesCurrent;
    const s = departmentSummary(director, data, 'Sales', base);
    expect(s.employeesAssessed).toBe(6);
    expect(s.strongestCollectiveDimension).toBeTruthy();
    expect(s.averageAccuracy).toBeCloseTo(87.3, 1);
  });
});

suite('snapshots & integrity (§171, §196–§197)', () => {
  it('freezes a benchmark and compares it with the current one', () => {
    const data = buildDataset();
    const before = computeBenchmark(data, salesCurrent, 'decision_efficiency');
    const snap = createSnapshot(director, 'Sales Team – October 2026', [before], { id: 's1', now: NOW });
    expect(Object.isFrozen(snap.metrics)).toBe(true);
    data.ledger.excludeEmployee(director, 'sam', 'test_account');
    data.ledger.excludeEmployee(director, 'raj', 'test_account');
    const after = computeBenchmark(data, salesCurrent, 'decision_efficiency');
    const cmp = compareFrozenToCurrent(snap, after);
    expect(cmp.frozenMedian).toBe(71);
    // Two fewer people leaves the current benchmark below the minimum cohort size.
    expect(cmp.currentMedian).toBeNull();
    expect(cmp.integrity.warning).toBe(POPULATION_CHANGED_WARNING);
  });

  it('does not warn when only the time window moves', () => {
    const shape = { definition: salesCurrent, employeeIds: ['a', 'b', 'c', 'd', 'e'], versions: ['v1'] };
    const r = populationChange(shape, {
      ...shape,
      definition: { ...salesCurrent, window: { kind: 'last_months', months: 6 } },
    });
    expect(r.significant).toBe(false);
  });
});

suite('calibration & normalisation (§169–§170)', () => {
  it('calibrates questions and normalises across different question sets', () => {
    const responses: QuestionResponse[] = [];
    for (let i = 0; i < 40; i++) {
      const strong = i < 20;
      for (const [q, easy] of [['easy', true], ['hard', false]] as const) {
        responses.push({
          questionId: q,
          family: 'prioritisation',
          assessmentId: `as${i}`,
          employeeId: `e${i}`,
          department: i % 2 ? 'Sales' : 'Finance',
          correct: easy ? !(i >= 20 && i % 4 === 3) : strong && i % 2 === 0,
          timeSeconds: 30 + i,
          reviews: i % 4 === 0 ? 1 : 0,
          answerChanged: i % 5 === 0,
        });
      }
    }
    const cal = calibrateQuestions(responses);
    const easy = cal.find((c) => c.questionId === 'easy')!;
    const hard = cal.find((c) => c.questionId === 'hard')!;
    expect(easy.calibrated).toBe(true);
    expect(easy.difficulty).toBeLessThan(hard.difficulty);
    expect(hard.discrimination).toBeGreaterThan(0);
    const map = new Map(cal.map((c) => [c.questionId, c]));
    // Getting a hard question right is worth more than an easy one.
    const onHard = normalisedScore([{ questionId: 'hard', correct: true }], map)!;
    const onEasy = normalisedScore([{ questionId: 'easy', correct: true }], map)!;
    expect(onHard).toBeGreaterThan(onEasy);
    expect(normalisedScore([{ questionId: 'unknown', correct: true }], map)).toBeNull();
  });
});

suite('external correlation (§178–§180)', () => {
  it('reports a meaningful relationship when there is one', () => {
    const pairs = [...Array(12)].map((_, i) => ({ employeeId: `e${i}`, focusValue: 50 + i * 3, kpiValue: 80 + i * 2 + (i % 2) }));
    const f = correlateWithKpi(director, 'Prioritisation', 'Target attainment', pairs);
    expect(f.meaningful).toBe(true);
    expect(f.insight).toMatch(/^Employees demonstrating stronger Prioritisation scores currently show better Target attainment/);
  });

  it('is willing to say a measure is not useful', () => {
    const noise = [3, 9, 1, 7, 5, 2, 8, 4, 6, 10];
    const pairs = noise.map((k, i) => ({ employeeId: `e${i}`, focusValue: i, kpiValue: k * (i % 2 ? 1 : -1) + 50 }));
    const f = correlateWithKpi(director, 'Puzzle performance', 'Sales performance', pairs);
    expect(f.meaningful).toBe(false);
    expect(f.insight).toMatch(/^No meaningful relationship has yet been found/);
  });

  it('requires external evidence for high-performance cohorts', () => {
    expect(() =>
      defineHighPerformanceCohort(director, {
        name: 'Top scorers',
        employeeIds: ['katie'],
        evidenceSource: 'focusiq_score',
        evidenceDescription: 'Highest FocusiQ',
      }),
    ).toThrow(/external job-performance evidence/);
  });
});

suite('cohort tags (§198–§199)', () => {
  it('adds audited tags and rejects protected characteristics', () => {
    const data = buildDataset();
    const sam = data.employees.find((e) => e.id === 'sam')!;
    const tagged = addCohortTag(director, data.ledger, sam, 'Office based', 'Works from HQ');
    expect(tagged.cohortTags).toContain('Office based');
    expect(tagged.department).toBe('Sales');
    expect(data.ledger.historyFor('sam')[0]!.action).toBe('cohort_changed');
    expect(() => addCohortTag(director, data.ledger, sam, 'Over 50s', 'x')).toThrow(ProtectedCharacteristicError);
    expect(() => addCohortTag(director, data.ledger, sam, 'Female staff', 'x')).toThrow(ProtectedCharacteristicError);
    expect(() => addCohortTag(director, data.ledger, sam, 'Manager', 'x')).not.toThrow();
  });
});

suite('one result per person; full trend history (point 1)', () => {
  it('benchmarks only the latest eligible assessment per person, even over a long window', () => {
    const data = buildDataset();
    const b = computeBenchmark(data, { ...salesCurrent, window: { kind: 'last_months', months: 12 } }, 'decision_efficiency');
    const derry = b.values.filter((v) => v.employeeId === 'derry');
    expect(derry).toEqual([{ employeeId: 'derry', assessmentId: 'derry-sep', value: 76, adjusted: false }]);
    expect(b.explanation.counts.eligibleAssessments).toBe(b.explanation.counts.eligibleEmployees);
    expect(b.explanation.counts.supersededAssessments).toBe(2); // Derry's Jan + Apr
  });

  it('keeps every valid assessment in personal trend history', () => {
    const data = buildDataset();
    data.ledger.excludeEmployee(director, 'derry', 'pilot_user');
    data.ledger.excludeAssessment(director, 'derry-apr', 'reasonable_adjustment');
    expect(personalImprovement(data, 'derry', 'decision_efficiency').series.map((s) => s.assessmentId)).toEqual([
      'derry-jan',
      'derry-apr',
      'derry-sep',
    ]);
  });

  it('drops results that are not genuine measurements from the trend', () => {
    const data = buildDataset();
    data.ledger.excludeAssessment(director, 'derry-apr', 'technical_failure', 'Timer froze');
    expect(personalImprovement(data, 'derry', 'decision_efficiency').series.map((s) => s.value)).toEqual([61, 76]);
  });
});

suite('eligibility at employee and assessment level (point 7)', () => {
  it('Simon Test Account excluded completely; Katie normally included but one assessment excluded', () => {
    const data = buildDataset();
    (data.employees as Employee[]).push({ id: 'simon-test', displayName: 'Simon Test Account', department: 'Sales', status: 'active', startDate: '2020-01-01', cohortTags: [] });
    (data.assessments as Assessment[]).push(
      assessment('simon-test', '2026-09-01T10:00:00Z', { decision_efficiency: 99 }, { id: 'simon-1' }),
      assessment('simon-test', '2026-09-20T10:00:00Z', { decision_efficiency: 98 }, { id: 'simon-2' }),
      assessment('katie', '2026-09-25T10:00:00Z', { decision_efficiency: 20 }, { id: 'katie-2' }),
    );
    data.ledger.excludeEmployee(director, 'simon-test', 'test_account', 'Director demo account');
    data.ledger.excludeAssessment(director, 'katie-2', 'technical_failure', 'Browser crashed mid-exercise');

    const b = computeBenchmark(data, { ...salesCurrent, window: { kind: 'last_months', months: 12 } }, 'decision_efficiency');
    expect(b.values.find((v) => v.employeeId === 'simon-test')).toBeUndefined();
    expect(b.values.find((v) => v.employeeId === 'katie')).toMatchObject({ assessmentId: 'katie-sep', value: 68 });
    expect(b.explanation.counts).toMatchObject({ excludedEmployees: 1 });
    expect(b.explanation.counts.exclusionsByReason).toMatchObject({ test_account: 2, technical_failure: 1 });
    // Nothing deleted; every decision carries reason, person and timestamp.
    expect(data.assessments.map((a) => a.id)).toEqual(expect.arrayContaining(['simon-1', 'simon-2', 'katie-2']));
    for (const id of ['simon-test', 'katie-2']) {
      const [e] = data.ledger.historyFor(id);
      expect(e).toMatchObject({ actorId: director.id, at: NOW.toISOString() });
      expect(e!.reason).toBeTruthy();
    }
  });
});

suite('adjusted assessments (point 8)', () => {
  it('flags an adjusted assessment without excluding it, then applies the decision', () => {
    const data = buildDataset();
    data.ledger.flagAdjustedAssessment(director, 'ola-sep', 'Extra time agreed as a reasonable adjustment');
    let b = computeBenchmark(data, salesCurrent, 'decision_efficiency');
    expect(b.values.find((v) => v.employeeId === 'ola')).toMatchObject({ adjusted: true });
    expect(b.explanation.counts).toMatchObject({ adjustedAssessments: 1, adjustedPendingReview: 1 });
    expect(b.warnings.join(' ')).toMatch(/await a comparability decision/);

    data.ledger.reviewAdjustedAssessment(director, 'ola-sep', 'comparable', 'Extra time does not affect untimed measures');
    b = computeBenchmark(data, salesCurrent, 'decision_efficiency');
    expect(b.explanation.counts.adjustedPendingReview).toBe(0);
    expect(b.values.some((v) => v.employeeId === 'ola')).toBe(true);

    const data2 = buildDataset();
    data2.ledger.flagAdjustedAssessment(director, 'ola-sep', 'Paper version used');
    data2.ledger.reviewAdjustedAssessment(director, 'ola-sep', 'not_comparable', 'Different format');
    const b2 = computeBenchmark(data2, salesCurrent, 'decision_efficiency');
    expect(b2.values.some((v) => v.employeeId === 'ola')).toBe(false);
    expect(b2.explanation.counts.exclusionsByReason.reasonable_adjustment).toBe(1);
    // Still in Ola's own history.
    expect(personalImprovement(data2, 'ola', 'decision_efficiency').current).toBe(70);
    expect(data2.ledger.historyFor('ola-sep').map((e) => e.action)).toEqual([
      'assessment_adjustment_flagged',
      'assessment_adjustment_reviewed',
    ]);
  });
});

suite('report benchmark freeze (point 9)', () => {
  it('saves the benchmark at the assessment date and never changes it', () => {
    const data = buildDataset();
    const { asOf: _a, ...population } = salesCurrent;
    const report = generateReportBenchmark(
      director,
      data,
      {
        employeeId: 'derry',
        assessmentId: 'derry-sep',
        population,
        metricKeys: ['decision_efficiency'],
        versions: { reportVersion: 'report/1.0', interpretationVersion: 'interp/1.0' },
        id: 'rep-1',
      },
      { now: NOW },
    );
    // Assessment date 2026-09-20: Sales results after that date are not in the population.
    const frozen = report.results.decision_efficiency!;
    expect(report.assessmentDate).toBe('2026-09-20T10:00:00Z');
    expect(frozen.comparison.comparisonPopulationSize).toBe(5);
    expect(report.snapshot.members.map((m) => m.employeeId).sort()).toEqual(['derry', 'donna', 'katie', 'ola', 'raj', 'sam']);
    expect(report.snapshot.metrics.decision_efficiency!.stats!.median).toBe(71);
    expect(Object.isFrozen(report.results)).toBe(true);

    // Later: team grows and someone is excluded.
    (data.employees as Employee[]).push(
      ...['n1', 'n2', 'n3'].map((id) => ({ id, displayName: id, department: 'Sales' as const, status: 'active' as const, startDate: '2026-09-01', cohortTags: [] })),
    );
    (data.assessments as Assessment[]).push(
      ...['n1', 'n2', 'n3'].map((id) => assessment(id, '2026-09-28T10:00:00Z', { decision_efficiency: 85 })),
    );
    data.ledger.excludeEmployee(director, 'sam', 'test_account');

    expect(report.snapshot.metrics.decision_efficiency!.stats!.median).toBe(71); // unchanged
    const cmp = compareReportWithCurrent(director, data, report, { now: new Date('2026-10-30T00:00:00Z') });
    expect(cmp.rows[0]).toMatchObject({
      atAssessmentDate: { median: 71, percentile: 100, comparisonPopulationSize: 5 },
      current: { comparisonPopulationSize: 7 },
    });
    expect(cmp.rows[0]!.current.median).toBe(75); // [68,70,72,74,76,85,85,85]
    expect(cmp.integrity.warning).toBe(POPULATION_CHANGED_WARNING);
  });
});

suite('minimum question evidence (point 10)', () => {
  const obs = (pattern: boolean[]) => pattern.map((showsPattern, i) => ({ exerciseId: `ex${i}`, showsPattern }));

  it('reports evidence count, consistency and confidence', () => {
    const e = assessDimensionEvidence('Decision Confidence', 'Hesitant decision-making', obs([true, true, true, true, true, true, true, true, false, false, false]));
    expect(e.evidenceLabel).toBe('Evidence: 11 exercises · Consistent pattern: 8/11 · Interpretation confidence: High');
    expect(supportsFirmConclusion(e)).toBe(true);
  });

  it('refuses a strong conclusion from two questions', () => {
    const e = assessDimensionEvidence('Re-checking', 'High re-checking tendency', obs([true, true]));
    expect(e.confidence).toBe('Insufficient');
    expect(e.interpretation).toBe('Not enough consistent evidence to draw a conclusion about high re-checking tendency.');
    expect(supportsFirmConclusion(e)).toBe(false);
  });

  it('treats mixed evidence as low confidence', () => {
    const e = assessDimensionEvidence('Re-checking', 'High re-checking tendency', obs([true, false, true, false, true]));
    expect(e.confidence).toBe('Low');
    expect(e.interpretation).toMatch(/tentative/);
  });
});

suite('configurable comparability (point 6)', () => {
  it('supports role-level comparability', () => {
    const data = buildDataset();
    const roleOnly = data.metrics.map((m) => (m.key === 'decision_efficiency' ? { ...m, requiresSameRole: true } : m));
    const withRoleMetric = { ...data, metrics: roleOnly, eligibility: data.eligibility };
    const dept = computeBenchmark(withRoleMetric, salesCurrent, 'decision_efficiency');
    expect(dept.available).toBe(true); // every Sales employee is a Salesperson
    const company = computeBenchmark(withRoleMetric, { ...salesCurrent, scope: { kind: 'company' } }, 'decision_efficiency');
    expect(company.unavailableReason).toMatch(/only comparable between people in the same job role/);
    const role = computeBenchmark(withRoleMetric, { ...salesCurrent, scope: { kind: 'role', role: 'Salesperson' } }, 'decision_efficiency');
    expect(role.available).toBe(true);
  });
});
