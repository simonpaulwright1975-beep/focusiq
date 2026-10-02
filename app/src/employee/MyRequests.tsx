import { useEffect, useState } from 'react';
import {
  RIGHTS_REQUEST_LABELS,
  employeeFollowUp,
  employeeRequestView,
  type RightsRequest,
} from '../../../src/participation/index.js';
import { requestsForEmployee, subscribeRightsRequests, upsertRightsRequest } from '../shared/requestStore.js';

const dateOnly = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const dateTime = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function useMyRequests(employeeId: string): RightsRequest[] {
  const [mine, setMine] = useState(() => requestsForEmployee(employeeId));
  useEffect(() => subscribeRightsRequests(() => setMine(requestsForEmployee(employeeId))), [employeeId]);
  return mine;
}

/** The employee's own questions and requests – never internal notes. */
export function MyRequests({ employeeId }: { employeeId: string }) {
  const mine = useMyRequests(employeeId);
  const [openId, setOpenId] = useState<string | null>(null);
  if (mine.length === 0) return null;
  return (
    <section className="card my-requests no-print" aria-labelledby="my-requests-h">
      <h2 id="my-requests-h">Your questions and requests</h2>
      <ul>
        {mine.map((r) => {
          const v = employeeRequestView(r);
          const replies = v.messages.filter((m) => m.from !== 'You').length;
          const expanded = openId === r.id;
          return (
            <li key={r.id}>
              <button className="my-request-head" aria-expanded={expanded} onClick={() => setOpenId(expanded ? null : r.id)}>
                <span>
                  <strong>{RIGHTS_REQUEST_LABELS[v.type]}</strong>
                  <span className="muted small"> · sent {dateOnly(v.createdAt)}</span>
                </span>
                {v.status === 'closed' ? (
                  <span className="tag tag-green">✓ Closed</span>
                ) : (
                  <span className="tag tag-amber">● {v.status === 'in_progress' ? 'In progress' : 'Received'} · reply by {dateOnly(v.respondBy)}{v.extended ? ' (extended)' : ''}</span>
                )}
                {replies > 0 && <span className="small muted">{replies} update{replies > 1 ? 's' : ''}</span>}
              </button>
              {expanded && <Thread request={r} employeeId={employeeId} />}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Thread({ request, employeeId }: { request: RightsRequest; employeeId: string }) {
  const v = employeeRequestView(request);
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="my-thread">
      <ol>
        {v.messages.map((m, i) => (
          <li key={i} className={m.from === 'You' ? 'mine' : 'theirs'}>
            <div className="small"><strong>{m.from}</strong> <span className="muted">{dateTime(m.at)}</span></div>
            <p>{m.body}</p>
          </li>
        ))}
      </ol>
      {v.status !== 'closed' && (
        <div className="field">
          <label htmlFor={`fu-${request.id}`}>Add to this request</label>
          <textarea id={`fu-${request.id}`} value={body} onChange={(e) => setBody(e.target.value)} />
          {error && <p className="field-error" role="alert">{error}</p>}
          <button
            className="btn secondary"
            onClick={() => {
              try {
                upsertRightsRequest(employeeFollowUp(request, employeeId, body, new Date()));
                setBody('');
                setError(null);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Send
          </button>
        </div>
      )}
    </div>
  );
}
