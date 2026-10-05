/**
 * Seeded DEMO dataset. Every name is fictional; every number is generated.
 * Replace with the Supabase data source once a FocusiQ project exists.
 */
import { DEFAULT_METRICS, EligibilityLedger, type Actor, type Assessment, type Department, type Employee } from '../../../src/benchmarking/index.js';
import type { ExerciseEvidence, MotivationProfile, MotivatorKey } from '../../../src/insight/index.js';

export const DEMO_NOW = new Date('2026-10-02T12:00:00Z');
/** Stan: the fictional sample reference profile (see SEEDS). */
export const SAMPLE_EMPLOYEE_ID = 'stan';
export const DEMO_DIRECTOR: Actor = { id: 'director-demo', name: 'Demo Director', role: 'director' };

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Profile =
  | 'over_processor'
  | 'rusher'
  | 'escalator'
  | 'initiative'
  | 'task_focused'
  | 'balanced'
  | 'commercial_gap'
  | 'controlled'
  | 'reference';

interface Seed {
  id: string;
  name: string;
  department: Department;
  role: string;
  profile: Profile;
  start: string;
  status?: Employee['status'];
  tags?: string[];
  /** Only one assessment round. */
  single?: boolean;
}

const SEEDS: Seed[] = [
  // Sales
  { id: 's1', name: 'Alex Morgan', department: 'Sales', role: 'Salesperson', profile: 'over_processor', start: '2021-03-01', tags: ['Customer-facing', 'Target bearing'] },
  { id: 's2', name: 'Priya Shah', department: 'Sales', role: 'Salesperson', profile: 'initiative', start: '2019-06-10', tags: ['Customer-facing', 'Target bearing'] },
  { id: 's3', name: 'Tom Reilly', department: 'Sales', role: 'Salesperson', profile: 'task_focused', start: '2022-09-05', tags: ['Customer-facing', 'Target bearing'] },
  { id: 's4', name: 'Grace Okafor', department: 'Sales', role: 'Salesperson', profile: 'commercial_gap', start: '2025-11-03', tags: ['Customer-facing', 'New starter'] },
  { id: 's5', name: 'Liam Carter', department: 'Sales', role: 'Salesperson', profile: 'rusher', start: '2020-01-13', tags: ['Customer-facing', 'Target bearing'] },
  { id: 's6', name: 'Hannah Price', department: 'Sales', role: 'Sales Manager', profile: 'balanced', start: '2016-04-18', tags: ['Customer-facing', 'Manager'] },
  { id: 's7', name: 'Ben Walsh', department: 'Sales', role: 'Salesperson', profile: 'task_focused', start: '2023-02-20', tags: ['Customer-facing', 'Target bearing'] },
  { id: 's8', name: 'Chloe Turner', department: 'Sales', role: 'Salesperson', profile: 'escalator', start: '2024-05-07', tags: ['Customer-facing', 'Target bearing'] },
  { id: 's9', name: 'Mark Stone', department: 'Sales', role: 'Salesperson', profile: 'balanced', start: '2018-02-01', status: 'former', single: true },
  { id: 'dt', name: 'Director Test Account', department: 'Sales', role: 'Salesperson', profile: 'balanced', start: '2026-01-01', status: 'test', single: true },
  // Marketing
  { id: 'm1', name: 'Maya Patel', department: 'Marketing', role: 'Marketing Executive', profile: 'initiative', start: '2021-08-02', tags: ['Office based'] },
  { id: 'm2', name: 'Owen Hughes', department: 'Marketing', role: 'Marketing Executive', profile: 'controlled', start: '2017-10-09', tags: ['Office based'] },
  { id: 'm3', name: 'Zara Ali', department: 'Marketing', role: 'Designer', profile: 'balanced', start: '2022-01-17', tags: ['Office based'] },
  { id: 'm4', name: 'Ethan Brooks', department: 'Marketing', role: 'Marketing Executive', profile: 'over_processor', start: '2023-06-12', tags: ['Office based'] },
  { id: 'm5', name: 'Isla Murray', department: 'Marketing', role: 'Marketing Manager', profile: 'balanced', start: '2015-03-23', tags: ['Office based', 'Manager'] },
  // Customer Service
  { id: 'c1', name: 'Ruby Clarke', department: 'Customer Service', role: 'Customer Service Advisor', profile: 'escalator', start: '2022-04-04', tags: ['Customer-facing'] },
  { id: 'c2', name: 'Jack Evans', department: 'Customer Service', role: 'Customer Service Advisor', profile: 'escalator', start: '2020-07-20', tags: ['Customer-facing'] },
  { id: 'c3', name: 'Amira Hassan', department: 'Customer Service', role: 'Customer Service Advisor', profile: 'balanced', start: '2019-09-30', tags: ['Customer-facing'] },
  { id: 'c4', name: 'Noah Bennett', department: 'Customer Service', role: 'Customer Service Advisor', profile: 'escalator', start: '2024-02-12', tags: ['Customer-facing'] },
  { id: 'c5', name: 'Lucy Ward', department: 'Customer Service', role: 'Customer Service Advisor', profile: 'over_processor', start: '2021-11-08', tags: ['Customer-facing'] },
  { id: 'c6', name: 'Sam Cooper', department: 'Customer Service', role: 'Customer Service Advisor', profile: 'escalator', start: '2023-03-06', tags: ['Customer-facing'] },
  { id: 'c7', name: 'Ella Foster', department: 'Customer Service', role: 'Customer Service Advisor', profile: 'escalator', start: '2025-12-01', tags: ['Customer-facing', 'New starter'] },
  { id: 'c8', name: 'Kai Robinson', department: 'Customer Service', role: 'Customer Service Advisor', profile: 'initiative', start: '2018-05-14', tags: ['Customer-facing'] },
  { id: 'c9', name: 'Freya Bell', department: 'Customer Service', role: 'Customer Service Advisor', profile: 'escalator', start: '2022-08-22', tags: ['Customer-facing'] },
  { id: 'c10', name: 'Dan Moore', department: 'Customer Service', role: 'Team Leader', profile: 'escalator', start: '2017-01-09', tags: ['Customer-facing', 'Manager'] },
  // Stock Control (deliberately small: shows "Benchmark unavailable")
  { id: 'k1', name: 'Megan Holt', department: 'Stock Control', role: 'Stock Controller', profile: 'controlled', start: '2016-06-06' },
  { id: 'k2', name: 'Ryan Doyle', department: 'Stock Control', role: 'Stock Controller', profile: 'rusher', start: '2023-10-02' },
  { id: 'k3', name: 'Tess Kim', department: 'Stock Control', role: 'Stock Controller', profile: 'over_processor', start: '2020-02-17' },
  { id: 'k4', name: 'Leo Grant', department: 'Stock Control', role: 'Warehouse Lead', profile: 'balanced', start: '2014-08-11', tags: ['Manager'] },
  // Finance
  { id: 'f1', name: 'Olivia Dunn', department: 'Finance', role: 'Finance Assistant', profile: 'over_processor', start: '2019-04-01', tags: ['Office based'] },
  { id: 'f2', name: 'Harry Lowe', department: 'Finance', role: 'Finance Assistant', profile: 'over_processor', start: '2021-07-12', tags: ['Office based'] },
  { id: 'f3', name: 'Nina Kaur', department: 'Finance', role: 'Credit Controller', profile: 'controlled', start: '2018-11-19', tags: ['Office based'] },
  { id: 'f4', name: 'Paul Reid', department: 'Finance', role: 'Finance Assistant', profile: 'over_processor', start: '2022-03-28', tags: ['Office based'] },
  { id: 'f5', name: 'Sophie Lane', department: 'Finance', role: 'Finance Manager', profile: 'balanced', start: '2013-09-02', tags: ['Office based', 'Manager'] },
  { id: 'f6', name: 'Adam Cole', department: 'Finance', role: 'Purchase Ledger Clerk', profile: 'over_processor', start: '2024-01-15', tags: ['Office based'], single: true },
  // Sample reference profile for managers: a fictional strong result (core average 85).
  // A test user, so it never counts towards anyone's benchmarks. Kept last so the
  // seeded numbers for everyone above stay the same.
  { id: 'stan', name: 'Stan', department: 'Sales', role: 'Sales Manager', profile: 'reference', start: '2015-05-11', status: 'test', tags: ['Manager', 'Sample reference profile'] },
];

