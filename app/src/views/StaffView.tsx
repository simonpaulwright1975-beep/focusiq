/**
 * Staff: everyone in the WG staff directory, who is in FocusiQ, and invitations.
 * Directors add people (FocusiQ department and start date) and invite them.
 * Logins come from the Hub; FocusiQ never creates them.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal } from '../components/Modal.js';
import { Card } from '../components/ui.js';
import { useStore } from '../state.js';
import { DEPARTMENTS, resetDemoStaff, staffSource, subscribeStaff, type Department, type InviteResult, type StaffRow } from './staffData.js';
import { subscribeOutbox } from '../demo/outboxStore.js';

type Filter = 'not_added' | 'in_focusiq' | 'all';

const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

const INVITE_MESSAGE: Record<InviteResult, string> = {
  invited: 'Invitation email queued. It is sent within a minute.',
  recently_invited: 'An invitation was sent in the last 3 days (or is waiting to send), so another was not sent.',
  no_login: 'No Walter Geering login yet. Set one up in the Hub, then send the invitation.',
  not_active: 'This person is no longer active, so no invitation was sent.',
};

function InvitationCell({ row }: { row: StaffRow }) {
  if (!row.employeeId) return <span className="muted small">—</span>;
  if (!row.hasLogin) return <span className="tag tag-amber">⚠ No WG login yet</span>;
  if (!row.invitationStatus) return <span className="tag">Not invited</span>;
  if (row.invitationStatus === 'pending' || row.invitationStatus === 'sending') return <span className="tag tag-amber">● Waiting to send</span>;
  if (row.invitationStatus === 'sent') return <span className="tag tag-green">✓ Invited {row.lastInvitedAt ? shortDate(row.lastInvitedAt) : ''}</span>;
  return <span className="tag tag-red">⚠ Invitation not sent ({row.invitationStatus})</span>;
}

function AssessmentCell({ row }: { row: StaffRow }) {
  if (!row.employeeId || !row.assessment) return <span className="muted small">—</span>;
  if (row.assessment.status === 'completed') return <span className="tag tag-green">✓ Completed {row.assessment.at ? shortDate(row.assessment.at) : ''}</span>;
  if (row.assessment.status === 'in_progress') return <span className="tag tag-amber">● In progress</span>;
  return <span className="tag">Not started</span>;
}

export function StaffView() {
  const { demo } = useStore();
  const source = useMemo(() => staffSource(demo), [demo]);
  const [rows, setRows] = useState<StaffRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('not_added');
  const [adding, setAdding] = useState<StaffRow | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    source.list().then(
      (r) => { setRows(r); setError(null); },
      (e: Error) => setError(e.message),
    );
  }, [source]);
  useEffect(() => {
    load();
    const off1 = subscribeStaff(load);
    const off2 = subscribeOutbox(load);
    return () => { off1(); off2(); };
  }, [load]);

  const active = (rows ?? []).filter((r) => r.isActive);
  const notAdded = active.filter((r) => !r.employeeId);
  const inFocusiq = (rows ?? []).filter((r) => r.employeeId);
  const shown = filter === 'not_added' ? notAdded : filter === 'in_focusiq' ? inFocusiq : rows ?? [];

  const invite = async (row: StaffRow) => {
    setBusy(true);
    try {
      const r = await source.invite(row.employeeId!);
      setMessage(`${row.fullName}: ${INVITE_MESSAGE[r]}`);
      load();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const sync = async () => {
    if (!source.sync) return;
    setBusy(true);
    try {
      const r = await source.sync();
      setMessage(`Staff directory synced: ${r.details_updated ?? 0} details updated, ${r.logins_updated ?? 0} logins linked, ${r.left ?? 0} marked as left, ${r.returned ?? 0} returned.`);
      load();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <Card
        title="Staff"
        sub="Everyone in the Walter Geering staff directory. Add people to FocusiQ and invite them. New starters and logins are set up in the Hub."
        actions={
          <div className="row">
            {source.sync && <button className="btn secondary" disabled={busy} onClick={sync}>Sync with staff directory</button>}
            {!source.live && <button className="btn link" onClick={resetDemoStaff}>Reset demo staff</button>}
          </div>
        }
      >
        <div className="grid cols-3 staff-stats">
          <div><div className="lbl">In FocusiQ</div><div className="staff-num">{inFocusiq.filter((r) => r.status === 'active').length}</div></div>
          <div><div className="lbl">Not added yet</div><div className="staff-num">{notAdded.length}</div></div>
          <div><div className="lbl">Added, not invited</div><div className="staff-num">{inFocusiq.filter((r) => r.status === 'active' && r.hasLogin && !r.invitationStatus).length}</div></div>
          <div><div className="lbl">Assessments completed</div><div className="staff-num">{inFocusiq.filter((r) => r.status === 'active' && r.assessment?.status === 'completed').length}</div></div>
        </div>

        <div className="row" role="tablist" aria-label="Show" style={{ margin: '16px 0 8px' }}>
          {([['not_added', `Not added yet (${notAdded.length})`], ['in_focusiq', `In FocusiQ (${inFocusiq.length})`], ['all', `Everyone (${rows?.length ?? 0})`]] as const).map(([k, label]) => (
            <button key={k} role="tab" aria-selected={filter === k} className={filter === k ? 'chip sel' : 'chip'} onClick={() => setFilter(k)}>{label}</button>
          ))}
        </div>

        {message && <p className="tag-green staff-message" role="status">{message}</p>}
        {error && <p className="field-error" role="alert">{error}</p>}
        {!rows && !error && <p className="empty">Loading the staff directory…</p>}

        {rows && (
          shown.length === 0 ? (
            <p className="empty">{filter === 'not_added' ? 'Everyone in the staff directory is in FocusiQ.' : 'Nobody to show.'}</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Name</th><th>Job title</th><th>WG login</th><th>FocusiQ</th><th>Invitation</th><th>Assessment</th><th /></tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.staffId}>
                      <td><strong>{r.fullName}</strong>{!r.isActive && <div className="small muted">Left (inactive in the directory)</div>}</td>
                      <td>{r.jobTitle ?? '—'}</td>
                      <td>{r.hasLogin ? <span className="tag tag-green">✓ Yes</span> : <span className="tag tag-amber">⚠ Not yet</span>}</td>
                      <td>
                        {r.employeeId ? (
                          <>{r.department}<div className="small muted">{r.status === 'active' ? `Since ${r.startDate ? shortDate(r.startDate) : '—'}` : r.status === 'former' ? 'Former employee' : r.status}</div></>
                        ) : (
                          <span className="muted">Not added</span>
                        )}
                      </td>
                      <td><InvitationCell row={r} /></td>
                      <td><AssessmentCell row={r} /></td>
                      <td className="num">
                        {!r.employeeId && r.isActive && <button className="btn" disabled={busy} onClick={() => { setMessage(null); setAdding(r); }}>Add…</button>}
                        {r.employeeId && r.status === 'active' && r.hasLogin && (
                          <button className="btn secondary" disabled={busy} onClick={() => invite(r)}>{r.invitationStatus ? 'Resend invitation' : 'Send invitation'}</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
        <p className="small muted" style={{ marginTop: 12 }}>
          Names, job titles and logins come from the staff directory and are updated every night; people who leave are marked as former
          automatically. The FocusiQ department and start date are set here because they decide who people are compared with.
        </p>
      </Card>

      {adding && (
        <AddModal
          row={adding}
          onClose={() => setAdding(null)}
          onAdd={async (department, startDate, sendInvite) => {
            const employeeId = await source.add(adding.staffId, department, startDate);
            let note = `${adding.fullName} has been added to FocusiQ.`;
            if (sendInvite && adding.hasLogin) note += ` ${INVITE_MESSAGE[await source.invite(employeeId)]}`;
            else if (!adding.hasLogin) note += ' They need a Walter Geering login before they can be invited: set one up in the Hub.';
            setMessage(note);
            setAdding(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function AddModal({ row, onClose, onAdd }: { row: StaffRow; onClose: () => void; onAdd: (d: Department, start: string | null, invite: boolean) => Promise<void> }) {
  const [department, setDepartment] = useState<Department | ''>('');
  const [start, setStart] = useState(row.directoryStartDate ?? '');
  const [sendInvite, setSendInvite] = useState(row.hasLogin);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!department) return setError('Choose a FocusiQ department.');
    if (!start) return setError('Enter a start date: the staff directory does not have one.');
    setSaving(true);
    try {
      await onAdd(department, start, sendInvite);
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };
  return (
    <Modal title={`Add ${row.fullName} to FocusiQ`} onClose={onClose}>
      <div className="stack-tight">
        {error && <p className="field-error" role="alert">{error}</p>}
        <div className="field">
          <label htmlFor="add-dept">FocusiQ department</label>
          <select id="add-dept" value={department} onChange={(e) => setDepartment(e.target.value as Department)}>
            <option value="">Choose…</option>
            {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <span className="small muted">Decides who this person is compared with in department results.</span>
        </div>
        <div className="field">
          <label htmlFor="add-start">Start date at Walter Geering</label>
          <input id="add-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          <span className="small muted">{row.directoryStartDate ? 'From the staff directory. Change it if it is wrong.' : 'The staff directory has no start date for this person.'}</span>
        </div>
        {row.hasLogin ? (
          <label className="check-row">
            <input type="checkbox" checked={sendInvite} onChange={(e) => setSendInvite(e.target.checked)} />
            <span>Email an invitation now (from “Walter Geering”, a nudge to sign in with no results or personal details)</span>
          </label>
        ) : (
          <p className="tag-amber staff-message">This person has no Walter Geering login yet. Add them now, set up their login in the Hub, then send the invitation from this page.</p>
        )}
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
          <button className="btn secondary" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={saving} onClick={submit}>{saving ? 'Adding…' : 'Add to FocusiQ'}</button>
        </div>
      </div>
    </Modal>
  );
}
