/**
 * The person's own "Live the Walter Geering Way" result, shown only once a
 * Director has shared it: the score and how many were right in each topic.
 * Never the questions, the person's answers or the right answers, and never
 * anyone else's score.
 */
import { useEffect, useState } from 'react';
import type { EmployeeRecordDetails } from '../../../src/participation/index.js';
import { ScoreDonut } from '../shared/ScoreDonut.js';
import type { WgWayRelease } from '../shared/wgWayReleaseStore.js';
import { useBackend } from './backend.js';

const longDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const pct = (c: number, t: number) => (t ? Math.round((c / t) * 100) : 0);

export function MyWgWay({ me }: { me: EmployeeRecordDetails }) {
  const backend = useBackend();
  const [results, setResults] = useState<WgWayRelease[]>([]);
  useEffect(() => backend.watchWgWay(me, setResults), [me, backend]);
  const latest = results[0];
  if (!latest) return null;
  const earlier = results.slice(1);
  return (
    <section className="card panel my-wgway" aria-label="Your Live the Walter Geering Way result">
      <h2>Live the Walter Geering Way</h2>
      <p className="secondary">Your knowledge check on {longDate(latest.completedAt)}{latest.sample ? ' (sample)' : ''}.</p>
      <div className="glance">
        <ScoreDonut correct={latest.correct} total={latest.total} />
        <ul className="wg-topics">
          {latest.byTopic.map((t) => (
            <li key={t.topic}>
              <span>{t.label}</span>
              <span className="wg-topic">
                <span className="wg-bar" aria-hidden="true"><span style={{ width: `${pct(t.correct, t.total)}%` }} /></span>
                {t.correct}/{t.total}
              </span>
            </li>
          ))}
        </ul>
      </div>
      {earlier.length > 0 && (
        <p className="small secondary">
          Earlier: {earlier.map((r) => `${r.correct}/${r.total} on ${longDate(r.completedAt)}`).join(' · ')}
        </p>
      )}
      <p className="small muted">
        The questions and answers are not shared, so that later checks stay fair. This check is separate from your FocusiQ assessment.
      </p>
    </section>
  );
}
