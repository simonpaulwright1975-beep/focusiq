import { useEffect, useState } from 'react';
import {
  RIGHTS_REQUEST_LABELS,
  employeeRequestView,
  type EmployeeRecordDetails,
  type RightsRequest,
} from '../../../src/participation/index.js';
import { backend } from './backend.js';

const dateOnly = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const dateTime = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function useMyRequests(me: EmployeeRecordDetails): [RightsRequest[], () => void] {
  const [mine, setMine] = useState<RightsRequest[]>([]);
  const [rev, setRev] = useState(0);
  useEffect(() => backend.watchRequests(me, setMine), [me, rev]);
  return [mine, () => setRev((r) => r + 1)];
}

/** The employee's own questions and requests – never internal notes. */
export function MyRequests({ me }: { me: EmployeeRecordDetails }) {
  const [mine, refresh] = useMyRequests(me);
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
              {expanded && <Thread request={r} me={me} onSent={refresh} />}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Thread({ request, me, onSent }: { request: RightsRequest; me: EmployeeRecordDetails; onSent: () => void }) {
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
            onClick={async () => {
              try {
                await backend.followUp(me, request, body);
                setBody('');
                setError(null);
                onSent();
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
