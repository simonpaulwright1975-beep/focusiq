import { describe as suite, expect, it } from 'vitest';
import {
  DEFAULT_DAY_SETTINGS,
  assessReadiness,
  dayStatus,
  planDay,
  summariseDay,
  type AdjustmentRequest,
  type DayEmployee,
  type DaySettings,
  type ReadinessInputs,
} from '../src/participation/index.js';

const SETTINGS: DaySettings = { ...DEFAULT_DAY_SETTINGS, date: '2026-10-12' };
const emp = (employeeId: string, department = 'Sales', status: DayEmployee['status'] = 'active'): DayEmployee => ({
  employeeId,
  name: `Person ${employeeId}`,
  department,
  jobRole: 'Role',
  status,
});
const ack = (employeeId: string, noticeVersion = 'v1', detailsCorrect = true) => ({
  employeeId,
  noticeVersion,
  detailsCorrect,
  acknowledgedAt: '2026-10-01T09:00:00Z',
});
const adjustment = (employeeId: string, over: Partial<AdjustmentRequest> = {}): AdjustmentRequest => ({
  id: `adj-${employeeId}`,
  employeeId,
  employeeName: `Person ${employeeId}`,
  department: 'Sales',
  description: 'Private words that must never appear on the readiness view.',
  createdAt: '2026-10-01T09:00:00Z',
  status: 'pending',
  history: [],
  ...over,
});
const agreed = (employeeId: string, arrangements: AdjustmentRequest['history'][number]['arrangements'], timeMultiplier: number | null) =>
  adjustment(employeeId, {
    status: 'agreed',
    history: [
      {
        status: 'agreed',
        arrangements,
        timeMultiplier,
        employeeMessage: 'Agreed.',
        internalNote: 'Internal note that must never appear.',
        decidedBy: 'd1',
        decidedByName: 'Demo Director',
        decidedAt: '2026-10-01T10:00:00Z',
        revisionReason: null,
      },
    ],
  });

const base = (over: Partial<ReadinessInputs> = {}): ReadinessInputs => ({
  employees: [emp('a'), emp('b'), emp('c'), emp('d'), emp('e'), emp('x', 'Sales', 'former'), emp('t', 'Sales', 'test')],
  currentNoticeVersion: 'v2',
  acknowledgements: [ack('a', 'v2'), ack('b', 'v1'), ack('d', 'v2', false), ack('e', 'v2')],
  adjustments: [adjustment('c'), agreed('e', ['extra_time', 'quiet_room', 'rest_breaks'], 1.5)],
  rightsRequests: [
    { employeeId: 'a', type: 'objection', status: 'in_progress', createdAt: '2026-09-01T00:00:00Z' },
    { employeeId: 'e', type: 'objection', status: 'closed', createdAt: '2026-09-01T00:00:00Z' },
  ],
  ...over,
});

