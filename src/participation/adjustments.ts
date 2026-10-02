/**
 * Adjustment requests raised on the acknowledgement form, and Director decisions.
 *
 * Requests may contain health information, so they are handled on a
 * need-to-know basis: only Directors (or authorised Super Admins / managers)
 * see and decide them, internal notes are never shown to the employee, and
 * every decision – including revisions – is kept in an append-only history.
 *
 * This module is shared with the employee app, so it imports no engine code.
 */
import type { Actor } from '../benchmarking/types.js';

export const ARRANGEMENTS = [
  'extra_time',
  'rest_breaks',
  'larger_text',
  'screen_reader',
  'quiet_room',
  'paper_version',
  'other',
] as const;
export type Arrangement = (typeof ARRANGEMENTS)[number];

export const ARRANGEMENT_LABELS: Record<Arrangement, string> = {
  extra_time: 'Extra time on timed sections',
  rest_breaks: 'Rest breaks between sections',
  larger_text: 'Larger text / zoom',
  screen_reader: 'Screen reader support',
  quiet_room: 'A quiet room to complete it',
  paper_version: 'A paper or assisted version',
  other: 'Other arrangement (described in the message)',
};

/** Arrangements the runner applies automatically; the rest are arranged in person. */
export const AUTOMATIC_ARRANGEMENTS: readonly Arrangement[] = ['extra_time'];

export const TIME_MULTIPLIER_MIN = 1;
export const TIME_MULTIPLIER_MAX = 3;

export type AdjustmentStatus = 'pending' | 'agreed' | 'declined';

export interface AdjustmentDecision {
  status: Exclude<AdjustmentStatus, 'pending'>;
  arrangements: Arrangement[];
  /** e.g. 1.25 = 25 % extra time. Only with the extra_time arrangement. */
  timeMultiplier: number | null;
  /** Shown to the employee. */
  employeeMessage: string;
  /** Directors only – never shown to the employee. */
  internalNote: string | null;
  decidedBy: string;
  decidedByName: string;
  decidedAt: string;
  /** Required when an earlier decision is changed. */
  revisionReason: string | null;
}

export interface AdjustmentRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  /** The employee's own words from the form. */
  description: string;
  createdAt: string;
  status: AdjustmentStatus;
  /** Latest decision first is NOT assumed – history is in decision order. */
  history: AdjustmentDecision[];
}

export interface DecisionInput {
  status: 'agreed' | 'declined';
  arrangements: Arrangement[];
  timeMultiplier: number | null;
  employeeMessage: string;
  internalNote?: string;
  revisionReason?: string;
}

export type DecisionErrors = Partial<Record<'permission' | 'arrangements' | 'timeMultiplier' | 'employeeMessage' | 'revisionReason', string>>;

/** Mirrors benchmark locking (§184): Directors, Super Admins, or explicitly authorised managers. */
export function canDecideAdjustments(actor: Actor): boolean {
  return actor.role === 'director' || actor.role === 'super_admin' || (actor.role === 'manager' && actor.benchmarkAuthority === true);
}

export function validateDecision(request: AdjustmentRequest, input: DecisionInput, actor: Actor): DecisionErrors {
  const errors: DecisionErrors = {};
  if (!canDecideAdjustments(actor)) errors.permission = 'Only Directors can decide adjustment requests.';
  if (input.status === 'agreed' && input.arrangements.length === 0) {
    errors.arrangements = 'Choose at least one arrangement to agree.';
  }
  const wantsTime = input.arrangements.includes('extra_time');
  if (input.status === 'agreed' && wantsTime) {
    const m = input.timeMultiplier;
    if (m === null || !Number.isFinite(m) || m <= TIME_MULTIPLIER_MIN || m > TIME_MULTIPLIER_MAX) {
      errors.timeMultiplier = `Extra time must be more than 0% and at most ${(TIME_MULTIPLIER_MAX - 1) * 100}%.`;
    }
  } else if (input.timeMultiplier !== null && input.timeMultiplier !== 1) {
    errors.timeMultiplier = 'Extra time can only be set with the “Extra time” arrangement.';
  }
  if (!input.employeeMessage.trim()) {
    errors.employeeMessage =
      input.status === 'declined'
        ? 'Explain the decision to the employee and any alternative offered.'
        : 'Write a short message to the employee confirming what has been arranged.';
  }
  if (request.status !== 'pending' && !input.revisionReason?.trim()) {
    errors.revisionReason = 'Give a reason for changing the earlier decision.';
  }
  return errors;
}

export class DecisionInvalidError extends Error {
  constructor(public readonly errors: DecisionErrors) {
    super(Object.values(errors).join(' '));
  }
}

/** Returns the request with the decision applied and appended to its history. */
export function decideAdjustment(request: AdjustmentRequest, input: DecisionInput, actor: Actor, now: Date): AdjustmentRequest {
  const errors = validateDecision(request, input, actor);
  if (Object.keys(errors).length) throw new DecisionInvalidError(errors);
  const agreed = input.status === 'agreed';
  const decision: AdjustmentDecision = {
    status: input.status,
    arrangements: agreed ? [...new Set(input.arrangements)] : [],
    timeMultiplier: agreed && input.arrangements.includes('extra_time') ? input.timeMultiplier : null,
    employeeMessage: input.employeeMessage.trim(),
    internalNote: input.internalNote?.trim() || null,
    decidedBy: actor.id,
    decidedByName: actor.name,
    decidedAt: now.toISOString(),
    revisionReason: request.status === 'pending' ? null : input.revisionReason!.trim(),
  };
  return { ...request, status: input.status, history: [...request.history, decision] };
}

export function currentDecision(request: AdjustmentRequest): AdjustmentDecision | null {
  return request.history.at(-1) ?? null;
}

/** What the employee is shown – never the internal note or who wrote it. */
export interface EmployeeAdjustmentView {
  status: AdjustmentStatus;
  headline: string;
  message: string | null;
  arrangements: string[];
  extraTimePercent: number | null;
  /** Whether the assessment may start (pending blocks it). */
  canStart: boolean;
}

export function employeeAdjustmentView(request: AdjustmentRequest): EmployeeAdjustmentView {
  const d = currentDecision(request);
  if (request.status === 'pending' || !d) {
    return {
      status: 'pending',
      headline: 'Your adjustment request is being reviewed',
      message: null,
      arrangements: [],
      extraTimePercent: null,
      canStart: false,
    };
  }
  const extra = d.timeMultiplier ? Math.round((d.timeMultiplier - 1) * 100) : null;
  return {
    status: request.status,
    headline: request.status === 'agreed' ? 'Your adjustment has been agreed' : 'Your adjustment request has been reviewed',
    message: d.employeeMessage,
    arrangements: d.arrangements.map((a) => (a === 'extra_time' && extra ? `${extra}% extra time on timed sections` : ARRANGEMENT_LABELS[a])),
    extraTimePercent: extra,
    canStart: true,
  };
}

/** Time multiplier to apply when the employee starts (1 when none agreed). */
export function agreedTimeMultiplier(request: AdjustmentRequest | null): number {
  if (!request || request.status !== 'agreed') return 1;
  return currentDecision(request)?.timeMultiplier ?? 1;
}
