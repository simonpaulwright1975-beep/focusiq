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
  employeeFacingBenchmark,
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
  type QuestionResponse,
} from '../src/benchmarking/index.js';
import { NOW, assessment, buildDataset, director, employeeActor, manager, salesCurrent } from './fixtures.js';

const metric = (data: ReturnType<typeof buildDataset>, key: string) =>
  data.metrics.find((m) => m.key === key)!;

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
    expect(b.sampleSizeLabel).toBe('Benchmark based on 6 eligible assessments from 6 employees.');
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

suite('positioning (§157–§160, §181, §193)', () => {
  it('gives a Director percentile and an employee-friendly band', () => {
    const data = buildDataset();
    const b = computeBenchmark(data, salesCurrent, 'decision_efficiency');
    const pos = positionAgainst(b, metric(data, 'decision_efficiency'), 76, 'derry');
    expect(pos.percentile).toBe(100);
    expect(pos.band).toBe('Above Typical Range');
    const facing = employeeFacingBenchmark(metric(data, 'decision_efficiency'), pos);
    expect(facing.message).toBe('Above the typical range');
    expect(JSON.stringify(facing)).not.toMatch(/percentile|rank/i);
  });

  it('orients lower-is-better metrics', () => {
    const data = buildDataset();
    const m = { ...metric(data, 'recheck_rate'), higherIsBetter: false };
    const fake = {
      ...computeBenchmark(data, salesCurrent, 'decision_efficiency'),
      values: [10, 20, 30, 40, 50, 60].map((value, i) => ({ employeeId: `x${i}`, value, assessmentIds: [] })),
    };
    expect(positionAgainst(fake, m, 5).band).toBe('Above Typical Range');
    expect(positionAgainst(fake, m, 65).band).toBe('Development Range');
  });

  it('flags statistical outliers neutrally', () => {
    const data = buildDataset();
    const b = computeBenchmark(data, salesCurrent, 'decision_efficiency');
    const values = [...Array(20)].map((_, i) => ({ employeeId: `e${i}`, assessmentIds: [], value: 70 + (i % 3) }));
    values.push({ employeeId: 'odd', assessmentIds: [], value: 200 });
    const big = { ...b, stats: { ...b.stats!, mean: 75.5, standardDeviation: 28 }, values };
    const out = detectOutliers(big, metric(data, 'decision_efficiency'));
    expect(out.map((o) => o.employeeId)).toEqual(['odd']);
    expect(out[0]!.flag.label).toBe('Significant Outlier');
  });

  it('compares an employee by dimension against a department benchmark (§160)', () => {
    const data = buildDataset();
    const rows = compareEmployeeByDimension(data, 'katie', salesCurrent, ['absorb', 'prioritise', 'decision_efficiency']);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ metricLabel: 'Absorb', employeeValue: 73 });
    expect(rows.every((r) => r.benchmarkMedian !== null)).toBe(true);
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
      "Improvement of 7; current result is above the department's typical range.",
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
