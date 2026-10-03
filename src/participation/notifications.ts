/**
 * Email notifications.
 *
 * Emails are a nudge to sign in, never a copy of the content. They contain no
 * adjustment details, request text, replies, summaries or Director names (all
 * may be personal or health information, and email is less secure than
 * FocusiQ). Employee emails come from "Walter Geering". The Director email is
 * one daily summary of counts with no employee names.
 *
 * The wording here is mirrored by the SQL in
 * 20261002090900_focusiq_notifications.sql – keep the two in step
 * (tests/notifications.test.ts checks the fixed wording appears in the SQL).
 *
 * Pure: no engine imports.
 */
import { DEFAULT_DAY_SETTINGS, type DayPlan, type DaySettings, type PersonReadiness, type Room } from './readiness.js';

export type EmployeeNotificationKind =
  | 'adjustment_decided'
  | 'request_reply'
  | 'request_extended'
  | 'request_closed'
  | 'summary_released'
  | 'day_invitation'
  | 'day_updated'
  | 'acknowledgement_reminder';
export type NotificationKind = EmployeeNotificationKind | 'director_digest';

export const NOTIFICATION_KIND_LABELS: Record<NotificationKind, string> = {
  adjustment_decided: 'Adjustment decision',
  request_reply: 'Reply to a question or request',
  request_extended: 'Request response date extended',
  request_closed: 'Question or request closed',
  summary_released: 'Summary ready',
  day_invitation: 'Assessment day invitation',
  day_updated: 'Assessment day change',
  acknowledgement_reminder: 'Acknowledgement reminder',
  director_digest: 'Director daily summary',
};

export type NotificationStatus = 'pending' | 'sent' | 'cancelled' | 'failed' | 'skipped';

export interface Notification {
  id: string;
  kind: NotificationKind;
  /** Employee id for employee emails, Director user id for the daily summary. */
  recipientId: string;
  recipientName: string;
  audience: 'employee' | 'director';
  subject: string;
  /** Plain text. `{{link}}` is replaced with the FocusiQ address when sent. */
  text: string;
  /** Repeat updates about the same thing replace a pending email instead of adding another. */
  coalesceKey: string;
  createdAt: string;
  status: NotificationStatus;
  sentAt: string | null;
  attempts: number;
  /** Why it was cancelled, skipped or failed. */
  note: string | null;
  /** e.g. the booking a day email was about, to tell whether it changed. */
  context?: Record<string, string>;
}

/** The token replaced with the employee or Director app address at send time. */
export const LINK_TOKEN = '{{link}}';

export const EMAIL_FOOTER =
  'This is an automatic message from FocusiQ at Walter Geering. Replies to this email are not monitored: please use "Questions or concerns" in FocusiQ instead.';

/** Fixed wording per employee email (the day emails add the booking details). */
export const EMPLOYEE_TEMPLATES: Record<Exclude<EmployeeNotificationKind, 'day_invitation' | 'day_updated'>, { subject: string; line: string }> = {
  adjustment_decided: {
    subject: 'Your FocusiQ adjustment request has been reviewed',
    line: 'Walter Geering has reviewed your adjustment request for the FocusiQ assessment. Sign in to FocusiQ to see the outcome:',
  },
  request_reply: {
    subject: 'New reply to your FocusiQ question or request',
    line: 'Walter Geering has replied to your question or request. Sign in to FocusiQ to read the reply:',
  },
  request_extended: {
    subject: 'Update on your FocusiQ request',
    line: 'Walter Geering needs more time to respond fully to your request. Sign in to FocusiQ to see the new response date and the reason:',
  },
  request_closed: {
    subject: 'Your FocusiQ question or request has been closed',
    line: 'Walter Geering has closed your question or request. Sign in to FocusiQ to read the final message:',
  },
  summary_released: {
    subject: 'Your FocusiQ summary is ready',
    line: 'Your FocusiQ summary is ready to read. Sign in to FocusiQ to see it:',
  },
  acknowledgement_reminder: {
    subject: 'Please complete your FocusiQ acknowledgement',
    line: 'Before your FocusiQ assessment, please read the privacy notice and complete the short acknowledgement form. It takes about 5 minutes:',
  },
};

export const DAY_ACKNOWLEDGE_LINE = 'Before the day, please read the privacy notice and complete the acknowledgement in FocusiQ:';
export const DAY_CHANGES_LINE = 'If you can’t make this time, please let your manager know.';

export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

const body = (name: string, lines: string[]) =>
  [name.trim() ? `Hello ${firstName(name)},` : 'Hello,', '', ...lines, '', EMAIL_FOOTER].join('\n');

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
/** "Monday 5 October 2026" from "2026-10-05" (matches SQL to_char 'FMDay FMDD FMMonth YYYY'). */
export function dayDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dow = new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay();
  return `${DAYS[dow]} ${d} ${MONTHS[m! - 1]} ${y}`;
}

