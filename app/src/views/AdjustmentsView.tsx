import { useEffect, useMemo, useState } from 'react';
import {
  ARRANGEMENTS,
  ARRANGEMENT_LABELS,
  AUTOMATIC_ARRANGEMENTS,
  currentDecision,
  decideAdjustment,
  employeeAdjustmentView,
  validateDecision,
  type AdjustmentRequest,
  type Arrangement,
  type DecisionErrors,
  type DecisionInput,
} from '../../../src/participation/index.js';
import { Modal } from '../components/Modal.js';
import { Card } from '../components/ui.js';
import { DEMO_ADJUSTMENT_REQUESTS } from '../demo/adjustmentSeed.js';
import { listRequests, seedOnce, subscribe, upsertRequest } from '../shared/adjustmentStore.js';
import { useStore } from '../state.js';

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export function useAdjustmentRequests(): AdjustmentRequest[] {
  const [requests, setRequests] = useState(() => {
    seedOnce(DEMO_ADJUSTMENT_REQUESTS);
    return listRequests();
  });
  useEffect(() => subscribe(() => setRequests(listRequests())), []);
  return requests;
}

function StatusTag({ status }: { status: AdjustmentRequest['status'] }) {
  if (status === 'pending') return <span className="tag tag-amber">● Awaiting decision</span>;
  if (status === 'agreed') return <span className="tag tag-green">✓ Agreed</span>;
  return <span className="tag">✕ Declined</span>;
}

function DecisionSummary({ request }: { request: AdjustmentRequest }) {
  const view = employeeAdjustmentView(request);
  const d = currentDecision(request)!;
  return (
    <div className="small">
      {view.arrangements.length > 0 && <div><strong>Arranged:</strong> {view.arrangements.join('; ')}</div>}
      <div className="secondary">Message to employee: “{d.employeeMessage}”</div>
      <div className="muted">Decided by {d.decidedByName}, {dateTime(d.decidedAt)}{request.history.length > 1 ? ` · revised ${request.history.length - 1}×` : ''}</div>
    </div>
  );
}

