/**
 * The employee's own FocusiQ summary – what a Director releases to them.
 *
 * Constructive by design (Insight §233, benchmarking §193): strengths, a small
 * number of development opportunities, absolute bands only (never percentiles,
 * rankings or colleagues' results), their own change over time, what they told
 * us motivates them, and what the business will do to support them.
 *
 * A released summary is frozen. This module holds only types and display
 * helpers so the employee app can use it without engine code.
 */

/** Employee-facing wording for the absolute bands. */
export type EmployeeBand = 'Strength' | 'Expected' | 'Development opportunity';

export type ChangeSinceLast = 'higher' | 'similar' | 'lower';

export interface SummaryDimension {
  key: string;
  label: string;
  /** Plain-English description of what the dimension covers. */
  description: string;
  band: EmployeeBand;
  /** Compared with the employee's previous assessment (null when this is the first). */
  change: ChangeSinceLast | null;
}

export interface SupportAction {
  title: string;
  detail: string;
}

export interface EmployeeSummary {
  id: string;
  employeeId: string;
  assessmentId: string;
  assessmentDate: string;
  /** Previous assessment date, if "since last time" comparisons are shown. */
  previousAssessmentDate: string | null;
  interpretationVersion: string;
  /** Constructive paragraphs written from the evidence. */
  paragraphs: string[];
  /** Only included when the Director chose to show bands. */
  dimensions: SummaryDimension[];
  /** Shown when bands are based on provisional (not yet validated) expectations. */
  bandsProvisional: boolean;
  /** The employee's own top motivators, from their ranking. */
  motivators: string[];
  /** What Walter Geering will do to support them (chosen by the Director). */
  support: SupportAction[];
  /** Optional personal note from the Director, shown as from "Walter Geering". */
  personalMessage: string | null;
  releasedAt: string;
}

/** Director-side record of a release. Who released it is never shown to the employee. */
export interface SummaryRelease {
  summary: EmployeeSummary;
  releasedBy: string;
  withdrawn: { at: string; reason: string } | null;
  readAt: string | null;
}

export const BAND_EXPLANATIONS: Record<EmployeeBand, string> = {
  Strength: 'You showed this clearly and consistently.',
  Expected: 'In line with what FocusiQ expects for this.',
  'Development opportunity': 'An area where support or practice could help.',
};

export const CHANGE_LABELS: Record<ChangeSinceLast, string> = {
  higher: 'Higher than last time',
  similar: 'Similar to last time',
  lower: 'Lower than last time',
};

/** The release the employee should currently see (latest not withdrawn). */
export function currentRelease(releases: readonly SummaryRelease[], employeeId: string): SummaryRelease | null {
  return (
    releases
      .filter((r) => r.summary.employeeId === employeeId && !r.withdrawn)
      .sort((a, b) => b.summary.releasedAt.localeCompare(a.summary.releasedAt))[0] ?? null
  );
}

// ---------------------------------------------------------------------------
// Release lifecycle (pure; used by both apps)
// ---------------------------------------------------------------------------
export function withdrawRelease(release: SummaryRelease, reason: string, now: Date): SummaryRelease {
  if (release.withdrawn) throw new Error('This summary has already been withdrawn.');
  if (!reason.trim()) throw new Error('Give a reason for withdrawing the summary.');
  return { ...release, withdrawn: { at: now.toISOString(), reason: reason.trim() } };
}

export function markReleaseRead(release: SummaryRelease, employeeId: string, now: Date): SummaryRelease {
  if (release.summary.employeeId !== employeeId) throw new Error('You can only confirm your own summary.');
  if (release.readAt) return release;
  return { ...release, readAt: now.toISOString() };
}
