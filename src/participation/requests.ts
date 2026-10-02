/**
 * "Questions or concerns" – employee questions and data-rights requests.
 *
 * Copy of data (subject access), correction and objection are UK GDPR rights
 * requests: they must be answered within one calendar month, extendable once
 * by up to two further months for complex requests if the employee is told
 * within the first month. Plain questions get an internal target instead.
 *
 * Each request is a thread of messages. Internal notes are Director-only and
 * are never included in what the employee sees. The thread is append-only, so
 * it is also the audit trail. Shared with the employee app: no engine imports.
 */
import type { Actor } from '../benchmarking/types.js';
import type { RightsRequestType } from './acknowledgement.js';

export const STATUTORY_TYPES: readonly RightsRequestType[] = ['copy_of_data', 'correction', 'objection'];
/** Internal response target for plain questions (working days) – adjust to Walter Geering policy. */
export const QUESTION_TARGET_WORKING_DAYS = 5;
export const MAX_EXTENSION_MONTHS = 2;

export type RequestStatus = 'open' | 'in_progress' | 'closed';

export type MessageKind = 'employee' | 'reply' | 'internal' | 'event';

export interface RequestMessage {
  id: string;
  kind: MessageKind;
  /** Shown to the employee? (false only for internal notes) */
  visibleToEmployee: boolean;
  authorId: string;
  /** Employees see "Walter Geering", never individual Director names. */
  authorName: string;
  body: string;
  at: string;
}

export type Outcome =
  | 'answered'
  | 'provided'
  | 'partly_provided'
  | 'corrected'
  | 'no_change_needed'
  | 'upheld'
  | 'not_upheld'
  | 'withdrawn';

export const OUTCOMES_BY_TYPE: Record<RightsRequestType, Outcome[]> = {
  question: ['answered', 'withdrawn'],
  copy_of_data: ['provided', 'partly_provided', 'withdrawn'],
  correction: ['corrected', 'no_change_needed', 'withdrawn'],
  objection: ['upheld', 'not_upheld', 'withdrawn'],
};

export const OUTCOME_LABELS: Record<Outcome, string> = {
  answered: 'Answered',
  provided: 'Information provided',
  partly_provided: 'Partly provided (some information withheld, with reasons)',
  corrected: 'Record corrected',
  no_change_needed: 'No change needed (record was accurate)',
  upheld: 'Objection upheld – FocusiQ processing stopped',
  not_upheld: 'Objection not upheld (reasons given)',
  withdrawn: 'Withdrawn by the employee',
};

export interface RightsRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  type: RightsRequestType;
  createdAt: string;
  status: RequestStatus;
  dueAt: string;
  extended: { reason: string; at: string; by: string } | null;
  outcome: Outcome | null;
  closedAt: string | null;
  messages: RequestMessage[];
}

export class RequestRuleError extends Error {}

// ---------------------------------------------------------------------------
// Deadlines
// ---------------------------------------------------------------------------
/** Same date next month(s); clamps to the month's last day (31 Jan → 28/29 Feb). Date-only, UTC. */
export function addCalendarMonths(isoDate: string, months: number): Date {
  const d = new Date(isoDate);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(d.getUTCDate(), lastDay)));
}

/** Weekends roll forward to Monday (bank holidays are not modelled). */
export function nextWorkingDay(d: Date): Date {
  const out = new Date(d);
  while (out.getUTCDay() === 0 || out.getUTCDay() === 6) out.setUTCDate(out.getUTCDate() + 1);
  return out;
}

export function addWorkingDays(isoDate: string, days: number): Date {
  const d = new Date(isoDate);
  const out = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  let added = 0;
  while (added < days) {
    out.setUTCDate(out.getUTCDate() + 1);
    if (out.getUTCDay() !== 0 && out.getUTCDay() !== 6) added++;
  }
  return out;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** "4 January 2027" from "2027-01-04" – used in messages to employees. */
export function longDate(isoDate: string): string {
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number);
  return `${d} ${MONTHS[m! - 1]} ${y}`;
}

