import { describe as suite, expect, it } from 'vitest';
import {
  InsightLanguageError,
  PATTERNS,
  assertSafeLanguage,
  deriveExerciseEvidence,
  generateInsightReport,
  organisationInsights,
  type ExerciseEvidence,
  type Finding,
  type InsightReport,
} from '../src/insight/index.js';
import { BenchmarkPermissionError } from '../src/benchmarking/index.js';
import { director, employeeActor } from './fixtures.js';

let n = 0;
function ex(p: Partial<ExerciseEvidence>): ExerciseEvidence {
  n += 1;
  return {
    exerciseId: p.exerciseId ?? `e${n}`,
    family: 'f',
    dimension: 'decide',
    modality: 'text',
    sequence: n,
    timed: false,
    risk: 'high',
    correct: true,
    firstAnswerCorrect: true,
    reopened: false,
    answerChanged: false,
    responseSeconds: 40,
    reviewSecondsAfterFirstAnswer: 0,
    ...p,
  };
}

/** "Sarah": careful, accurate, over-checks lower-risk work, efficient under time limits (§203, §232). */
function sarahExercises(): ExerciseEvidence[] {
  n = 0;
  const low = (i: number, p: Partial<ExerciseEvidence>) => ex({ exerciseId: `L${i}`, risk: 'low', ...p });
  return [
    ...[1, 2, 3, 4, 5, 6, 7].map((i) => low(i, { reopened: true, reviewSecondsAfterFirstAnswer: 21 })),
    low(8, { reopened: true, firstAnswerCorrect: false, answerChanged: true, reviewSecondsAfterFirstAnswer: 21 }),
    low(9, { reopened: true, firstAnswerCorrect: false, correct: false, reviewSecondsAfterFirstAnswer: 21 }),
    ...[10, 11, 12, 13].map((i) => low(i, { timed: true, responseSeconds: 25 })),
    ...[1, 2, 3, 4, 5].map((i) => ex({ exerciseId: `H${i}`, dimension: 'absorb', timed: true, responseSeconds: 25 })),
    ex({ exerciseId: 'H6', dimension: 'absorb', timed: true, responseSeconds: 25, correct: false, firstAnswerCorrect: false }),
    ...[1, 2, 3, 4, 5, 6].map((i) => ex({ exerciseId: `R${i}`, dimension: 'remember' })),
    ...[1, 2, 3, 4, 5, 6].map((i) => ex({ exerciseId: `C${i}`, modality: 'scenario', customerImpactScenario: true, choseOutcomeAction: true })),
    ...[1, 2, 3, 4, 5].map((i) => ex({ exerciseId: `P${i}`, dimension: 'prioritise', priorityContext: 'defined' })),
    ...[1, 2, 3, 4].map((i) => ex({ exerciseId: `Q${i}`, dimension: 'prioritise', priorityContext: 'competing' })),
    ex({ exerciseId: 'Q5', dimension: 'prioritise', priorityContext: 'competing', correct: false, firstAnswerCorrect: false }),
  ];
}

function sarahReport(): InsightReport {
  return generateInsightReport({
    employee: { id: 'sarah', name: 'Sarah' },
    assessmentId: 'a-sarah',
    exercises: sarahExercises(),
    motivation: { ranked: ['progression', 'recognition', 'autonomy', 'customer_impact', 'financial_reward'] },
    roleDemands: ['rapid commercial prioritisation', 'independent prioritisation of competing tasks'],
    now: new Date('2026-10-02T12:00:00Z'),
  });
}

const keys = (r: InsightReport) => r.findings.map((f) => f.key).sort();

