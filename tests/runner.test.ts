import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe as suite, expect, it } from 'vitest';
import { DEMO_ASSESSMENT } from '../app/src/demo/assessment.js';
import { DEMO_SCORING } from '../app/src/demo/scoring.js';
import { WG_WAY_DRAW, WG_WAY_NOT_TOGETHER, WG_WAY_TEST } from '../app/src/demo/wgWayBank.js';
import { WG_WAY_ANSWERS } from '../app/src/demo/wgWayScoring.js';
import { deriveExerciseEvidence, type Presentation as EvidencePresentation } from '../src/insight/index.js';
import {
  Outbox,
  createSession,
  currentQuestionId,
  motivationRanking,
  reduce,
  remainingSeconds,
  replay,
  scoredEvidence,
  verifyMedia,
  type Action,
  type SessionOptions,
  type SessionState,
  type Transport,
} from '../src/runner/index.js';

const T0 = Date.parse('2026-10-05T09:00:00Z');
const at = (s: number) => new Date(T0 + s * 1000).toISOString();
const opts = { definition: DEMO_ASSESSMENT, assessmentId: 'asmt-1', seed: 'seed-1' };

function run(actions: Action[], o: SessionOptions = opts): SessionState {
  return actions.reduce(reduce, createSession(o));
}
const types = (s: SessionState) => s.events.map((e) => e.type);