export function isStatutory(type: RightsRequestType): boolean {
  return STATUTORY_TYPES.includes(type);
}

export function initialDueDate(type: RightsRequestType, createdAt: string): string {
  const due = isStatutory(type) ? nextWorkingDay(addCalendarMonths(createdAt, 1)) : addWorkingDays(createdAt, QUESTION_TARGET_WORKING_DAYS);
  return due.toISOString().slice(0, 10);
}

export type DueState = 'closed' | 'overdue' | 'due_soon' | 'on_track';

export function dueState(r: RightsRequest, now: Date): { state: DueState; daysLeft: number } {
  const end = Date.parse(`${r.dueAt}T23:59:59Z`);
  const daysLeft = Math.ceil((end - now.getTime()) / 86_400_000) - 1;
  if (r.status === 'closed') return { state: 'closed', daysLeft };
  if (end < now.getTime()) return { state: 'overdue', daysLeft };
  return { state: daysLeft <= 7 ? 'due_soon' : 'on_track', daysLeft };
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------
let seq = 0;
const newId = () => globalThis.crypto?.randomUUID?.() ?? `m${Date.now()}-${++seq}`;
const FROM_WG = 'Walter Geering';

function event(body: string, actorId: string, at: string): RequestMessage {
  return { id: newId(), kind: 'event', visibleToEmployee: true, authorId: actorId, authorName: FROM_WG, body, at };
}

export function canHandleRequests(actor: Actor): boolean {
  return actor.role === 'director' || actor.role === 'super_admin';
}

function assertDirector(actor: Actor) {
  if (!canHandleRequests(actor)) throw new RequestRuleError('Only Directors can handle questions and requests.');
}

function assertOpen(r: RightsRequest) {
  if (r.status === 'closed') throw new RequestRuleError('This request is closed.');
}

export function createRequest(input: {
  employeeId: string;
  employeeName: string;
  department: string;
  type: RightsRequestType;
  message: string;
  now: Date;
  id?: string;
}): RightsRequest {
  if (!input.message.trim()) throw new RequestRuleError('Please write your message.');
  const at = input.now.toISOString();
  return {
    id: input.id ?? newId(),
    employeeId: input.employeeId,
    employeeName: input.employeeName,
    department: input.department,
    type: input.type,
    createdAt: at,
    status: 'open',
    dueAt: initialDueDate(input.type, at),
    extended: null,
    outcome: null,
    closedAt: null,
    messages: [{ id: newId(), kind: 'employee', visibleToEmployee: true, authorId: input.employeeId, authorName: input.employeeName, body: input.message.trim(), at }],
  };
}

/** Employee follow-up on their own open request. */
export function employeeFollowUp(r: RightsRequest, employeeId: string, body: string, now: Date): RightsRequest {
  if (employeeId !== r.employeeId) throw new RequestRuleError('You can only reply to your own requests.');
  assertOpen(r);
  if (!body.trim()) throw new RequestRuleError('Please write your message.');
  const msg: RequestMessage = { id: newId(), kind: 'employee', visibleToEmployee: true, authorId: employeeId, authorName: r.employeeName, body: body.trim(), at: now.toISOString() };
  return { ...r, messages: [...r.messages, msg] };
}

/** Director reply (visible) or internal note (Directors only). A visible reply moves an open request to in progress. */
export function directorMessage(r: RightsRequest, actor: Actor, body: string, internal: boolean, now: Date): RightsRequest {
  assertDirector(actor);
  assertOpen(r);
  if (!body.trim()) throw new RequestRuleError('Write a message first.');
  const msg: RequestMessage = {
    id: newId(),
    kind: internal ? 'internal' : 'reply',
    visibleToEmployee: !internal,
    authorId: actor.id,
    authorName: internal ? actor.name : FROM_WG,
    body: body.trim(),
    at: now.toISOString(),
  };
  return { ...r, status: !internal && r.status === 'open' ? 'in_progress' : r.status, messages: [...r.messages, msg] };
}

export function markInProgress(r: RightsRequest, actor: Actor, now: Date): RightsRequest {
  assertDirector(actor);
  assertOpen(r);
  if (r.status === 'in_progress') return r;
  return { ...r, status: 'in_progress', messages: [...r.messages, event('We are looking into this.', actor.id, now.toISOString())] };
}

/**
 * Extend a statutory deadline (complex requests). Once only, before the
 * original deadline, by 1–2 months; the employee is told why.
 */
export function extendDeadline(r: RightsRequest, actor: Actor, months: number, reason: string, now: Date): RightsRequest {
  assertDirector(actor);
  assertOpen(r);
  if (!isStatutory(r.type)) throw new RequestRuleError('Only data-rights requests have a legal deadline that can be extended.');
  if (r.extended) throw new RequestRuleError('The deadline has already been extended once.');
  if (!Number.isInteger(months) || months < 1 || months > MAX_EXTENSION_MONTHS) {
    throw new RequestRuleError(`An extension must be 1 or ${MAX_EXTENSION_MONTHS} months.`);
  }
  if (!reason.trim()) throw new RequestRuleError('Explain to the employee why more time is needed.');
  if (Date.parse(`${r.dueAt}T23:59:59Z`) < now.getTime()) {
    throw new RequestRuleError('The deadline has passed – an extension must be made within the original month.');
  }
  const original = initialDueDate(r.type, r.createdAt);
  const dueAt = nextWorkingDay(addCalendarMonths(r.createdAt, 1 + months)).toISOString().slice(0, 10);
  const at = now.toISOString();
  return {
    ...r,
    status: 'in_progress',
    dueAt,
    extended: { reason: reason.trim(), at, by: actor.id },
    messages: [
      ...r.messages,
      event(`We need more time to respond fully. New response date: ${longDate(dueAt)} (originally ${longDate(original)}). Reason: ${reason.trim()}`, actor.id, at),
    ],
  };
}

export function closeRequest(r: RightsRequest, actor: Actor, outcome: Outcome, summaryToEmployee: string, now: Date): RightsRequest {
  assertDirector(actor);
  assertOpen(r);
  if (!OUTCOMES_BY_TYPE[r.type].includes(outcome)) throw new RequestRuleError('That outcome does not apply to this kind of request.');
  if (!summaryToEmployee.trim()) throw new RequestRuleError('Write a closing message to the employee.');
  const needsComplaintInfo = outcome === 'not_upheld' || outcome === 'partly_provided';
  const complaintInfo = needsComplaintInfo
    ? ' If you are unhappy with this response, you can ask us to look at it again, or complain to the Information Commissioner’s Office (ico.org.uk).'
    : '';
  const at = now.toISOString();
  return {
    ...r,
    status: 'closed',
    outcome,
    closedAt: at,
    messages: [...r.messages, event(`${OUTCOME_LABELS[outcome]}. ${summaryToEmployee.trim()}${complaintInfo}`, actor.id, at)],
  };
}

// ---------------------------------------------------------------------------
// What the employee sees
// ---------------------------------------------------------------------------
export interface EmployeeRequestView {
  id: string;
  type: RightsRequestType;
  createdAt: string;
  status: RequestStatus;
  respondBy: string;
  extended: boolean;
  outcome: Outcome | null;
  messages: { kind: Exclude<MessageKind, 'internal'>; from: string; body: string; at: string }[];
}

export function employeeRequestView(r: RightsRequest): EmployeeRequestView {
  return {
    id: r.id,
    type: r.type,
    createdAt: r.createdAt,
    status: r.status,
    respondBy: r.dueAt,
    extended: r.extended !== null,
    outcome: r.outcome,
    messages: r.messages
      .filter((m) => m.visibleToEmployee && m.kind !== 'internal')
      .map((m) => ({ kind: m.kind as Exclude<MessageKind, 'internal'>, from: m.kind === 'employee' ? 'You' : FROM_WG, body: m.body, at: m.at })),
  };
}