/**
 * Stan's fixed scores (no random noise), so the sample report always reads the
 * same. Latest round: the ten core dimensions average exactly 85.
 */
const REFERENCE_SCORES: Record<1 | 2, Record<string, number>> = {
  1: {
    think: 82, absorb: 80, remember: 79, prioritise: 84, decide: 83, act: 82, own: 85, drive: 81, complete: 78, focus: 76,
    decision_efficiency: 82, decision_confidence: 83, information_retention: 79, accuracy: 91, avg_response_seconds: 29,
    recheck_rate: 12, unnecessary_recheck_rate: 8, timed_performance: 86, untimed_performance: 85,
    commercial_awareness: 83, target_ownership: 85, customer_judgement: 84,
  },
  2: {
    think: 86, absorb: 84, remember: 83, prioritise: 88, decide: 87, act: 86, own: 89, drive: 85, complete: 82, focus: 80,
    decision_efficiency: 86, decision_confidence: 87, information_retention: 83, accuracy: 94, avg_response_seconds: 27,
    recheck_rate: 10, unnecessary_recheck_rate: 6, timed_performance: 89, untimed_performance: 88,
    commercial_awareness: 86, target_ownership: 88, customer_judgement: 87,
  },
};

/** Profile → dimension tendencies (offsets from 68) and behavioural parameters. */
const PROFILE: Record<Profile, { dims: Partial<Record<string, number>>; acc: number; time: number; recheck: number }> = {
  over_processor: { dims: { absorb: 8, remember: 8, decide: -8, act: -6, complete: -7, focus: 4 }, acc: 92, time: 46, recheck: 44 },
  rusher: { dims: { act: 10, drive: 6, absorb: -9, remember: -6, think: -4 }, acc: 78, time: 21, recheck: 8 },
  escalator: { dims: { decide: -9, own: -6, act: -5, absorb: 3 }, acc: 86, time: 35, recheck: 24 },
  initiative: { dims: { act: 10, own: 10, drive: 9, decide: 6 }, acc: 88, time: 28, recheck: 14 },
  task_focused: { dims: { complete: 8, own: -8, drive: -7, prioritise: -4 }, acc: 87, time: 31, recheck: 18 },
  balanced: { dims: { think: 3, prioritise: 3 }, acc: 87, time: 30, recheck: 18 },
  commercial_gap: { dims: { prioritise: -8, think: -3, complete: 4 }, acc: 89, time: 32, recheck: 20 },
  controlled: { dims: { think: 6, absorb: 6, focus: 6, act: -4 }, acc: 93, time: 52, recheck: 12 },
  reference: { dims: {}, acc: 94, time: 27, recheck: 10 },
};

