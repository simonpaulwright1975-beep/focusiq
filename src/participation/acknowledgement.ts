/**
 * Participation acknowledgement: the record an employee completes before
 * their first assessment (and again whenever the notice changes).
 */
import { noticeFingerprint, type PrivacyNotice } from './notice.js';

/** Details shown from the employee record for the employee to confirm. */
export interface EmployeeRecordDetails {
  employeeId: string;
  fullName: string;
  department: string;
  jobRole: string;
  startDate: string;
}

export interface AcknowledgementForm {
  /** Employee confirms the record is correct, or describes what is wrong. */
  detailsCorrect: boolean | null;
  detailsCorrection: string;
  /** Acknowledgement item id → ticked. */
  ticked: Record<string, boolean>;
  adjustmentRequested: boolean | null;
  adjustmentDescription: string;
  /** Typed full name as a signature. */
  typedName: string;
}

export interface AcknowledgementRecord {
  id: string;
  employeeId: string;
  noticeVersion: string;
  /** SHA-256 of the exact notice wording acknowledged. */
  noticeSha256: string;
  /** Snapshot of each item's wording at the time it was ticked. */
  acknowledgedItems: { id: string; text: string }[];
  detailsConfirmed: EmployeeRecordDetails;
  detailsCorrect: boolean;
  detailsCorrection: string | null;
  adjustmentRequested: boolean;
  adjustmentDescription: string | null;
  typedName: string;
  acknowledgedAt: string;
}

export type FormErrors = Partial<Record<'details' | 'ticked' | 'adjustment' | 'typedName' | 'notice', string>>;

export function emptyForm(): AcknowledgementForm {
  return {
    detailsCorrect: null,
    detailsCorrection: '',
    ticked: {},
    adjustmentRequested: null,
    adjustmentDescription: '',
    typedName: '',
  };
}

const normaliseName = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

export function validateAcknowledgement(
  form: AcknowledgementForm,
  notice: PrivacyNotice,
  details: EmployeeRecordDetails,
): FormErrors {
  const errors: FormErrors = {};
  if (!notice.publishedAt) errors.notice = 'This version of the notice has not been published yet.';
  if (form.detailsCorrect === null) errors.details = 'Please confirm whether your details are correct.';
  else if (!form.detailsCorrect && !form.detailsCorrection.trim()) {
    errors.details = 'Please tell us what needs correcting.';
  }
  const missing = notice.acknowledgements.filter((a) => !form.ticked[a.id]);
  if (missing.length) errors.ticked = `Please tick all ${notice.acknowledgements.length} statements (${missing.length} remaining).`;
  if (form.adjustmentRequested === null) errors.adjustment = 'Please tell us whether you would like an adjustment.';
  else if (form.adjustmentRequested && !form.adjustmentDescription.trim()) {
    errors.adjustment = 'Please describe what would help.';
  }
  if (!form.typedName.trim()) errors.typedName = 'Please type your full name.';
  else if (normaliseName(form.typedName) !== normaliseName(details.fullName)) {
    errors.typedName = `Please type your name as it appears on your record (${details.fullName}).`;
  }
  return errors;
}

export class AcknowledgementInvalidError extends Error {
  constructor(public readonly errors: FormErrors) {
    super(Object.values(errors).join(' '));
  }
}

export async function createAcknowledgement(
  form: AcknowledgementForm,
  notice: PrivacyNotice,
  details: EmployeeRecordDetails,
  options: { now?: Date; id?: string } = {},
): Promise<AcknowledgementRecord> {
  const errors = validateAcknowledgement(form, notice, details);
  if (Object.keys(errors).length) throw new AcknowledgementInvalidError(errors);
  return Object.freeze({
    id: options.id ?? globalThis.crypto.randomUUID(),
    employeeId: details.employeeId,
    noticeVersion: notice.version,
    noticeSha256: await noticeFingerprint(notice),
    acknowledgedItems: notice.acknowledgements.map((a) => ({ id: a.id, text: a.text })),
    detailsConfirmed: { ...details },
    detailsCorrect: form.detailsCorrect!,
    detailsCorrection: form.detailsCorrect ? null : form.detailsCorrection.trim(),
    adjustmentRequested: form.adjustmentRequested!,
    adjustmentDescription: form.adjustmentRequested ? form.adjustmentDescription.trim() : null,
    typedName: form.typedName.trim(),
    acknowledgedAt: (options.now ?? new Date()).toISOString(),
  });
}

export type StartCheck =
  | { allowed: true }
  | { allowed: false; reason: 'no_acknowledgement' | 'notice_updated'; message: string };

/** An assessment may only start once the CURRENT published notice has been acknowledged. */
export function canStartAssessment(
  records: readonly AcknowledgementRecord[],
  currentNotice: PrivacyNotice,
  employeeId: string,
): StartCheck {
  const mine = records.filter((r) => r.employeeId === employeeId);
  if (mine.some((r) => r.noticeVersion === currentNotice.version)) return { allowed: true };
  if (mine.length) {
    return {
      allowed: false,
      reason: 'notice_updated',
      message: 'The FocusiQ privacy notice has been updated. Please read and acknowledge the new version before continuing.',
    };
  }
  return {
    allowed: false,
    reason: 'no_acknowledgement',
    message: 'Please read the privacy notice and complete the acknowledgement before starting.',
  };
}

/** "Questions or concerns" – data-rights and general requests. */
export type RightsRequestType = 'question' | 'copy_of_data' | 'correction' | 'objection';

export const RIGHTS_REQUEST_LABELS: Record<RightsRequestType, string> = {
  question: 'Ask a question',
  copy_of_data: 'Request a copy of my information',
  correction: 'Ask for something to be corrected',
  objection: 'Object to how my information is used',
};
