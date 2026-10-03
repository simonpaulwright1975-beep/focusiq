/**
 * Assessment day: who is ready, what each person needs on the day, a session
 * plan for completing everyone in one office day, and live progress.
 *
 * Director-only. It reads only the agreed arrangement labels and time
 * multiplier from adjustment requests: never the employee's own words or
 * internal notes (they may contain health information).
 *
 * Pure: no engine imports, so it can be tested and reused server-side.
 */
import { ARRANGEMENT_LABELS, currentDecision, type AdjustmentRequest, type Arrangement } from './adjustments.js';
import type { RightsRequest } from './requests.js';

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------
export interface DayEmployee {
  employeeId: string;
  name: string;
  department: string;
  jobRole: string;
  status: 'active' | 'former' | 'test';
}

/** The parts of an acknowledgement the readiness check needs. */
export interface AcknowledgementSummary {
  employeeId: string;
  noticeVersion: string;
  detailsCorrect: boolean;
  acknowledgedAt: string;
}

/** On-the-day progress for one employee's assessment. */
export interface AssessmentProgress {
  employeeId: string;
  startedAt: string | null;
  lastActivityAt: string | null;
  answered: number;
  total: number;
  completedAt: string | null;
}

export interface DaySettings {
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM, local time */
  firstStart: string;
  endBy: string;
  /** Seats (devices) in the main room. */
  seats: number;
  /** Seats in the quiet room (quiet room or assisted/paper arrangements). */
  quietSeats: number;
  /** Assessment length for someone without extra time. */
  assessmentMinutes: number;
  /** Time for arriving, logging in and reading the instructions. */
  settlingMinutes: number;
  /** Slot length; null = suggest one from the longest expected time. */
  sessionMinutes: number | null;
  gapMinutes: number;
  /** Allowance added when rest breaks are agreed. */
  restBreakMinutes: number;
  lunch: { start: string; minutes: number } | null;
  /** Room names used in invitations. */
  rooms: Record<Room, string>;
}

export const DEFAULT_DAY_SETTINGS: Omit<DaySettings, 'date'> = {
  firstStart: '09:30',
  endBy: '17:00',
  seats: 8,
  quietSeats: 1,
  assessmentMinutes: 15,
  settlingMinutes: 10,
  sessionMinutes: null,
  gapMinutes: 15,
  restBreakMinutes: 10,
  lunch: { start: '12:30', minutes: 45 },
  rooms: { main: 'Main assessment room', quiet: 'Quiet room' },
};

/** Minutes after which an in-progress assessment with no activity needs a check-in. */
export const CHECK_IN_AFTER_MINUTES = 10;
/** Minutes after a session starts before an absent person is flagged. */
export const NOT_ARRIVED_AFTER_MINUTES = 10;

// ---------------------------------------------------------------------------
// Readiness
// ---------------------------------------------------------------------------
export type ActionCode = 'no_acknowledgement' | 'notice_updated' | 'adjustment_pending' | 'objection_open' | 'details_correction';

export interface ReadinessAction {
  code: ActionCode;
  label: string;
  /** Who needs to act. */
  owner: 'employee' | 'director';
  /** Blocks the person from starting on the day. */
  blocking: boolean;
}

const ACTIONS: Record<ActionCode, Omit<ReadinessAction, 'code'>> = {
  no_acknowledgement: { label: 'Privacy notice not acknowledged yet', owner: 'employee', blocking: true },
  notice_updated: { label: 'Needs to acknowledge the updated privacy notice', owner: 'employee', blocking: true },
  adjustment_pending: { label: 'Adjustment request awaiting a decision', owner: 'director', blocking: true },
  objection_open: { label: 'Objection open: resolve before assessing', owner: 'director', blocking: true },
  details_correction: { label: 'Asked for record details to be corrected', owner: 'director', blocking: false },
};
const action = (code: ActionCode): ReadinessAction => ({ code, ...ACTIONS[code] });

/** Arrangements that need the quiet room rather than the main room. */
export const QUIET_ROOM_ARRANGEMENTS: readonly Arrangement[] = ['quiet_room', 'paper_version'];

export interface DayNeeds {
  /** Agreed arrangement labels (never the request text). */
  arrangements: string[];
  extraTimePercent: number | null;
  quietRoom: boolean;
  restBreaks: boolean;
}

export interface PersonReadiness {
  employee: DayEmployee;
  ready: boolean;
  actions: ReadinessAction[];
  needs: DayNeeds;
  /** Expected minutes at the desk, including settling time. */
  expectedMinutes: number;
}

