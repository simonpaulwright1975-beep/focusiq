/**
 * Outbox: sends presentations and events to the server in order, keeps
 * anything unsent (e.g. while offline) and retries with backoff.
 *
 * Saves are idempotent: presentations have deterministic ids and events are
 * unique on (assessment_id, client_sequence), so a retried batch that was in
 * fact saved is simply ignored by the server.
 */
import type { Presentation, RunnerEvent } from './session.js';

export interface Transport {
  /** Persist a batch. Must be idempotent. Throws on failure. */
  save(batch: { presentations: Presentation[]; events: RunnerEvent[] }): Promise<void>;
  /** Mark the assessment complete. Idempotent. */
  complete(assessmentId: string, completedAt: string): Promise<void>;
}

export type SyncStatus =
  | { kind: 'saved'; savedEvents: number }
  | { kind: 'saving'; pending: number }
  | { kind: 'retrying'; pending: number; attempt: number; nextRetryMs: number; error: string };

export interface OutboxOptions {
  transport: Transport;
  onStatus?: (s: SyncStatus) => void;
  /** Backoff schedule in ms (last value repeats). */
  backoffMs?: number[];
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (t: unknown) => void;
}

export class Outbox {
  private savedEvents = 0;
  private savedPresentations = new Set<string>();
  private latest: { presentations: Presentation[]; events: RunnerEvent[]; completedAt: string | null; assessmentId: string } | null = null;
  private inFlight = false;
  private attempt = 0;
  private timer: unknown = null;
  private completedSent = false;
  private readonly backoff: number[];
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (t: unknown) => void;

  constructor(private readonly o: OutboxOptions) {
    this.backoff = o.backoffMs ?? [1000, 2000, 5000, 10000, 30000];
    this.setTimer = o.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = o.clearTimer ?? ((t) => clearTimeout(t as ReturnType<typeof setTimeout>));
  }

  /** Restore what the server already has (e.g. after reload). */
  markSaved(savedEvents: number, presentationIds: Iterable<string>, completed = false): void {
    this.savedEvents = savedEvents;
    for (const id of presentationIds) this.savedPresentations.add(id);
    this.completedSent = completed;
  }

  get pending(): number {
    return this.latest ? this.latest.events.length - this.savedEvents : 0;
  }

  /** Offer the latest session snapshot; unsent items are queued and flushed. */
  push(snapshot: { assessmentId: string; presentations: Presentation[]; events: RunnerEvent[]; completedAt: string | null }): Promise<void> {
    this.latest = snapshot;
    return this.flush();
  }

  /** Try now (e.g. when the browser comes back online). */
  retryNow(): Promise<void> {
    if (this.timer !== null) {
      this.clearTimer(this.timer);
      this.timer = null;
    }
    return this.flush();
  }

  private async flush(): Promise<void> {
    if (this.inFlight || !this.latest || this.timer !== null) return;
    const snap = this.latest;
    const events = snap.events.slice(this.savedEvents);
    const presentations = snap.presentations.filter((p) => !this.savedPresentations.has(p.id));
    const needsComplete = snap.completedAt !== null && !this.completedSent;
    if (events.length === 0 && presentations.length === 0 && !needsComplete) {
      this.o.onStatus?.({ kind: 'saved', savedEvents: this.savedEvents });
      return;
    }
    this.inFlight = true;
    this.o.onStatus?.({ kind: 'saving', pending: events.length });
    try {
      if (events.length || presentations.length) await this.o.transport.save({ presentations, events });
      this.savedEvents += events.length;
      presentations.forEach((p) => this.savedPresentations.add(p.id));
      // Completion is sent only after every event before it has been saved.
      if (needsComplete) {
        await this.o.transport.complete(snap.assessmentId, snap.completedAt!);
        this.completedSent = true;
      }
      this.attempt = 0;
      this.inFlight = false;
      return this.flush(); // anything that arrived meanwhile
    } catch (e) {
      this.inFlight = false;
      const delay = this.backoff[Math.min(this.attempt, this.backoff.length - 1)]!;
      this.attempt += 1;
      this.o.onStatus?.({
        kind: 'retrying',
        pending: this.pending,
        attempt: this.attempt,
        nextRetryMs: delay,
        error: (e as Error).message,
      });
      this.timer = this.setTimer(() => {
        this.timer = null;
        void this.flush();
      }, delay);
    }
  }
}
