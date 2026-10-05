/**
 * Assessment session – a pure, deterministic state machine.
 *
 * Every action carries its own timestamp, so the same action log always
 * rebuilds the same state and the same events (used to resume after a
 * reload). The events it emits are exactly the `response_events` that the
 * insight engine reads (question_presented / viewed / left with dwell_ms /
 * revisited, answer_selected / changed / submitted, timer_*, focus_*).
 */
import type { AssessmentDefinition, QuestionDef, RenderedContent, SectionDef } from './content.js';
import { deterministicUuid, seededShuffle } from './random.js';

export type RunnerEventType =
  | 'assessment_started'
  | 'instructions_viewed'
  | 'question_presented'
  | 'question_viewed'
  | 'question_left'
  | 'question_revisited'
  | 'answer_selected'
  | 'answer_changed'
  | 'answer_submitted'
  | 'timer_started'
  | 'timer_expired'
  | 'focus_lost'
  | 'focus_returned'
  | 'assessment_submitted';

export interface RunnerEvent {
  assessmentId: string;
  presentationId: string | null;
  clientSequence: number;
  type: RunnerEventType;
  occurredAt: string;
  payload: Record<string, unknown>;
}

export interface Presentation {
  id: string;
  assessmentId: string;
  questionVersionId: string;
  sectionId: string;
  sequence: number;
  presentedAt: string;
  renderedContent: RenderedContent;
  timed: boolean;
  timeLimitSeconds: number | null;
  scored: boolean;
}

export type Phase =
  | { kind: 'intro' }
  | { kind: 'section_intro'; section: number }
  | { kind: 'question'; section: number; index: number }
  | { kind: 'section_review'; section: number }
  | { kind: 'complete' };

export type Action =
  | { type: 'start'; at: string }
  | { type: 'start_section'; at: string }
  | { type: 'answer'; value: string; at: string }
  | { type: 'go'; index: number; at: string }
  | { type: 'review'; at: string }
  | { type: 'submit_section'; at: string }
  | { type: 'tick'; at: string }
  | { type: 'visibility'; hidden: boolean; at: string };

export interface SessionState {
  assessmentId: string;
  seed: string;
  /** Agreed adjustment, e.g. 1.25 = 25 % extra time on timed sections. */
  timeMultiplier: number;
  definition: AssessmentDefinition;
  /** Question ids per section, in the order this person sees them. */
  order: { sectionId: string; questionIds: string[] }[];
  /** Option ids per question, in display order. */
  optionOrder: Record<string, string[]>;
  phase: Phase;
  presentations: Record<string, Presentation>;
  answers: Record<string, string>;
  /** Questions left at least once – the next view is a revisit. */
  left: Record<string, boolean>;
  visitStartedAt: string | null;
  sectionDeadline: string | null;
  submittedSections: string[];
  hidden: boolean;
  events: RunnerEvent[];
  startedAt: string | null;
  completedAt: string | null;
}

export interface SessionOptions {
  definition: AssessmentDefinition;
  assessmentId: string;
  /** Per-assessment randomisation seed (store it in `assessments.delivery_context`). */
  seed: string;
  timeMultiplier?: number;
}

/** The questions a sitting presents for a section: drawn from the bank (if any), then shuffled (if asked). */
export function sectionQuestions(s: SectionDef, seed: string): QuestionDef[] {
  let questions = s.questions;
  if (s.draw) {
    questions = Object.entries(s.draw).flatMap(([topic, n]) => {
      const bank = s.questions.filter((q) => q.topic === topic);
      if (bank.length < n) throw new Error(`Section ${s.id}: topic ${topic} has ${bank.length} questions, ${n} needed.`);
      return seededShuffle(bank, `${seed}:${s.id}:draw:${topic}`).slice(0, n);
    });
  }
  return s.shuffleQuestions ? seededShuffle(questions, `${seed}:${s.id}`) : questions;
}

export function createSession(o: SessionOptions): SessionState {
  const order = o.definition.sections.map((s) => ({
    sectionId: s.id,
    questionIds: sectionQuestions(s, o.seed).map((q) => q.questionVersionId),
  }));
  const optionOrder: Record<string, string[]> = {};
  for (const s of o.definition.sections) {
    for (const q of s.questions) {
      const ids = q.options.map((op) => op.id);
      optionOrder[q.questionVersionId] = q.shuffleOptions === false ? ids : seededShuffle(ids, `${o.seed}:${q.questionVersionId}`);
    }
  }
  return {
    assessmentId: o.assessmentId,
    seed: o.seed,
    timeMultiplier: o.timeMultiplier ?? 1,
    definition: o.definition,
    order,
    optionOrder,
    phase: { kind: 'intro' },
    presentations: {},
    answers: {},
    left: {},
    visitStartedAt: null,
    sectionDeadline: null,
    submittedSections: [],
    hidden: false,
    events: [],
    startedAt: null,
    completedAt: null,
  };
}

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------
export function sectionAt(s: SessionState, index: number): SectionDef {
  return s.definition.sections[index]!;
}