suite('evidence-based findings (§202, §203)', () => {
  it('detects the over-processing profile with traceable evidence', () => {
    const r = sarahReport();
    expect(keys(r)).toEqual(
      [
        'efficient_under_pressure',
        'needs_defined_priorities',
        'outcome_orientation',
        'over_processing',
        'strength_attention_to_detail',
        'strength_customer_ownership',
        'strength_decision_quality',
        'strength_information_retention',
      ].sort(),
    );
    const op = r.findings.find((f) => f.key === 'over_processing')!;
    expect(op.insight).toBe('Employee appears to over-check lower-risk decisions.');
    expect(op.evidence.map((e) => e.label)).toEqual([
      '9 of 13 relevant exercises were reopened',
      'First answer was already correct in 7 of those 9',
      'Additional checking improved only 1 outcome',
      'Average additional review time: 21 seconds',
      'Timed-task accuracy remained within 4% of untimed accuracy',
    ]);
    // "View Evidence": the underlying exercises.
    expect(op.evidence[0]!.exerciseIds).toEqual(['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9']);
    expect(op.evidence[2]!.exerciseIds).toEqual(['L8']);
    expect(op).toMatchObject({ evidenceCount: 13, consistentCount: 9, confidence: 'Moderate' });
  });

  it('every statement is traceable to findings', () => {
    const r = sarahReport();
    const found = new Set(r.findings.map((f) => f.key));
    const statements = [
      ...r.fourQuestions.whatThisTellsUs,
      ...r.fourQuestions.overallSummary,
      ...r.howToGetTheBest,
      ...r.roleFit.observations,
      ...r.directorSummary.flatMap((s) => s.statements),
    ];
    for (const s of statements) {
      for (const k of s.findingKeys) expect(found.has(k)).toBe(true);
    }
    expect(r.fourQuestions.whatThisTellsUs.every((s) => s.findingKeys.length > 0)).toBe(true);
    expect(r.findings.every((f) => f.evidence.every((e) => e.exerciseIds.length > 0))).toBe(true);
  });

  it('combines over-checking and timed efficiency into a capability insight', () => {
    const r = sarahReport();
    expect(r.fourQuestions.whatThisTellsUs.at(-1)).toEqual({
      text: 'Together, these suggest the employee is capable of working more quickly than their natural working style currently demonstrates, particularly on lower-risk tasks.',
      findingKeys: ['over_processing', 'efficient_under_pressure'],
    });
  });

  it('refuses to conclude from too little evidence (minimum question evidence)', () => {
    n = 0;
    const r = generateInsightReport({
      employee: { id: 'x', name: 'Alex' },
      assessmentId: 'a-x',
      exercises: [ex({ risk: 'low', reopened: true }), ex({ risk: 'low', reopened: true })],
    });
    expect(r.findings.map((f) => f.key)).not.toContain('over_processing');
    expect(r.notConcluded.find((c) => c.key === 'over_processing')?.reason).toMatch(/Evidence: 2 exercises/);
    expect(r.fourQuestions.overallSummary[0]!.text).toMatch(/No firm conclusion/);
  });
});

suite('the four headline questions (§201) and summary (§232, §234)', () => {
  it('answers all four questions', () => {
    const q = sarahReport().fourQuestions;
    expect(q.whatThisTellsUs.length).toBeGreaterThan(3);
    expect(q.howTheBusinessCanSupport.length).toBeGreaterThan(0);
    expect(q.whatTheBusinessCouldChange.length).toBeGreaterThan(0);
    expect(q.overallSummary[0]!.text).toBe('Sarah demonstrated an accurate, careful and methodical working style.');
  });

  it('writes the narrative summary from evidence without inferring pronouns', () => {
    const text = sarahReport().fourQuestions.overallSummary.map((s) => s.text).join(' ');
    expect(text).toContain('Sarah absorbed information well and retained key details throughout the assessment.');
    expect(text).toContain('Sarah generally reached appropriate decisions but showed a tendency to continue checking after reaching the correct answer');
    expect(text).toContain('Under timed conditions Sarah worked significantly faster while maintaining comparable accuracy');
    expect(text).toMatch(/Sarah may perform best when given .+\./);
    expect(text).not.toMatch(/\b(she|her|he|his)\b/i);
  });

  it('ends with the signature Director summary structure', () => {
    expect(sarahReport().directorSummary.map((s) => s.heading)).toEqual([
      'Demonstrated Working Style',
      'Key Strengths',
      'Development Opportunities',
      'What Motivates Them',
      'How They Respond to Pressure',
      'How They Make Decisions',
      'How They Process Information',
      'How They Prioritise',
      'What Management Should Do',
      'What the Business Could Change',
      'How to Get the Best From Them',
      'Recommended Next Actions',
    ]);
  });
});

