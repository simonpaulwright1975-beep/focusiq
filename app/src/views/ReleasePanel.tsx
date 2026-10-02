import { useEffect, useMemo, useState } from 'react';
import { buildEmployeeSummary, toEmployeeVoice, type InsightReport } from '../../../src/insight/index.js';
import { withdrawRelease, type SummaryRelease } from '../../../src/participation/index.js';
import { Modal } from '../components/Modal.js';
import { Card } from '../components/ui.js';
import { listReleases, saveRelease, subscribeReleases } from '../shared/summaryStore.js';
import { SummaryView } from '../shared/SummaryView.js';
import { useStore } from '../state.js';

const dateTime = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function useReleases(employeeId: string): SummaryRelease[] {
  const read = () => listReleases().filter((r) => r.summary.employeeId === employeeId).sort((a, b) => b.summary.releasedAt.localeCompare(a.summary.releasedAt));
  const [releases, setReleases] = useState(read);
  useEffect(() => {
    setReleases(read());
    return subscribeReleases(() => setReleases(read()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId]);
  return releases;
}

/** Director: prepare, release and withdraw the employee's own summary. */
export function ReleasePanel({ employeeId, name, assessmentId, report }: { employeeId: string; name: string; assessmentId: string; report: InsightReport }) {
  const releases = useReleases(employeeId);
  const live = releases.find((r) => !r.withdrawn) ?? null;
  const [preparing, setPreparing] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);

  return (
    <Card
      title="Employee summary"
      sub="What the employee receives: constructive, absolute bands only, never compared with colleagues. Nothing is shared until you release it."
      actions={
        <div className="row">
          {live && <button className="btn secondary" onClick={() => setWithdrawing(true)}>Withdraw</button>}
          <button className="btn" onClick={() => setPreparing(true)}>{live ? 'Prepare a new version…' : 'Prepare summary…'}</button>
        </div>
      }
    >
      {live ? (
        <p className="row" style={{ margin: 0 }}>
          <span className="tag tag-green">✓ Released {dateTime(live.summary.releasedAt)}</span>
          {live.readAt ? <span className="tag tag-green">✓ Read by employee {dateTime(live.readAt)}</span> : <span className="tag tag-amber">● Not yet read</span>}
        </p>
      ) : (
        <p className="row" style={{ margin: 0 }}><span className="tag tag-amber">● Not released</span><span className="small muted">Release after the one-to-one conversation, or before it if you prefer.</span></p>
      )}
      {releases.some((r) => r.withdrawn) && (
        <details className="explain">
          <summary>Release history ({releases.length})</summary>
          <ul className="history">
            {releases.map((r) => (
              <li key={r.summary.id}>
                Released {dateTime(r.summary.releasedAt)}
                {r.withdrawn ? ` · withdrawn ${dateTime(r.withdrawn.at)} – ${r.withdrawn.reason}` : ' · current'}
              </li>
            ))}
          </ul>
        </details>
      )}
      {preparing && <PrepareModal employeeId={employeeId} name={name} assessmentId={assessmentId} report={report} current={live} onClose={() => setPreparing(false)} />}
      {withdrawing && live && <WithdrawModal release={live} onClose={() => setWithdrawing(false)} />}
    </Card>
  );
}

function PrepareModal({ employeeId, name, assessmentId, report, current, onClose }: {
  employeeId: string; name: string; assessmentId: string; report: InsightReport; current: SummaryRelease | null; onClose: () => void;
}) {
  const { actor, data, demo } = useStore();
  const firstName = name.split(' ')[0]!;
  const supportable = report.recommendations;
  const [includeBands, setIncludeBands] = useState(false);
  const [chosen, setChosen] = useState<string[]>(supportable.filter((r) => r.target !== 'employee').map((r) => r.id));
  const [texts, setTexts] = useState<Record<string, string>>(() => Object.fromEntries(supportable.map((r) => [r.id, toEmployeeVoice(r.detail)])));
  const [message, setMessage] = useState('');

  const result = useMemo(() => {
    try {
      return {
        summary: buildEmployeeSummary({
          actor, data, employeeId, employeeName: firstName, assessmentId, report,
          motivation: demo.motivation.get(assessmentId),
          options: {
            includeBands,
            supportRecommendationIds: chosen,
            supportOverrides: Object.fromEntries(chosen.map((id) => [id, { detail: texts[id] }])),
            personalMessage: message,
          },
          now: new Date(),
        }),
        error: null,
      };
    } catch (e) {
      return { summary: null, error: (e as Error).message };
    }
  }, [actor, data, demo, employeeId, firstName, assessmentId, report, includeBands, chosen, texts, message]);

  const release = () => {
    if (!result.summary) return;
    if (current) saveRelease(withdrawRelease(current, 'Replaced by a new version', new Date()));
    saveRelease({ summary: result.summary, releasedBy: actor.id, withdrawn: null, readAt: null });
    onClose();
  };

  return (
    <Modal title={`Prepare ${firstName}’s summary`} onClose={onClose}>
      <div className="release-grid">
        <div className="stack">
          <label className="row small">
            <input type="checkbox" checked={includeBands} onChange={(e) => setIncludeBands(e.target.checked)} />
            Include working-style bands per dimension
          </label>
          {includeBands && (
            <p className="small notice-sensitive" style={{ margin: 0 }}>
              The expectation bands are provisional. They will be labelled as such to the employee. Consider leaving them out until validated.
            </p>
          )}
          <fieldset className="plain">
            <legend className="lbl">Support to share</legend>
            {supportable.length === 0 && <p className="empty small">No recommendations in this report.</p>}
            {supportable.map((r) => (
              <div key={r.id} className="support-choice">
                <label className="row small">
                  <input type="checkbox" checked={chosen.includes(r.id)} onChange={(e) => setChosen(e.target.checked ? [...chosen, r.id] : chosen.filter((x) => x !== r.id))} />
                  <strong>{r.title}</strong> <span className="tag">{r.category}</span>
                </label>
                {chosen.includes(r.id) && (
                  <textarea aria-label={`Text shown to the employee for ${r.title}`} value={texts[r.id]} onChange={(e) => setTexts({ ...texts, [r.id]: e.target.value })} />
                )}
              </div>
            ))}
          </fieldset>
          <div className="field">
            <label htmlFor="pm">Personal note (optional, shown as from Walter Geering)</label>
            <textarea id="pm" value={message} onChange={(e) => setMessage(e.target.value)} placeholder={`e.g. Thanks for taking part, ${firstName}. Let’s talk this through on Thursday.`} />
          </div>
          {result.error && <p className="field-error" role="alert">{result.error}</p>}
        </div>
        <div className="release-preview">
          <div className="lbl">Exactly what {firstName} will see</div>
          {result.summary ? <SummaryView summary={result.summary} firstName={firstName} /> : <p className="empty">Fix the problem on the left to see the preview.</p>}
        </div>
      </div>
      <div className="actions">
        <button className="btn secondary" onClick={onClose}>Cancel</button>
        <button className="btn" disabled={!result.summary} onClick={release}>{current ? 'Release new version' : 'Release to employee'}</button>
      </div>
    </Modal>
  );
}

function WithdrawModal({ release, onClose }: { release: SummaryRelease; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal title="Withdraw summary" onClose={onClose}>
      <p className="small secondary">The employee will no longer see this summary. It is kept in the release history.</p>
      <div className="field">
        <label htmlFor="wr">Reason</label>
        <textarea id="wr" value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      {error && <p className="field-error" role="alert">{error}</p>}
      <div className="actions">
        <button className="btn secondary" onClick={onClose}>Cancel</button>
        <button className="btn" onClick={() => { try { saveRelease(withdrawRelease(release, reason, new Date())); onClose(); } catch (e) { setError((e as Error).message); } }}>Withdraw</button>
      </div>
    </Modal>
  );
}
