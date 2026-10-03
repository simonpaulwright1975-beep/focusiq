/**
 * Notifications: what FocusiQ emails, the outbox, and the Director daily
 * summary. Emails never carry content: they ask people to sign in.
 */
import { useMemo, useState } from 'react';
import {
  NOTIFICATION_KIND_LABELS,
  coalesceKeys,
  directorDigest,
  dueState,
  employeeEmail,
  type DigestCounts,
  type EmployeeNotificationKind,
  type Notification,
  type NotificationStatus,
} from '../../../src/participation/index.js';
import { Modal } from '../components/Modal.js';
import { Card } from '../components/ui.js';
import { markAllSent, queue } from '../demo/outboxStore.js';
import { readJson, writeJson } from '../shared/participationStore.js';
import { useStore } from '../state.js';
import { currentDaySettings, localDate, useNow, useOutbox, useReadiness } from './dayData.js';
import { EmailPreview } from './EmailPreview.js';

const DIGEST_PREF_KEY = 'focusiq-demo-digest';

const STATUS: Record<NotificationStatus, { cls: string; label: string }> = {
  pending: { cls: 'tag tag-amber', label: '● Waiting to send' },
  sent: { cls: 'tag tag-green', label: '✓ Sent' },
  cancelled: { cls: 'tag', label: '✕ Cancelled' },
  skipped: { cls: 'tag', label: '– Not sent' },
  failed: { cls: 'tag tag-red', label: '⚠ Failed' },
};

type Filter = 'all' | 'pending' | 'sent' | 'not_sent';

const WHEN: { kind: EmployeeNotificationKind; when: string }[] = [
  { kind: 'adjustment_decided', when: 'A Director decides or changes an adjustment request' },
  { kind: 'request_reply', when: 'A Director replies to a question or request (not internal notes)' },
  { kind: 'request_extended', when: 'The response date of a request is extended' },
  { kind: 'request_closed', when: 'A question or request is closed' },
  { kind: 'summary_released', when: 'A Director releases a summary (cancelled if withdrawn before it is sent)' },
  { kind: 'day_invitation', when: 'A Director emails invitations from Assessment day' },
  { kind: 'day_updated', when: 'A sent booking changes and invitations are emailed again' },
  { kind: 'acknowledgement_reminder', when: 'A Director emails reminders from Assessment day (at most every 3 days)' },
];

const SAMPLE_BOOKING = { date: '2026-10-05', start: '09:30', end: '10:15', room: 'Main assessment room', minutes: 25, acknowledged: false };