export interface ReadinessInputs {
  employees: readonly DayEmployee[];
  currentNoticeVersion: string;
  acknowledgements: readonly AcknowledgementSummary[];
  adjustments: readonly AdjustmentRequest[];
  rightsRequests: readonly Pick<RightsRequest, 'employeeId' | 'type' | 'status' | 'createdAt'>[];
}

export function needsFor(adjustment: AdjustmentRequest | null): DayNeeds {
  const d = adjustment?.status === 'agreed' ? currentDecision(adjustment) : null;
  if (!d) return { arrangements: [], extraTimePercent: null, quietRoom: false, restBreaks: false };
  const extra = d.arrangements.includes('extra_time') && d.timeMultiplier ? Math.round((d.timeMultiplier - 1) * 100) : null;
  return {
    arrangements: d.arrangements.map((a) => (a === 'extra_time' && extra ? `${extra}% extra time` : ARRANGEMENT_LABELS[a])),
    extraTimePercent: extra,
    quietRoom: d.arrangements.some((a) => QUIET_ROOM_ARRANGEMENTS.includes(a)),
    restBreaks: d.arrangements.includes('rest_breaks'),
  };
}

/** Minutes at the desk: settling + assessment (with extra time) + any agreed rest-break allowance. */
export function expectedMinutes(needs: DayNeeds, s: Pick<DaySettings, 'assessmentMinutes' | 'settlingMinutes' | 'restBreakMinutes'>): number {
  const multiplier = 1 + (needs.extraTimePercent ?? 0) / 100;
  return s.settlingMinutes + Math.ceil(s.assessmentMinutes * multiplier) + (needs.restBreaks ? s.restBreakMinutes : 0);
}

const latestBy = <T extends { employeeId: string }>(rows: readonly T[], at: (r: T) => string) => {
  const map = new Map<string, T>();
  for (const r of rows) {
    const prev = map.get(r.employeeId);
    if (!prev || at(r) > at(prev)) map.set(r.employeeId, r);
  }
  return map;
};

/** Only active employees take part; former employees and test accounts are counted separately. */
export function assessReadiness(
  inputs: ReadinessInputs,
  settings: Pick<DaySettings, 'assessmentMinutes' | 'settlingMinutes' | 'restBreakMinutes'>,
): { people: PersonReadiness[]; notTakingPart: DayEmployee[] } {
  const latestAdjustment = latestBy(inputs.adjustments, (r) => r.createdAt);
  const latestAck = latestBy(inputs.acknowledgements, (r) => r.acknowledgedAt);
  const people: PersonReadiness[] = [];
  for (const employee of inputs.employees) {
    if (employee.status !== 'active') continue;
    const id = employee.employeeId;
    const actions: ReadinessAction[] = [];
    const ack = latestAck.get(id);
    if (!inputs.acknowledgements.some((a) => a.employeeId === id && a.noticeVersion === inputs.currentNoticeVersion)) {
      actions.push(action(ack ? 'notice_updated' : 'no_acknowledgement'));
    }
    const adjustment = latestAdjustment.get(id) ?? null;
    if (adjustment?.status === 'pending') actions.push(action('adjustment_pending'));
    const open = inputs.rightsRequests.filter((r) => r.employeeId === id && r.status !== 'closed');
    if (open.some((r) => r.type === 'objection')) actions.push(action('objection_open'));
    if (open.some((r) => r.type === 'correction') || ack?.detailsCorrect === false) actions.push(action('details_correction'));
    const needs = needsFor(adjustment);
    people.push({
      employee,
      ready: !actions.some((a) => a.blocking),
      actions,
      needs,
      expectedMinutes: expectedMinutes(needs, settings),
    });
  }
  return { people, notTakingPart: inputs.employees.filter((e) => e.status !== 'active') };
}

// ---------------------------------------------------------------------------
// Session plan
// ---------------------------------------------------------------------------
export type Room = 'main' | 'quiet';

export interface PlannedSession {
  number: number;
  /** HH:MM */
  start: string;
  end: string;
  main: string[];
  quiet: string[];
}

export interface DayWarning {
  code: 'runs_late' | 'too_long' | 'department_away' | 'over_capacity' | 'no_seats';
  message: string;
}

export interface DayPlan {
  sessionMinutes: number;
  /** Suggested slot length from the longest expected time (rounded up to 15 minutes). */
  suggestedSessionMinutes: number;
  sessions: PlannedSession[];
  /** employeeId → session number */
  assignment: Record<string, number>;
  warnings: DayWarning[];
  finishesAt: string | null;
}