suite('recommendations (§204, §205, §228–§231)', () => {
  it('gives at most three prioritised, categorised recommendations with impact and effort', () => {
    const recs = sarahReport().recommendations;
    expect(recs).toHaveLength(3);
    expect(recs.map((r) => r.priority)).toEqual([1, 2, 3]);
    expect(recs[0]!.priorityLabel).toBe('Priority 1 – greatest likely impact');
    for (const r of recs) {
      expect(r.category).toBeTruthy();
      expect(['High', 'Medium', 'Low']).toContain(r.impact);
      expect(['High', 'Medium', 'Low']).toContain(r.effort);
      expect(r.linkedFindings.length).toBeGreaterThan(0);
    }
    expect(recs.map((r) => r.id)).toEqual(expect.arrayContaining(['completion_criteria', 'time_boundaries']));
    expect(recs.map((r) => r.id)).not.toContain('use_strengths');
  });

  it('separates business change from employee change and never assumes the cause', () => {
    const change = sarahReport().fourQuestions.whatTheBusinessCouldChange.find((b) => b.findingKey === 'over_processing')!;
    expect(change.considerations.map((c) => c.attribution)).toEqual([
      'Individual Behaviour',
      'Management / Clarity',
      'Business Process',
    ]);
    expect(change.question).toMatch(/^Could the business/);
    expect(change.businessRecommendations.every((r) => r.target !== 'employee')).toBe(true);
  });

  it('lists possible reasons for escalation without choosing one (§218)', () => {
    n = 0;
    const exercises = [...Array(8)].map((_, i) => ex({ escalatedUnnecessarily: i < 6, modality: 'scenario' }));
    const r = generateInsightReport({ employee: { id: 'y', name: 'Jo' }, assessmentId: 'a-y', exercises });
    const change = r.fourQuestions.whatTheBusinessCouldChange.find((b) => b.findingKey === 'high_escalation')!;
    expect(change.possibleReasons).toEqual(['unclear authority', 'low decision confidence', 'previous management culture', 'genuine risk sensitivity']);
    expect(r.recommendations[0]!.id).toBe('decision_authority');
    expect(r.conversationGuide!.questions.length).toBeGreaterThanOrEqual(3);
  });

  it('gives different pressure advice when accuracy drops under time pressure (§223)', () => {
    n = 0;
    const exercises = [
      ...[...Array(6)].map(() => ex({ timed: false, responseSeconds: 40 })),
      ...[...Array(6)].map((_, i) => ex({ timed: true, responseSeconds: 30, correct: i < 3, firstAnswerCorrect: i < 3 })),
    ];
    const r = generateInsightReport({ employee: { id: 'z', name: 'Sam' }, assessmentId: 'a-z', exercises });
    expect(r.findings.map((f) => f.key)).toContain('quality_drops_under_pressure');
    expect(r.findings.map((f) => f.key)).not.toContain('efficient_under_pressure');
    expect(r.recommendations.map((x) => x.id)).toContain('pressure_support');
  });
});

suite('management, strengths, role fit, motivation (§206–§210)', () => {
  it('recommends management styles linked to findings', () => {
    const styles = sarahReport().managementStyle;
    expect(styles.map((s) => s.style)).toContain('Provide Time Boundaries');
    expect(styles.every((s) => s.rationale.startsWith('Useful'))).toBe(true);
  });

  it('balances strength utilisation with a caution where relevant', () => {
    const detail = sarahReport().strengthUtilisation.find((s) => s.findingKey === 'strength_attention_to_detail')!;
    expect(detail.uses).toContain('checking important quotations');
    expect(detail.caution).toMatch(/Avoid making this employee the default checker/);
  });

  it('gives neutral role-fit observations only', () => {
    const r = sarahReport();
    const text = r.roleFit.observations.map((o) => o.text).join(' ');
    expect(text).toContain('These characteristics may be particularly valuable in tasks requiring');
    expect(text).toContain('Where the role requires frequent independent prioritisation of competing tasks, additional coaching or clearer decision frameworks may help.');
    expect(text).not.toMatch(/suitable|dismiss|demot|promot/i);
  });

  it('translates motivation into neutral business actions', () => {
    const m = sarahReport().motivation!;
    expect(m.primaryMotivators).toEqual(['Progression', 'Recognition', 'Autonomy', 'Customer impact']);
    expect(m.whatThisCouldMean).toBe('The employee appears more strongly motivated by progression and recognition than by financial reward.');
    expect(m.businessResponse).toContain('establish progression milestones');
    expect(m.note).toMatch(/No motivation type is better than another/);
  });
});

