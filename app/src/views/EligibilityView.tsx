import { useMemo, useState } from 'react';
import {
  EXCLUSION_REASONS,
  EXCLUSION_REASON_LABELS,
  exclusionReasonFor,
  previewExclusion,
  type Assessment,
  type Employee,
  type ExclusionReason,
} from '../../../src/benchmarking/index.js';
import { Card, Modal } from '../components/ui.js';
import { CORE_KEYS, definitionFor, metricLabel, useStore } from '../state.js';

type Action =
  | { kind: 'exclude-employee'; employee: Employee }
  | { kind: 'exclude-assessment'; employee: Employee; assessment: Assessment }
  | { kind: 'restore-employee'; employee: Employee }
  | { kind: 'restore-assessment'; employee: Employee; assessment: Assessment }
  | { kind: 'flag-adjusted'; employee: Employee; assessment: Assessment }
  | { kind: 'review-adjusted'; employee: Employee; assessment: Assessment };

const dateOf = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export function EligibilityView() {
  const { data, demo, filters, actor, now, bump, revision } = useStore();
  const [action, setAction] = useState<Action | null>(null);
  const people = data.employees.filter((e) => filters.department === 'all' || e.department === filters.department);
  const log = useMemo(() => [...demo.ledger.auditLog()].reverse(), [demo, revision]);
  const nameOf = (targetId: string) => {
    const e = data.employees.find((x) => x.id === targetId);
    if (e) return e.displayName;
    const a = data.assessments.find((x) => x.id === targetId);
    const owner = a && data.employees.find((x) => x.id === a.employeeId);
    return owner ? `${owner.displayName} – assessment ${dateOf(a!.completedAt)}` : targetId;
  };

  return (
    <div className="stack">
      <Card
        title="Benchmark eligibility"
        sub="Exclusions never delete data – they control the benchmark population and record who, when and why. Only Directors and authorised Super Admins can change them."
      >
        <div className="table-wrap">
          <table>
            <thead><tr><th>Employee</th><th>Status</th><th>Assessments</th><th>Employee-level</th></tr></thead>
            <tbody>
              {people.map((e) => {
                const empEx = data.eligibility.employees.get(e.id);
                const assessments = data.assessments.filter((a) => a.employeeId === e.id).sort((a, b) => a.completedAt.localeCompare(b.completedAt));
                return (
                  <tr key={e.id} className={empEx ? 'excluded' : undefined}>
                    <td><strong>{e.displayName}</strong><div className="small muted">{e.department} · {e.role}</div></td>
                    <td className="small">{e.status === 'active' ? 'Active' : e.status === 'former' ? 'Former employee' : 'Test user'}</td>
                    <td>
                      {assessments.map((a) => {
                        const ex = data.eligibility.assessments.get(a.id);
                        const reason = exclusionReasonFor(a, data.eligibility);
                        const adj = data.eligibility.adjustments?.get(a.id);
                        return (
                          <div key={a.id} className="row small" style={{ marginBottom: 4 }}>
                            <span style={{ minWidth: 92 }}>{dateOf(a.completedAt)}</span>
                            <span className="tag">
                              {reason ? `Excluded: ${reason === 'review_required' ? 'review required' : EXCLUSION_REASON_LABELS[reason]}` : 'Eligible'}
                            </span>
                            {adj && <span className="tag">Adjusted · {adj.comparability.replace('_', ' ')}</span>}
                            {ex ? (
                              <button className="btn link" onClick={() => setAction({ kind: 'restore-assessment', employee: e, assessment: a })}>Restore</button>
                            ) : a.complete && !empEx ? (
                              <button className="btn link" onClick={() => setAction({ kind: 'exclude-assessment', employee: e, assessment: a })}>Exclude</button>
                            ) : null}
                            {!adj && a.complete && <button className="btn link" onClick={() => setAction({ kind: 'flag-adjusted', employee: e, assessment: a })}>Flag adjusted</button>}
                            {adj?.comparability === 'pending_review' && <button className="btn link" onClick={() => setAction({ kind: 'review-adjusted', employee: e, assessment: a })}>Review</button>}
                          </div>
                        );
                      })}
                    </td>
                    <td>
                      {empEx ? (
                        <>
                          <div className="small">Excluded: {EXCLUSION_REASON_LABELS[empEx.reason]}{empEx.note ? ` – ${empEx.note}` : ''}</div>
                          <button className="btn secondary" onClick={() => setAction({ kind: 'restore-employee', employee: e })}>Restore to benchmark population</button>
                        </>
                      ) : (
                        <button className="btn secondary" onClick={() => setAction({ kind: 'exclude-employee', employee: e })}>Exclude employee…</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Benchmark audit log" sub="Append-only: every exclusion, restoration, validity change and adjustment decision">
        <div className="table-wrap">
          <table>
            <thead><tr><th>When</th><th>Who</th><th>What</th><th>Target</th><th>Why</th></tr></thead>
            <tbody>
              {log.map((ev) => (
                <tr key={ev.id}>
                  <td className="small">{new Date(ev.at).toLocaleString('en-GB')}</td>
                  <td className="small">{ev.actorName}</td>
                  <td className="small">{ev.action.replaceAll('_', ' ')}</td>
                  <td className="small">{nameOf(ev.targetId)}</td>
                  <td className="small">{EXCLUSION_REASON_LABELS[ev.reason as ExclusionReason] ?? ev.reason}{ev.note ? ` – ${ev.note}` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {action && (
        <ActionModal
          action={action}
          onClose={() => setAction(null)}
          onDone={() => { setAction(null); bump(); }}
          filtersDef={definitionFor(filters, now, action.employee.department)}
          actor={actor}
        />
      )}
    </div>
  );
}

function ActionModal({
  action,
  onClose,
  onDone,
  filtersDef,
  actor,
}: {
  action: Action;
  onClose: () => void;
  onDone: () => void;
  filtersDef: ReturnType<typeof definitionFor>;
  actor: ReturnType<typeof useStore>['actor'];
}) {
  const { data, demo, now } = useStore();
  const [reason, setReason] = useState<ExclusionReason | ''>('');
  const [note, setNote] = useState('');
  const [metric, setMetric] = useState(CORE_KEYS[4]!);
  const [decision, setDecision] = useState<'comparable' | 'not_comparable'>('comparable');
  const [error, setError] = useState<string | null>(null);
  const excluding = action.kind === 'exclude-employee' || action.kind === 'exclude-assessment';

  const preview = useMemo(() => {
    if (!excluding) return null;
    return previewExclusion(
      data,
      filtersDef,
      metric,
      action.kind === 'exclude-employee' ? { employeeIds: [action.employee.id] } : { assessmentIds: [action.assessment.id] },
      { now },
    );
  }, [data, metric, action]);

  const submit = () => {
    try {
      const l = demo.ledger;
      if (excluding && !reason) throw new Error('Choose a reason for the exclusion.');
      if (action.kind === 'exclude-employee') l.excludeEmployee(actor, action.employee.id, reason as ExclusionReason, note || undefined);
      if (action.kind === 'exclude-assessment') l.excludeAssessment(actor, action.assessment.id, reason as ExclusionReason, note || undefined);
      if (action.kind === 'restore-employee') l.restoreEmployee(actor, action.employee.id, note);
      if (action.kind === 'restore-assessment') l.restoreAssessment(actor, action.assessment.id, note);
      if (action.kind === 'flag-adjusted') l.flagAdjustedAssessment(actor, action.assessment.id, note);
      if (action.kind === 'review-adjusted') l.reviewAdjustedAssessment(actor, action.assessment.id, decision, note);
      onDone();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const title = {
    'exclude-employee': `Exclude ${action.employee.displayName} from benchmarking`,
    'exclude-assessment': `Exclude one assessment – ${action.employee.displayName}`,
    'restore-employee': `Restore ${action.employee.displayName} to the benchmark population`,
    'restore-assessment': `Restore assessment – ${action.employee.displayName}`,
    'flag-adjusted': `Flag adjusted assessment – ${action.employee.displayName}`,
    'review-adjusted': `Review adjusted assessment – ${action.employee.displayName}`,
  }[action.kind];

  return (
    <Modal title={title} onClose={onClose}>
      <div className="stack">
        {excluding && (
          <>
            <p className="small secondary">The assessment data is kept and stays in the person's own history. It will not influence benchmark calculations.</p>
            <div className="field">
              <label htmlFor="m-reason">Reason (required)</label>
              <select id="m-reason" value={reason} onChange={(e) => setReason(e.target.value as ExclusionReason)}>
                <option value="" disabled>Choose a reason…</option>
                {EXCLUSION_REASONS.map((r) => <option key={r} value={r}>{EXCLUSION_REASON_LABELS[r]}</option>)}
              </select>
            </div>
          </>
        )}
        {action.kind === 'flag-adjusted' && (
          <p className="small secondary">An adjusted assessment is not excluded automatically. It stays in the benchmark, marked as awaiting a comparability decision.</p>
        )}
        {action.kind === 'review-adjusted' && (
          <div className="field">
            <label htmlFor="m-dec">Is the result still comparable?</label>
            <select id="m-dec" value={decision} onChange={(e) => setDecision(e.target.value as 'comparable' | 'not_comparable')}>
              <option value="comparable">Comparable – keep in benchmarks</option>
              <option value="not_comparable">Not comparable – exclude from benchmarks</option>
            </select>
          </div>
        )}
        <div className="field">
          <label htmlFor="m-note">
            {excluding ? `Note${reason === 'other' ? ' (required for "Other")' : ' (optional)'}` : action.kind === 'flag-adjusted' ? 'Describe the adjusted conditions (required)' : 'Reason (required)'}
          </label>
          <textarea id="m-note" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        {preview && (
          <div className="rec">
            <div className="row">
              <strong>Benchmark exclusion preview</strong>
              <span className="spacer" />
              <select value={metric} onChange={(e) => setMetric(e.target.value)} aria-label="Preview measure">
                {CORE_KEYS.map((k) => <option key={k} value={k}>{metricLabel(k)}</option>)}
              </select>
            </div>
            <p className="small" style={{ margin: '6px 0 0' }}>{preview.summary}</p>
            <p className="small muted" style={{ margin: '4px 0 0' }}>
              {preview.current.sampleSizeLabel} → {preview.withoutSelected.sampleSizeLabel}
            </p>
          </div>
        )}
        {error && <p role="alert" style={{ color: 'var(--critical)' }}>{error}</p>}
        <p className="small muted">Recorded as {actor.name} at {now.toLocaleString('en-GB')} (demo clock).</p>
      </div>
      <div className="actions">
        <button className="btn secondary" onClick={onClose}>Cancel</button>
        <button className="btn" onClick={submit} disabled={excluding && !reason}>Confirm</button>
      </div>
    </Modal>
  );
}
