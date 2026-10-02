/**
 * DEMO acknowledgement status for the assessment day, Director app only.
 * Grace Okafor (s4) is left out: her status comes live from the employee page.
 */
import type { AcknowledgementSummary } from '../../../src/participation/index.js';

/** Not acknowledged yet. */
const NOT_ACKNOWLEDGED = new Set(['c4', 'f6']);
/** Acknowledged an earlier draft notice, before the current one was published. */
const EARLIER_NOTICE = new Set(['k2']);
/** Said their record details were wrong. */
const DETAILS_WRONG = new Set(['f2']);

export function demoAcknowledgements(employeeIds: readonly string[], currentVersion: string): AcknowledgementSummary[] {
  return employeeIds
    .filter((id) => id !== 's4' && !NOT_ACKNOWLEDGED.has(id))
    .map((id, i) => ({
      employeeId: id,
      noticeVersion: EARLIER_NOTICE.has(id) ? 'privacy-notice/0.9.0' : currentVersion,
      detailsCorrect: !DETAILS_WRONG.has(id),
      acknowledgedAt: new Date(Date.UTC(2026, 8, 28, 8, 0) + i * 37 * 60_000).toISOString(),
    }));
}