function questionDef(s: SessionState, id: string): QuestionDef {
  for (const sec of s.definition.sections) {
    const q = sec.questions.find((x) => x.questionVersionId === id);
    if (q) return q;
  }
  throw new Error(`Unknown question ${id}`);
}

export function currentQuestionId(s: SessionState): string | null {
  return s.phase.kind === 'question' ? s.order[s.phase.section]!.questionIds[s.phase.index]! : null;
}

export function renderQuestion(s: SessionState, id: string, sectionId: string): RenderedContent {
  const q = questionDef(s, id);
  const byId = new Map(q.options.map((op) => [op.id, op]));
  return {
    questionVersionId: q.questionVersionId,
    kind: q.kind,
    sectionId,
    stem: q.stem,
    ...(q.detail ? { detail: q.detail } : {}),
    ...(q.image ? { image: q.image } : {}),
    options: s.optionOrder[id]!.map((oid) => byId.get(oid)!),
  };
}

/** Effective limit for a section after any agreed adjustment. */
export function effectiveTimeLimit(s: SessionState, section: SectionDef): number | null {
  return section.timeLimitSeconds ? Math.round(section.timeLimitSeconds * s.timeMultiplier) : null;
}

export function remainingSeconds(s: SessionState, now: string): number | null {
  if (!s.sectionDeadline) return null;
  return Math.max(0, Math.ceil((Date.parse(s.sectionDeadline) - Date.parse(now)) / 1000));
}

export function unansweredInSection(s: SessionState, section: number): number[] {
  return s.order[section]!.questionIds.flatMap((id, i) => (s.answers[id] === undefined ? [i] : []));
}

/** Ranked motivators from the motivation section (most → least), or null. */
export function motivationRanking(s: SessionState): string[] | null {
  const idx = s.definition.sections.findIndex((x) => x.purpose === 'motivation');
  if (idx < 0) return null;
  const answer = s.answers[s.order[idx]!.questionIds[0]!];
  return answer ? answer.split('>') : null;
}

