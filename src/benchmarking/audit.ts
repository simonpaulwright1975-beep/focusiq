/**
 * Benchmark eligibility ledger and audit log (§151–§153, §183–§185, §203).
 *
 * Golden rule: data is never deleted. Excluding someone only records an
 * auditable decision; restoring reverses it and keeps the full history.
 */
import {
  EXCLUSION_REASONS,
  type Actor,
  type AdjustmentState,
  type AssessmentValidity,
  type EligibilityState,
  type ExclusionReason,
  type ExclusionState,
} from './types.js';

export type AuditAction =
  | 'employee_excluded'
  | 'employee_restored'
  | 'assessment_excluded'
  | 'assessment_restored'
  | 'assessment_validity_changed'
  | 'assessment_adjustment_flagged'
  | 'assessment_adjustment_reviewed'
  | 'cohort_changed'
  | 'benchmark_recalculated'
  | 'role_changed'
  | 'snapshot_saved';

/** §185 – Who, What, When, Why. */
export interface AuditEvent {
  id: string;
  action: AuditAction;
  targetType: 'employee' | 'assessment' | 'cohort' | 'benchmark' | 'user' | 'snapshot';
  targetId: string;
  actorId: string;
  actorName: string;
  at: string;
  reason: string;
  note?: string;
  details?: Record<string, unknown>;
}

export class BenchmarkPermissionError extends Error {}
export class BenchmarkValidationError extends Error {}

/** §184 – only Directors / authorised Super Admins (or explicitly authorised managers). */
export function canAlterBenchmarkInclusion(actor: Actor): boolean {
  if (actor.role === 'director' || actor.role === 'super_admin') return true;
  return actor.role === 'manager' && actor.benchmarkAuthority === true;
}

/** §161, §162, §186 – comparison, ranking and percentile views are Director-only. */
export function canViewDirectorComparisons(actor: Actor): boolean {
  return actor.role === 'director' || actor.role === 'super_admin';
}

export function assertCanAlterInclusion(actor: Actor): void {
  if (!canAlterBenchmarkInclusion(actor)) {
    throw new BenchmarkPermissionError(
      `${actor.name} is not authorised to alter benchmark inclusion.`,
    );
  }
}

export function assertCanViewDirectorComparisons(actor: Actor): void {
  if (!canViewDirectorComparisons(actor)) {
    throw new BenchmarkPermissionError('This comparison is restricted to Directors.');
  }
}

export interface LedgerOptions {
  now?: () => Date;
  newId?: () => string;
}

let fallbackCounter = 0;
function defaultId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  fallbackCounter += 1;
  return `evt_${Date.now()}_${fallbackCounter}`;
}

/**
 * In-memory eligibility ledger. In production the same rules are enforced by
 * the `benchmark_eligibility` / `benchmark_audit_log` tables and RLS; this
 * class keeps the domain logic testable and usable on the client.
 */
export class EligibilityLedger {
  private readonly employees = new Map<string, ExclusionState>();
  private readonly assessments = new Map<string, ExclusionState>();
  private readonly validity = new Map<string, AssessmentValidity>();
  private readonly adjustments = new Map<string, AdjustmentState>();
  private readonly log: AuditEvent[] = [];
  private readonly now: () => Date;
  private readonly newId: () => string;

  constructor(options: LedgerOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.newId = options.newId ?? defaultId;
  }

  /** §153 – exclude every assessment from one employee from population benchmarks. */
  excludeEmployee(actor: Actor, employeeId: string, reason: ExclusionReason, note?: string): void {
    this.exclude(actor, 'employee', employeeId, reason, note);
  }

  /** §153 – exclude a single assessment. */
  excludeAssessment(
    actor: Actor,
    assessmentId: string,
    reason: ExclusionReason,
    note?: string,
  ): void {
    this.exclude(actor, 'assessment', assessmentId, reason, note);
  }

  /** §183 – Restore to Benchmark Population. */
  restoreEmployee(actor: Actor, employeeId: string, reason: string): void {
    this.restore(actor, 'employee', employeeId, reason);
  }

  restoreAssessment(actor: Actor, assessmentId: string, reason: string): void {
    this.restore(actor, 'assessment', assessmentId, reason);
  }

  /** §202 assessment_validity – status changes are audited too. */
  setAssessmentValidity(
    actor: Actor,
    assessmentId: string,
    status: AssessmentValidity,
    reason: string,
  ): void {
    assertCanAlterInclusion(actor);
    requireText(reason, 'A reason is required when changing assessment validity.');
    const previous = this.validity.get(assessmentId) ?? 'valid';
    this.validity.set(assessmentId, status);
    this.record(actor, 'assessment_validity_changed', 'assessment', assessmentId, reason, undefined, {
      from: previous,
      to: status,
    });
  }

