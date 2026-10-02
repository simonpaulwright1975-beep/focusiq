/**
 * DEMO transport: stands in for Supabase by saving to this browser's
 * localStorage, with a short delay. It refuses to save while the browser is
 * offline so the offline queue can be seen working.
 *
 * Production replaces this with inserts into `assessment_presentations` /
 * `response_events` (idempotent on id / (assessment_id, client_sequence)) and
 * an update of `assessments.complete`.
 */
import type { Presentation, RunnerEvent, Transport } from '../../../src/runner/index.js';
import { DEMO_SERVER_KEY as KEY } from '../shared/participationStore.js';

interface ServerCopy {
  presentations: Record<string, Presentation>;
  events: Record<string, RunnerEvent>;
  completedAt: string | null;
}

function read(id: string): ServerCopy {
  try {
    return JSON.parse(localStorage.getItem(`${KEY}:${id}`) ?? '') as ServerCopy;
  } catch {
    return { presentations: {}, events: {}, completedAt: null };
  }
}

function write(id: string, copy: ServerCopy) {
  try {
    localStorage.setItem(`${KEY}:${id}`, JSON.stringify(copy));
  } catch {
    /* storage unavailable – demo only */
  }
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const demoTransport: Transport = {
  async save(batch) {
    await delay(250);
    if (!navigator.onLine) throw new Error('You appear to be offline');
    const id = batch.events[0]?.assessmentId ?? batch.presentations[0]?.assessmentId;
    if (!id) return;
    const copy = read(id);
    for (const p of batch.presentations) copy.presentations[p.id] = p;
    for (const e of batch.events) copy.events[String(e.clientSequence)] = e; // unique per sequence
    write(id, copy);
  },
  async complete(assessmentId, completedAt) {
    await delay(150);
    if (!navigator.onLine) throw new Error('You appear to be offline');
    const copy = read(assessmentId);
    copy.completedAt ??= completedAt;
    write(assessmentId, copy);
  },
};

/** What the (demo) server already holds – used to resume without re-sending. */
export function serverSnapshot(assessmentId: string): { events: number; presentationIds: string[]; completed: boolean } {
  const copy = read(assessmentId);
  return { events: Object.keys(copy.events).length, presentationIds: Object.keys(copy.presentations), completed: copy.completedAt !== null };
}

export function clearDemoServer() {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(KEY)) localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}