export interface DayBooking {
  date: string;
  start: string;
  end: string;
  room: string;
  /** Expected minutes, including settling in and any agreed extra time. */
  minutes: number;
  acknowledged: boolean;
}

export function employeeEmail(
  kind: EmployeeNotificationKind,
  name: string,
  booking?: DayBooking,
): { subject: string; text: string } {
  if (kind === 'day_invitation' || kind === 'day_updated') {
    if (!booking) throw new Error('A day email needs the booking.');
    const when = `${dayDate(booking.date)}, ${booking.start}`;
    const lines = [
      kind === 'day_updated' ? 'Your FocusiQ assessment time has changed. Your new booking is:' : 'Your FocusiQ assessment is booked:',
      '',
      `When: ${dayDate(booking.date)}, ${booking.start} to ${booking.end}`,
      `Where: ${booking.room}`,
      `Allow: about ${booking.minutes} minutes, including time to settle in`,
      '',
      'A computer will be ready for you. There is nothing to prepare.',
      DAY_CHANGES_LINE,
    ];
    if (!booking.acknowledged) lines.push('', DAY_ACKNOWLEDGE_LINE, LINK_TOKEN);
    return { subject: `${kind === 'day_updated' ? 'Updated: your' : 'Your'} FocusiQ assessment: ${when}`, text: body(name, lines) };
  }
  const t = EMPLOYEE_TEMPLATES[kind];
  return { subject: t.subject, text: body(name, [t.line, LINK_TOKEN]) };
}

