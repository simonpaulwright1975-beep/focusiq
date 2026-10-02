/** Tenure handling for new-starter and length-of-service analysis (§166–§167). */
import type { Employee } from './types.js';

export interface TenureBand {
  key: string;
  label: string;
  /** Inclusive lower bound in months. */
  minMonths: number;
  /** Exclusive upper bound in months; omitted = open-ended. */
  maxMonths?: number;
}

/** §166 */
export const DEFAULT_TENURE_BANDS: TenureBand[] = [
  { key: '0-3m', label: '0–3 months', minMonths: 0, maxMonths: 3 },
  { key: '3-12m', label: '3–12 months', minMonths: 3, maxMonths: 12 },
  { key: '1-3y', label: '1–3 years', minMonths: 12, maxMonths: 36 },
  { key: '3y+', label: '3+ years', minMonths: 36 },
];

/** §167 example banding. */
export const RETENTION_TENURE_BANDS: TenureBand[] = [
  { key: '0-6m', label: '0–6 months', minMonths: 0, maxMonths: 6 },
  { key: '6-24m', label: '6–24 months', minMonths: 6, maxMonths: 24 },
  { key: '2y+', label: '2+ years', minMonths: 24 },
];

/** §166 New Starter Cohort vs Established Employees. */
export const NEW_STARTER_BANDS: TenureBand[] = [
  { key: 'new_starter', label: 'New Starter Cohort', minMonths: 0, maxMonths: 12 },
  { key: 'established', label: 'Established Employees', minMonths: 12 },
];

/** Whole months of service between start date and `asOf`. */
export function tenureMonths(startDate: string, asOf: Date): number {
  const start = new Date(startDate);
  let months =
    (asOf.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (asOf.getUTCMonth() - start.getUTCMonth());
  if (asOf.getUTCDate() < start.getUTCDate()) months -= 1;
  return Math.max(0, months);
}

export function tenureBandFor(
  employee: Employee,
  asOf: Date,
  bands: readonly TenureBand[] = DEFAULT_TENURE_BANDS,
): TenureBand | undefined {
  const m = tenureMonths(employee.startDate, asOf);
  return bands.find((b) => m >= b.minMonths && (b.maxMonths === undefined || m < b.maxMonths));
}
