import { readFileSync } from 'node:fs';
import { describe as suite, expect, it } from 'vitest';
import {
  DAY_ACKNOWLEDGE_LINE,
  DAY_CHANGES_LINE,
  EMAIL_FOOTER,
  EMPLOYEE_TEMPLATES,
  LINK_TOKEN,
  assertSafeEmail,
  cancelPending,
  coalesceKeys,
  dayDate,
  digestLines,
  directorDigest,
  employeeEmail,
  markSent,
  queueNotification,
  recentlyReminded,
  DEFAULT_DAY_SETTINGS,
  assessReadiness,
  planDay,
  planInvitations,
  type DaySettings,
  type EmployeeNotificationKind,
  type Notification,
} from '../src/participation/index.js';

const SQL = ['20261002090900_focusiq_notifications.sql', '20261002091000_focusiq_resend_delivery.sql', '20261005090000_focusiq_invitations_and_completion.sql']
  .map((f) => readFileSync(new URL(`../supabase/migrations/${f}`, import.meta.url), 'utf8'))
  .join('\n');
const NOW = new Date('2026-10-03T09:00:00Z');
const booking = { date: '2026-10-05', start: '09:30', end: '10:15', room: 'Boardroom', minutes: 29, acknowledged: true };

suite('notification emails', () => {
  it('say only that there is an update, from Walter Geering, with a sign-in link', () => {
    const kinds = Object.keys(EMPLOYEE_TEMPLATES) as EmployeeNotificationKind[];
    for (const kind of kinds) {
      const { subject, text } = employeeEmail(kind, 'Grace Okafor');
      expect(text.startsWith('Hello Grace,\n\n')).toBe(true);
      expect(text).toContain(LINK_TOKEN);
      expect(text.endsWith(EMAIL_FOOTER)).toBe(true);
      expect(subject).toMatch(/FocusiQ/);
      expect(text).not.toContain('Okafor');
      assertSafeEmail(text);
    }
    expect(employeeEmail('request_reply', 'Grace Okafor').text).toMatch(/^Hello Grace,\n\nWalter Geering has replied/);
  });

  it('day emails give the booking, and ask for the acknowledgement only when it is missing', () => {
    const invite = employeeEmail('day_invitation', 'Grace Okafor', booking);
    expect(invite.subject).toBe('Your FocusiQ assessment: Monday 5 October 2026, 09:30');
    expect(invite.text).toContain('When: Monday 5 October 2026, 09:30 to 10:15\nWhere: Boardroom\nAllow: about 29 minutes, including time to settle in');
    expect(invite.text).not.toContain(LINK_TOKEN);
    const unacknowledged = employeeEmail('day_invitation', 'Grace Okafor', { ...booking, acknowledged: false });
    expect(unacknowledged.text).toContain(`${DAY_ACKNOWLEDGE_LINE}\n${LINK_TOKEN}`);
    expect(employeeEmail('day_updated', 'Grace Okafor', booking).subject).toBe('Updated: your FocusiQ assessment: Monday 5 October 2026, 09:30');
    expect(() => employeeEmail('day_invitation', 'Grace Okafor')).toThrow();
  });

  it('the Director summary lists counts only, and is not sent when there is nothing to do', () => {
    expect(directorDigest({ pendingAdjustments: 0, overdueRequests: 0, dueSoonRequests: 0, upcomingDay: null, undeliveredEmails: 0 })).toBeNull();
    expect(digestLines({ pendingAdjustments: 1, overdueRequests: 2, dueSoonRequests: 1, upcomingDay: { date: '2026-10-05', notReady: 1 }, undeliveredEmails: 3 })).toEqual([
      '1 adjustment request awaiting a decision',
      '2 questions or requests overdue',
      '1 question or request due within 7 days',
      'Assessment day on Monday 5 October 2026: 1 person not ready yet',
      '3 emails not delivered in the last 7 days',
    ]);
    const d = directorDigest({ pendingAdjustments: 2, overdueRequests: 0, dueSoonRequests: 0, upcomingDay: { date: '2026-10-05', notReady: 0 }, undeliveredEmails: 0 })!;
    expect(d.subject).toBe('FocusiQ: 1 thing needs your attention');
    expect(d.text).toMatch(/^Hello,\n\nToday in FocusiQ:\n\n- 2 adjustment requests awaiting a decision\n\nSign in/);
  });

  it('keeps the wording in step with the SQL', () => {
    for (const t of Object.values(EMPLOYEE_TEMPLATES)) {
      expect(SQL).toContain(`'${t.subject}'`);
      expect(SQL).toContain(`'${t.line}'`);
    }
    for (const line of [EMAIL_FOOTER, DAY_ACKNOWLEDGE_LINE, DAY_CHANGES_LINE, 'Your FocusiQ assessment is booked:', 'Your FocusiQ assessment time has changed. Your new booking is:',
      'A computer will be ready for you. There is nothing to prepare.', 'Today in FocusiQ:', 'Sign in to the FocusiQ dashboard to deal with them:',
      ' awaiting a decision', ' overdue', ' due within 7 days', ' not ready yet', ' minutes, including time to settle in', ' not delivered in the last 7 days']) {
      expect(SQL).toContain(line);
    }
    expect(SQL).toContain("to_char(d, 'FMDay FMDD FMMonth YYYY')");
    expect(dayDate('2026-12-25')).toBe('Friday 25 December 2026');
    // Coalesce keys match the SQL triggers.
    expect(coalesceKeys.adjustment('r1')).toBe('adjustment:r1');
    expect(SQL).toContain("'adjustment:' || new.request_id");
    expect(SQL).toContain("'request:' || new.request_id");
    expect(SQL).toContain("'summary:' || new.employee_id");
    expect(SQL).toContain("'ack-reminder:' || e.id");
    expect(coalesceKeys.invitation('e1')).toBe('invite:e1');
    expect(SQL).toContain("'invite:' || e.id");
    expect(coalesceKeys.completed('a1')).toBe('completed:a1');
    expect(SQL).toContain("'completed:' || new.id");
    for (const line of [' completed since the last summary', 'FocusiQ: daily summary', 'Sign in to the FocusiQ dashboard to see more:']) expect(SQL).toContain(line);
  });

  it('adds completions to the daily summary as information, not action', () => {
    const none = { pendingAdjustments: 0, overdueRequests: 0, dueSoonRequests: 0, upcomingDay: null, undeliveredEmails: 0 };
    const only = directorDigest({ ...none, completedSinceLast: 4 })!;
    expect(only.subject).toBe('FocusiQ: daily summary');
    expect(only.text).toContain('- 4 assessments completed since the last summary\n\nSign in to the FocusiQ dashboard to see more:');
    const both = directorDigest({ ...none, pendingAdjustments: 1, completedSinceLast: 1 })!;
    expect(both.subject).toBe('FocusiQ: 1 thing needs your attention');
    expect(both.text).toContain('- 1 adjustment request awaiting a decision\n- 1 assessment completed since the last summary\n\nSign in to the FocusiQ dashboard to deal with them:');
  });

  it('refuses pronouns and content in emails', () => {
    expect(() => assertSafeEmail('Tell her the result')).toThrow(/pronouns/);
    expect(() => assertSafeEmail('Hello,\nElla Foster asked for a quiet room', ['Ella Foster', 'asked for a quiet room'])).toThrow(/content/);
    expect(() => assertSafeEmail('Hello Grace,', ['Ella Foster'])).not.toThrow();
  });
});