export function AdjustmentsView() {
  const requests = useAdjustmentRequests();
  const [reviewing, setReviewing] = useState<AdjustmentRequest | null>(null);
  const [openHistory, setOpenHistory] = useState<string | null>(null);
  const pending = requests.filter((r) => r.status === 'pending').sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const decided = requests.filter((r) => r.status !== 'pending').sort((a, b) => (currentDecision(b)!.decidedAt).localeCompare(currentDecision(a)!.decidedAt));

  return (
    <div className="stack">
      <div className="notice-sensitive" role="note">
        <strong>Confidential.</strong> Requests may include health information. Only Directors can see them. Use them only to
        arrange the adjustment, and keep internal notes factual – employees never see internal notes.
      </div>

      <Card title={`Awaiting a decision (${pending.length})`} sub="Oldest first. The employee cannot start the assessment until the request is decided.">
        {pending.length === 0 ? (
          <p className="empty">No requests are waiting.</p>
        ) : (
          pending.map((r) => (
            <div className="rec request" key={r.id}>
              <div className="row">
                <strong>{r.employeeName}</strong>
                <span className="muted small">{r.department} · requested {dateTime(r.createdAt)}</span>
                <span className="spacer" />
                <StatusTag status={r.status} />
              </div>
              <blockquote className="quote">{r.description}</blockquote>
              <button className="btn" onClick={() => setReviewing(r)}>Review request</button>
            </div>
          ))
        )}
      </Card>

      <Card title={`Decided (${decided.length})`} sub="Every decision and revision is kept.">
        {decided.length === 0 ? (
          <p className="empty">No decisions yet.</p>
        ) : (
          decided.map((r) => (
            <div className="rec request" key={r.id}>
              <div className="row">
                <strong>{r.employeeName}</strong>
                <span className="muted small">{r.department} · requested {dateTime(r.createdAt)}</span>
                <span className="spacer" />
                <StatusTag status={r.status} />
              </div>
              <blockquote className="quote">{r.description}</blockquote>
              <DecisionSummary request={r} />
              <div className="row" style={{ marginTop: 8 }}>
                <button className="btn secondary" onClick={() => setReviewing(r)}>Change decision</button>
                <button className="btn link" aria-expanded={openHistory === r.id} onClick={() => setOpenHistory(openHistory === r.id ? null : r.id)}>
                  {openHistory === r.id ? 'Hide history' : 'Decision history'}
                </button>
              </div>
              {openHistory === r.id && (
                <ol className="history">
                  {r.history.map((h, i) => (
                    <li key={i}>
                      <strong>{h.status === 'agreed' ? 'Agreed' : 'Declined'}</strong> by {h.decidedByName}, {dateTime(h.decidedAt)}
                      {h.timeMultiplier ? ` · ${Math.round((h.timeMultiplier - 1) * 100)}% extra time` : ''}
                      {h.arrangements.filter((a) => a !== 'extra_time').length > 0 && ` · ${h.arrangements.filter((a) => a !== 'extra_time').map((a) => ARRANGEMENT_LABELS[a]).join(', ')}`}
                      {h.revisionReason && <div className="small">Reason for change: {h.revisionReason}</div>}
                      {h.internalNote && <div className="small secondary">Internal note: {h.internalNote}</div>}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          ))
        )}
      </Card>

      {reviewing && <DecisionModal request={reviewing} onClose={() => setReviewing(null)} />}
    </div>
  );
}

const EXTRA_TIME_OPTIONS = [25, 50, 100];

function templateMessage(status: 'agreed' | 'declined', arrangements: Arrangement[], extraPct: number | null): string {
  if (status === 'declined') {
    return 'Thank you for letting us know. We are not able to make this change because [reason]. Instead we can offer [alternative] – please speak to HR if you would like to discuss it.';
  }
  const parts = arrangements.map((a) => (a === 'extra_time' && extraPct ? `${extraPct}% extra time on timed sections` : ARRANGEMENT_LABELS[a].toLowerCase()));
  const inPerson = arrangements.filter((a) => !AUTOMATIC_ARRANGEMENTS.includes(a));
  return (
    `We have agreed ${parts.join(', ') || '…'}.` +
    (arrangements.includes('extra_time') ? ' The extra time is applied automatically when you start.' : '') +
    (inPerson.length ? ' HR will contact you to arrange the rest before you begin.' : '')
  );
}

function DecisionModal({ request, onClose }: { request: AdjustmentRequest; onClose: () => void }) {
  const { actor, now } = useStore();
  const previous = currentDecision(request);
  const [status, setStatus] = useState<'agreed' | 'declined'>(previous?.status ?? 'agreed');
  const [arrangements, setArrangements] = useState<Arrangement[]>(previous?.arrangements ?? []);
  const [extraPct, setExtraPct] = useState<number | null>(previous?.timeMultiplier ? Math.round((previous.timeMultiplier - 1) * 100) : 25);
  const [customPct, setCustomPct] = useState('');
  const [message, setMessage] = useState(previous?.employeeMessage ?? '');
  const [messageEdited, setMessageEdited] = useState(Boolean(previous));
  const [internalNote, setInternalNote] = useState('');
  const [revisionReason, setRevisionReason] = useState('');
  const [errors, setErrors] = useState<DecisionErrors>({});

  const wantsTime = status === 'agreed' && arrangements.includes('extra_time');
  const pct = extraPct ?? (customPct.trim() ? Number(customPct) : NaN);
  const input: DecisionInput = {
    status,
    arrangements: status === 'agreed' ? arrangements : [],
    timeMultiplier: wantsTime ? 1 + pct / 100 : null,
    employeeMessage: message,
    internalNote,
    revisionReason,
  };

  // Keep the suggested message in step with the choices until the Director edits it.
  useEffect(() => {
    if (!messageEdited) setMessage(templateMessage(status, arrangements, wantsTime ? (Number.isFinite(pct) ? pct : null) : null));
  }, [status, arrangements, pct, wantsTime, messageEdited]);

  const preview = useMemo(() => {
    try {
      return employeeAdjustmentView(decideAdjustment(request, input, actor, now));
    } catch {
      return null;
    }
  }, [request, status, arrangements, pct, message, revisionReason]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (a: Arrangement) => setArrangements((xs) => (xs.includes(a) ? xs.filter((x) => x !== a) : [...xs, a]));
  const submit = () => {
    const errs = validateDecision(request, input, actor);
    if (message.includes('[reason]') || message.includes('[alternative]')) errs.employeeMessage = 'Replace the [bracketed] parts of the message before sending.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    upsertRequest(decideAdjustment(request, input, actor, now));
    onClose();
  };
  const err = (k: keyof DecisionErrors) => (errors[k] ? <p className="field-error" role="alert">{errors[k]}</p> : null);

  return (
    <Modal title={`${previous ? 'Change decision' : 'Review request'} – ${request.employeeName}`} onClose={onClose}>
      <div className="stack">
        <blockquote className="quote">{request.description}</blockquote>
        {err('permission')}
        <fieldset className="plain">
          <legend className="lbl">Decision</legend>
          <div className="row">
            <button type="button" className={status === 'agreed' ? 'chip sel' : 'chip'} aria-pressed={status === 'agreed'} onClick={() => setStatus('agreed')}>Agree</button>
            <button type="button" className={status === 'declined' ? 'chip sel' : 'chip'} aria-pressed={status === 'declined'} onClick={() => setStatus('declined')}>Decline</button>
          </div>
        </fieldset>

        {status === 'agreed' && (
          <fieldset className="plain">
            <legend className="lbl">What will be arranged</legend>
            {err('arrangements')}
            <div className="arrangements">
              {ARRANGEMENTS.map((a) => (
                <label key={a} className="row small">
                  <input type="checkbox" checked={arrangements.includes(a)} onChange={() => toggle(a)} />
                  {ARRANGEMENT_LABELS[a]}
                  {AUTOMATIC_ARRANGEMENTS.includes(a) ? <span className="tag">applied automatically</span> : <span className="muted">arranged by HR</span>}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {wantsTime && (
          <fieldset className="plain">
            <legend className="lbl">Extra time on timed sections</legend>
            {err('timeMultiplier')}
            <div className="row">
              {EXTRA_TIME_OPTIONS.map((p) => (
                <button key={p} type="button" className={extraPct === p ? 'chip sel' : 'chip'} aria-pressed={extraPct === p} onClick={() => setExtraPct(p)}>{p}%</button>
              ))}
              <button type="button" className={extraPct === null ? 'chip sel' : 'chip'} aria-pressed={extraPct === null} onClick={() => setExtraPct(null)}>Other</button>
              {extraPct === null && (
                <label className="row small">
                  <input type="text" inputMode="numeric" value={customPct} onChange={(e) => setCustomPct(e.target.value)} style={{ width: 80 }} aria-label="Extra time percentage" />%
                </label>
              )}
            </div>
            <p className="small muted">For example, 25% turns a 2-minute section into 2 minutes 30 seconds. Maximum 200%.</p>
          </fieldset>
        )}

        <div className="field">
          <label htmlFor="emp-msg">Message to the employee</label>
          {err('employeeMessage')}
          <textarea id="emp-msg" value={message} onChange={(e) => { setMessage(e.target.value); setMessageEdited(true); }} />
        </div>
        <div className="field">
          <label htmlFor="int-note">Internal note (Directors only – optional)</label>
          <textarea id="int-note" value={internalNote} onChange={(e) => setInternalNote(e.target.value)} placeholder="Keep it factual and minimal." />
        </div>
        {previous && (
          <div className="field">
            <label htmlFor="rev">Reason for changing the decision</label>
            {err('revisionReason')}
            <textarea id="rev" value={revisionReason} onChange={(e) => setRevisionReason(e.target.value)} />
          </div>
        )}

        {preview && (
          <div className="employee-preview">
            <div className="lbl">The employee will see</div>
            <strong>{preview.headline}</strong>
            {preview.arrangements.length > 0 && <ul>{preview.arrangements.map((a) => <li key={a}>{a}</li>)}</ul>}
            {preview.message && <p>{preview.message}</p>}
          </div>
        )}
        {status === 'agreed' && (
          <p className="small muted">
            Assessments taken with an agreed adjustment are marked <strong>Adjusted</strong>. You decide later, in Eligibility &amp; audit,
            whether each result is comparable for benchmarking. It is never excluded automatically.
          </p>
        )}
      </div>
      <div className="actions">
        <button className="btn secondary" onClick={onClose}>Cancel</button>
        <button className="btn" onClick={submit}>{status === 'agreed' ? 'Agree adjustment' : 'Decline request'}</button>
      </div>
    </Modal>
  );
}
