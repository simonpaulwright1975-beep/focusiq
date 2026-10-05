/**
 * "Live the Walter Geering Way" in WG Main. The server draws each sitting's
 * questions and scores it; this page only shows the wording (from the bank in
 * the app) and sends the person's answers. The answer key never reaches the
 * browser, and the person gets no score back – a Director shares it later.
 */
import type { AssessmentDefinition, RunnerEvent, Transport } from '../../../src/runner/index.js';
import { WG_WAY_TEST } from '../demo/wgWayBank.js';
import { check, db } from '../shared/supabase.js';

export interface LiveSitting {
  sittingId: string;
  definition: AssessmentDefinition;
  snapshot: { events: number; presentationIds: string[]; completed: boolean };
}

const BANK = new Map(WG_WAY_TEST.sections[0]!.questions.map((q) => [q.questionVersionId, q]));

/** The check with exactly the server's questions, in the server's order. */
export function definitionFor(questionIds: string[]): AssessmentDefinition {
  const { draw: _draw, notTogether: _nt, ...section } = WG_WAY_TEST.sections[0]!;
  return {
    ...WG_WAY_TEST,
    sections: [{
      ...section,
      shuffleQuestions: false,
      questions: questionIds.map((id) => {
        const q = BANK.get(id);
        if (!q) throw new Error('This check has a question this page does not know. Please refresh the page.');
        return q;
      }),
    }],
  };
}

/** Starts a sitting, or resumes the one left open in the last 30 minutes. */
export async function startLiveSitting(): Promise<LiveSitting> {
  const rows = check(await db().rpc('wg_way_start')) as { sitting_id: string; question_ids: string[]; events_received: number; presentation_ids: string[] }[];
  const r = rows[0];
  if (!r) throw new Error('The check could not start. Please try again.');
  return {
    sittingId: r.sitting_id,
    definition: definitionFor(r.question_ids),
    snapshot: { events: r.events_received, presentationIds: r.presentation_ids, completed: false },
  };
}

const ANSWER_EVENTS = new Set<RunnerEvent['type']>(['answer_selected', 'answer_changed', 'answer_submitted']);

/** Sends the answers only: which question each presentation showed, and the person's latest choice. */
export const liveTransport: Transport = {
  async save({ presentations, events }) {
    const sittingId = events[0]?.assessmentId ?? presentations[0]?.assessmentId;
    if (!sittingId) return;
    check(await db().rpc('wg_way_save', {
      p_sitting: sittingId,
      p_presentations: Object.fromEntries(presentations.map((p) => [p.id, p.questionVersionId])),
      p_events: events.map((e) => ({
        seq: e.clientSequence,
        presentation_id: e.presentationId,
        answer: ANSWER_EVENTS.has(e.type) && e.payload.answer != null ? String(e.payload.answer) : null,
      })),
    }));
  },
  async complete(sittingId) {
    check(await db().rpc('wg_way_submit', { p_sitting: sittingId }));
  },
};
