/**
 * Derives per-exercise evidence from the append-only response-event log
 * (`assessment_presentations` + `response_events`). This is the bridge
 * between "exactly what the employee saw and did" and every insight.
 */
import type { ExerciseEvidence, Modality } from './types.js';

export type ResponseEventType =
  | 'question_presented'
  | 'question_viewed'
  | 'question_left'
  | 'question_revisited'
  | 'answer_selected'
  | 'answer_changed'
  | 'answer_cleared'
  | 'answer_submitted'
  | 'timer_started'
  | 'timer_expired'
  | 'focus_lost'
  | 'focus_returned';

export interface ResponseEvent {
  presentationId: string;
  clientSequence: number;
  type: ResponseEventType | string;
  /** ISO timestamp (client clock). */
  occurredAt: string;
  payload?: { answer?: string; dwell_ms?: number; [k: string]: unknown };
}

/**
 * Exercise metadata, stored in `question_versions.scoring_meta`. Scenario
 * flags map answer options to the behaviour they indicate.
 */
export interface ExerciseMeta {
  family: string;
  dimension: string;
  modality: Modality;
  risk: 'low' | 'high';
  multiStage?: boolean;
  priorityContext?: 'defined' | 'competing';
  customerImpactScenario?: boolean;
  correctAnswer: string;
  /** Options indicating unnecessary escalation (where escalation was not required). */
  unnecessaryEscalationOptions?: string[];
  /** For ownership scenarios: options that take further action toward the unresolved outcome. */
  outcomeActionOptions?: string[];
  /** For initiative scenarios: options that identify a relevant next action. */
  nextActionOptions?: string[];
  /** Commercial-consequence items: correctness measures commercial understanding. */
  commercial?: boolean;
  /** Sales prioritisation: options choosing routine admin over a live opportunity. */
  routineOverOpportunityOptions?: string[];
}

export interface Presentation {
  id: string;
  questionVersionId: string;
  sequence: number;
  timed: boolean;
  meta: ExerciseMeta;
}

const seconds = (from: string, to: string) => (Date.parse(to) - Date.parse(from)) / 1000;

export function deriveExerciseEvidence(
  presentations: readonly Presentation[],
  events: readonly ResponseEvent[],
): ExerciseEvidence[] {
  const byPresentation = new Map<string, ResponseEvent[]>();
  for (const e of events) {
    const list = byPresentation.get(e.presentationId) ?? [];
    list.push(e);
    byPresentation.set(e.presentationId, list);
  }

  const out: ExerciseEvidence[] = [];
  for (const p of [...presentations].sort((a, b) => a.sequence - b.sequence)) {
    const evs = (byPresentation.get(p.id) ?? []).sort((a, b) => a.clientSequence - b.clientSequence);
    const answers = evs.filter((e) => ['answer_selected', 'answer_changed'].includes(e.type) && e.payload?.answer !== undefined);
    if (answers.length === 0) continue; // never answered – not evidence of a decision
    const first = answers[0]!;
    const final = answers[answers.length - 1]!;
    const start = evs.find((e) => e.type === 'question_presented' || e.type === 'question_viewed') ?? first;
    const end =
      evs.filter((e) => e.type === 'answer_submitted' || e.type === 'question_left').at(-1) ?? final;
    const finalAnswer = String(final.payload!.answer);
    const firstAnswer = String(first.payload!.answer);
    const m = p.meta;

    // Time on task: dwell recorded on question_left events, else wall-clock.
    const dwell = evs
      .filter((e) => e.type === 'question_left' && typeof e.payload?.dwell_ms === 'number')
      .reduce((acc, e) => acc + (e.payload!.dwell_ms as number) / 1000, 0);
    const responseSeconds = dwell > 0 ? dwell : Math.max(0, seconds(start.occurredAt, end.occurredAt));
    // Dwell before the first answer: time from first view to first answer (first visit only).
    const beforeFirst = Math.max(0, seconds(start.occurredAt, first.occurredAt));

    const has = (opts?: string[]) => (opts ? opts.includes(finalAnswer) : undefined);
    out.push({
      exerciseId: p.id,
      presentationId: p.id,
      questionVersionId: p.questionVersionId,
      family: m.family,
      dimension: m.dimension,
      modality: m.modality,
      sequence: p.sequence,
      timed: p.timed,
      risk: m.risk,
      multiStage: m.multiStage,
      priorityContext: m.priorityContext,
      correct: finalAnswer === m.correctAnswer,
      firstAnswerCorrect: firstAnswer === m.correctAnswer,
      reopened: evs.some((e) => e.type === 'question_revisited'),
      answerChanged: answers.length > 1 && answers.some((a) => String(a.payload!.answer) !== firstAnswer),
      responseSeconds,
      reviewSecondsAfterFirstAnswer: Math.max(0, responseSeconds - beforeFirst),
      escalatedUnnecessarily: has(m.unnecessaryEscalationOptions),
      choseOutcomeAction: has(m.outcomeActionOptions),
      identifiedNextAction: has(m.nextActionOptions),
      commercialCorrect: m.commercial ? finalAnswer === m.correctAnswer : undefined,
      choseRoutineOverOpportunity: has(m.routineOverOpportunityOptions),
      customerImpactScenario: m.customerImpactScenario,
    });
  }
  return out;
}
