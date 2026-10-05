/**
 * DEMO store for adjustment requests, shared by the employee and Director
 * apps through this browser's localStorage (both pages are on the same
 * origin, so a request made on the employee page appears in the dashboard).
 *
 * Production uses `adjustment_requests` + `decide_adjustment_request()`.
 * This file is imported by the employee bundle: it must not import engine code.
 */
import type { AdjustmentRequest } from '../../../src/participation/index.js';

const KEY = 'focusiq-demo-adjustments';
const CHANGED = 'focusiq-adjustments-changed';

export function listRequests(): AdjustmentRequest[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as AdjustmentRequest[];
  } catch {
    /* nothing stored */
  }
  return [];
}

function save(all: AdjustmentRequest[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* demo only */
  }
  window.dispatchEvent(new Event(CHANGED));
}

export function upsertRequest(request: AdjustmentRequest) {
  const all = listRequests().filter((r) => r.id !== request.id);
  save([request, ...all]);
}

/** The employee's most recent request, if any. */
export function latestRequestFor(employeeId: string): AdjustmentRequest | null {
  return listRequests()
    .filter((r) => r.employeeId === employeeId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
}

export function resetRequests() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(CHANGED));
}

/** Notifies on changes from this tab and from other tabs. */
export function subscribe(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => e.key === KEY && onChange();
  window.addEventListener('storage', onStorage);
  window.addEventListener(CHANGED, onChange);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(CHANGED, onChange);
  };
}
