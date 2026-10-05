/**
 * Adjustment requests and "Questions or concerns" for the Director dashboard.
 *
 * Demo: this browser's stores (the existing pure functions decide the change,
 * and the demo outbox gets the content-free email the database would send).
 * Live: WG Main. Lists are read under Director row-level security; every
 * change goes through the database functions, which apply the same rules,
 * keep the append-only history and queue the employee's email.
 *
 * Live mode must show real requests here: data-rights requests have a legal
 * one-month deadline, so they can never be left in a demo store.
 */
import { useEffect, useState } from 'react';
import {
  closeRequest,
  coalesceKeys,
  decideAdjustment,
  directorMessage,
  extendDeadline,
  markInProgress,
  type AdjustmentRequest,
  type DecisionInput,
  type Outcome,
  type RightsRequest,
} from '../../../src/participation/index.js';
import type { Actor } from '../../../src/benchmarking/index.js';
import { notifyEmployee } from '../demo/outboxStore.js';
import { listRequests, subscribe, upsertRequest } from '../shared/adjustmentStore.js';
import { listRightsRequests, subscribeRightsRequests, upsertRightsRequest } from '../shared/requestStore.js';
import { check, db, LIVE } from '../shared/supabase.js';

const REFRESH = 'focusiq-live-refresh';
const POLL_MS = 30_000;
const refresh = () => {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(REFRESH));
};