export const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h! * 60 + m!;
};
export const toHHMM = (mins: number) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
const roundUp15 = (n: number) => Math.ceil(n / 15) * 15;

/** Start times for n sessions, skipping lunch. */
function sessionTimes(n: number, s: DaySettings, length: number): { start: number; end: number }[] {
  const times: { start: number; end: number }[] = [];
  let t = toMinutes(s.firstStart);
  const lunch = s.lunch ? { start: toMinutes(s.lunch.start), end: toMinutes(s.lunch.start) + s.lunch.minutes } : null;
  for (let i = 0; i < n; i++) {
    if (lunch && t < lunch.end && t + length > lunch.start) t = Math.max(t, lunch.end);
    times.push({ start: t, end: t + length });
    t += length + s.gapMinutes;
  }
  return times;
}

/**
 * Suggests sessions for completing everyone in one day.
 *
 * Each department is spread across sessions (so teams keep cover), people
 * with a quiet-room arrangement go to the quiet room, and `pinned` keeps any
 * session a Director has chosen. Blocked people are still planned: they may be
 * ready by the day.
 */
export function planDay(people: readonly PersonReadiness[], settings: DaySettings, pinned: Record<string, number> = {}): DayPlan {
  const warnings: DayWarning[] = [];
  const longest = Math.max(0, ...people.map((p) => p.expectedMinutes));
  const suggestedSessionMinutes = roundUp15(longest);
  const sessionMinutes = settings.sessionMinutes ?? suggestedSessionMinutes;
  const room = (p: PersonReadiness): Room => (p.needs.quietRoom ? 'quiet' : 'main');
  const capacity = (r: Room) => (r === 'main' ? settings.seats : settings.quietSeats);

  const byRoom = (r: Room) => people.filter((p) => room(p) === r);
  if (settings.seats < 1 && byRoom('main').length) warnings.push({ code: 'no_seats', message: 'Add at least one seat in the main room.' });
  if (settings.quietSeats < 1 && byRoom('quiet').length) {
    warnings.push({ code: 'no_seats', message: 'Someone has a quiet-room arrangement, but the quiet room has no seats.' });
  }
  const byId = new Map(people.map((p) => [p.employee.employeeId, p]));
  const validPins = Object.entries(pinned).filter(([id, n]) => byId.has(id) && Number.isInteger(n) && n >= 1);
  const needed = Math.max(
    1,
    ...(['main', 'quiet'] as Room[]).map((r) => (capacity(r) > 0 ? Math.ceil(byRoom(r).length / capacity(r)) : 0)),
    ...validPins.map(([, n]) => n),
  );
  const rooms: Record<Room, string[][]> = {
    main: Array.from({ length: needed }, () => []),
    quiet: Array.from({ length: needed }, () => []),
  };
  const assignment: Record<string, number> = {};
  for (const [id, n] of validPins) {
    rooms[room(byId.get(id)!)][n - 1]!.push(id);
    assignment[id] = n;
  }

  // Deal each room's people into sessions department by department, largest
  // department first, so every department is spread across the day.
  for (const r of ['main', 'quiet'] as Room[]) {
    const cap = capacity(r);
    if (cap < 1) continue;
    const groups = new Map<string, PersonReadiness[]>();
    for (const p of byRoom(r)) {
      if (assignment[p.employee.employeeId]) continue;
      const g = groups.get(p.employee.department) ?? [];
      g.push(p);
      groups.set(p.employee.department, g);
    }
    const ordered = [...groups.entries()]
      .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
      .flatMap(([, g]) => g.sort((a, b) => a.employee.name.localeCompare(b.employee.name)));
    let cursor = 0;
    for (const p of ordered) {
      let placed = false;
      for (let tries = 0; tries < rooms[r].length; tries++) {
        const k = (cursor + tries) % rooms[r].length;
        if (rooms[r][k]!.length < cap) {
          rooms[r][k]!.push(p.employee.employeeId);
          assignment[p.employee.employeeId] = k + 1;
          cursor = k + 1;
          placed = true;
          break;
        }
      }
      if (!placed) {
        rooms.main.push([]);
        rooms.quiet.push([]);
        rooms[r].at(-1)!.push(p.employee.employeeId);
        assignment[p.employee.employeeId] = rooms[r].length;
        cursor = 0;
      }
    }
  }

  const count = rooms.main.length;
  const times = sessionTimes(count, settings, sessionMinutes);
  const sessions: PlannedSession[] = times.map((t, i) => ({
    number: i + 1,
    start: toHHMM(t.start),
    end: toHHMM(t.end),
    main: rooms.main[i]!,
    quiet: rooms.quiet[i]!,
  }));

  for (const s of sessions) {
    if (s.main.length > settings.seats || s.quiet.length > settings.quietSeats) {
      warnings.push({ code: 'over_capacity', message: `Session ${s.number} has more people than seats.` });
    }
  }
  for (const p of people) {
    if (p.expectedMinutes > sessionMinutes) {
      warnings.push({
        code: 'too_long',
        message: `${p.employee.name} needs about ${p.expectedMinutes} minutes, but sessions are ${sessionMinutes} minutes.`,
      });
    }
  }
  // Teams keep cover: flag a session that takes more than half of a department of 3 or more.
  const deptSize = new Map<string, number>();
  for (const p of people) deptSize.set(p.employee.department, (deptSize.get(p.employee.department) ?? 0) + 1);
  const deptOf = new Map(people.map((p) => [p.employee.employeeId, p.employee.department]));
  for (const s of sessions) {
    const here = new Map<string, number>();
    for (const id of [...s.main, ...s.quiet]) here.set(deptOf.get(id)!, (here.get(deptOf.get(id)!) ?? 0) + 1);
    for (const [d, n] of here) {
      const size = deptSize.get(d)!;
      if (size >= 3 && n > size / 2) {
        warnings.push({ code: 'department_away', message: `Session ${s.number} takes ${n} of ${size} people from ${d}.` });
      }
    }
  }
  const used = sessions.filter((s) => s.main.length + s.quiet.length > 0);
  const finishesAt = used.length ? used.at(-1)!.end : null;
  if (finishesAt && toMinutes(finishesAt) > toMinutes(settings.endBy)) {
    warnings.push({ code: 'runs_late', message: `The plan finishes at ${finishesAt}, after ${settings.endBy}. Add seats or shorten the gaps.` });
  }
  return { sessionMinutes, suggestedSessionMinutes, sessions, assignment, warnings, finishesAt };
}

