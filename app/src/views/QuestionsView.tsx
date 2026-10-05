import { useEffect, useMemo, useState } from 'react';
import {
  MAX_EXTENSION_MONTHS,
  OUTCOMES_BY_TYPE,
  OUTCOME_LABELS,
  RIGHTS_REQUEST_LABELS,
  closeRequest,
  directorMessage,
  dueState,
  extendDeadline,
  isStatutory,
  markInProgress,
  type Outcome,
  type RightsRequest,
} from '../../../src/participation/index.js';
import { Modal } from '../components/Modal.js';
import { Card } from '../components/ui.js';
import { LIVE } from '../shared/supabase.js';
import { rightsActions, useRightsRequests } from './requestsData.js';
import { useStore } from '../state.js';
import { buildDataExport, downloadJson } from './dataExport.js';

const dateOnly = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const dateTime = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

const TYPE_SHORT: Record<RightsRequest['type'], string> = {
  question: 'Question',
  copy_of_data: 'Copy of data',
  correction: 'Correction',
  objection: 'Objection',
};

export { useRightsRequests };

function DueTag({ request, now }: { request: RightsRequest; now: Date }) {
  const { state, daysLeft } = dueState(request, now);
  if (state === 'closed') return <span className="tag">✓ Closed · {OUTCOME_LABELS[request.outcome!].split(' (')[0]}</span>;
  if (state === 'overdue') return <span className="tag tag-red">⚠ Overdue since {dateOnly(request.dueAt)}</span>;
  const when = daysLeft === 0 ? 'due today' : daysLeft === 1 ? 'due tomorrow' : `due in ${daysLeft} days`;
  if (state === 'due_soon') return <span className="tag tag-amber">● {when[0]!.toUpperCase() + when.slice(1)}</span>;
  return <span className="tag tag-green">✓ On track · {when}</span>;
}

type Filter = 'open' | 'closed' | 'all';