/** Polls a live query, and re-runs it straight after a change or when the window regains focus. */
function useLive<T>(fetch: () => Promise<T>, initial: T): T {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    let alive = true;
    const run = () => fetch().then((v) => alive && setValue(v), () => undefined);
    run();
    const t = setInterval(run, POLL_MS);
    window.addEventListener(REFRESH, run);
    window.addEventListener('focus', run);
    return () => {
      alive = false;
      clearInterval(t);
      window.removeEventListener(REFRESH, run);
      window.removeEventListener('focus', run);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return value;
}

// ---------------------------------------------------------------------------
// Adjustment requests
// ---------------------------------------------------------------------------
interface AdjustmentRow {
  id: string; employee_id: string; description: string; status: AdjustmentRequest['status']; created_at: string;
  employees: { display_name: string; department: string } | null;
  adjustment_decisions: {
    status: 'agreed' | 'declined'; arrangements: string[]; time_multiplier: number | null; employee_message: string;
    internal_note: string | null; revision_reason: string | null; decided_by: string; decided_at: string;
  }[];
}

export async function liveAdjustments(): Promise<AdjustmentRequest[]> {
  const rows = check(
    await db().from('adjustment_requests')
      .select('id, employee_id, description, status, created_at, employees(display_name, department), adjustment_decisions(status, arrangements, time_multiplier, employee_message, internal_note, revision_reason, decided_by, decided_at)')
      .order('created_at', { ascending: false }),
  ) as unknown as AdjustmentRow[];
  return rows.map((r) => ({
    id: r.id,
    employeeId: r.employee_id,
    employeeName: r.employees?.display_name ?? 'Unknown',
    department: r.employees?.department ?? '',
    description: r.description,
    createdAt: r.created_at,
    status: r.status,
    history: [...r.adjustment_decisions]
      .sort((a, b) => a.decided_at.localeCompare(b.decided_at))
      .map((d) => ({
        status: d.status,
        arrangements: d.arrangements as AdjustmentRequest['history'][number]['arrangements'],
        timeMultiplier: d.time_multiplier,
        employeeMessage: d.employee_message,
        internalNote: d.internal_note,
        decidedBy: d.decided_by,
        decidedByName: 'A Director',
        decidedAt: d.decided_at,
        revisionReason: d.revision_reason,
      })),
  }));
}

function useDemoAdjustments(): AdjustmentRequest[] {
  const [requests, setRequests] = useState(listRequests);
  useEffect(() => subscribe(() => setRequests(listRequests())), []);
  return requests;
}

export const useAdjustmentRequests: () => AdjustmentRequest[] = LIVE ? () => useLive(liveAdjustments, []) : useDemoAdjustments;

/** Records a decision (validated by the caller with validateDecision first). */
export async function saveDecision(request: AdjustmentRequest, input: DecisionInput, actor: Actor, now: Date): Promise<void> {
  if (!LIVE) {
    upsertRequest(decideAdjustment(request, input, actor, now));
    notifyEmployee('adjustment_decided', request.employeeId, request.employeeName, coalesceKeys.adjustment(request.id));
    return;
  }
  check(await db().rpc('decide_adjustment_request', {
    p_request_id: request.id,
    p_status: input.status,
    p_arrangements: input.status === 'agreed' ? input.arrangements : [],
    p_time_multiplier: input.status === 'agreed' ? input.timeMultiplier : null,
    p_employee_message: input.employeeMessage,
    p_internal_note: input.internalNote ?? null,
    p_revision_reason: input.revisionReason ?? null,
  }));
  refresh();
}

// ---------------------------------------------------------------------------
// Questions and data-rights requests
// ---------------------------------------------------------------------------
interface RightsRow {
  id: string; employee_id: string; request_type: RightsRequest['type']; status: RightsRequest['status']; created_at: string; due_at: string;
  extended_reason: string | null; extended_at: string | null; extended_by: string | null; outcome: Outcome | null; closed_at: string | null;
  employees: { display_name: string; department: string } | null;
  rights_request_messages: { id: string; kind: RightsRequest['messages'][number]['kind']; visible_to_employee: boolean; author_id: string | null; body: string; created_at: string }[];
}

export async function liveRightsRequests(): Promise<RightsRequest[]> {
  const rows = check(
    await db().from('rights_requests')
      .select('id, employee_id, request_type, status, created_at, due_at, extended_reason, extended_at, extended_by, outcome, closed_at, employees(display_name, department), rights_request_messages(id, kind, visible_to_employee, author_id, body, created_at)')
      .order('created_at', { ascending: false }),
  ) as unknown as RightsRow[];
  return rows.map((r) => {
    const name = r.employees?.display_name ?? 'Unknown';
    return {
      id: r.id,
      employeeId: r.employee_id,
      employeeName: name,
      department: r.employees?.department ?? '',
      type: r.request_type,
      createdAt: r.created_at,
      status: r.status,
      dueAt: r.due_at,
      extended: r.extended_at ? { reason: r.extended_reason ?? '', at: r.extended_at, by: r.extended_by ?? '' } : null,
      outcome: r.outcome,
      closedAt: r.closed_at,
      messages: [...r.rights_request_messages]
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((m) => ({
          id: m.id,
          kind: m.kind,
          visibleToEmployee: m.visible_to_employee,
          authorId: m.author_id ?? '',
          authorName: m.kind === 'employee' ? name : 'A Director',
          body: m.body,
          at: m.created_at,
        })),
    };
  });
}

function useDemoRightsRequests(): RightsRequest[] {
  const [requests, setRequests] = useState(listRightsRequests);
  useEffect(() => subscribeRightsRequests(() => setRequests(listRightsRequests())), []);
  return requests;
}

export const useRightsRequests: () => RightsRequest[] = LIVE ? () => useLive(liveRightsRequests, []) : useDemoRightsRequests;

/**
 * Director actions. The pure functions run first in both modes, so the same
 * rules (and messages) apply before anything is sent; live then calls the
 * database function, which checks them again.
 */
export const rightsActions = {
  async message(r: RightsRequest, actor: Actor, body: string, internal: boolean) {
    const next = directorMessage(r, actor, body, internal, new Date());
    if (!LIVE) {
      upsertRightsRequest(next);
      if (!internal) notifyEmployee('request_reply', r.employeeId, r.employeeName, coalesceKeys.request(r.id));
      return;
    }
    check(await db().rpc('respond_rights_request', { p_id: r.id, p_body: body, p_internal: internal }));
    refresh();
  },
  async markInProgress(r: RightsRequest, actor: Actor) {
    const next = markInProgress(r, actor, new Date());
    if (!LIVE) return upsertRightsRequest(next);
    check(await db().rpc('mark_rights_request_in_progress', { p_id: r.id }));
    refresh();
  },
  async extend(r: RightsRequest, actor: Actor, months: number, reason: string) {
    const next = extendDeadline(r, actor, months, reason, new Date());
    if (!LIVE) {
      upsertRightsRequest(next);
      notifyEmployee('request_extended', r.employeeId, r.employeeName, coalesceKeys.request(r.id));
      return;
    }
    check(await db().rpc('extend_rights_request', { p_id: r.id, p_months: months, p_reason: reason }));
    refresh();
  },
  async close(r: RightsRequest, actor: Actor, outcome: Outcome, summary: string) {
    const next = closeRequest(r, actor, outcome, summary, new Date());
    if (!LIVE) {
      upsertRightsRequest(next);
      notifyEmployee('request_closed', r.employeeId, r.employeeName, coalesceKeys.request(r.id));
      return;
    }
    check(await db().rpc('close_rights_request', { p_id: r.id, p_outcome: outcome, p_summary: summary }));
    refresh();
  },
};