const CORE = ['think', 'absorb', 'remember', 'prioritise', 'decide', 'act', 'own', 'drive', 'complete', 'focus'];
const clamp = (v: number, lo = 20, hi = 98) => Math.max(lo, Math.min(hi, Math.round(v)));

function scoresFor(seed: Seed, round: 1 | 2, r: () => number): Record<string, number> {
  if (seed.profile === 'reference') return { ...REFERENCE_SCORES[round] };
  const p = PROFILE[seed.profile];
  const growth = round === 2 ? 3 : 0;
  const noise = () => (r() - 0.5) * 12;
  const s: Record<string, number> = {};
  for (const d of CORE) s[d] = clamp(68 + (p.dims[d] ?? 0) + growth + noise());
  s.decision_efficiency = clamp((s.decide! + s.act!) / 2 + noise() / 2);
  s.decision_confidence = clamp(s.decide! + noise() / 2);
  s.information_retention = clamp(s.remember! + noise() / 2);
  s.accuracy = clamp(p.acc + (r() - 0.5) * 6 + growth / 2, 50, 100);
  s.avg_response_seconds = Math.round(p.time * (round === 2 ? 0.93 : 1) + (r() - 0.5) * 8);
  s.recheck_rate = clamp(p.recheck * (round === 2 ? 0.85 : 1) + (r() - 0.5) * 8, 2, 80);
  s.unnecessary_recheck_rate = clamp(s.recheck_rate * 0.7, 1, 70);
  s.timed_performance = clamp((s.decision_efficiency! + s.accuracy!) / 2 + (seed.profile === 'rusher' ? -6 : 2));
  s.untimed_performance = clamp((s.absorb! + s.accuracy!) / 2);
  if (seed.department === 'Sales') {
    s.commercial_awareness = clamp(70 + (seed.profile === 'commercial_gap' ? -20 : 0) + noise());
    s.target_ownership = clamp(s.own! + noise() / 2);
  }
  if (seed.department === 'Sales' || seed.department === 'Customer Service') {
    s.customer_judgement = clamp(72 + noise());
  }
  return s;
}

