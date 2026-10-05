/**
 * Staff tab data: the WG staff directory and who is in FocusiQ.
 *
 * Live: focusiq.staff_directory(), link_staff(), invite_staff(),
 * staff_invitations() and sync_staff_directory() (Directors only; see
 * 20261002091200 and 20261005090000). Demo: a made-up directory kept in this
 * browser; invitations go to the demo outbox on the Notifications tab.
 *
 * Logins are never created here: new starters are set up in the Hub, which
 * adds them to the staff directory and sends their WG login invitation.
 */
import { DEPARTMENTS, type Department } from '../../../src/benchmarking/index.js';
import { coalesceKeys } from '../../../src/participation/index.js';
import { listOutbox, notifyEmployee } from '../demo/outboxStore.js';
import type { DemoData } from '../demo/dataset.js';
import { check, db, LIVE } from '../shared/supabase.js';

export { DEPARTMENTS };
export type { Department };

export interface StaffRow {
  staffId: string;
  fullName: string;
  jobTitle: string | null;
  isActive: boolean;
  /** Has a WG login (set up in the Hub). */
  hasLogin: boolean;
  directoryStartDate: string | null;
  /** FocusiQ record, once added. */
  employeeId: string | null;
  department: string | null;
  startDate: string | null;
  status: string | null;
  lastInvitedAt: string | null;
  invitationStatus: string | null;
  /** Latest assessment: not started, in progress, or completed (with when). */
  assessment?: { status: 'not_started' | 'in_progress' | 'completed'; at: string | null };
}

export type InviteResult = 'invited' | 'recently_invited' | 'no_login' | 'not_active';

export interface StaffSource {
  live: boolean;
  list(): Promise<StaffRow[]>;
  add(staffId: string, department: Department, startDate: string | null): Promise<string>;
  invite(employeeId: string): Promise<InviteResult>;
  /** Live only: bring names, logins and leavers up to date now (it also runs nightly). */
  sync?(): Promise<Record<string, number>>;
}

// ---------------------------------------------------------------------------
// Live
// ---------------------------------------------------------------------------
interface DirectoryRow {
  staff_id: string; full_name: string; job_title: string | null; is_active: boolean; has_login: boolean;
  directory_start_date: string | null; employee_id: string | null; department: string | null; start_date: string | null; status: string | null;
}

const liveSource: StaffSource = {
  live: true,
  async list() {
    const rows = check(await db().rpc('staff_directory')) as DirectoryRow[];
    const invites = check(await db().rpc('staff_invitations')) as { employee_id: string; last_invited_at: string; invitation_status: string }[];
    const byEmployee = new Map(invites.map((i) => [i.employee_id, i]));
    const assessments = check(
      await db().from('assessments').select('employee_id, complete, completed_at, started_at, created_at').order('created_at', { ascending: false }),
    ) as { employee_id: string; complete: boolean; completed_at: string | null; started_at: string | null }[];
    const latest = new Map<string, (typeof assessments)[number]>();
    for (const a of assessments) if (!latest.has(a.employee_id)) latest.set(a.employee_id, a);
    return rows.map((r) => ({
      staffId: r.staff_id,
      fullName: r.full_name,
      jobTitle: r.job_title,
      isActive: r.is_active,
      hasLogin: r.has_login,
      directoryStartDate: r.directory_start_date,
      employeeId: r.employee_id,
      department: r.department,
      startDate: r.start_date,
      status: r.status,
      lastInvitedAt: r.employee_id ? byEmployee.get(r.employee_id)?.last_invited_at ?? null : null,
      invitationStatus: r.employee_id ? byEmployee.get(r.employee_id)?.invitation_status ?? null : null,
      assessment: (() => {
        const a = r.employee_id ? latest.get(r.employee_id) : undefined;
        if (!a) return { status: 'not_started' as const, at: null };
        return a.complete ? { status: 'completed' as const, at: a.completed_at } : { status: 'in_progress' as const, at: a.started_at };
      })(),
    }));
  },
  async add(staffId, department, startDate) {
    return check(await db().rpc('link_staff', { p_staff_id: staffId, p_department: department, p_start_date: startDate })) as string;
  },
  async invite(employeeId) {
    return check(await db().rpc('invite_staff', { p_employee_id: employeeId })) as InviteResult;
  },
  async sync() {
    return check(await db().rpc('sync_staff_directory')) as Record<string, number>;
  },
};

