/**
 * DEMO store for released employee summaries, shared by both apps through
 * localStorage. Production: summary_releases + my_summary(), which return the
 * summary content only (never who released it).
 */
import type { SummaryRelease } from '../../../src/participation/index.js';

const KEY = 'focusiq-demo-summaries';
const CHANGED = 'focusiq-summaries-changed';

export function listReleases(): SummaryRelease[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as SummaryRelease[];
  } catch {
    /* nothing stored */
  }
  return [];
}

export function saveRelease(release: SummaryRelease) {
  const rest = listReleases().filter((r) => r.summary.id !== release.summary.id);
  try {
    localStorage.setItem(KEY, JSON.stringify([release, ...rest]));
  } catch {
    /* demo only */
  }
  window.dispatchEvent(new Event(CHANGED));
}

export function resetReleases() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(CHANGED));
}

export function subscribeReleases(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => e.key === KEY && onChange();
  window.addEventListener('storage', onStorage);
  window.addEventListener(CHANGED, onChange);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(CHANGED, onChange);
  };
}