// ---------------------------------------------------------------------------
// Exercise-level evidence for the insight reports (latest assessment only)
// ---------------------------------------------------------------------------
function exercisesFor(seed: Seed, r: () => number): ExerciseEvidence[] {
  const p = seed.profile;
  const out: ExerciseEvidence[] = [];
  let seq = 0;
  const add = (e: Partial<ExerciseEvidence> & { family: string; dimension: string }) => {
    seq += 1;
    const correct = e.correct ?? true;
    out.push({
      exerciseId: `${seed.id}-x${String(seq).padStart(2, '0')}`,
      modality: 'text',
      sequence: seq,
      timed: false,
      risk: 'high',
      firstAnswerCorrect: correct,
      reopened: false,
      answerChanged: false,
      responseSeconds: PROFILE[p].time,
      reviewSecondsAfterFirstAnswer: 0,
      ...e,
      correct,
    });
  };
  const chance = (x: number) => r() < x;

  // 13 lower-risk decisions
  for (let i = 0; i < 13; i++) {
    const timed = i >= 9;
    const reopen = p === 'over_processor' ? i < 9 : chance(p === 'controlled' ? 0.25 : p === 'reference' ? 0.08 : 0.15);
    const first = p === 'rusher' ? chance(0.78) : chance(p === 'reference' ? 0.95 : 0.9);
    const improved = reopen && !first && chance(0.3);
    add({
      family: 'routine-decision',
      dimension: 'decide',
      risk: 'low',
      timed,
      reopened: reopen && !timed,
      firstAnswerCorrect: first,
      correct: first || improved,
      answerChanged: improved,
      responseSeconds: timed ? PROFILE[p].time * (p === 'over_processor' ? 0.6 : 0.85) : PROFILE[p].time + (reopen ? 20 : 0),
      reviewSecondsAfterFirstAnswer: reopen && !timed ? 18 + Math.round(r() * 8) : 0,
    });
  }
  // 6 higher-risk detail checks (4 timed)
  for (let i = 0; i < 6; i++) {
    const acc = p === 'rusher' ? 0.65 : p === 'over_processor' || p === 'controlled' || p === 'reference' ? 0.97 : 0.85;
    add({ family: 'detail-check', dimension: 'absorb', timed: i < 4, modality: i % 2 ? 'visual' : 'text', correct: chance(acc), multiStage: i >= 3, responseSeconds: PROFILE[p].time * (i < 4 ? 0.7 : 1) });
  }
  // 6 retention
  for (let i = 0; i < 6; i++) {
    const acc = p === 'rusher' ? 0.5 : p === 'over_processor' || p === 'controlled' ? 0.92 : p === 'reference' ? 0.9 : 0.8;
    add({ family: 'recall', dimension: 'remember', multiStage: true, correct: chance(acc) });
  }
  // 6 initiative scenarios
  for (let i = 0; i < 6; i++) {
    const share = p === 'initiative' || p === 'reference' ? 0.9 : p === 'task_focused' || p === 'escalator' ? 0.25 : 0.55;
    add({ family: 'next-action', dimension: 'act', modality: 'scenario', identifiedNextAction: chance(share) });
  }
  // 8 escalation scenarios
  for (let i = 0; i < 8; i++) {
    const share = p === 'escalator' ? 0.75 : p === 'initiative' || p === 'reference' ? 0.05 : 0.2;
    add({ family: 'authority', dimension: 'decide', modality: 'scenario', escalatedUnnecessarily: chance(share) });
  }
  // 6 ownership scenarios (3 customer impact)
  for (let i = 0; i < 6; i++) {
    const share = p === 'task_focused' ? 0.15 : p === 'initiative' || p === 'reference' ? 0.9 : 0.6;
    const outcome = chance(share);
    add({ family: 'ownership', dimension: 'own', modality: 'scenario', choseOutcomeAction: outcome, customerImpactScenario: i < 3, correct: outcome || chance(0.5) });
  }
  // 5 commercial items
  for (let i = 0; i < 5; i++) {
    const acc = p === 'commercial_gap' ? 0.3 : p === 'reference' ? 0.95 : seed.department === 'Sales' || seed.department === 'Finance' ? 0.85 : 0.7;
    const ok = chance(acc);
    add({ family: 'commercial', dimension: 'prioritise', modality: 'numerical', commercialCorrect: ok, correct: ok });
  }
  // Sales: routine vs live opportunity
  if (seed.department === 'Sales') {
    for (let i = 0; i < 4; i++) {
      const share = p === 'task_focused' || p === 'commercial_gap' ? 0.75 : p === 'reference' ? 0.05 : 0.2;
      add({ family: 'sales-priority', dimension: 'prioritise', modality: 'scenario', choseRoutineOverOpportunity: chance(share) });
    }
  }
  // Priorities: 5 defined, 5 competing
  for (let i = 0; i < 10; i++) {
    const defined = i < 5;
    const acc = defined ? 0.92 : p === 'commercial_gap' || p === 'over_processor' ? 0.5 : p === 'reference' ? 0.9 : 0.8;
    add({ family: 'prioritisation', dimension: 'prioritise', priorityContext: defined ? 'defined' : 'competing', correct: chance(acc) });
  }
  return out;
}