// ---------------------------------------------------------------------------
// Director daily summary
// ---------------------------------------------------------------------------
export interface DigestCounts {
  pendingAdjustments: number;
  overdueRequests: number;
  /** Open questions or requests due within the next 7 days (not overdue). */
  dueSoonRequests: number;
  /** The next assessment day within 3 days, if any. */
  upcomingDay: { date: string; notReady: number } | null;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Lines of the daily summary; empty when nothing needs attention. */
export function digestLines(c: DigestCounts): string[] {
  const lines: string[] = [];
  if (c.pendingAdjustments) lines.push(`${plural(c.pendingAdjustments, 'adjustment request', 'adjustment requests')} awaiting a decision`);
  if (c.overdueRequests) lines.push(`${plural(c.overdueRequests, 'question or request', 'questions or requests')} overdue`);
  if (c.dueSoonRequests) lines.push(`${plural(c.dueSoonRequests, 'question or request', 'questions or requests')} due within 7 days`);
  if (c.upcomingDay && c.upcomingDay.notReady > 0) {
    lines.push(`Assessment day on ${dayDate(c.upcomingDay.date)}: ${plural(c.upcomingDay.notReady, 'person', 'people')} not ready yet`);
  }
  return lines;
}

/** Directors are greeted with a plain "Hello," (no names are held for them). */
export function directorDigest(c: DigestCounts): { subject: string; text: string } | null {
  const lines = digestLines(c);
  if (!lines.length) return null;
  return {
    subject: `FocusiQ: ${plural(lines.length, 'thing needs', 'things need')} your attention`,
    text: body('', ['Today in FocusiQ:', '', ...lines.map((l) => `- ${l}`), '', 'Sign in to the FocusiQ dashboard to deal with them:', LINK_TOKEN]),
  };
}

// ---------------------------------------------------------------------------
// Safeguard
// ---------------------------------------------------------------------------
const PRONOUNS = /\b(he|she|him|her|his|hers|himself|herself)\b/i;

/** Throws if an email could leak content: other people's names or quoted text, or uses gendered pronouns. */
export function assertSafeEmail(text: string, forbidden: readonly string[] = []): void {
  if (PRONOUNS.test(text)) throw new Error('Emails must not use gendered pronouns.');
  for (const f of forbidden) {
    if (f.trim().length >= 3 && text.toLowerCase().includes(f.trim().toLowerCase())) {
      throw new Error('Emails must not contain names or the content of requests, replies or summaries.');
    }
  }
}

// ---------------------------------------------------------------------------
// Outbox (mirrors the SQL triggers and functions)
// ---------------------------------------------------------------------------
let seq = 0;
const newId = () => globalThis.crypto?.randomUUID?.() ?? `n${Date.now()}-${++seq}`;

export interface QueueInput {
  kind: NotificationKind;
  recipientId: string;
  recipientName: string;
  subject: string;
  text: string;
  coalesceKey: string;
  context?: Record<string, string>;
}

/**
 * Adds a notification. A pending email with the same coalesce key is replaced
 * (so three quick replies send one email); sent ones are kept as history.
 */
export function queueNotification(outbox: readonly Notification[], input: QueueInput, now: Date): Notification[] {
  const audience = input.kind === 'director_digest' ? 'director' : 'employee';
  const pending = outbox.find((n) => n.coalesceKey === input.coalesceKey && n.status === 'pending');
  if (pending) {
    return outbox.map((n) => (n === pending ? { ...n, ...input, audience, createdAt: now.toISOString() } : n));
  }
  const n: Notification = {
    ...input,
    id: newId(),
    audience,
    createdAt: now.toISOString(),
    status: 'pending',
    sentAt: null,
    attempts: 0,
    note: null,
  };
  return [n, ...outbox];
}

/** Cancels a pending email, e.g. a summary withdrawn before its email was sent. */
export function cancelPending(outbox: readonly Notification[], coalesceKey: string, note: string): Notification[] {
  return outbox.map((n) => (n.coalesceKey === coalesceKey && n.status === 'pending' ? { ...n, status: 'cancelled', note } : n));
}

/** Days between reminders to acknowledge, so nobody is nagged. */
export const REMINDER_COOLDOWN_DAYS = 3;

export function recentlyReminded(outbox: readonly Notification[], employeeId: string, now: Date): boolean {
  return outbox.some(
    (n) =>
      n.kind === 'acknowledgement_reminder' &&
      n.recipientId === employeeId &&
      n.status !== 'cancelled' &&
      now.getTime() - Date.parse(n.sentAt ?? n.createdAt) < REMINDER_COOLDOWN_DAYS * 86_400_000,
  );
}

export function markSent(outbox: readonly Notification[], ids: readonly string[], now: Date): Notification[] {
  const set = new Set(ids);
  return outbox.map((n) => (set.has(n.id) && n.status === 'pending' ? { ...n, status: 'sent', sentAt: now.toISOString(), attempts: n.attempts + 1 } : n));
}

/** Coalesce keys, shared with the SQL. */
export const coalesceKeys = {
  adjustment: (requestId: string) => `adjustment:${requestId}`,
  request: (requestId: string) => `request:${requestId}`,
  summary: (employeeId: string) => `summary:${employeeId}`,
  day: (dayId: string, employeeId: string) => `day:${dayId}:${employeeId}`,
  reminder: (employeeId: string) => `ack-reminder:${employeeId}`,
  digest: (userId: string, date: string) => `digest:${userId}:${date}`,
};

// ---------------------------------------------------------------------------
// Assessment day invitations (mirrors send_assessment_day_invitations())
// ---------------------------------------------------------------------------
const roomName = (s: DaySettings, r: Room) => s.rooms?.[r]?.trim() || DEFAULT_DAY_SETTINGS.rooms[r];

export type InviteOutcome = 'invite' | 'update' | 'unchanged' | 'objection_open';

export interface PlannedInvite {
  employeeId: string;
  name: string;
  outcome: InviteOutcome;
  booking: DayBooking;
  coalesceKey: string;
}

/**
 * What sending invitations now would do for each planned person: a new
 * invitation, an update (only if an earlier booking was actually sent),
 * nothing (booking unchanged), or no invitation while an objection is open.
 */
export function planInvitations(
  people: readonly PersonReadiness[],
  plan: DayPlan,
  settings: DaySettings,
  dayId: string,
  outbox: readonly Notification[],
): PlannedInvite[] {
  const out: PlannedInvite[] = [];
  for (const p of people) {
    const id = p.employee.employeeId;
    const session = plan.sessions.find((s) => s.number === plan.assignment[id]);
    if (!session) continue;
    const booking: DayBooking = {
      date: settings.date,
      start: session.start,
      end: session.end,
      room: roomName(settings, p.needs.quietRoom ? 'quiet' : 'main'),
      minutes: p.expectedMinutes,
      acknowledged: !p.actions.some((a) => a.code === 'no_acknowledgement' || a.code === 'notice_updated'),
    };
    const coalesceKey = coalesceKeys.day(dayId, id);
    const base = { employeeId: id, name: p.employee.name, booking, coalesceKey };
    if (p.actions.some((a) => a.code === 'objection_open')) {
      out.push({ ...base, outcome: 'objection_open' });
      continue;
    }
    const previous = outbox.filter((n) => n.coalesceKey === coalesceKey && (n.status === 'pending' || n.status === 'sent'));
    const latest = previous.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    const same =
      latest?.context &&
      latest.context.date === booking.date &&
      latest.context.start === booking.start &&
      latest.context.end === booking.end &&
      latest.context.room === booking.room;
    if (same) out.push({ ...base, outcome: 'unchanged' });
    else out.push({ ...base, outcome: previous.some((n) => n.status === 'sent') ? 'update' : 'invite' });
  }
  return out;
}