suite('employee-facing summary (§233)', () => {
  it('is constructive and hides Director-only interpretation', () => {
    const r = sarahReport();
    const text = r.employeeFacing.paragraphs.join(' ');
    expect(text).toContain('You demonstrated strong information retention.');
    expect(text).toContain('One opportunity is to build confidence in completing lower-risk decisions once the required checks have been made.');
    expect(text).not.toMatch(/percentile|possible reasons|Business Process|Management \/ Clarity|motivat/i);
    expect(new Set(r.employeeFacing.paragraphs).size).toBe(r.employeeFacing.paragraphs.length);
  });
});

suite('language safeguard', () => {
  it('rejects forbidden wording', () => {
    expect(() => assertSafeLanguage({ a: 'The employee lacks motivation.' })).toThrow(InsightLanguageError);
    expect(() => assertSafeLanguage(['She checks too much.'])).toThrow(/Pronouns are never inferred/);
    expect(() => assertSafeLanguage(['Consider promotion.'])).toThrow(/promotion/);
    expect(() => assertSafeLanguage(['Possible memory disorder.'])).toThrow(/medical/);
  });

  it('the pattern library itself passes the safeguard', () => {
    expect(() => assertSafeLanguage(PATTERNS)).not.toThrow();
  });
});

suite('organisation-level insight (§226–§228)', () => {
  const escalation: Finding = {
    key: 'high_escalation',
    kind: 'style',
    insight: 'x',
    evidence: [],
    evidenceCount: 8,
    consistentCount: 6,
    confidence: 'Moderate',
    measures: {},
  };
  const people = (group: string, total: number, withPattern: number) =>
    [...Array(total)].map((_, i) => ({ employeeId: `${group}-${i}`, group, findings: i < withPattern ? [escalation] : [] }));

  it('reports a shared pattern as a possible process issue', () => {
    const [insight] = organisationInsights(director, people('Customer Service', 10, 7));
    expect(insight!.observation).toBe('7 of 10 Customer Service employees (70%) demonstrated uncertainty around escalation decisions.');
    expect(insight!.interpretation).toBe('This may indicate a business process or clarity issue rather than 7 individual problems.');
    expect(insight!.suggestedResponse).toBe('Clarify escalation authority across the group.');
  });

  it('suppresses small groups and minority patterns, and is Director-only', () => {
    expect(organisationInsights(director, people('Stock Control', 4, 4))).toEqual([]);
    expect(organisationInsights(director, people('Sales', 10, 3))).toEqual([]);
    expect(() => organisationInsights(employeeActor, people('Sales', 10, 7))).toThrow(BenchmarkPermissionError);
  });
});

suite('evidence derived from the response-event log', () => {
  it('derives reopen, answer change, first-answer correctness and timing', () => {
    const t = (s: number) => new Date(Date.UTC(2026, 9, 1, 9, 0, s)).toISOString();
    const [e] = deriveExerciseEvidence(
      [{ id: 'p1', questionVersionId: 'qv1', sequence: 1, timed: false, meta: { family: 'f', dimension: 'decide', modality: 'text', risk: 'low', correctAnswer: 'B' } }],
      [
        { presentationId: 'p1', clientSequence: 1, type: 'question_presented', occurredAt: t(0) },
        { presentationId: 'p1', clientSequence: 2, type: 'answer_selected', occurredAt: t(10), payload: { answer: 'B' } },
        { presentationId: 'p1', clientSequence: 3, type: 'question_left', occurredAt: t(12), payload: { dwell_ms: 12000 } },
        { presentationId: 'p1', clientSequence: 4, type: 'question_revisited', occurredAt: t(30) },
        { presentationId: 'p1', clientSequence: 5, type: 'answer_changed', occurredAt: t(40), payload: { answer: 'C' } },
        { presentationId: 'p1', clientSequence: 6, type: 'answer_changed', occurredAt: t(45), payload: { answer: 'B' } },
        { presentationId: 'p1', clientSequence: 7, type: 'question_left', occurredAt: t(50), payload: { dwell_ms: 20000 } },
      ],
    );
    expect(e).toMatchObject({
      exerciseId: 'p1',
      correct: true,
      firstAnswerCorrect: true,
      reopened: true,
      answerChanged: true,
      responseSeconds: 32,
      reviewSecondsAfterFirstAnswer: 22,
    });
  });
});
