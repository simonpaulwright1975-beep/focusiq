/**
 * Where the Director app's "Live the Walter Geering Way" results come from.
 *
 * Demo: sittings taken in this browser, scored here, plus Stan's sample.
 * Live: WG Main's wg_way_sittings, drawn and scored by the database (Directors
 * can read them; the answers stay on the server). Sharing a result with the
 * person goes through wg_way_set_shared(). Stan's sample stays a demo item.
 */
import { LIVE, check, db } from '../shared/supabase.js';
import { releaseWgWay, withdrawWgWay } from '../shared/wgWayReleaseStore.js';
import { releaseOf, TOPICS, type WgWayResult } from './wgWayResults.js';

const CHANGED = 'focusiq-wgway-live-changed';

interface SittingRow {
  id: string;
  employee_id: string;
  submitted_at: string;
  correct: number;
  total: number;
  by_topic: Record<string, { correct: number; total: number }> | null;
  shared_at: string | null;
  employees: { display_name: string } | null;
}

let pending: Promise<WgWayResult[]> | null = null;

/** Finished live sittings, oldest first (cached until a result is shared or unshared). */
export function liveWgWayResults(): Promise<WgWayResult[]> {
  if (!LIVE) return Promise.resolve([]);
  pending ??= (async () => {
    const rows = check(
      await db().from('wg_way_sittings')
        .select('id, employee_id, submitted_at, correct, total, by_topic, shared_at, employees(display_name)')
        .not('submitted_at', 'is', null)
        .order('submitted_at', { ascending: true }),
    ) as unknown as SittingRow[];
    return rows.map((r): WgWayResult => ({
      id: r.id,
      employeeId: r.employee_id,
      name: r.employees?.display_name ?? 'Unknown',
      completedAt: r.submitted_at,
      correct: r.correct,
      total: r.total,
      byTopic: Object.fromEntries(TOPICS.map((t) => [t, r.by_topic?.[t] ?? { correct: 0, total: 0 }])) as WgWayResult['byTopic'],
      live: true,
      sharedAt: r.shared_at,
    }));
  })().catch((e: unknown) => {
    pending = null;
    throw e;
  });
  return pending;
}

export function subscribeLiveWgWay(onChange: () => void): () => void {
  window.addEventListener(CHANGED, onChange);
  return () => window.removeEventListener(CHANGED, onChange);
}

/** Lets the person see their own score and topic counts (or stops it). */
export async function setShared(r: WgWayResult, shared: boolean): Promise<void> {
  if (r.live) {
    check(await db().rpc('wg_way_set_shared', { p_sitting: r.id, p_shared: shared }));
    pending = null;
    window.dispatchEvent(new Event(CHANGED));
    return;
  }
  if (shared) releaseWgWay(releaseOf(r));
  else withdrawWgWay(r.id);
}
