/**
 * DEMO store for "Questions or concerns", shared by the employee and Director
 * apps through this browser's localStorage. Production: `rights_requests` +
 * `rights_request_messages`. Imported by the employee bundle – no engine code.
 */
import type { RightsRequest } from '../../../src/participation/index.js';

const KEY = 'focusiq-demo-requests';
const CHANGED = 'focusiq-requests-changed';

export function listRightsRequests(): RightsRequest[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as RightsRequest[];
  } catch {
    /* nothing stored */
  }
  return [];
}

function save(all: RightsRequest[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* demo only */
  }
  window.dispatchEvent(new Event(CHANGED));
}

export function upsertRightsRequest(r: RightsRequest) {
  save([r, ...listRightsRequests().filter((x) => x.id !== r.id)]);
}

export function requestsForEmployee(employeeId: string): RightsRequest[] {
  return listRightsRequests()
    .filter((r) => r.employeeId === employeeId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function resetRightsRequests() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(CHANGED));
}

export function subscribeRightsRequests(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => e.key === KEY && onChange();
  window.addEventListener('storage', onStorage);
  window.addEventListener(CHANGED, onChange);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(CHANGED, onChange);
  };
}
