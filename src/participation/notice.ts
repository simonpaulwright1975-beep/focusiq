/**
 * FocusiQ privacy notice and participation acknowledgement.
 *
 * Under UK GDPR an employer can rarely rely on employee *consent* (it is not
 * freely given in an employment relationship). This notice therefore explains
 * the processing (lawful basis: legitimate interests) and the employee
 * *acknowledges* it – the tick boxes record understanding, not consent.
 *
 * Text in [[double brackets]] is a placeholder that Walter Geering (HR / legal)
 * must complete. A notice containing placeholders cannot be published.
 */

export interface NoticeSection {
  id: string;
  heading: string;
  paragraphs: string[];
}

export interface AcknowledgementItem {
  id: string;
  text: string;
}

export interface PrivacyNotice {
  version: string;
  title: string;
  /** Plain-language summary shown before the full notice. */
  summary: string[];
  sections: NoticeSection[];
  acknowledgements: AcknowledgementItem[];
  publishedAt: string | null;
}

export const PLACEHOLDER = /\[\[([^\]]+)\]\]/g;

export const NOTICE_V1: PrivacyNotice = {
  version: 'privacy-notice/1.0.0',
  title: 'FocusiQ – how your assessment information is used',
  summary: [
    'FocusiQ helps Walter Geering understand how people approach their work, so we can support you better. It is not a pass/fail test.',
    'Your results are confidential. They are used only inside Walter Geering and are never made public.',
    'Directors see your full report. You receive your own summary.',
    'Results are a starting point for conversation and will not be used on their own to make decisions about your employment.',
  ],
  sections: [
    {
      id: 'who',
      heading: 'Who is responsible for your information',
      paragraphs: [
        '[[Legal entity name, e.g. Walter Geering Ltd]] is the data controller for FocusiQ.',
        'Questions about FocusiQ or your information: [[HR / data protection contact name and email]].',
      ],
    },
    {
      id: 'why',
      heading: 'Why we use FocusiQ',
      paragraphs: [
        'To understand working styles, strengths and development opportunities, and to identify where the business – its processes, priorities and management – could support people better.',
        'FocusiQ also looks at patterns across teams so we can improve processes rather than treat shared issues as individual problems.',
        'Taking part: [[State whether taking part is voluntary or expected as part of development reviews, and what happens if someone does not take part]].',
      ],
    },
    {
      id: 'what',
      heading: 'What information is collected',
      paragraphs: [
        'Your name, department, job role and start date (from your employee record).',
        'Your answers, and how you interact with the assessment: the time taken on each question, whether you change an answer, and whether you return to a question. This is used to understand working style – for example whether extra checking improves results.',
        'Your answers to the motivation questions, and any adjustment you ask for.',
        'FocusiQ does not ask for, and does not use, your age, sex, ethnicity, religion, sexual orientation, health or any other protected characteristic to assess or rank you.',
      ],
    },
    {
      id: 'basis',
      heading: 'Our lawful basis',
      paragraphs: [
        'We rely on legitimate interests: developing and supporting our people and improving how the business works. We have considered your interests and limited the information collected and who can see it.',
        'If you tell us about an adjustment that relates to your health, we use it only to make that adjustment, under our obligations as an employer.',
      ],
    },
    {
      id: 'who-sees',
      heading: 'Who can see your results',
      paragraphs: [
        'Your full report can be seen only by Walter Geering Directors and authorised senior administrators. You will receive your own summary.',
        'Results may be combined with colleagues’ results to produce department or company averages. Group results are never shown for fewer than five people.',
        'Your results are never published, shared outside Walter Geering, or sold. Our hosting provider stores the information on our behalf in [[hosting location, e.g. the UK (London)]] and cannot use it for its own purposes.',
      ],
    },
    {
      id: 'decisions',
      heading: 'How results are used in decisions',
      paragraphs: [
        'FocusiQ generates observations from your responses using fixed, documented rules. They are a starting point for a conversation with you, not an unquestionable judgement.',
        'Results will not be used as the sole basis for disciplinary action, pay, promotion, demotion or dismissal. No decision about you is made automatically.',
      ],
    },
    {
      id: 'retention',
      heading: 'How long we keep it',
      paragraphs: [
        'Assessment information is kept for [[retention period, in line with Walter Geering’s retention policy]] and is then deleted. If you leave Walter Geering it is kept only as our retention policy allows.',
      ],
    },
    {
      id: 'rights',
      heading: 'Your rights',
      paragraphs: [
        'You can ask for a copy of your information, ask us to correct anything wrong, and object to how we use it. Use the "Questions or concerns" option in FocusiQ or contact [[HR / data protection contact]].',
        'You can also complain to the Information Commissioner’s Office (ico.org.uk), though we would like the chance to resolve any concern first.',
      ],
    },
  ],
  acknowledgements: [
    { id: 'read_notice', text: 'I have read this privacy notice.' },
    { id: 'development_tool', text: 'I understand FocusiQ is a development tool, not a pass/fail test.' },
    { id: 'internal_only', text: 'I understand my results are confidential, are used only within Walter Geering and will not be made public.' },
    { id: 'interactions_recorded', text: 'I understand that how I complete the assessment – time taken, changed answers and revisited questions – is recorded.' },
    { id: 'who_sees', text: 'I understand that Directors can see my full report and that I will receive my own summary.' },
    { id: 'not_sole_basis', text: 'I understand results will not be used as the sole basis for decisions about my employment.' },
    { id: 'rights', text: 'I know how to ask questions, request a copy of my information or raise an objection.' },
    { id: 'own_work', text: 'I will complete the assessment myself and will not share the questions with others.' },
  ],
  publishedAt: null,
};

/** Every unfilled placeholder in a notice. */
export function placeholdersIn(notice: PrivacyNotice): string[] {
  const text = [
    notice.title,
    ...notice.summary,
    ...notice.sections.flatMap((s) => [s.heading, ...s.paragraphs]),
    ...notice.acknowledgements.map((a) => a.text),
  ].join('\n');
  return [...text.matchAll(PLACEHOLDER)].map((m) => m[1]!);
}

export class NoticeNotReadyError extends Error {}

/** A notice may only be published once every placeholder has been completed. */
export function publishNotice(notice: PrivacyNotice, at: Date): PrivacyNotice {
  const missing = placeholdersIn(notice);
  if (missing.length) {
    throw new NoticeNotReadyError(`Complete these before publishing: ${missing.join('; ')}`);
  }
  return Object.freeze({ ...notice, publishedAt: at.toISOString() });
}

/** Canonical text used for the content fingerprint stored with each acknowledgement. */
/** JSON with object keys sorted at every level, so the text does not depend on key order (jsonb reorders keys). */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as object)
      .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function canonicalNoticeText(notice: PrivacyNotice): string {
  return stableStringify({
    version: notice.version,
    title: notice.title,
    summary: notice.summary,
    sections: notice.sections,
    acknowledgements: notice.acknowledgements,
  });
}

/** SHA-256 of the canonical notice text (hex) – proves exactly which wording was acknowledged. */
export async function noticeFingerprint(notice: PrivacyNotice): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalNoticeText(notice));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
