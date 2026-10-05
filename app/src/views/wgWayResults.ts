/**
 * Scores "Live the Walter Geering Way" sittings (Director app only – uses the
 * answer key). DEMO: sittings and answers come from this browser; Stan's
 * sample baseline shows what a result looks like.
 */
import type { Presentation, RunnerEvent } from '../../../src/runner/index.js';
import { WG_WAY_DRAW, WG_WAY_TEST, WG_WAY_TOPICS, type WgWayTopic } from '../demo/wgWayBank.js';
import { WG_WAY_ANSWERS } from '../demo/wgWayScoring.js';
import { DEMO_SERVER_KEY } from '../shared/participationStore.js';
import { listSittings } from '../wgway/store.js';
import { STAN_SAMPLE_RELEASE, type WgWayRelease } from '../shared/wgWayReleaseStore.js';

export const TOPICS = Object.keys(WG_WAY_TOPICS) as WgWayTopic[];
export const QUESTIONS_PER_SITTING = Object.values(WG_WAY_DRAW).reduce((a, b) => a + b, 0);

export interface WgWayResult {
  id: string;
  employeeId: string;
  name: string;
  completedAt: string;
  correct: number;
  total: number;
  byTopic: Record<WgWayTopic, { correct: number; total: number }>;
  sample?: boolean;
}

const topicOf = new Map(WG_WAY_TEST.sections[0]!.questions.map((q) => [q.questionVersionId, q.topic as WgWayTopic]));
const empty = () => Object.fromEntries(TOPICS.map((t) => [t, { correct: 0, total: 0 }])) as WgWayResult['byTopic'];

/** Score one sitting from its recorded questions and answers. Unanswered questions count as wrong. */
export function scoreSitting(presentations: Presentation[], events: RunnerEvent[]): Omit<WgWayResult, 'id' | 'employeeId' | 'name' | 'completedAt'> {
  const finalAnswer = new Map<string, string>();
  for (const e of [...events].sort((a, b) => a.clientSequence - b.clientSequence)) {
    if (e.presentationId && (e.type === 'answer_selected' || e.type === 'answer_changed' || e.type === 'answer_submitted')) {
      finalAnswer.set(e.presentationId, String(e.payload.answer));
    }
  }
  const byTopic = empty();
  let correct = 0;
  for (const p of presentations) {
    const topic = topicOf.get(p.questionVersionId);
    if (!topic) continue;
    const right = finalAnswer.get(p.id) === WG_WAY_ANSWERS[p.questionVersionId];
    byTopic[topic].total += 1;
    if (right) {
      byTopic[topic].correct += 1;
      correct += 1;
    }
  }
  return { correct, total: presentations.length, byTopic };
}

/** Stan's sample: the whole 70-question bank as a reference (a real sitting draws 25). */
const SAMPLE: WgWayResult = {
  id: STAN_SAMPLE_RELEASE.sittingId,
  employeeId: STAN_SAMPLE_RELEASE.employeeId,
  name: 'Stan',
  completedAt: STAN_SAMPLE_RELEASE.completedAt,
  correct: STAN_SAMPLE_RELEASE.correct,
  total: STAN_SAMPLE_RELEASE.total,
  byTopic: Object.fromEntries(TOPICS.map((t) => {
    const s = STAN_SAMPLE_RELEASE.byTopic.find((x) => x.topic === t);
    return [t, { correct: s?.correct ?? 0, total: s?.total ?? 0 }];
  })) as WgWayResult['byTopic'],
  sample: true,
};

/** What the person sees once a Director shares the result: the score and topic counts only. */
export const releaseOf = (r: WgWayResult, now = new Date()): WgWayRelease => ({
  sittingId: r.id,
  employeeId: r.employeeId,
  completedAt: r.completedAt,
  correct: r.correct,
  total: r.total,
  byTopic: TOPICS.filter((t) => r.byTopic[t].total > 0).map((t) => ({ topic: t, label: WG_WAY_TOPICS[t], ...r.byTopic[t] })),
  releasedAt: now.toISOString(),
  ...(r.sample ? { sample: true } : {}),
});

function serverCopy(id: string): { presentations: Record<string, Presentation>; events: Record<string, RunnerEvent>; completedAt: string | null } | null {
  try {
    return JSON.parse(localStorage.getItem(`${DEMO_SERVER_KEY}:${id}`) ?? 'null');
  } catch {
    return null;
  }
}

export function demoWgWayResults(names: Map<string, string>): WgWayResult[] {
  const results: WgWayResult[] = [SAMPLE];
  for (const s of listSittings()) {
    const copy = serverCopy(s.assessmentId);
    if (!copy?.completedAt) continue;
    results.push({
      id: s.assessmentId,
      employeeId: s.employeeId,
      name: names.get(s.employeeId) ?? s.employeeId,
      completedAt: copy.completedAt,
      ...scoreSitting(Object.values(copy.presentations), Object.values(copy.events)),
    });
  }
  return results.sort((a, b) => a.name.localeCompare(b.name) || a.completedAt.localeCompare(b.completedAt));
}

export const pct = (c: number, t: number) => (t ? Math.round((c / t) * 100) : 0);
