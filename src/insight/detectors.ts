/**
 * Pattern detectors. Each turns exercise evidence into a Finding only when
 * the evidence is sufficient (interpretation confidence Moderate or High);
 * otherwise it is reported as "not concluded" – never guessed.
 */
import { assessDimensionEvidence, type InterpretationConfidence } from '../benchmarking/evidence.js';
import type { BenchmarkConfig } from '../benchmarking/config.js';
import { median } from '../benchmarking/stats.js';
import { DEFAULT_RULES, type InsightRules } from './rules.js';
import type {
  EvidenceItem,
  ExerciseEvidence,
  Finding,
  InsightBenchmarkContext,
  NotConcluded,
  PatternKey,
  PatternKind,
} from './types.js';

export interface DetectionContext {
  rules?: InsightRules;
  benchmark?: InsightBenchmarkContext;
  evidenceConfig?: Partial<BenchmarkConfig>;
}

export interface DetectionResult {
  findings: Finding[];
  notConcluded: NotConcluded[];
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const share = (n: number, d: number) => (d === 0 ? 0 : n / d);
const ids = (xs: readonly ExerciseEvidence[]) => xs.map((x) => x.exerciseId);
const accuracy = (xs: readonly ExerciseEvidence[]) => share(xs.filter((x) => x.correct).length, xs.length);
const firm = (c: InterpretationConfidence) => c === 'Moderate' || c === 'High';

/** Confidence for comparison patterns (two groups compared). */
function comparisonConfidence(a: number, b: number, min: number): InterpretationConfidence {
  const smaller = Math.min(a, b);
  if (smaller < min) return 'Insufficient';
  if (smaller >= 6 && a + b >= 14) return 'High';
  if (a + b >= 10) return 'Moderate';
  return 'Low';
}

class Collector {
  findings: Finding[] = [];
  notConcluded: NotConcluded[] = [];
  constructor(private readonly config?: Partial<BenchmarkConfig>) {}

  /** Pattern defined by a per-exercise observation over a relevant set. */
  observed(
    key: PatternKey,
    kind: PatternKind,
    insight: string,
    relevant: readonly ExerciseEvidence[],
    shows: (e: ExerciseEvidence) => boolean,
    conditionsMet: boolean,
    evidence: EvidenceItem[],
    measures: Record<string, number>,
  ) {
    if (relevant.length === 0) return;
    const ev = assessDimensionEvidence(
      key,
      insight,
      relevant.map((e) => ({ exerciseId: e.exerciseId, showsPattern: shows(e) })),
      this.config,
    );
    if (!conditionsMet) return;
    if (ev.patternObserved !== true || !firm(ev.confidence)) {
      this.notConcluded.push({ key, reason: `${ev.evidenceLabel} – not enough consistent evidence to conclude.` });
      return;
    }
    this.findings.push({
      key,
      kind,
      insight,
      evidence,
      evidenceCount: ev.evidenceCount,
      consistentCount: ev.consistentCount,
      confidence: ev.confidence,
      measures,
    });
  }