/** Presentations and events for scored sections only – the input to evidence derivation. */
export function scoredEvidence(s: SessionState): { presentations: Presentation[]; events: RunnerEvent[] } {
  const presentations = Object.values(s.presentations)
    .filter((p) => p.scored)
    .sort((a, b) => a.sequence - b.sequence);
  const ids = new Set(presentations.map((p) => p.id));
  return { presentations, events: s.events.filter((e) => e.presentationId !== null && ids.has(e.presentationId)) };
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------
function emit(
  s: SessionState,
  type: RunnerEventType,
  at: string,
  payload: Record<string, unknown> = {},
  presentationId: string | null = null,
): SessionState {
  const event: RunnerEvent = {
    assessmentId: s.assessmentId,
    presentationId,
    clientSequence: s.events.length + 1,
    type,
    occurredAt: at,
    payload,
  };
  return { ...s, events: [...s.events, event] };
}

function show(s: SessionState, section: number, index: number, at: string): SessionState {
  const sec = sectionAt(s, section);
  const id = s.order[section]!.questionIds[index]!;
  let next: SessionState = { ...s, phase: { kind: 'question', section, index }, visitStartedAt: at };
  let p = next.presentations[id];
  if (!p) {
    const sequence = Object.keys(next.presentations).length + 1;
    p = {
      id: deterministicUuid(`${s.assessmentId}:${sequence}`),
      assessmentId: s.assessmentId,
      questionVersionId: id,
      sectionId: sec.id,
      sequence,
      presentedAt: at,
      renderedContent: renderQuestion(s, id, sec.id),
      timed: !!sec.timeLimitSeconds,
      timeLimitSeconds: effectiveTimeLimit(s, sec),
      scored: sec.scored,
    };
    next = { ...next, presentations: { ...next.presentations, [id]: p } };
    next = emit(next, 'question_presented', at, {}, p.id);
  } else if (next.left[id]) {
    next = emit(next, 'question_revisited', at, {}, p.id);
  }
  return emit(next, 'question_viewed', at, {}, p.id);
}

function leave(s: SessionState, at: string): SessionState {
  const id = currentQuestionId(s);
  if (!id || !s.visitStartedAt) return s;
  const p = s.presentations[id]!;
  const dwell = Math.max(0, Date.parse(at) - Date.parse(s.visitStartedAt));
  const next = emit(s, 'question_left', at, { dwell_ms: dwell }, p.id);
  return { ...next, left: { ...next.left, [id]: true }, visitStartedAt: null };
}

function submitSection(s: SessionState, at: string): SessionState {
  const section = s.phase.kind === 'question' || s.phase.kind === 'section_review' ? s.phase.section : null;
  if (section === null) return s;
  let next = leave(s, at);
  for (const id of next.order[section]!.questionIds) {
    const answer = next.answers[id];
    if (answer !== undefined) next = emit(next, 'answer_submitted', at, { answer }, next.presentations[id]!.id);
  }
  next = {
    ...next,
    submittedSections: [...next.submittedSections, sectionAt(next, section).id],
    sectionDeadline: null,
  };
  if (section + 1 < next.definition.sections.length) {
    return { ...next, phase: { kind: 'section_intro', section: section + 1 } };
  }
  next = emit(next, 'assessment_submitted', at, { answered: Object.keys(next.answers).length });
  return { ...next, phase: { kind: 'complete' }, completedAt: at };
}

function expired(s: SessionState, at: string): boolean {
  return s.sectionDeadline !== null && Date.parse(at) >= Date.parse(s.sectionDeadline);
}

export function reduce(s: SessionState, action: Action): SessionState {
  const at = action.at;
  // A passed deadline always wins: the section is submitted with what was answered.
  if (action.type !== 'visibility' && (s.phase.kind === 'question' || s.phase.kind === 'section_review') && expired(s, at)) {
    const withExpiry = emit(s, 'timer_expired', s.sectionDeadline!, {
      section_id: sectionAt(s, s.phase.section).id,
    });
    return submitSection(withExpiry, s.sectionDeadline!);
  }

  switch (action.type) {
    case 'start': {
      if (s.phase.kind !== 'intro') return s;
      const next = emit(s, 'assessment_started', at, {
        seed: s.seed,
        time_multiplier: s.timeMultiplier,
        version: s.definition.version,
      });
      return { ...next, startedAt: at, phase: { kind: 'section_intro', section: 0 } };
    }
    case 'start_section': {
      if (s.phase.kind !== 'section_intro') return s;
      const section = s.phase.section;
      const sec = sectionAt(s, section);
      let next = emit(s, 'instructions_viewed', at, { section_id: sec.id });
      const limit = effectiveTimeLimit(next, sec);
      if (limit) {
        next = emit(next, 'timer_started', at, {
          section_id: sec.id,
          time_limit_seconds: limit,
          base_time_limit_seconds: sec.timeLimitSeconds,
          time_multiplier: next.timeMultiplier,
        });
        next = { ...next, sectionDeadline: new Date(Date.parse(at) + limit * 1000).toISOString() };
      }
      return show(next, section, 0, at);
    }
    case 'answer': {
      const id = currentQuestionId(s);
      if (!id) return s;
      const previous = s.answers[id];
      if (previous === action.value) return s;
      const p = s.presentations[id]!;
      const next = emit(
        s,
        previous === undefined ? 'answer_selected' : 'answer_changed',
        at,
        previous === undefined ? { answer: action.value } : { answer: action.value, previous_answer: previous },
        p.id,
      );
      return { ...next, answers: { ...next.answers, [id]: action.value } };
    }
    case 'go': {
      const section = s.phase.kind === 'question' || s.phase.kind === 'section_review' ? s.phase.section : null;
      if (section === null) return s;
      const count = s.order[section]!.questionIds.length;
      if (action.index < 0 || action.index >= count) return s;
      if (s.phase.kind === 'question' && s.phase.index === action.index) return s;
      return show(leave(s, at), section, action.index, at);
    }
    case 'review': {
      if (s.phase.kind !== 'question') return s;
      return { ...leave(s, at), phase: { kind: 'section_review', section: s.phase.section } };
    }
    case 'submit_section':
      return submitSection(s, at);
    case 'tick':
      return s;
    case 'visibility': {
      if (action.hidden === s.hidden || s.phase.kind === 'intro' || s.phase.kind === 'complete') return s;
      const id = currentQuestionId(s);
      const next = emit(s, action.hidden ? 'focus_lost' : 'focus_returned', at, {}, id ? s.presentations[id]!.id : null);
      return { ...next, hidden: action.hidden };
    }
  }
}

/** Rebuild a session from its saved action log (resume after reload). */
export function replay(options: SessionOptions, actions: readonly Action[]): SessionState {
  return actions.reduce(reduce, createSession(options));
}