// ---------------------------------------------------------------------------
// Demo
// ---------------------------------------------------------------------------
const KEY = 'focusiq-demo-staff';
const CHANGED = 'focusiq-staff-changed';

function readDemo(data: DemoData): StaffRow[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as StaffRow[];
  } catch {
    /* fall through to the seed */
  }
  return data.employees.map((e) => ({
    staffId: `dir-${e.id}`,
    fullName: e.displayName,
    jobTitle: e.role ?? null,
    isActive: e.status !== 'former',
    hasLogin: true,
    directoryStartDate: e.startDate,
    employeeId: e.id,
    department: e.department,
    startDate: e.startDate,
    status: e.status,
    lastInvitedAt: null,
    invitationStatus: null,
  }));
}

function writeDemo(rows: StaffRow[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(rows));
  } catch {
    /* demo only */
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CHANGED));
}

function demoSource(data: DemoData): StaffSource {
  return {
    live: false,
    async list() {
      const rows = readDemo(data);
      // Reflect sends from the demo outbox, and the demo's assessments.
      const box = listOutbox();
      const done = new Map<string, string>();
      for (const a of data.assessments) if (a.complete && (!done.has(a.employeeId) || done.get(a.employeeId)! < a.completedAt)) done.set(a.employeeId, a.completedAt);
      return rows.map((row) => {
        const r: StaffRow = row.employeeId
          ? { ...row, assessment: done.has(row.employeeId) ? { status: 'completed', at: done.get(row.employeeId)! } : { status: 'not_started', at: null } }
          : row;
        if (!r.employeeId) return r;
        const n = box.filter((x) => x.coalesceKey === coalesceKeys.invitation(r.employeeId!)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
        return n ? { ...r, lastInvitedAt: n.sentAt ?? n.createdAt, invitationStatus: n.status } : r;
      });
    },
    async add(staffId, department, startDate) {
      const rows = readDemo(data);
      const row = rows.find((r) => r.staffId === staffId);
      if (!row) throw new Error('That person is not in the staff directory.');
      if (row.employeeId) throw new Error('That person is already in FocusiQ.');
      const start = startDate ?? row.directoryStartDate;
      if (!start) throw new Error('Enter a start date: the staff directory does not have one.');
      const employeeId = `new-${staffId}`;
      writeDemo(rows.map((r) => (r.staffId === staffId ? { ...r, employeeId, department, startDate: start, status: 'active' } : r)));
      return employeeId;
    },
    async invite(employeeId) {
      const row = readDemo(data).find((r) => r.employeeId === employeeId);
      if (!row) throw new Error('That person is not in FocusiQ.');
      if (row.status !== 'active') return 'not_active';
      if (!row.hasLogin) return 'no_login';
      const key = coalesceKeys.invitation(employeeId);
      const recent = listOutbox().some(
        (n) => n.coalesceKey === key && (n.status === 'pending' || (n.status === 'sent' && Date.now() - Date.parse(n.sentAt ?? n.createdAt) < 3 * 86_400_000)),
      );
      if (recent) return 'recently_invited';
      notifyEmployee('focusiq_invitation', employeeId, row.fullName, key);
      window.dispatchEvent(new Event(CHANGED));
      return 'invited';
    },
  };
}

export function staffSource(data: DemoData): StaffSource {
  return LIVE ? liveSource : demoSource(data);
}

export function subscribeStaff(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => (e.key === KEY || e.key === null) && onChange();
  window.addEventListener('storage', onStorage);
  window.addEventListener(CHANGED, onChange);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(CHANGED, onChange);
  };
}

export function resetDemoStaff() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(CHANGED));
}
