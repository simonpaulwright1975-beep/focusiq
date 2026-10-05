import { describe as suite, expect, it } from 'vitest';
import {
  AcknowledgementInvalidError,
  NOTICE_V1,
  NoticeNotReadyError,
  canStartAssessment,
  createAcknowledgement,
  emptyForm,
  noticeFingerprint,
  placeholdersIn,
  publishNotice,
  validateAcknowledgement,
  type AcknowledgementForm,
  type PrivacyNotice,
} from '../src/participation/index.js';

const NOW = new Date('2026-10-02T09:00:00Z');
const details = {
  employeeId: 'e1',
  fullName: 'Grace Okafor',
  department: 'Sales',
  jobRole: 'Salesperson',
  startDate: '2025-11-03',
};

/** The v1 notice with every placeholder completed (as HR would do). */
function completedNotice(): PrivacyNotice {
  const fill = (s: string) => s.replace(/\[\[[^\]]+\]\]/g, 'COMPLETED');
  return publishNotice(
    {
      ...NOTICE_V1,
      summary: NOTICE_V1.summary.map(fill),
      sections: NOTICE_V1.sections.map((s) => ({ ...s, paragraphs: s.paragraphs.map(fill) })),
    },
    NOW,
  );
}

function completeForm(notice: PrivacyNotice): AcknowledgementForm {
  return {
    ...emptyForm(),
    detailsCorrect: true,
    ticked: Object.fromEntries(notice.acknowledgements.map((a) => [a.id, true])),
    adjustmentRequested: false,
    typedName: ' grace  okafor ',
  };
}

suite('privacy notice', () => {
  it('lists the placeholders HR must complete and refuses to publish until they are filled', () => {
    expect(placeholdersIn(NOTICE_V1)).toEqual(
      expect.arrayContaining([
        'Legal entity name, e.g. Walter Geering Ltd',
        'HR / data protection contact name and email',
        'retention period, in line with Walter Geering’s retention policy',
      ]),
    );
    expect(() => publishNotice(NOTICE_V1, NOW)).toThrow(NoticeNotReadyError);
    expect(completedNotice().publishedAt).toBe(NOW.toISOString());
  });

  it('frames the tick boxes as acknowledgement, not consent, and asks for no protected characteristics', () => {
    const text = JSON.stringify(NOTICE_V1);
    expect(text).toContain('legitimate interests');
    expect(NOTICE_V1.acknowledgements.map((a) => a.text).join(' ')).not.toMatch(/\bconsent\b/i);
    expect(text).toMatch(/does not ask for, and does not use, your age, sex/);
  });

  it('fingerprints the exact wording', async () => {
    const a = await noticeFingerprint(completedNotice());
    const b = await noticeFingerprint({ ...completedNotice(), summary: ['changed'] });
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });

  it('gives the same fingerprint whatever order the stored JSON keys come back in', async () => {
    const n = completedNotice();
    // jsonb returns object keys in its own order; the wording is unchanged.
    const reordered = {
      ...n,
      sections: n.sections.map((sec) => Object.fromEntries(Object.entries(sec).reverse())) as typeof n.sections,
      acknowledgements: n.acknowledgements.map((x) => Object.fromEntries(Object.entries(x).reverse())) as typeof n.acknowledgements,
    };
    expect(await noticeFingerprint(reordered)).toBe(await noticeFingerprint(n));
  });
});

suite('acknowledgement form', () => {
  it('requires every statement, a details decision, an adjustment answer and the typed name', () => {
    const errors = validateAcknowledgement(emptyForm(), completedNotice(), details);
    expect(Object.keys(errors).sort()).toEqual(['adjustment', 'details', 'ticked', 'typedName']);
    expect(errors.ticked).toBe('Please tick all 8 statements (8 remaining).');
  });

  it('requires a description when details are wrong or an adjustment is requested', () => {
    const notice = completedNotice();
    const errors = validateAcknowledgement(
      { ...completeForm(notice), detailsCorrect: false, adjustmentRequested: true },
      notice,
      details,
    );
    expect(errors.details).toBe('Please tell us what needs correcting.');
    expect(errors.adjustment).toBe('Please describe what would help.');
  });

  it('checks the typed name matches the record', () => {
    const notice = completedNotice();
    const errors = validateAcknowledgement({ ...completeForm(notice), typedName: 'G Okafor' }, notice, details);
    expect(errors.typedName).toMatch(/as it appears on your record \(Grace Okafor\)/);
  });

  it('cannot be completed against an unpublished notice', () => {
    expect(validateAcknowledgement(completeForm(NOTICE_V1), NOTICE_V1, details).notice).toBeTruthy();
  });

  it('creates an immutable record with the wording snapshot, fingerprint, corrections and adjustment request', async () => {
    const notice = completedNotice();
    const record = await createAcknowledgement(
      {
        ...completeForm(notice),
        detailsCorrect: false,
        detailsCorrection: 'My role is now Senior Salesperson',
        adjustmentRequested: true,
        adjustmentDescription: 'Extra time on timed sections',
      },
      notice,
      details,
      { now: NOW, id: 'ack-1' },
    );
    expect(record).toMatchObject({
      id: 'ack-1',
      employeeId: 'e1',
      noticeVersion: 'privacy-notice/1.0.0',
      detailsCorrect: false,
      detailsCorrection: 'My role is now Senior Salesperson',
      adjustmentRequested: true,
      adjustmentDescription: 'Extra time on timed sections',
      typedName: 'grace  okafor',
      acknowledgedAt: NOW.toISOString(),
    });
    expect(record.noticeSha256).toBe(await noticeFingerprint(notice));
    expect(record.acknowledgedItems).toHaveLength(8);
    expect(Object.isFrozen(record)).toBe(true);
    await expect(createAcknowledgement(emptyForm(), notice, details)).rejects.toThrow(AcknowledgementInvalidError);
  });
});

suite('starting an assessment', () => {
  it('requires an acknowledgement of the current notice version', async () => {
    const notice = completedNotice();
    expect(canStartAssessment([], notice, 'e1')).toMatchObject({ allowed: false, reason: 'no_acknowledgement' });
    const record = await createAcknowledgement(completeForm(notice), notice, details);
    expect(canStartAssessment([record], notice, 'e1')).toEqual({ allowed: true });
    expect(canStartAssessment([record], notice, 'someone-else').allowed).toBe(false);

    const v2 = { ...notice, version: 'privacy-notice/1.1.0' };
    expect(canStartAssessment([record], v2, 'e1')).toMatchObject({ allowed: false, reason: 'notice_updated' });
  });
});