suite('notification outbox', () => {
  const input = (kind: Notification['kind'], key: string, subject = 's') => ({ kind, recipientId: 'e1', recipientName: 'Grace Okafor', subject, text: 't', coalesceKey: key });

  it('repeat updates replace a pending email; sent ones are kept', () => {
    let box = queueNotification([], input('request_reply', 'request:r1', 'first'), NOW);
    box = queueNotification(box, input('request_closed', 'request:r1', 'second'), NOW);
    expect(box).toHaveLength(1);
    expect(box[0]).toMatchObject({ kind: 'request_closed', subject: 'second', status: 'pending', audience: 'employee' });
    box = markSent(box, [box[0]!.id], NOW);
    box = queueNotification(box, input('request_reply', 'request:r1', 'third'), NOW);
    expect(box.map((n) => [n.subject, n.status])).toEqual([['third', 'pending'], ['second', 'sent']]);
  });

  it('cancels a pending summary email when the summary is withdrawn', () => {
    let box = queueNotification([], input('summary_released', 'summary:e1'), NOW);
    box = cancelPending(box, 'summary:e1', 'Summary withdrawn before the email was sent');
    expect(box[0]).toMatchObject({ status: 'cancelled', note: 'Summary withdrawn before the email was sent' });
  });

  it('reminds at most once every 3 days', () => {
    const box = queueNotification([], input('acknowledgement_reminder', 'ack-reminder:e1'), new Date('2026-10-01T09:00:00Z'));
    expect(recentlyReminded(box, 'e1', NOW)).toBe(true);
    expect(recentlyReminded(box, 'e1', new Date('2026-10-04T09:01:00Z'))).toBe(false);
    expect(recentlyReminded(box, 'e2', NOW)).toBe(false);
  });
});