const dateTime = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function NotificationsView() {
  const { actor } = useStore();
  const now = useNow();
  const outbox = useOutbox();
  const settings = useMemo(currentDaySettings, []);
  const { people, adjustments, rightsRequests } = useReadiness(settings, now);
  const [filter, setFilter] = useState<Filter>('all');
  const [preview, setPreview] = useState<{ subject: string; text: string; to?: string } | null>(null);
  const [digestOn, setDigestOn] = useState(() => readJson<boolean>(DIGEST_PREF_KEY) ?? true);

  const today = localDate(now);
  const daysToDay = Math.round((Date.parse(`${settings.date}T12:00:00`) - Date.parse(`${today}T12:00:00`)) / 86_400_000);
  const counts: DigestCounts = {
    pendingAdjustments: adjustments.filter((r) => r.status === 'pending').length,
    overdueRequests: rightsRequests.filter((r) => dueState(r, now).state === 'overdue').length,
    dueSoonRequests: rightsRequests.filter((r) => dueState(r, now).state === 'due_soon').length,
    upcomingDay: daysToDay >= 0 && daysToDay <= 3 ? { date: settings.date, notReady: people.filter((p) => !p.ready).length } : null,
  };
  const digest = directorDigest(counts);
  const digestKey = coalesceKeys.digest(actor.id, today);
  const digestQueued = outbox.some((n) => n.coalesceKey === digestKey);

  const shown = outbox.filter(
    (n) =>
      filter === 'all' ||
      (filter === 'pending' && n.status === 'pending') ||
      (filter === 'sent' && n.status === 'sent') ||
      (filter === 'not_sent' && ['cancelled', 'skipped', 'failed'].includes(n.status)),
  );
  const waiting = outbox.filter((n) => n.status === 'pending').length;

  return (
    <div className="stack">
      <Card
        title="Notifications"
        sub="FocusiQ emails people when something needs their attention. Emails never include request text, replies, adjustments, summaries or anyone else’s name: they ask people to sign in."
      >
        <div className="row">
          <span className="tag tag-amber">● Email sending not set up yet</span>
          <span className="small secondary">
            Emails wait here until an email service is connected (see docs/notifications.md). Demo: “Mark as sent” stands in for sending.
          </span>
        </div>
      </Card>

      <div className="grid cols-2">
        <Card title="Your daily summary" sub="One email each weekday at 08:00, only when something needs attention. Counts only, no names.">
          <label className="row small" style={{ marginBottom: 12 }}>
            <input
              type="checkbox"
              checked={digestOn}
              onChange={(e) => {
                setDigestOn(e.target.checked);
                writeJson(DIGEST_PREF_KEY, e.target.checked);
              }}
            />
            Email me the daily summary
          </label>
          {digest ? (
            <>
              <EmailPreview subject={digest.subject} text={digest.text} />
              <div className="row" style={{ marginTop: 12 }}>
                <button
                  className="btn secondary"
                  disabled={!digestOn || digestQueued}
                  onClick={() => queue({ kind: 'director_digest', recipientId: actor.id, recipientName: actor.name, coalesceKey: digestKey, ...digest })}
                >
                  {digestQueued ? 'Today’s summary queued' : 'Queue today’s summary (demo)'}
                </button>
                <span className="small muted">In production this runs on a schedule.</span>
              </div>
            </>
          ) : (
            <p className="small">✓ Nothing needs attention today, so no summary would be sent.</p>
          )}
        </Card>

        <Card title="What employees are emailed about" sub="Sent as Walter Geering. Every email links to FocusiQ, where the detail is.">
          <ul className="todo">
            {WHEN.map(({ kind, when }) => (
              <li key={kind}>
                <span>
                  <strong>{NOTIFICATION_KIND_LABELS[kind]}</strong>
                  <span className="muted"> · {when}</span>
                </span>
                <button className="btn link" onClick={() => setPreview({ ...employeeEmail(kind, 'Grace Okafor', SAMPLE_BOOKING), to: 'Grace Okafor (example)' })}>
                  Preview
                </button>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card
        title="Outbox"
        sub={`${waiting} waiting to send · ${outbox.length} in total`}
        actions={
          <div className="row">
            {([['all', 'All'], ['pending', 'Waiting'], ['sent', 'Sent'], ['not_sent', 'Not sent']] as [Filter, string][]).map(([f, label]) => (
              <button key={f} className={filter === f ? 'chip sel' : 'chip'} aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {label}
              </button>
            ))}
            <button className="btn secondary" disabled={waiting === 0} onClick={markAllSent}>Mark as sent (demo)</button>
          </div>
        }
      >
        {shown.length === 0 ? (
          <p className="small muted">
            {outbox.length === 0
              ? 'No emails yet. They are queued when a Director decides an adjustment, replies to or closes a request, releases a summary, or emails invitations or reminders.'
              : 'Nothing here.'}
          </p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Queued</th>
                  <th>To</th>
                  <th>About</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {shown.map((n: Notification) => (
                  <tr key={n.id}>
                    <td className="small">{dateTime(n.createdAt)}</td>
                    <td>{n.audience === 'director' ? `${n.recipientName} (Director)` : n.recipientName}</td>
                    <td>
                      {NOTIFICATION_KIND_LABELS[n.kind]}
                      <div className="small muted">{n.subject}</div>
                    </td>
                    <td>
                      <span className={STATUS[n.status].cls}>{STATUS[n.status].label}</span>
                      {n.sentAt && <div className="small muted">{dateTime(n.sentAt)}</div>}
                      {n.note && <div className="small muted">{n.note}</div>}
                    </td>
                    <td><button className="btn link" onClick={() => setPreview({ subject: n.subject, text: n.text, to: n.recipientName })}>Preview</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="small muted" style={{ marginBottom: 0 }}>
          Several updates about the same thing before an email goes out are merged into one email.
        </p>
      </Card>

      {preview && (
        <Modal title="Email preview" onClose={() => setPreview(null)}>
          <EmailPreview {...preview} />
          <div className="actions"><button className="btn" onClick={() => setPreview(null)}>Close</button></div>
        </Modal>
      )}
    </div>
  );
}