// ---------------------------------------------------------------------------
// On the day
// ---------------------------------------------------------------------------
export type DayStatus = 'waiting' | 'not_arrived' | 'in_progress' | 'check_in' | 'finished';

export const DAY_STATUS_LABELS: Record<DayStatus, string> = {
  waiting: 'Not started',
  not_arrived: 'Not arrived',
  in_progress: 'In progress',
  check_in: 'Check in',
  finished: 'Finished',
};

/** `sessionStart` is the planned start as an instant (null when unplanned or not the day). */
export function dayStatus(progress: AssessmentProgress | null, sessionStart: Date | null, now: Date): DayStatus {
  if (progress?.completedAt) return 'finished';
  if (progress?.startedAt) {
    const last = new Date(progress.lastActivityAt ?? progress.startedAt).getTime();
    return now.getTime() - last > CHECK_IN_AFTER_MINUTES * 60_000 ? 'check_in' : 'in_progress';
  }
  if (sessionStart && now.getTime() - sessionStart.getTime() > NOT_ARRIVED_AFTER_MINUTES * 60_000) return 'not_arrived';
  return 'waiting';
}

export interface DaySummary {
  takingPart: number;
  ready: number;
  blocked: number;
  byAction: Partial<Record<ActionCode, number>>;
  quietRoom: number;
  extraTime: number;
  otherArrangements: number;
  byStatus: Record<DayStatus, number>;
}

export function summariseDay(people: readonly PersonReadiness[], statuses: Record<string, DayStatus>): DaySummary {
  const byAction: Partial<Record<ActionCode, number>> = {};
  for (const p of people) for (const a of p.actions) byAction[a.code] = (byAction[a.code] ?? 0) + 1;
  const byStatus: Record<DayStatus, number> = { waiting: 0, not_arrived: 0, in_progress: 0, check_in: 0, finished: 0 };
  for (const p of people) byStatus[statuses[p.employee.employeeId] ?? 'waiting']++;
  return {
    takingPart: people.length,
    ready: people.filter((p) => p.ready).length,
    blocked: people.filter((p) => !p.ready).length,
    byAction,
    quietRoom: people.filter((p) => p.needs.quietRoom).length,
    extraTime: people.filter((p) => p.needs.extraTimePercent).length,
    otherArrangements: people.filter((p) => !p.needs.quietRoom && !p.needs.extraTimePercent && p.needs.arrangements.length > 0).length,
    byStatus,
  };
}
