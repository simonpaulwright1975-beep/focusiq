/**
 * DEMO: the employee page's acknowledgement and assessment progress, read by
 * the Director's assessment-day view through this browser's localStorage.
 *
 * Production: participation_acknowledgements, assessments and response_events,
 * read by Directors through assessment_day_readiness().
 * Imported by the employee bundle: no engine imports.
 */
import type { AcknowledgementRecord, AssessmentProgress } from '../../../src/participation/index.js';
import type { RunnerEvent } from '../../../src/runner/index.js';

export const ACK_KEY = 'focusiq-demo-ack';
export const RUN_KEY = 'focusiq-demo-run';
export const DEMO_SERVER_KEY = 'focusiq-demo-server';

export const readJson = <T,>(key: string): T | null => {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '') as T;
  } catch {
    return null;
  }
};

export const writeJson = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* demo only */
  }
};

/** The demo employee's acknowledgement, if made. */
export const demoAcknowledgement = () => readJson<AcknowledgementRecord>(ACK_KEY);

/** Progress for the demo employee's current assessment, from what the (demo) server has received. */
export function demoProgress(employeeId: string, totalQuestions: number): AssessmentProgress | null {
  const run = readJson<{ assessmentId: string }>(RUN_KEY);
  if (!run) return null;
  const copy = readJson<{ events: Record<string, RunnerEvent>; completedAt: string | null }>(`${DEMO_SERVER_KEY}:${run.assessmentId}`);
  const events = Object.values(copy?.events ?? {}).sort((a, b) => a.clientSequence - b.clientSequence);
  const started = events.find((e) => e.type === 'assessment_started');
  const answered = new Set(events.filter((e) => e.type === 'answer_submitted').map((e) => e.presentationId));
  return {
    employeeId,
    startedAt: started?.occurredAt ?? null,
    lastActivityAt: events.at(-1)?.occurredAt ?? null,
    answered: answered.size,
    total: totalQuestions,
    completedAt: copy?.completedAt ?? null,
  };
}

/** Notifies when the employee page acknowledges, starts or saves progress (other tabs). */
export function subscribeParticipation(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === ACK_KEY || e.key === RUN_KEY || e.key.startsWith(DEMO_SERVER_KEY)) onChange();
  };
  window.addEventListener('storage', onStorage);
  return () => window.removeEventListener('storage', onStorage);
}
