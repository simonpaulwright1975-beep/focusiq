import { describe as suite, expect, it } from 'vitest';
import { createSession, reduce, type Action, type SessionState } from '../src/runner/index.js';
import { WG_WAY_TEST } from '../app/src/demo/wgWayBank.js';
import { WG_WAY_ANSWERS } from '../app/src/demo/wgWayScoring.js';
import { scoreSitting } from '../app/src/views/wgWayResults.js';

/** Sit the whole check, answering the first `right` questions correctly and the rest wrongly. */
function sit(right: number): SessionState {
  let s = createSession({ definition: WG_WAY_TEST, assessmentId: 'wg-test', seed: 'seed-x' });
  let t = Date.parse('2026-10-06T09:00:00Z');
  const at = () => new Date((t += 1000)).toISOString();
  const go = (a: Action) => (s = reduce(s, a));
  go({ type: 'start', at: at() });
  go({ type: 'start_section', at: at() });
  const ids = s.order[0]!.questionIds;
  ids.forEach((id, i) => {
    const key = WG_WAY_ANSWERS[id]!;
    const wrong = WG_WAY_TEST.sections[0]!.questions.find((q) => q.questionVersionId === id)!.options.find((o) => o.id !== key)!.id;
    go({ type: 'answer', value: i < right ? key : wrong, at: at() });
    if (i < ids.length - 1) go({ type: 'go', index: i + 1, at: at() });
  });
  go({ type: 'review', at: at() });
  go({ type: 'submit_section', at: at() });
  return s;
}

suite('Live the Walter Geering Way scoring', () => {
  it('scores right and wrong answers, with a topic breakdown that adds up', () => {
    const s = sit(18);
    const r = scoreSitting(Object.values(s.presentations), s.events);
    expect(r).toMatchObject({ correct: 18, total: 25 });
    expect(Object.values(r.byTopic).reduce((n, t) => n + t.total, 0)).toBe(25);
    expect(Object.values(r.byTopic).reduce((n, t) => n + t.correct, 0)).toBe(18);
  });
});

suite('sharing a WG Way result with the person', () => {
  it('shares the score and topic counts only – no questions or answers', async () => {
    const { releaseOf } = await import('../app/src/views/wgWayResults.js');
    const { STAN_SAMPLE_RELEASE } = await import('../app/src/shared/wgWayReleaseStore.js');
    const byTopic = Object.fromEntries(
      ['history', 'way', 'products', 'supply', 'business', 'playbook', 'newbiz'].map((t) => [t, { correct: t === 'supply' ? 1 : 0, total: t === 'supply' ? 2 : 0 }]),
    ) as Parameters<typeof releaseOf>[0]['byTopic'];
    const r = releaseOf({ id: 's1', employeeId: 'e1', name: 'Alex', completedAt: '2026-10-06T09:00:00Z', correct: 1, total: 2, byTopic }, new Date('2026-10-07T09:00:00Z'));
    expect(Object.keys(r).sort()).toEqual(['byTopic', 'completedAt', 'correct', 'employeeId', 'releasedAt', 'sittingId', 'total']);
    expect(r.byTopic).toEqual([{ topic: 'supply', label: 'Supply, bespoke & lead times', correct: 1, total: 2 }]);
    const text = JSON.stringify([r, STAN_SAMPLE_RELEASE]);
    expect(text).not.toMatch(/"wg-\d+"|answer|option/i);
    expect(STAN_SAMPLE_RELEASE.correct).toBe(67);
    expect(STAN_SAMPLE_RELEASE.byTopic.reduce((n, t) => n + t.total, 0)).toBe(70);
  });
});
