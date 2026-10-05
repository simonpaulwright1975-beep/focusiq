/**
 * The employee's released FocusiQ summary. Shown only once a Director has
 * released it; withdrawn versions disappear. Live, it comes from my_summary(),
 * which returns the summary content only.
 */
import { useEffect, useState } from 'react';
import type { EmployeeRecordDetails } from '../../../src/participation/index.js';
import { SummaryView } from '../shared/SummaryView.js';
import { useBackend, type MySummaryView } from './backend.js';

const longDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

export function MySummary({ me, onAsk }: { me: EmployeeRecordDetails; onAsk: () => void }) {
  const backend = useBackend();
  const [release, setRelease] = useState<MySummaryView | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => backend.watchSummary(me, setRelease), [me, backend]);
  if (!release) return null;
  const firstName = me.fullName.split(' ')[0] ?? me.fullName;
  return (
    <section className="card panel my-summary" aria-label="Your FocusiQ summary">
      <SummaryView summary={release.summary} firstName={firstName} />
      <div className="nav no-print">
        <button className="btn link" onClick={onAsk}>Questions about your summary?</button>
        {release.readAt ? (
          <span className="tag" role="status">✓ Read on {longDate(release.readAt)}</span>
        ) : (
          <button
            className="btn"
            onClick={() =>
              backend.markSummaryRead(me).then(
                () => setRelease({ ...release, readAt: new Date().toISOString() }),
                (e: Error) => setError(e.message),
              )
            }
          >
            I have read my summary
          </button>
        )}
      </div>
      {error && <p className="field-error" role="alert">{error}</p>}
    </section>
  );
}
