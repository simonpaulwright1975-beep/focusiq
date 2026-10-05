/**
 * DEMO store for "Live the Walter Geering Way" results a Director has shared
 * with the person who sat the check (shared by both apps through
 * localStorage). A released result holds the score and topic counts only –
 * never the questions, the person's answers or the right answers – so it is
 * safe in the employee bundle. Stan's sample baseline starts released.
 */
import { WG_WAY_TOPICS, type WgWayTopic } from '../demo/wgWayBank.js';

export interface WgWayTopicScore {
  topic: WgWayTopic;
  label: string;
  correct: number;
  total: number;
}

export interface WgWayRelease {
  /** The sitting this result is for. */
  sittingId: string;
  employeeId: string;
  completedAt: string;
  correct: number;
  total: number;
  byTopic: WgWayTopicScore[];
  releasedAt: string;
  sample?: boolean;
}

const topics = (counts: Partial<Record<WgWayTopic, [number, number]>>): WgWayTopicScore[] =>
  (Object.keys(WG_WAY_TOPICS) as WgWayTopic[]).flatMap((t) => {
    const c = counts[t];
    return c && c[1] > 0 ? [{ topic: t, label: WG_WAY_TOPICS[t], correct: c[0], total: c[1] }] : [];
  });

/** Stan's sample: the whole 70-question bank as a reference (a real sitting draws 25). */
export const STAN_SAMPLE_RELEASE: WgWayRelease = {
  sittingId: 'sample-stan',
  employeeId: 'stan',
  completedAt: '2026-10-04T11:00:00.000Z',
  correct: 67,
  total: 70,
  byTopic: topics({ history: [8, 8], way: [6, 6], products: [6, 6], supply: [3, 4], business: [6, 6], playbook: [19, 20], newbiz: [19, 20] }),
  releasedAt: '2026-10-05T09:00:00.000Z',
  sample: true,
};

/** A 25-question sitting for the Staff view preview (a made-up person). */
export const PREVIEW_SAMPLE_RELEASE: WgWayRelease = {
  sittingId: 'preview-sample',
  employeeId: 'preview',
  completedAt: '2026-10-04T11:00:00.000Z',
  correct: 21,
  total: 25,
  byTopic: topics({ history: [4, 4], way: [3, 3], products: [2, 3], supply: [2, 2], playbook: [5, 7], newbiz: [5, 6] }),
  releasedAt: '2026-10-05T09:00:00.000Z',
  sample: true,
};

const KEY = 'focusiq-demo-wgway-releases';
const CHANGED = 'focusiq-wgway-releases-changed';

export function listWgWayReleases(): WgWayRelease[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as WgWayRelease[];
  } catch {
    /* nothing stored */
  }
  return [STAN_SAMPLE_RELEASE];
}

function write(releases: WgWayRelease[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(releases));
  } catch {
    /* demo only */
  }
  window.dispatchEvent(new Event(CHANGED));
}

export function releaseWgWay(release: WgWayRelease) {
  write([...listWgWayReleases().filter((r) => r.sittingId !== release.sittingId), release]);
}

export function withdrawWgWay(sittingId: string) {
  write(listWgWayReleases().filter((r) => r.sittingId !== sittingId));
}

/** The person's released results, latest first. */
export const wgWayReleasesFor = (employeeId: string) =>
  listWgWayReleases().filter((r) => r.employeeId === employeeId).sort((a, b) => b.completedAt.localeCompare(a.completedAt));

export function subscribeWgWayReleases(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => e.key === KEY && onChange();
  window.addEventListener('storage', onStorage);
  window.addEventListener(CHANGED, onChange);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(CHANGED, onChange);
  };
}