export function QuestionsView() {
  const requests = useRightsRequests();
  const now = new Date();
  const [filter, setFilter] = useState<Filter>('open');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const sorted = useMemo(() => {
    const list = requests.filter((r) => (filter === 'all' ? true : filter === 'open' ? r.status !== 'closed' : r.status === 'closed'));
    return list.sort((a, b) => (a.status === 'closed' ? 1 : 0) - (b.status === 'closed' ? 1 : 0) || a.dueAt.localeCompare(b.dueAt));
  }, [requests, filter]);
  const selected = requests.find((r) => r.id === selectedId) ?? sorted[0] ?? null;
  const openCount = requests.filter((r) => r.status !== 'closed').length;

  return (
    <div className="stack">
      <div className="notice-sensitive" role="note">
        <strong>Data-rights requests have legal deadlines.</strong> A copy of data, a correction or an objection must be answered within one
        calendar month. This can be extended once by up to two months for complex requests, if the employee is told within the first month. Replies
        are sent as “Walter Geering”; internal notes are never shown to the employee.
      </div>
      <div className="grid inbox">
        <Card
          title="Questions & concerns"
          sub={`${openCount} open · soonest deadline first`}
          actions={
            <div className="row">
              {(['open', 'closed', 'all'] as Filter[]).map((f) => (
                <button key={f} className={filter === f ? 'chip sel' : 'chip'} aria-pressed={filter === f} onClick={() => setFilter(f)}>
                  {f === 'open' ? 'Open' : f === 'closed' ? 'Closed' : 'All'}
                </button>
              ))}
            </div>
          }
        >
          {sorted.length === 0 ? (
            <p className="empty">Nothing here.</p>
          ) : (
            <ul className="inbox-list">
              {sorted.map((r) => (
                <li key={r.id}>
                  <button className={`inbox-item${selected?.id === r.id ? ' current' : ''}`} aria-current={selected?.id === r.id} onClick={() => setSelectedId(r.id)}>
                    <span className="row">
                      <strong>{r.employeeName}</strong>
                      <span className="tag">{TYPE_SHORT[r.type]}{isStatutory(r.type) ? ' · legal deadline' : ''}</span>
                    </span>
                    <span className="inbox-snippet">{r.messages[0]!.body}</span>
                    <DueTag request={r} now={now} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
        {selected ? <RequestDetail key={selected.id} request={selected} now={now} /> : <Card title="No request selected"><p className="empty">Choose a request.</p></Card>}
      </div>
    </div>
  );
}

function RequestDetail({ request, now }: { request: RightsRequest; now: Date }) {
  const { actor, demo, bump } = useStore();
  const [body, setBody] = useState('');
  const [internal, setInternal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<'extend' | 'close' | null>(null);
  const open = request.status !== 'closed';

  const apply = async (fn: () => Promise<void>) => {
    try {
      await fn();
      setError(null);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  };

  return (
    <Card
      title={`${RIGHTS_REQUEST_LABELS[request.type]} – ${request.employeeName}`}
      sub={`${request.department} · received ${dateTime(request.createdAt)} · respond by ${dateOnly(request.dueAt)}${request.extended ? ' (extended)' : ''}`}
      actions={<DueTag request={request} now={now} />}
    >
      {isStatutory(request.type) && open && (
        <p className="small secondary" style={{ marginTop: 0 }}>
          {request.type === 'copy_of_data' && 'Subject access request: provide a copy of their personal data, plus how it is used, who sees it and how long it is kept.'}
          {request.type === 'correction' && 'Right to rectification: correct inaccurate details, or explain why the record is accurate.'}
          {request.type === 'objection' && 'Right to object: stop the processing unless there are compelling legitimate grounds that override the employee’s interests – record your reasoning.'}
        </p>
      )}

      <ol className="thread" aria-label="Conversation">
        {request.messages.map((m) => (
          <li key={m.id} className={`msg msg-${m.kind}`}>
            <div className="msg-meta">
              <strong>{m.kind === 'internal' ? `Internal note – ${m.authorName}` : m.kind === 'employee' ? m.authorName : m.kind === 'event' ? 'Update sent' : 'Reply from Walter Geering'}</strong>
              <span className="muted">{dateTime(m.at)}</span>
              {m.kind === 'internal' && <span className="tag">🔒 Not visible to the employee</span>}
            </div>
            <p>{m.body}</p>
          </li>
        ))}
      </ol>

      {open ? (
        <div className="composer">
          <label className="lbl" htmlFor="reply">{internal ? 'Internal note (Directors only)' : 'Reply to the employee'}</label>
          <textarea id="reply" value={body} onChange={(e) => setBody(e.target.value)} placeholder={internal ? 'Not visible to the employee.' : 'Sent as “Walter Geering”.'} />
          {error && <p className="field-error" role="alert">{error}</p>}
          <div className="row">
            <label className="row small"><input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} />Internal note</label>
            <span className="spacer" />
            <button className="btn" onClick={async () => {
              if (await apply(() => rightsActions.message(request, actor, body, internal))) setBody('');
            }}>
              {internal ? 'Add note' : 'Send reply'}
            </button>
          </div>
          <div className="row request-actions">
            {request.status === 'open' && <button className="btn secondary" onClick={() => apply(() => rightsActions.markInProgress(request, actor))}>Mark in progress</button>}
            {isStatutory(request.type) && !request.extended && <button className="btn secondary" onClick={() => setModal('extend')}>Extend deadline…</button>}
            {request.type === 'copy_of_data' && (
              <button
                className="btn secondary"
                onClick={() => downloadJson(`focusiq-data-${request.employeeName.toLowerCase().replace(/\s+/g, '-')}-DRAFT.json`, buildDataExport(demo, request.employeeId, new Date()))}
              >
                Prepare data export (draft)
              </button>
            )}
            <button className="btn secondary" onClick={() => setModal('close')}>Close request…</button>
          </div>
        </div>
      ) : (
        <p className="small muted">Closed {dateTime(request.closedAt!)}. The conversation is kept as a record and cannot be changed.</p>
      )}

      {modal === 'extend' && <ExtendModal request={request} onClose={() => setModal(null)} onDone={async (months, reason) => { await rightsActions.extend(request, actor, months, reason); setModal(null); }} />}
      {modal === 'close' && (
        <CloseModal
          request={request}
          onClose={() => setModal(null)}
          onDone={async (outcome, summary, alsoExclude) => {
            await rightsActions.close(request, actor, outcome, summary);
            if (!LIVE && alsoExclude && !demo.ledger.isEmployeeExcluded(request.employeeId) && demo.employees.some((e) => e.id === request.employeeId)) {
              demo.ledger.excludeEmployee(actor, request.employeeId, 'other', `Objection upheld (request ${request.id.slice(0, 8)}) – FocusiQ processing stopped`);
              bump();
            }
            setModal(null);
          }}
        />
      )}
    </Card>
  );
}

function ExtendModal({ request, onClose, onDone }: { request: RightsRequest; onClose: () => void; onDone: (months: number, reason: string) => Promise<void> }) {
  const { actor } = useStore();
  const [months, setMonths] = useState(1);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal title="Extend the response deadline" onClose={onClose}>
      <div className="stack">
        <p className="small secondary">Only for complex requests, and only once. The employee is told the new date and your reason straight away.</p>
        <fieldset className="plain">
          <legend className="lbl">Extend by</legend>
          <div className="row">
            {Array.from({ length: MAX_EXTENSION_MONTHS }, (_, i) => i + 1).map((m) => (
              <button key={m} type="button" className={months === m ? 'chip sel' : 'chip'} aria-pressed={months === m} onClick={() => setMonths(m)}>
                {m} month{m > 1 ? 's' : ''}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="field">
          <label htmlFor="ext-reason">Reason (sent to the employee)</label>
          <textarea id="ext-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        {error && <p className="field-error" role="alert">{error}</p>}
      </div>
      <div className="actions">
        <button className="btn secondary" onClick={onClose}>Cancel</button>
        <button
          className="btn"
          onClick={async () => {
            try {
              extendDeadline(request, actor, months, reason, new Date()); // same rules as the database, checked first
              await onDone(months, reason);
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          Extend and tell the employee
        </button>
      </div>
    </Modal>
  );
}

function CloseModal({ request, onClose, onDone }: { request: RightsRequest; onClose: () => void; onDone: (outcome: Outcome, summary: string, alsoExclude: boolean) => Promise<void> }) {
  const { actor } = useStore();
  const options = OUTCOMES_BY_TYPE[request.type];
  const [outcome, setOutcome] = useState<Outcome>(options[0]!);
  const [summary, setSummary] = useState('');
  const [exclude, setExclude] = useState(true);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal title={`Close request – ${request.employeeName}`} onClose={onClose}>
      <div className="stack">
        <fieldset className="plain">
          <legend className="lbl">Outcome</legend>
          <div className="stack-tight">
            {options.map((o) => (
              <label key={o} className="row small"><input type="radio" name="outcome" checked={outcome === o} onChange={() => setOutcome(o)} />{OUTCOME_LABELS[o]}</label>
            ))}
          </div>
        </fieldset>
        <div className="field">
          <label htmlFor="close-summary">Closing message to the employee</label>
          <textarea id="close-summary" value={summary} onChange={(e) => setSummary(e.target.value)} />
        </div>
        {(outcome === 'not_upheld' || outcome === 'partly_provided') && (
          <p className="small secondary">The employee will also be told they can ask for a review or complain to the ICO.</p>
        )}
        {outcome === 'upheld' && LIVE && (
          <p className="small secondary">Upholding an objection stops FocusiQ processing. Also exclude this person from benchmarking on the Eligibility &amp; audit tab.</p>
        )}
        {outcome === 'upheld' && !LIVE && (
          <label className="row small">
            <input type="checkbox" checked={exclude} onChange={(e) => setExclude(e.target.checked)} />
            Also exclude {request.employeeName} from benchmarking now (recorded in Eligibility &amp; audit). Their existing data is kept.
          </label>
        )}
        {error && <p className="field-error" role="alert">{error}</p>}
      </div>
      <div className="actions">
        <button className="btn secondary" onClick={onClose}>Cancel</button>
        <button
          className="btn"
          onClick={async () => {
            try {
              closeRequest(request, actor, outcome, summary, new Date()); // same rules as the database, checked first
              await onDone(outcome, summary, outcome === 'upheld' && exclude);
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          Close request
        </button>
      </div>
    </Modal>
  );
}