  /**
   * Flag an Adjusted Assessment: the person legitimately received different
   * conditions. This does NOT exclude the assessment – it marks it for a
   * comparability decision (pending review until a Director decides).
   */
  flagAdjustedAssessment(actor: Actor, assessmentId: string, description: string): void {
    assertCanAlterInclusion(actor);
    requireText(description, 'Describe the adjusted conditions.');
    if (this.adjustments.has(assessmentId)) {
      throw new BenchmarkValidationError('This assessment is already flagged as adjusted.');
    }
    const at = this.now().toISOString();
    this.adjustments.set(assessmentId, {
      description,
      recordedBy: actor.id,
      recordedAt: at,
      comparability: 'pending_review',
    });
    this.record(actor, 'assessment_adjustment_flagged', 'assessment', assessmentId, description);
  }

  /** Decide whether an adjusted assessment remains comparable for benchmarking. */
  reviewAdjustedAssessment(
    actor: Actor,
    assessmentId: string,
    comparability: 'comparable' | 'not_comparable',
    reason: string,
  ): void {
    assertCanAlterInclusion(actor);
    requireText(reason, 'A reason is required for the comparability decision.');
    const current = this.adjustments.get(assessmentId);
    if (!current) throw new BenchmarkValidationError('This assessment is not flagged as adjusted.');
    const at = this.now().toISOString();
    this.adjustments.set(assessmentId, {
      ...current,
      comparability,
      decidedBy: actor.id,
      decidedAt: at,
      decisionReason: reason,
    });
    this.record(actor, 'assessment_adjustment_reviewed', 'assessment', assessmentId, reason, undefined, {
      from: current.comparability,
      to: comparability,
    });
  }

  adjustmentFor(assessmentId: string): AdjustmentState | undefined {
    return this.adjustments.get(assessmentId);
  }

  /** Record any other auditable benchmark action (§185). */
  recordEvent(
    actor: Actor,
    action: AuditAction,
    targetType: AuditEvent['targetType'],
    targetId: string,
    reason: string,
    details?: Record<string, unknown>,
  ): AuditEvent {
    requireText(reason, 'A reason is required for every audited benchmark action.');
    return this.record(actor, action, targetType, targetId, reason, undefined, details);
  }

  isEmployeeExcluded(employeeId: string): boolean {
    return this.employees.has(employeeId);
  }

  isAssessmentExcluded(assessmentId: string): boolean {
    return this.assessments.has(assessmentId);
  }

  validityOverride(assessmentId: string): AssessmentValidity | undefined {
    return this.validity.get(assessmentId);
  }

  state(): EligibilityState {
    return {
      employees: new Map(this.employees),
      assessments: new Map(this.assessments),
      validity: new Map(this.validity),
      adjustments: new Map(this.adjustments),
    };
  }

  auditLog(): readonly AuditEvent[] {
    return [...this.log];
  }

  historyFor(targetId: string): readonly AuditEvent[] {
    return this.log.filter((e) => e.targetId === targetId);
  }

  private exclude(
    actor: Actor,
    target: 'employee' | 'assessment',
    id: string,
    reason: ExclusionReason,
    note?: string,
  ): void {
    assertCanAlterInclusion(actor);
    if (!EXCLUSION_REASONS.includes(reason)) {
      throw new BenchmarkValidationError(`Unknown exclusion reason: ${String(reason)}`);
    }
    if (reason === 'other') {
      requireText(note, 'A note is required when the exclusion reason is "Other".');
    }
    const store = target === 'employee' ? this.employees : this.assessments;
    if (store.has(id)) {
      throw new BenchmarkValidationError(`This ${target} is already excluded from benchmarking.`);
    }
    const at = this.now().toISOString();
    store.set(id, { reason, note, excludedBy: actor.id, excludedAt: at });
    this.record(actor, `${target}_excluded`, target, id, reason, note);
  }

  private restore(actor: Actor, target: 'employee' | 'assessment', id: string, reason: string) {
    assertCanAlterInclusion(actor);
    requireText(reason, 'A reason is required when restoring to the benchmark population.');
    const store = target === 'employee' ? this.employees : this.assessments;
    const previous = store.get(id);
    if (!previous) {
      throw new BenchmarkValidationError(`This ${target} is not currently excluded.`);
    }
    store.delete(id);
    this.record(actor, `${target}_restored`, target, id, reason, undefined, {
      previousExclusion: previous,
    });
  }

  private record(
    actor: Actor,
    action: AuditAction,
    targetType: AuditEvent['targetType'],
    targetId: string,
    reason: string,
    note?: string,
    details?: Record<string, unknown>,
  ): AuditEvent {
    const event: AuditEvent = {
      id: this.newId(),
      action,
      targetType,
      targetId,
      actorId: actor.id,
      actorName: actor.name,
      at: this.now().toISOString(),
      reason,
      ...(note ? { note } : {}),
      ...(details ? { details } : {}),
    };
    this.log.push(Object.freeze(event));
    return event;
  }
}

function requireText(value: string | undefined, message: string): void {
  if (!value || value.trim().length === 0) throw new BenchmarkValidationError(message);
}