  /** Pattern defined by comparing two groups of exercises. */
  compared(
    key: PatternKey,
    kind: PatternKind,
    insight: string,
    a: readonly ExerciseEvidence[],
    b: readonly ExerciseEvidence[],
    minGroup: number,
    conditionsMet: boolean,
    evidence: EvidenceItem[],
    measures: Record<string, number>,
  ) {
    if (!conditionsMet) return;
    const confidence = comparisonConfidence(a.length, b.length, minGroup);
    if (!firm(confidence)) {
      this.notConcluded.push({
        key,
        reason: `Only ${a.length} and ${b.length} exercises in the compared groups – not enough to conclude.`,
      });
      return;
    }
    this.findings.push({
      key,
      kind,
      insight,
      evidence,
      evidenceCount: a.length + b.length,
      consistentCount: null,
      confidence,
      measures,
    });
  }
}

export function detectPatterns(
  exercises: readonly ExerciseEvidence[],
  ctx: DetectionContext = {},
): DetectionResult {
  const r = ctx.rules ?? DEFAULT_RULES;
  const c = new Collector(ctx.evidenceConfig);
  const overall = accuracy(exercises);
  const ownMedianTime = exercises.length ? median(exercises.map((e) => e.responseSeconds)) : 0;

  const timed = exercises.filter((e) => e.timed);
  const untimed = exercises.filter((e) => !e.timed);
  const accTimed = accuracy(timed);
  const accUntimed = accuracy(untimed);
  const tTimed = timed.length ? median(timed.map((e) => e.responseSeconds)) : NaN;
  const tUntimed = untimed.length ? median(untimed.map((e) => e.responseSeconds)) : NaN;
  const fasterBy = Number.isFinite(tTimed) && tUntimed > 0 ? 1 - tTimed / tUntimed : NaN;
  const accuracyDrop = accUntimed - accTimed;
  const pressureItems: EvidenceItem[] = [
    {
      label: `Median response ${Math.round(tUntimed)}s untimed vs ${Math.round(tTimed)}s timed (${pct(Math.abs(fasterBy))} ${fasterBy >= 0 ? 'faster' : 'slower'} under time constraint)`,
      exerciseIds: ids(exercises),
    },
    {
      label: `Accuracy ${pct(accUntimed)} untimed vs ${pct(accTimed)} timed (${accuracyDrop >= 0 ? '−' : '+'}${Math.round(Math.abs(accuracyDrop) * 100)} points)`,
      exerciseIds: ids(exercises),
    },
  ];
  const pressureMeasures = { fasterBy, accuracyDrop, accTimed, accUntimed };

  // --- Over-processing (§203, §215) --------------------------------------
  const lowRisk = exercises.filter((e) => e.risk === 'low');
  const reopened = lowRisk.filter((e) => e.reopened);
  const reopenedFirstCorrect = reopened.filter((e) => e.firstAnswerCorrect);
  const improved = reopened.filter((e) => !e.firstAnswerCorrect && e.correct);
  const avgReview = reopened.length
    ? reopened.reduce((a, e) => a + e.reviewSecondsAfterFirstAnswer, 0) / reopened.length
    : 0;
  const op = r.overProcessing;
  const opItems: EvidenceItem[] = [
    { label: `${reopened.length} of ${lowRisk.length} relevant exercises were reopened`, exerciseIds: ids(reopened) },
    { label: `First answer was already correct in ${reopenedFirstCorrect.length} of those ${reopened.length}`, exerciseIds: ids(reopenedFirstCorrect) },
    { label: `Additional checking improved ${improved.length === 1 ? 'only 1 outcome' : `${improved.length} outcomes`}`, exerciseIds: ids(improved) },
    { label: `Average additional review time: ${Math.round(avgReview)} seconds`, exerciseIds: ids(reopened) },
  ];
  if (timed.length >= r.pressure.minGroupSize && untimed.length >= r.pressure.minGroupSize && Math.abs(accuracyDrop) <= 0.05) {
    opItems.push({
      label: `Timed-task accuracy remained within ${Math.max(1, Math.round(Math.abs(accuracyDrop) * 100))}% of untimed accuracy`,
      exerciseIds: ids(exercises),
    });
  }
  c.observed(
    'over_processing',
    'style',
    'Employee appears to over-check lower-risk decisions.',
    lowRisk,
    (e) => e.reopened,
    share(reopened.length, lowRisk.length) >= op.minReopenShare &&
      share(reopenedFirstCorrect.length, reopened.length) >= op.minFirstCorrectShareOfReopened &&
      share(improved.length, reopened.length) <= op.maxImprovedShareOfReopened &&
      overall >= op.minAccuracy,
    opItems,
    { reopened: reopened.length, relevant: lowRisk.length, reopenedFirstCorrect: reopenedFirstCorrect.length, improved: improved.length, avgReviewSeconds: avgReview },
  );
  const overProcessing = c.findings.some((f) => f.key === 'over_processing');

  // --- Rushing (§214) ------------------------------------------------------
  const multi = exercises.filter((e) => e.multiStage);
  const single = exercises.filter((e) => !e.multiStage);
  const quickMisses = multi.filter((e) => !e.correct && !e.reopened && e.responseSeconds < ownMedianTime);
  c.observed(
    'rushing',
    'style',
    'Employee appears to act quickly on multi-stage instructions, sometimes before all the information has been processed.',
    multi,
    (e) => !e.correct,
    single.length > 0 && accuracy(single) - accuracy(multi) >= r.rushing.minAccuracyGap && quickMisses.length >= Math.ceil(multi.filter((e) => !e.correct).length / 2),
    [
      { label: `Multi-stage accuracy ${pct(accuracy(multi))} vs ${pct(accuracy(single))} on single-stage exercises`, exerciseIds: ids(multi) },
      { label: `${quickMisses.length} multi-stage errors were answered faster than this employee's typical pace without review`, exerciseIds: ids(quickMisses) },
    ],
    { multiAccuracy: accuracy(multi), singleAccuracy: accuracy(single), quickMisses: quickMisses.length },
  );

  // --- Slow but controlled (§216) – relative, needs benchmark context -------
  const p75 = ctx.benchmark?.responseSecondsP75;
  if (p75 !== undefined && !overProcessing) {
    const slow = exercises.filter((e) => e.responseSeconds > p75);
    const changes = exercises.filter((e) => e.answerChanged);
    c.observed(
      'slow_but_controlled',
      'style',
      'Employee takes longer than most colleagues, with high accuracy and stable decisions.',
      exercises,
      (e) => e.responseSeconds > p75,
      overall >= r.slowButControlled.minAccuracy && share(changes.length, exercises.length) <= r.slowButControlled.maxAnswerChangeShare,
      [
        { label: `${slow.length} of ${exercises.length} exercises took longer than three-quarters of the comparison group (${Math.round(p75)}s)`, exerciseIds: ids(slow) },
        { label: `Accuracy ${pct(overall)}; answers changed in ${changes.length} of ${exercises.length} exercises`, exerciseIds: ids(changes) },
      ],
      { slow: slow.length, accuracy: overall, answerChanges: changes.length, benchmarkP75: p75 },
    );
  }

  // --- Initiative (§217) & escalation (§218) --------------------------------
  const initiative = exercises.filter((e) => e.identifiedNextAction !== undefined);
  const nextActions = initiative.filter((e) => e.identifiedNextAction);
  c.observed(
    'high_initiative',
    'strength',
    'Employee frequently identifies relevant next actions without being explicitly directed.',
    initiative,
    (e) => e.identifiedNextAction === true,
    share(nextActions.length, initiative.length) >= r.highInitiative.minShare,
    [{ label: `Identified a relevant next action in ${nextActions.length} of ${initiative.length} initiative scenarios`, exerciseIds: ids(nextActions) }],
    { identified: nextActions.length, relevant: initiative.length },
  );

  const escalation = exercises.filter((e) => e.escalatedUnnecessarily !== undefined);
  const escalated = escalation.filter((e) => e.escalatedUnnecessarily);
  c.observed(
    'high_escalation',
    'style',
    'Employee frequently seeks additional approval before acting, including where the decision could be made independently.',
    escalation,
    (e) => e.escalatedUnnecessarily === true,
    share(escalated.length, escalation.length) >= r.highEscalation.minShare,
    [{ label: `Chose to seek approval in ${escalated.length} of ${escalation.length} scenarios where it was not required`, exerciseIds: ids(escalated) }],
    { escalated: escalated.length, relevant: escalation.length },
  );

  // --- Pressure response (§223) --------------------------------------------
  const pr = r.pressure;
  c.compared(
    'efficient_under_pressure',
    'style',
    'Clear time boundaries appear to increase decision speed without materially reducing quality.',
    timed,
    untimed,
    pr.minGroupSize,
    fasterBy >= pr.fasterBy && accuracyDrop <= pr.maxAccuracyDrop,
    pressureItems,
    pressureMeasures,
  );
  c.compared(
    'quality_drops_under_pressure',
    'style',
    'Accuracy reduces noticeably when working under time constraint.',
    timed,
    untimed,
    pr.minGroupSize,
    accuracyDrop >= pr.significantAccuracyDrop,
    pressureItems,
    pressureMeasures,
  );

  // --- Prioritisation structure (§202 example, §207 "Provide More Structure") -
  const defined = exercises.filter((e) => e.priorityContext === 'defined');
  const competing = exercises.filter((e) => e.priorityContext === 'competing');
  c.compared(
    'needs_defined_priorities',
    'development',
    'Employee performs more strongly when priorities are clearly defined than when several competing tasks require independent prioritisation.',
    defined,
    competing,
    r.priorities.minGroupSize,
    accuracy(defined) - accuracy(competing) >= r.priorities.minAccuracyGap,
    [{ label: `Accuracy ${pct(accuracy(defined))} with defined priorities vs ${pct(accuracy(competing))} with competing priorities`, exerciseIds: ids([...defined, ...competing]) }],
    { definedAccuracy: accuracy(defined), competingAccuracy: accuracy(competing) },
  );

  // --- Information retention (§219) ---------------------------------------
  const retention = exercises.filter((e) => e.dimension === 'remember');
  const retained = retention.filter((e) => e.correct);
  c.observed(
    'retention_support',
    'development',
    'Retention of multi-step or detailed information appears to benefit from reinforcement.',
    retention,
    (e) => !e.correct,
    accuracy(retention) < r.retention.developmentBelow,
    [{ label: `Recalled correctly in ${retained.length} of ${retention.length} retention exercises`, exerciseIds: ids(retention) }],
    { accuracy: accuracy(retention) },
  );
  c.observed(
    'strength_information_retention',
    'strength',
    'Employee retains key information accurately.',
    retention,
    (e) => e.correct,
    accuracy(retention) >= r.retention.strengthFrom,
    [{ label: `Recalled correctly in ${retained.length} of ${retention.length} retention exercises`, exerciseIds: ids(retained) }],
    { accuracy: accuracy(retention) },
  );

  // --- Processing preferences (§220, §221) --------------------------------
  const visual = exercises.filter((e) => e.modality === 'visual');
  const textual = exercises.filter((e) => e.modality === 'text' || e.modality === 'verbal');
  const verbal = exercises.filter((e) => e.modality === 'verbal' || e.modality === 'scenario');
  const visNum = exercises.filter((e) => e.modality === 'visual' || e.modality === 'numerical');
  c.compared(
    'visual_processing',
    'strength',
    'Employee may process visual information particularly effectively (an observed preference, not a fixed learning style).',
    visual,
    textual,
    r.modality.minGroupSize,
    accuracy(visual) - accuracy(textual) >= r.modality.minAccuracyGap,
    [{ label: `Accuracy ${pct(accuracy(visual))} on image/pattern exercises vs ${pct(accuracy(textual))} on text-heavy exercises`, exerciseIds: ids([...visual, ...textual]) }],
    { visual: accuracy(visual), text: accuracy(textual) },
  );
  c.compared(
    'verbal_processing',
    'strength',
    'Employee may work particularly effectively with words and scenarios (an observed preference, not a fixed learning style).',
    verbal,
    visNum,
    r.modality.minGroupSize,
    accuracy(verbal) - accuracy(visNum) >= r.modality.minAccuracyGap,
    [{ label: `Accuracy ${pct(accuracy(verbal))} on word/scenario exercises vs ${pct(accuracy(visNum))} on visual/numerical exercises`, exerciseIds: ids([...verbal, ...visNum]) }],
    { verbal: accuracy(verbal), visualNumerical: accuracy(visNum) },
  );

  // --- Sustained attention (§222) -----------------------------------------
  const ordered = [...exercises].sort((a, b) => a.sequence - b.sequence);
  const third = Math.floor(ordered.length / 3);
  const early = ordered.slice(0, third);
  const late = ordered.slice(ordered.length - third);
  c.compared(
    'sustained_attention',
    'development',
    'Performance reduced noticeably during the later part of the assessment.',
    early,
    late,
    r.sustainedAttention.minGroupSize,
    third > 0 && accuracy(early) - accuracy(late) >= r.sustainedAttention.minAccuracyDrop,
    [{ label: `Accuracy ${pct(accuracy(early))} in the first third vs ${pct(accuracy(late))} in the final third`, exerciseIds: ids([...early, ...late]) }],
    { early: accuracy(early), late: accuracy(late) },
  );

  // --- Task vs outcome orientation (§211, §213) ----------------------------
  const ownership = exercises.filter((e) => e.choseOutcomeAction !== undefined);
  const outcomeChoices = ownership.filter((e) => e.choseOutcomeAction);
  const ownershipItems = [
    { label: `Chose further action toward an unresolved outcome in ${outcomeChoices.length} of ${ownership.length} ownership scenarios`, exerciseIds: ids(ownership) },
  ];
  c.observed(
    'task_orientation',
    'style',
    'Employee consistently completed planned activity but was less likely to change approach when the desired result had not yet been achieved.',
    ownership,
    (e) => e.choseOutcomeAction === false,
    share(outcomeChoices.length, ownership.length) <= r.orientation.taskAtOrBelow,
    ownershipItems,
    { outcomeChoices: outcomeChoices.length, relevant: ownership.length },
  );
  c.observed(
    'outcome_orientation',
    'strength',
    'Employee consistently pursued the intended result rather than stopping at the planned activity.',
    ownership,
    (e) => e.choseOutcomeAction === true,
    share(outcomeChoices.length, ownership.length) >= r.orientation.outcomeFrom,
    ownershipItems,
    { outcomeChoices: outcomeChoices.length, relevant: ownership.length },
  );

  // --- Commercial understanding (§212) ------------------------------------
  const commercial = exercises.filter((e) => e.commercialCorrect !== undefined);
  const commercialRight = commercial.filter((e) => e.commercialCorrect);
  c.observed(
    'commercial_understanding',
    'development',
    'Employee demonstrated good task accuracy but weaker understanding of how missed sales, margin and delays translate into business performance.',
    commercial,
    (e) => e.commercialCorrect === false,
    accuracy(commercial) < r.commercial.developmentBelow && overall >= r.commercial.minOverallAccuracy,
    [
      { label: `Commercial-consequence items correct: ${commercialRight.length} of ${commercial.length}`, exerciseIds: ids(commercial) },
      { label: `Overall task accuracy ${pct(overall)}`, exerciseIds: ids(exercises) },
    ],
    { commercialAccuracy: share(commercialRight.length, commercial.length), overallAccuracy: overall },
  );

  // --- Routine vs live opportunity (§227) ----------------------------------
  const prioritySales = exercises.filter((e) => e.choseRoutineOverOpportunity !== undefined);
  const routine = prioritySales.filter((e) => e.choseRoutineOverOpportunity);
  c.observed(
    'routine_over_opportunity',
    'development',
    'Employee prioritised routine administration above live commercial opportunities.',
    prioritySales,
    (e) => e.choseRoutineOverOpportunity === true,
    routine.length >= r.routineOverOpportunity.minCount && share(routine.length, prioritySales.length) >= r.routineOverOpportunity.minShare,
    [{ label: `Prioritised routine activity over a live opportunity in ${routine.length} of ${prioritySales.length} scenarios`, exerciseIds: ids(routine) }],
    { routine: routine.length, relevant: prioritySales.length },
  );

  // --- Strengths (§208) ----------------------------------------------------
  const highRisk = exercises.filter((e) => e.risk === 'high');
  c.observed(
    'strength_attention_to_detail',
    'strength',
    'Employee shows strong attention to detail on important, higher-risk work.',
    highRisk,
    (e) => e.correct,
    accuracy(highRisk) >= r.strengths.detailAccuracy,
    [{ label: `Accuracy ${pct(accuracy(highRisk))} on ${highRisk.length} higher-risk exercises`, exerciseIds: ids(highRisk) }],
    { accuracy: accuracy(highRisk) },
  );
  const firstRight = exercises.filter((e) => e.firstAnswerCorrect);
  c.observed(
    'strength_decision_quality',
    'strength',
    'Employee generally reaches the correct decision first time.',
    exercises,
    (e) => e.firstAnswerCorrect,
    share(firstRight.length, exercises.length) >= r.strengths.decisionFirstCorrect,
    [{ label: `First answer correct in ${firstRight.length} of ${exercises.length} exercises`, exerciseIds: ids(firstRight) }],
    { firstCorrectShare: share(firstRight.length, exercises.length) },
  );
  const customer = exercises.filter((e) => e.customerImpactScenario);
  const customerOwned = customer.filter((e) => e.correct || e.choseOutcomeAction === true);
  c.observed(
    'strength_customer_ownership',
    'strength',
    'Employee responded particularly strongly to scenarios involving responsibility and customer impact.',
    customer,
    (e) => e.correct || e.choseOutcomeAction === true,
    share(customerOwned.length, customer.length) >= r.strengths.customerOwnership,
    [{ label: `Took ownership of the customer outcome in ${customerOwned.length} of ${customer.length} customer-impact scenarios`, exerciseIds: ids(customerOwned) }],
    { share: share(customerOwned.length, customer.length) },
  );

  return { findings: c.findings, notConcluded: c.notConcluded };
}
