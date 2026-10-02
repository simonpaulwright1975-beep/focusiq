/**
 * DEMO store for "Questions or concerns", shared by the employee and Director
 * apps through this browser's localStorage. Production: `rights_requests` +
 * `rights_request_messages`. Imported by the employee bundle – no engine code.
 */
import type { RightsRequest } from '../../../src/participation/index.js';

const KEY = 'focusiq-demo-requests';
const SEEDED_KEY = `${KEY}-seeded`;
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

/** Director app only: merge in demo requests once. */
export function seedRequestsOnce(seed: readonly RightsRequest[]) {
  try {
    if (localStorage.getItem(SEEDED_KEY) !== null) return;
    const existing = listRightsRequests();
    const ids = new Set(existing.map((r) => r.id));
    localStorage.setItem(SEEDED_KEY, '1');
    save([...existing, ...seed.filter((r) => !ids.has(r.id))]);
  } catch {
    /* demo only */
  }
}

export function resetRightsRequests() {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(SEEDED_KEY);
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