suite('per-person randomisation', () => {
  it('shuffles questions and options deterministically per seed', () => {
    const a = createSession(opts);
    const b = createSession(opts);
    const c = createSession({ ...opts, seed: 'another-person' });
    expect(a.order).toEqual(b.order);
    expect(a.optionOrder).toEqual(b.optionOrder);
    expect(JSON.stringify(a.order) + JSON.stringify(a.optionOrder)).not.toBe(JSON.stringify(c.order) + JSON.stringify(c.optionOrder));
  });

  it('keeps option order where it carries meaning and never reorders sections', () => {
    const s = createSession({ ...opts, seed: 'x' });
    expect(s.optionOrder['demo-q07']).toEqual(['a', 'b', 'c', 'd']);
    expect(s.order.map((o) => o.sectionId)).toEqual(['reading', 'quick', 'abstract', 'code', 'numbers', 'commercial', 'priorities', 'motivation']);
  });

  it('records exactly what was rendered, in the order shown', () => {
    const s = run([{ type: 'start', at: at(0) }, { type: 'start_section', at: at(5) }]);
    const id = currentQuestionId(s)!;
    const p = s.presentations[id]!;
    expect(p.sequence).toBe(1);
    expect(p.renderedContent.options.map((o) => o.id)).toEqual(s.optionOrder[id]);
    expect(p.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

suite('event stream', () => {
  it('records views, dwell, revisits, answer changes and submission', () => {
    const s = run([
      { type: 'start', at: at(0) },
      { type: 'start_section', at: at(10) },
      { type: 'answer', value: 'a', at: at(20) },
      { type: 'go', index: 1, at: at(30) },
      { type: 'go', index: 0, at: at(40) }, // revisit
      { type: 'answer', value: 'b', at: at(45) },
      { type: 'answer', value: 'b', at: at(46) }, // same answer – no event
      { type: 'review', at: at(50) },
      { type: 'submit_section', at: at(55) },
    ]);
    expect(types(s)).toEqual([
      'assessment_started',
      'instructions_viewed',
      'question_presented',
      'question_viewed',
      'answer_selected',
      'question_left',
      'question_presented',
      'question_viewed',
      'question_left',
      'question_revisited',
      'question_viewed',
      'answer_changed',
      'question_left',
      'answer_submitted',
    ]);
    const lefts = s.events.filter((e) => e.type === 'question_left').map((e) => e.payload.dwell_ms);
    expect(lefts).toEqual([20000, 10000, 10000]);
    expect(s.events.find((e) => e.type === 'answer_changed')!.payload).toEqual({ answer: 'b', previous_answer: 'a' });
    expect(s.events.map((e) => e.clientSequence)).toEqual(s.events.map((_, i) => i + 1));
    expect(s.phase).toEqual({ kind: 'section_intro', section: 1 });
  });

  it('records when the employee switches away from the assessment', () => {
    const s = run([
      { type: 'start', at: at(0) },
      { type: 'start_section', at: at(1) },
      { type: 'visibility', hidden: true, at: at(5) },
      { type: 'visibility', hidden: true, at: at(6) },
      { type: 'visibility', hidden: false, at: at(9) },
    ]);
    expect(types(s).slice(-2)).toEqual(['focus_lost', 'focus_returned']);
  });
});

suite('timed sections', () => {
  const toQuick: Action[] = [
    { type: 'start', at: at(0) },
    { type: 'start_section', at: at(1) },
    { type: 'review', at: at(2) },
    { type: 'submit_section', at: at(3) },
    { type: 'start_section', at: at(10) },
  ];

  it('counts down and auto-submits answered questions when time runs out', () => {
    let s = run([...toQuick, { type: 'answer', value: 'b', at: at(20) }]);
    expect(remainingSeconds(s, at(20))).toBe(110);
    s = reduce(s, { type: 'answer', value: 'c', at: at(200) }); // after the deadline – ignored
    expect(types(s).slice(-3)).toEqual(['timer_expired', 'question_left', 'answer_submitted']);
    expect(s.phase).toEqual({ kind: 'section_intro', section: 2 });
    expect(Object.values(s.answers)).toEqual(['b']);
    const expiry = s.events.find((e) => e.type === 'timer_expired')!;
    expect(expiry.occurredAt).toBe(at(130));
  });

  it('applies an agreed time adjustment and records it', () => {
    const s = run(toQuick, { ...opts, timeMultiplier: 1.25 });
    const started = s.events.find((e) => e.type === 'timer_started')!;
    expect(started.payload).toMatchObject({ time_limit_seconds: 150, base_time_limit_seconds: 120, time_multiplier: 1.25 });
    expect(remainingSeconds(s, at(10))).toBe(150);
    expect(Object.values(s.presentations)[1]!.timeLimitSeconds).toBe(150);
  });
});

/** Answers every question correctly using the demo key (test-only). */
function completeAll(seed = 'seed-1'): { actions: Action[]; state: SessionState } {
  const o = { ...opts, seed };
  let s = createSession(o);
  const actions: Action[] = [];
  let t = 0;
  const act = (a: Action) => {
    actions.push(a);
    s = reduce(s, a);
  };
  act({ type: 'start', at: at(t++) });
  while (s.phase.kind !== 'complete') {
    if (s.phase.kind === 'section_intro') act({ type: 'start_section', at: at((t += 2)) });
    const section = s.phase.kind === 'question' ? s.phase.section : -1;
    if (section < 0) continue;
    const ids = s.order[section]!.questionIds;
    ids.forEach((id, i) => {
      if (i > 0) act({ type: 'go', index: i, at: at((t += 3)) });
      const key = DEMO_SCORING[id]?.correctAnswer ?? 'customer_impact>mastery>autonomy>team>progression>recognition>security>financial_reward';
      act({ type: 'answer', value: key, at: at((t += 5)) });
    });
    act({ type: 'review', at: at((t += 1)) });
    act({ type: 'submit_section', at: at((t += 1)) });
  }
  return { actions, state: s };
}

suite('completion, resume and evidence', () => {
  it('completes, captures the motivation ranking and replays identically', () => {
    const { actions, state } = completeAll();
    expect(state.phase).toEqual({ kind: 'complete' });
    expect(types(state).at(-1)).toBe('assessment_submitted');
    expect(motivationRanking(state)).toEqual(['customer_impact', 'mastery', 'autonomy', 'team', 'progression', 'recognition', 'security', 'financial_reward']);
    expect(replay(opts, actions)).toEqual(state);
  });

  it('feeds the insight engine directly – motivation is never used as performance evidence', () => {
    const { state } = completeAll();
    const { presentations, events } = scoredEvidence(state);
    expect(presentations).toHaveLength(58);
    const evidence = deriveExerciseEvidence(
      presentations.map<EvidencePresentation>((p) => ({
        id: p.id,
        questionVersionId: p.questionVersionId,
        sequence: p.sequence,
        timed: p.timed,
        meta: DEMO_SCORING[p.questionVersionId]!,
      })),
      events.map((e) => ({ presentationId: e.presentationId!, clientSequence: e.clientSequence, type: e.type, occurredAt: e.occurredAt, payload: e.payload as never })),
    );
    expect(evidence).toHaveLength(58);
    expect(evidence.every((e) => e.correct && e.firstAnswerCorrect && !e.reopened)).toBe(true);
    expect(evidence.filter((e) => e.timed)).toHaveLength(43);
    expect(evidence.find((e) => e.questionVersionId === 'demo-q12')).toMatchObject({ choseOutcomeAction: true, escalatedUnnecessarily: false });
  });
});

suite('saving (outbox)', () => {
  function flakyTransport(failuresBeforeSuccess: number) {
    const saved = new Map<string, unknown>();
    let calls = 0;
    let completed: string | null = null;
    const t: Transport = {
      async save(batch) {
        calls += 1;
        if (calls <= failuresBeforeSuccess) throw new Error('offline');
        // Idempotent on (assessment, client_sequence) like the database.
        for (const e of batch.events) saved.set(`${e.assessmentId}:${e.clientSequence}`, e);
      },
      async complete(_id, when) {
        completed = when;
      },
    };
    return { t, saved, getCalls: () => calls, getCompleted: () => completed };
  }

  it('keeps unsent events while offline, retries with backoff and completes only after everything is saved', async () => {
    const { state } = completeAll();
    const flaky = flakyTransport(2);
    const timers: (() => void)[] = [];
    const statuses: string[] = [];
    const outbox = new Outbox({
      transport: flaky.t,
      onStatus: (s) => statuses.push(s.kind),
      setTimer: (fn) => timers.push(fn),
      clearTimer: () => {},
    });
    await outbox.push({ assessmentId: state.assessmentId, presentations: Object.values(state.presentations), events: state.events, completedAt: state.completedAt });
    expect(outbox.pending).toBe(state.events.length);
    expect(flaky.getCompleted()).toBeNull();
    timers.shift()!();
    await new Promise((r) => setTimeout(r, 0));
    timers.shift()!();
    await new Promise((r) => setTimeout(r, 0));
    expect(outbox.pending).toBe(0);
    expect(flaky.saved.size).toBe(state.events.length);
    expect(flaky.getCompleted()).toBe(state.completedAt);
    expect(statuses).toContain('retrying');
    expect(statuses.at(-1)).toBe('saved');
  });

  it('a retried batch that was already saved creates no duplicates', async () => {
    const { state } = completeAll();
    const flaky = flakyTransport(0);
    const outbox = new Outbox({ transport: flaky.t });
    const snap = { assessmentId: state.assessmentId, presentations: Object.values(state.presentations), events: state.events, completedAt: null };
    await outbox.push(snap);
    await flaky.t.save({ presentations: [], events: state.events }); // simulated duplicate delivery
    expect(flaky.saved.size).toBe(state.events.length);
  });
});

suite('question banks', () => {
  it('draws the same number from each topic, the same set on resume, and a fresh set for a new sitting', () => {
    const def = WG_WAY_TEST;
    const topics = (ids: string[]) => ids.map((id) => def.sections[0]!.questions.find((q) => q.questionVersionId === id)!.topic);
    const a = createSession({ definition: def, assessmentId: 'a', seed: 'seed-1' }).order[0]!.questionIds;
    const again = createSession({ definition: def, assessmentId: 'a', seed: 'seed-1' }).order[0]!.questionIds;
    const b = createSession({ definition: def, assessmentId: 'b', seed: 'seed-2' }).order[0]!.questionIds;
    expect(a).toHaveLength(25);
    expect(new Set(a).size).toBe(25);
    expect(again).toEqual(a);
    expect(b).not.toEqual(a);
    for (const ids of [a, b]) {
      const count = (t: string) => topics(ids).filter((x) => x === t).length;
      expect(Object.fromEntries(Object.keys(WG_WAY_DRAW).map((t) => [t, count(t)]))).toEqual(WG_WAY_DRAW);
    }
  });

  it('never puts two questions that are too alike in the same sitting', () => {
    for (let i = 0; i < 300; i++) {
      const ids = new Set(createSession({ definition: WG_WAY_TEST, assessmentId: `a${i}`, seed: `s${i}` }).order[0]!.questionIds);
      expect(ids.size).toBe(25);
      for (const [x, y] of WG_WAY_NOT_TOGETHER) expect(ids.has(x) && ids.has(y)).toBe(false);
    }
  });

  it('has an answer for every question in the Walter Geering bank', () => {
    const ids = WG_WAY_TEST.sections[0]!.questions.map((q) => q.questionVersionId);
    expect(ids).toHaveLength(63);
    expect(Object.keys(WG_WAY_ANSWERS).sort()).toEqual([...ids].sort());
    for (const q of WG_WAY_TEST.sections[0]!.questions) expect(q.options.map((o) => o.id)).toContain(WG_WAY_ANSWERS[q.questionVersionId]);
  });
});

suite('images and bundle safety', () => {
  const root = resolve(dirname(new URL(import.meta.url).pathname), '..');

  it('shows an image only when its bytes match the recorded fingerprint', async () => {
    const q = DEMO_ASSESSMENT.sections[1]!.questions[0]!;
    const bytes = readFileSync(resolve(root, 'app/public', q.image!.src.replace('./', '')));
    expect(await verifyMedia(bytes, q.image!.sha256)).toBe(true);
    const tampered = new Uint8Array(bytes.length + 1);
    tampered.set(bytes);
    tampered[bytes.length] = 32; // one extra byte
    expect(await verifyMedia(tampered, q.image!.sha256)).toBe(false);
    for (const o of q.options) {
      expect(await verifyMedia(readFileSync(resolve(root, 'app/public', o.image!.src.replace('./', ''))), o.image!.sha256)).toBe(true);
    }
  });

  it('the employee app cannot reach answer keys, Director views or the scoring engines', () => {
    const seen = new Set<string>();
    const visit = (file: string) => {
      if (seen.has(file)) return;
      seen.add(file);
      const src = readFileSync(file, 'utf8');
      // Type-only imports are erased at build time and ship no code.
      for (const m of src.matchAll(/^(?:import|export)(?!\s+type\b)[^'"]*?from\s+['"](\.[^'"]+)['"]/gm)) {
        let target = resolve(dirname(file), m[1]!).replace(/\.js$/, '');
        for (const ext of ['.ts', '.tsx', '/index.ts']) {
          try {
            readFileSync(target + ext);
            target += ext;
            break;
          } catch {
            /* try next */
          }
        }
        visit(target);
      }
    };
    visit(resolve(root, 'app/src/employee/main.tsx'));
    visit(resolve(root, 'app/src/wgway/main.tsx'));
    const files = [...seen].map((f) => f.replace(`${root}/`, ''));
    expect(files).toContain('src/runner/session.ts');
    expect(files).toContain('app/src/shared/SummaryView.tsx');
    expect(files).toContain('app/src/demo/wgWayBank.ts');
    for (const f of files) {
      expect(f).not.toMatch(/^src\/(benchmarking|insight)\//);
      expect(f).not.toMatch(/app\/src\/(views|demo\/scoring|demo\/abstractScoring|demo\/wgWayScoring|demo\/dataset|demo\/adjustmentSeed|demo\/requestSeed|demo\/daySeed|demo\/outboxStore|insights)/);
    }
  });
});