suite('assessment day readiness', () => {
  it('lists what stops each person starting, and who needs to act', () => {
    const { people, notTakingPart } = assessReadiness(base(), SETTINGS);
    const by = Object.fromEntries(people.map((p) => [p.employee.employeeId, p]));
    expect(notTakingPart.map((e) => e.employeeId)).toEqual(['x', 't']);
    expect(by.a!.actions.map((a) => a.code)).toEqual(['objection_open']);
    expect(by.a!.ready).toBe(false);
    expect(by.b!.actions.map((a) => a.code)).toEqual(['notice_updated']);
    expect(by.c!.actions.map((a) => [a.code, a.owner])).toEqual([
      ['no_acknowledgement', 'employee'],
      ['adjustment_pending', 'director'],
    ]);
    // A details correction is followed up but does not stop the person starting.
    expect(by.d!.actions.map((a) => [a.code, a.blocking])).toEqual([['details_correction', false]]);
    expect(by.d!.ready).toBe(true);
    // A closed objection no longer blocks.
    expect(by.e!.ready).toBe(true);
  });

  it('shows agreed arrangements only: never the request text or internal notes', () => {
    const { people } = assessReadiness(base(), SETTINGS);
    const e = people.find((p) => p.employee.employeeId === 'e')!;
    expect(e.needs).toEqual({
      arrangements: ['50% extra time', 'A quiet room to complete it', 'Rest breaks between sections'],
      extraTimePercent: 50,
      quietRoom: true,
      restBreaks: true,
    });
    // 10 settling + 15 × 1.5 (rounded up) + 10 rest-break allowance
    expect(e.expectedMinutes).toBe(10 + 23 + 10);
    const json = JSON.stringify(people);
    expect(json).not.toContain('Private words');
    expect(json).not.toContain('Internal note');
    // Pending and declined requests carry no arrangements.
    expect(people.find((p) => p.employee.employeeId === 'c')!.needs.arrangements).toEqual([]);
  });

  it('spreads each department across sessions and sends quiet-room people to the quiet room', () => {
    const employees = [
      ...Array.from({ length: 10 }, (_, i) => emp(`cs${i}`, 'Customer Service')),
      ...Array.from({ length: 6 }, (_, i) => emp(`s${i}`, 'Sales')),
      emp('q1', 'Finance'),
      emp('q2', 'Finance'),
    ];
    const inputs = base({
      employees,
      acknowledgements: employees.map((e) => ack(e.employeeId, 'v2')),
      adjustments: [agreed('q1', ['quiet_room'], null), agreed('q2', ['paper_version'], null)],
      rightsRequests: [],
    });
    const { people } = assessReadiness(inputs, SETTINGS);
    const plan = planDay(people, SETTINGS);
    expect(plan.sessions).toHaveLength(2); // 16 main-room people, 8 seats
    expect(plan.sessions.map((s) => s.main.length)).toEqual([8, 8]);
    expect(plan.sessions.map((s) => s.quiet)).toEqual([['q1'], ['q2']]);
    for (const s of plan.sessions) {
      expect(s.main.filter((id) => id.startsWith('cs'))).toHaveLength(5);
      expect(s.main.filter((id) => id.startsWith('s'))).toHaveLength(3);
    }
    expect(plan.warnings.filter((w) => w.code === 'department_away')).toEqual([]);
    expect(plan.suggestedSessionMinutes).toBe(30); // 10 settling + 15, rounded up to 15
    expect(plan.sessions.map((s) => [s.start, s.end])).toEqual([
      ['09:30', '10:00'],
      ['10:15', '10:45'],
    ]);
    expect(plan.finishesAt).toBe('10:45');
  });

  it('skips lunch, keeps pinned sessions and warns when the day runs late or a slot is too short', () => {
    const employees = Array.from({ length: 12 }, (_, i) => emp(`p${i}`, i % 2 ? 'Sales' : 'Finance'));
    const inputs = base({
      employees,
      acknowledgements: employees.map((e) => ack(e.employeeId, 'v2')),
      adjustments: [agreed('p0', ['extra_time'], 2)],
      rightsRequests: [],
    });
    const { people } = assessReadiness(inputs, SETTINGS);
    const settings: DaySettings = { ...SETTINGS, seats: 2, sessionMinutes: 60, firstStart: '11:00', endBy: '15:00' };
    const plan = planDay(people, settings, { p3: 6 });
    expect(plan.assignment.p3).toBe(6);
    expect(plan.sessions.map((s) => s.start)).toEqual(['11:00', '13:15', '14:30', '15:45', '17:00', '18:15']);
    expect(plan.warnings.map((w) => w.code)).toContain('runs_late');
    const tight = planDay(people, { ...settings, sessionMinutes: 30 });
    expect(tight.warnings).toContainEqual({
      code: 'too_long',
      message: 'Person p0 needs about 40 minutes, but sessions are 30 minutes.',
    });
  });

  it('flags a session that takes most of a department away', () => {
    const employees = [emp('a', 'Stock Control'), emp('b', 'Stock Control'), emp('c', 'Stock Control')];
    const { people } = assessReadiness(base({ employees, acknowledgements: employees.map((e) => ack(e.employeeId, 'v2')), adjustments: [], rightsRequests: [] }), SETTINGS);
    const plan = planDay(people, SETTINGS);
    expect(plan.warnings).toContainEqual({ code: 'department_away', message: 'Session 1 takes 3 of 3 people from Stock Control.' });
  });

  it('tracks progress on the day', () => {
    const now = new Date('2026-10-12T10:30:00Z');
    const start = new Date('2026-10-12T10:15:00Z');
    const p = { employeeId: 'a', startedAt: null, lastActivityAt: null, answered: 0, total: 20, completedAt: null };
    expect(dayStatus(null, new Date('2026-10-12T10:25:00Z'), now)).toBe('waiting');
    expect(dayStatus(p, start, now)).toBe('not_arrived');
    expect(dayStatus({ ...p, startedAt: '2026-10-12T10:16:00Z', lastActivityAt: '2026-10-12T10:29:00Z' }, start, now)).toBe('in_progress');
    expect(dayStatus({ ...p, startedAt: '2026-10-12T10:16:00Z', lastActivityAt: '2026-10-12T10:17:00Z' }, start, now)).toBe('check_in');
    expect(dayStatus({ ...p, startedAt: '2026-10-12T10:16:00Z', completedAt: '2026-10-12T10:40:00Z' }, start, now)).toBe('finished');

    const { people } = assessReadiness(base(), SETTINGS);
    const summary = summariseDay(people, { a: 'finished', b: 'check_in' });
    expect(summary).toMatchObject({ takingPart: 5, ready: 2, blocked: 3, quietRoom: 1, extraTime: 1 });
    expect(summary.byStatus).toEqual({ waiting: 3, not_arrived: 0, in_progress: 0, check_in: 1, finished: 1 });
    expect(summary.byAction).toEqual({ objection_open: 1, notice_updated: 1, no_acknowledgement: 1, adjustment_pending: 1, details_correction: 1 });
  });
});