const MOTIVATOR_ORDER: Record<Profile, MotivatorKey[]> = {
  over_processor: ['mastery', 'security', 'recognition', 'progression', 'financial_reward'],
  rusher: ['financial_reward', 'progression', 'recognition', 'autonomy', 'security'],
  escalator: ['security', 'team', 'recognition', 'customer_impact', 'autonomy'],
  initiative: ['autonomy', 'progression', 'customer_impact', 'recognition', 'security'],
  task_focused: ['security', 'financial_reward', 'team', 'recognition', 'autonomy'],
  balanced: ['progression', 'recognition', 'team', 'financial_reward', 'security'],
  commercial_gap: ['customer_impact', 'team', 'recognition', 'progression', 'financial_reward'],
  controlled: ['mastery', 'autonomy', 'security', 'recognition', 'financial_reward'],
  reference: ['team', 'customer_impact', 'progression', 'autonomy', 'recognition'],
};

export interface DemoData {
  employees: Employee[];
  assessments: Assessment[];
  ledger: EligibilityLedger;
  /** Exercise evidence per latest assessment id. */
  exercises: Map<string, ExerciseEvidence[]>;
  motivation: Map<string, MotivationProfile>;
}

/**
 * `sampleOnly`: just Stan, the labelled sample reference profile – used in live
 * mode so the results tabs never show the fictional staff next to real people.
 */
export function buildDemoData({ sampleOnly = false }: { sampleOnly?: boolean } = {}): DemoData {
  if (sampleOnly) {
    const full = buildDemoData();
    const keep = (id: string) => id === SAMPLE_EMPLOYEE_ID;
    const assessments = full.assessments.filter((a) => keep(a.employeeId));
    const ids = new Set(assessments.map((a) => a.id));
    return {
      employees: full.employees.filter((e) => keep(e.id)),
      assessments,
      ledger: new EligibilityLedger({ now: () => DEMO_NOW }),
      exercises: new Map([...full.exercises].filter(([id]) => ids.has(id))),
      motivation: new Map([...full.motivation].filter(([id]) => ids.has(id))),
    };
  }
  const r = rng(20261002);
  const employees: Employee[] = SEEDS.map((s) => ({
    id: s.id,
    displayName: s.name,
    department: s.department,
    role: s.role,
    status: s.status ?? 'active',
    startDate: s.start,
    ...(s.status === 'former' ? { leftDate: '2026-05-01' } : {}),
    cohortTags: s.tags ?? [],
  }));
  const assessments: Assessment[] = [];
  const exercises = new Map<string, ExerciseEvidence[]>();
  const motivation = new Map<string, MotivationProfile>();

  for (const s of SEEDS) {
    const rounds: (1 | 2)[] = s.single ? [s.status === 'former' ? 1 : 2] : [1, 2];
    for (const round of rounds) {
      const month = round === 1 ? 1 + Math.floor(r() * 3) : 7 + Math.floor(r() * 3);
      const day = 2 + Math.floor(r() * 25);
      const id = `${s.id}-r${round}`;
      assessments.push({
        id,
        employeeId: s.id,
        version: 'focusiq-2026.1',
        scoringVersion: 'scoring/1.0.0',
        type: 'full',
        completedAt: new Date(Date.UTC(2026, month - 1, day, 9 + Math.floor(r() * 6))).toISOString(),
        complete: true,
        validity: 'valid',
        scores: scoresFor(s, round, r),
      });
      if (round === rounds[rounds.length - 1]) {
        exercises.set(id, exercisesFor(s, r));
        motivation.set(id, { ranked: MOTIVATOR_ORDER[s.profile] });
      }
    }
  }
  // An abandoned attempt – never eligible, but kept.
  assessments.push({
    id: 'c3-incomplete', employeeId: 'c3', version: 'focusiq-2026.1', scoringVersion: 'scoring/1.0.0', type: 'full',
    completedAt: '2026-08-14T10:00:00Z', complete: false, validity: 'valid', scores: { decide: 31, accuracy: 40 },
  });

  const ledger = new EligibilityLedger({ now: () => DEMO_NOW });
  ledger.excludeEmployee(DEMO_DIRECTOR, 'dt', 'test_account', 'Director demonstration account');
  ledger.excludeAssessment(DEMO_DIRECTOR, 's5-r1', 'technical_failure', 'Browser crashed during the timed section');
  ledger.flagAdjustedAssessment(DEMO_DIRECTOR, 'f3-r2', 'Additional time agreed as a reasonable adjustment');

  return { employees, assessments, ledger, exercises, motivation };
}

export const METRICS = DEFAULT_METRICS;
