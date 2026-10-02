/**
 * Director-controlled cohort tags (§198) with the protected-characteristics
 * safeguard (§199).
 */
import { assertCanAlterInclusion, type EligibilityLedger } from './audit.js';
import type { Actor, Employee } from './types.js';

/** §198 examples. */
export const SUGGESTED_COHORT_TAGS = [
  'Sales',
  'Customer-facing',
  'Manager',
  'New starter',
  'Target bearing',
  'Non-target bearing',
  'Office based',
] as const;

/**
 * §199 – terms that indicate a protected characteristic (Equality Act 2010).
 * Cohorts named after these are rejected for operational benchmarking; any
 * legitimate equality monitoring must run in a separately governed process.
 */
const PROTECTED_TERMS = [
  /\bage\b/i,
  /\baged?\s*\d/i,
  /\bover\s*\d{2}/i,
  /\bunder\s*\d{2}/i,
  /\b(gen(eration)?\s*[xyz]|millennial|boomer)/i,
  /\bsex\b/i,
  /\bgender\b/i,
  /\b(male|female|men|women)\b/i,
  /\bdisab/i,
  /\bpregnan/i,
  /\bmaternity\b/i,
  /\b(race|racial|ethnic|nationality)/i,
  /\breligio/i,
  /\bbelief\b/i,
  /\bsexual orientation\b/i,
  /\b(gay|lesbian|bisexual|lgbt)/i,
  /\b(trans|transgender|gender reassignment)\b/i,
  /\b(married|marital|civil partner)/i,
];

export class ProtectedCharacteristicError extends Error {}

export function assertNotProtectedCharacteristic(tag: string): void {
  if (PROTECTED_TERMS.some((re) => re.test(tag))) {
    throw new ProtectedCharacteristicError(
      `"${tag}" appears to describe a protected characteristic. FocusiQ does not use protected ` +
        'characteristics for performance comparison or ranking.',
    );
  }
}

/** Adds a cohort tag without changing the employee's formal department. */
export function addCohortTag(
  actor: Actor,
  ledger: EligibilityLedger,
  employee: Employee,
  tag: string,
  reason: string,
): Employee {
  assertCanAlterInclusion(actor);
  const clean = tag.trim();
  if (!clean) throw new Error('Cohort tag cannot be empty.');
  assertNotProtectedCharacteristic(clean);
  if (employee.cohortTags.includes(clean)) return employee;
  ledger.recordEvent(actor, 'cohort_changed', 'employee', employee.id, reason, { added: clean });
  return { ...employee, cohortTags: [...employee.cohortTags, clean] };
}

export function removeCohortTag(
  actor: Actor,
  ledger: EligibilityLedger,
  employee: Employee,
  tag: string,
  reason: string,
): Employee {
  assertCanAlterInclusion(actor);
  if (!employee.cohortTags.includes(tag)) return employee;
  ledger.recordEvent(actor, 'cohort_changed', 'employee', employee.id, reason, { removed: tag });
  return { ...employee, cohortTags: employee.cohortTags.filter((t) => t !== tag) };
}
