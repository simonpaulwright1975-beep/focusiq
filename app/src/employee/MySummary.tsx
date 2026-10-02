/**
 * The employee's released FocusiQ summary. Shown only once a Director has
 * released it; withdrawn versions disappear. Production reads my_summary(),
 * which returns the summary content only.
 */
import { useEffect, useState } from 'react';
import { currentRelease, markReleaseRead } from '../../../src/participation/index.js';
import { SummaryView } from '../shared/SummaryView.js';
import { listReleases, saveRelease, subscribeReleases } from '../shared/summaryStore.js';

const longDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

export function MySummary({ employeeId, firstName, onAsk }: { employeeId: string; firstName: string; onAsk: () => void }) {
  const [release, setRelease] = useState(() => currentRelease(listReleases(), employeeId));
  useEffect(() => subscribeReleases(() => setRelease(currentRelease(listReleases(), employeeId))), [employeeId]);
  if (!release) return null;
  return (
    <section className="card panel my-summary" aria-label="Your FocusiQ summary">
      <SummaryView summary={release.summary} firstName={firstName} />
      <div className="nav no-print">
        <button className="btn link" onClick={onAsk}>Questions about your summary?</button>
        {release.readAt ? (
          <span className="tag" role="status">✓ Read on {longDate(release.readAt)}</span>
        ) : (
          <button className="btn" onClick={() => saveRelease(markReleaseRead(release, employeeId, new Date()))}>
            I have read my summary
          </button>
        )}
      </div>
    </section>
  );
}
