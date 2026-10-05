/**
 * "Live the Walter Geering Way" sittings in the DEMO (this browser). Each
 * sitting is a separate assessment with its own seed, so a retest draws a
 * fresh set of questions. Answers go through the same demo transport as the
 * main assessment; the Director app scores them with the answer key.
 */
export interface WgWaySitting {
  assessmentId: string;
  seed: string;
  employeeId: string;
  startedAt: string;
}

const KEY = 'focusiq-demo-wgway-sittings';
export const WG_WAY_SESSION_KEY = 'focusiq-demo-wgway-session';
const CHANGED = 'focusiq-wgway-changed';

export function listSittings(): WgWaySitting[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as WgWaySitting[];
  } catch {
    return [];
  }
}

export function addSitting(employeeId: string): WgWaySitting {
  const sitting: WgWaySitting = {
    assessmentId: `wg-way-${Date.now().toString(36)}`,
    seed: Math.random().toString(36).slice(2),
    employeeId,
    startedAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(KEY, JSON.stringify([...listSittings(), sitting]));
    localStorage.removeItem(WG_WAY_SESSION_KEY);
  } catch {
    /* demo only */
  }
  window.dispatchEvent(new Event(CHANGED));
  return sitting;
}

export function subscribeSittings(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => (e.key === KEY || e.key?.startsWith('focusiq-demo-server:')) && onChange();
  window.addEventListener(CHANGED, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGED, onChange);
    window.removeEventListener('storage', onStorage);
  };
}