suite('assessment day invitations', () => {
  const settings: DaySettings = { ...DEFAULT_DAY_SETTINGS, date: '2026-10-05' };
  const emp = (employeeId: string, name: string) => ({ employeeId, name, department: 'Sales', jobRole: 'Role', status: 'active' as const });
  const { people } = assessReadiness(
    {
      employees: [emp('a', 'Grace Okafor'), emp('b', 'Zara Ali'), emp('c', 'Noah Bennett')],
      currentNoticeVersion: 'v1',
      acknowledgements: [{ employeeId: 'a', noticeVersion: 'v1', detailsCorrect: true, acknowledgedAt: '2026-10-01T00:00:00Z' }],
      adjustments: [],
      rightsRequests: [{ employeeId: 'b', type: 'objection', status: 'open', createdAt: '2026-10-01T00:00:00Z' }],
    },
    settings,
  );

  it('invites, skips open objections, and only sends updates for changed bookings that went out', () => {
    const plan = planDay(people, settings);
    let invites = planInvitations(people, plan, settings, 'day1', []);
    expect(invites.map((i) => [i.employeeId, i.outcome])).toEqual([['a', 'invite'], ['b', 'objection_open'], ['c', 'invite']]);
    expect(invites.find((i) => i.employeeId === 'c')!.booking).toMatchObject({ room: 'Main assessment room', acknowledged: false, minutes: 25 });

    let box: Notification[] = [];
    for (const i of invites.filter((i) => i.outcome === 'invite')) {
      box = queueNotification(box, { kind: 'day_invitation', recipientId: i.employeeId, recipientName: i.name, coalesceKey: i.coalesceKey, context: { date: i.booking.date, start: i.booking.start, end: i.booking.end, room: i.booking.room }, ...employeeEmail('day_invitation', i.name, i.booking) }, NOW);
    }
    invites = planInvitations(people, plan, settings, 'day1', box);
    expect(invites.map((i) => i.outcome)).toEqual(['unchanged', 'objection_open', 'unchanged']);

    // Not yet sent and moved: still a first invitation (the pending one is replaced).
    const later = { ...settings, firstStart: '13:00' };
    expect(planInvitations(people, planDay(people, later), later, 'day1', box).map((i) => i.outcome)).toEqual(['invite', 'objection_open', 'invite']);
    // Sent and moved: an update.
    box = markSent(box, box.map((n) => n.id), NOW);
    expect(planInvitations(people, planDay(people, later), later, 'day1', box).map((i) => i.outcome)).toEqual(['update', 'objection_open', 'update']);
  });
});
