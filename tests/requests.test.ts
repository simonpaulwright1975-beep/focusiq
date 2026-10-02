import { describe as suite, expect, it } from 'vitest';
import {
  RequestRuleError,
  addCalendarMonths,
  closeRequest,
  createRequest,
  directorMessage,
  dueState,
  employeeFollowUp,
  employeeRequestView,
  extendDeadline,
  initialDueDate,
  markInProgress,
} from '../src/participation/index.js';
import type { Actor } from '../src/benchmarking/index.js';

const director: Actor = { id: 'd1', name: 'Demo Director', role: 'director' };
const manager: Actor = { id: 'm1', name: 'Line Manager', role: 'manager', benchmarkAuthority: true };
const base = { employeeId: 'e1', employeeName: 'Grace Okafor', department: 'Sales' };

suite('deadlines', () => {
  it('uses one calendar month for data-rights requests, clamping to month end and skipping weekends', () => {
    expect(addCalendarMonths('2026-01-31T10:00:00Z', 1).toISOString().slice(0, 10)).toBe('2026-02-28');
    expect(initialDueDate('copy_of_data', '2026-09-03T10:00:00Z')).toBe('2026-10-05'); // 3 Oct 2026 is a Saturday
    expect(initialDueDate('objection', '2026-10-02T10:00:00Z')).toBe('2026-11-02');
  });

  it('gives questions an internal target of 5 working days', () => {
    expect(initialDueDate('question', '2026-10-02T10:00:00Z')).toBe('2026-10-09'); // Fri → next Fri
  });

  it('reports overdue, due soon and on track', () => {
    const r = createRequest({ ...base, type: 'copy_of_data', message: 'Please send me a copy of my data', now: new Date('2026-10-02T09:00:00Z') });
    expect(dueState(r, new Date('2026-10-05T09:00:00Z')).state).toBe('on_track');
    expect(dueState(r, new Date('2026-10-28T09:00:00Z'))).toEqual({ state: 'due_soon', daysLeft: 5 });
    expect(dueState(r, new Date('2026-11-02T09:00:00Z'))).toEqual({ state: 'due_soon', daysLeft: 0 });
    expect(dueState(r, new Date('2026-11-03T09:00:00Z')).state).toBe('overdue');
  });
});

suite('handling a request', () => {
  const now = new Date('2026-10-02T09:00:00Z');
  const sar = () => createRequest({ ...base, type: 'copy_of_data', message: 'Please send me everything FocusiQ holds about me.', now });

  it('only Directors handle requests – not even authorised managers', () => {
    expect(() => directorMessage(sar(), manager, 'Hi', false, now)).toThrow(RequestRuleError);
  });

  it('keeps internal notes out of the employee view and hides Director names', () => {
    let r = directorMessage(sar(), director, 'Check with payroll before sending.', true, now);
    expect(r.status).toBe('open'); // an internal note does not change status
    r = directorMessage(r, director, 'Thanks – we are preparing your data.', false, now);
    expect(r.status).toBe('in_progress');
    const view = employeeRequestView(r);
    expect(view.messages.map((m) => [m.from, m.body])).toEqual([
      ['You', 'Please send me everything FocusiQ holds about me.'],
      ['Walter Geering', 'Thanks – we are preparing your data.'],
    ]);
    expect(JSON.stringify(view)).not.toMatch(/payroll|Demo Director/);
  });

  it('lets the employee follow up on their own open request only', () => {
    const r = employeeFollowUp(sar(), 'e1', 'Can you include my adjustment request?', now);
    expect(r.messages).toHaveLength(2);
    expect(() => employeeFollowUp(r, 'someone-else', 'x', now)).toThrow(/your own requests/);
  });

  it('extends a statutory deadline once, before it passes, telling the employee why', () => {
    const r = extendDeadline(sar(), director, 2, 'Your request covers several years of records.', new Date('2026-10-20T09:00:00Z'));
    expect(r.dueAt).toBe('2027-01-04'); // 2 Jan 2027 is a Saturday
    expect(employeeRequestView(r).messages.at(-1)!.body).toMatch(/New response date: 4 January 2027 \(originally 2 November 2026\)\. Reason: Your request covers/);
    expect(() => extendDeadline(r, director, 1, 'again', new Date('2026-10-21T09:00:00Z'))).toThrow(/already been extended/);
    expect(() => extendDeadline(sar(), director, 3, 'x', now)).toThrow(/1 or 2 months/);
    expect(() => extendDeadline(sar(), director, 1, 'late', new Date('2026-11-10T09:00:00Z'))).toThrow(/within the original month/);
    const q = createRequest({ ...base, type: 'question', message: 'Who sees my results?', now });
    expect(() => extendDeadline(q, director, 1, 'x', now)).toThrow(/Only data-rights requests/);
  });

  it('closes with an outcome that fits the request, adding ICO information when not upheld', () => {
    const objection = createRequest({ ...base, type: 'objection', message: 'I object to being benchmarked.', now });
    expect(() => closeRequest(objection, director, 'provided', 'x', now)).toThrow(/does not apply/);
    expect(() => closeRequest(objection, director, 'not_upheld', ' ', now)).toThrow(/closing message/);
    const closed = closeRequest(objection, director, 'not_upheld', 'Benchmarks are anonymised group figures and are needed to support development fairly.', now);
    expect(closed.status).toBe('closed');
    expect(employeeRequestView(closed).messages.at(-1)!.body).toMatch(/Objection not upheld \(reasons given\)\. Benchmarks.*ico\.org\.uk/);
    expect(() => directorMessage(closed, director, 'more', false, now)).toThrow(/closed/);
    expect(() => markInProgress(closed, director, now)).toThrow(/closed/);
  });
});
