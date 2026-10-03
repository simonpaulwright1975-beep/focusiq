/**
 * DEMO email outbox for the Director dashboard, kept in this browser's
 * localStorage. Nothing is emailed. Production: notification_outbox, filled by
 * database triggers and sent by the send-notifications Edge Function.
 * Director app only.
 */
import {
  cancelPending,
  employeeEmail,
  markSent,
  queueNotification,
  type DayBooking,
  type DeliveryStatus,
  type EmployeeNotificationKind,
  type Notification,
  type QueueInput,
} from '../../../src/participation/index.js';

const KEY = 'focusiq-demo-outbox';
const CHANGED = 'focusiq-outbox-changed';

export function listOutbox(): Notification[] {
  try {
    return (JSON.parse(localStorage.getItem(KEY) ?? '[]') as Notification[]) ?? [];
  } catch {
    return [];
  }
}

function save(all: Notification[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* demo only */
  }
  window.dispatchEvent(new Event(CHANGED));
}

export function queue(input: QueueInput) {
  save(queueNotification(listOutbox(), input, new Date()));
}

/** Mirrors the database triggers: one email per update, content-free. */
export function notifyEmployee(kind: Exclude<EmployeeNotificationKind, 'day_invitation' | 'day_updated'>, employeeId: string, name: string, coalesceKey: string) {
  queue({ kind, recipientId: employeeId, recipientName: name, coalesceKey, ...employeeEmail(kind, name) });
}

export function queueDayEmail(kind: 'day_invitation' | 'day_updated', employeeId: string, name: string, coalesceKey: string, booking: DayBooking) {
  queue({
    kind,
    recipientId: employeeId,
    recipientName: name,
    coalesceKey,
    context: { date: booking.date, start: booking.start, end: booking.end, room: booking.room },
    ...employeeEmail(kind, name, booking),
  });
}

export function cancel(coalesceKey: string, note: string) {
  save(cancelPending(listOutbox(), coalesceKey, note));
}

/** Demo stand-in for the sender: marks every waiting email as sent. */
export function markAllSent() {
  const all = listOutbox();
  save(markSent(all, all.filter((n) => n.status === 'pending').map((n) => n.id), new Date()));
}

/** Demo stand-in for Resend's delivery webhooks. */
export function setDelivery(id: string, status: DeliveryStatus) {
  save(listOutbox().map((n) => (n.id === id && n.status === 'sent' ? { ...n, deliveryStatus: status } : n)));
}

export function resetOutbox() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(CHANGED));
}

export function subscribeOutbox(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => e.key === KEY && onChange();
  window.addEventListener('storage', onStorage);
  window.addEventListener(CHANGED, onChange);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(CHANGED, onChange);
  };
}
