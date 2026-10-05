/**
 * Directors' view of "Live the Walter Geering Way": each sitting's score and
 * topic breakdown, the change since the person's previous sitting, and the
 * team's weakest topics – to plan Playbook training. Staff never see answers.
 */
import { useEffect, useMemo, useState } from 'react';
import { Card } from '../components/ui.js';
import { WG_WAY_TOPICS } from '../demo/wgWayBank.js';
import { useStore } from '../state.js';
import { subscribeSittings } from '../wgway/store.js';
import { demoWgWayResults, pct, QUESTIONS_PER_SITTING, TOPICS, type WgWayResult } from './wgWayResults.js';

const date = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

function TopicCell({ c, t }: { c: number; t: number }) {
  return (
    <span className="wg-topic" title={`${c} of ${t} correct`}>
      <span className="wg-bar" aria-hidden="true"><span style={{ width: `${pct(c, t)}%` }} /></span>
      {c}/{t}
    </span>
  );
}

export function WgWayView() {
  const { data } = useStore();
  const names = useMemo(() => new Map(data.employees.map((e) => [e.id, e.displayName])), [data]);
  const [results, setResults] = useState<WgWayResult[]>(() => demoWgWayResults(names));
  useEffect(() => subscribeSittings(() => setResults(demoWgWayResults(names))), [names]);

  // Latest sitting per person for the team view; the one before it for "change".
  const byPerson = new Map<string, WgWayResult[]>();
  for (const r of results) byPerson.set(r.employeeId, [...(byPerson.get(r.employeeId) ?? []), r]);
  const latest = [...byPerson.values()].map((rs) => rs.at(-1)!);
  const team = TOPICS.map((t) => {
    const c = latest.reduce((n, r) => n + r.byTopic[t].correct, 0);
    const n = latest.reduce((m, r) => m + r.byTopic[t].total, 0);
    return { topic: t, c, n };
  }).sort((a, b) => pct(a.c, a.n) - pct(b.c, b.n));

  return (
    <div className="stack">
      <Card
        title="Live the Walter Geering Way"
        sub="Put the Playbook into Practice – a separate 10-minute knowledge check for the sales team"
        actions={<a className="btn secondary" href="./wg-way.html" target="_blank" rel="noopener">Try it</a>}
      >
        <ul className="evidence-list">
          <li>Each sitting draws {QUESTIONS_PER_SITTING} questions from the Walter Geering bank, the same number from each topic, so a retest asks different questions but scores compare fairly.</li>
          <li>Plan: a baseline now, a retest after the Playbook is shared, and another later in the year.</li>
          <li>Staff never see the answers. Results here are right or wrong only and are kept apart from the FocusiQ assessment.</li>
        </ul>
        <p className="small muted">
          Demo: sittings are kept in this browser. Stan’s baseline is a sample. Bank: 63 questions; Q25–30 wait for current figures (active lines, customers, targets) and Q31 repeats Q12.
        </p>
      </Card>

      {latest.length > 0 && (
        <Card title="Where the team needs most help" sub="Latest sitting for each person, weakest topic first">
          <table>
            <thead><tr><th>Topic</th><th>Correct</th><th className="num">%</th></tr></thead>
            <tbody>
              {team.map((t) => (
                <tr key={t.topic}><td>{WG_WAY_TOPICS[t.topic]}</td><td><TopicCell c={t.c} t={t.n} /></td><td className="num">{pct(t.c, t.n)}%</td></tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Card title="Sittings" sub="Score out of 25, with each topic, and the change since the person’s previous sitting">
        <div className="table-wrap">
          <table className="small">
            <thead>
              <tr>
                <th>Person</th><th>Date</th><th className="num">Score</th><th className="num">Change</th>
                {TOPICS.map((t) => <th key={t}>{WG_WAY_TOPICS[t]}</th>)}
              </tr>
            </thead>
            <tbody>
              {results.map((r) => {
                const mine = byPerson.get(r.employeeId)!;
                const prev = mine[mine.indexOf(r) - 1];
                const change = prev ? pct(r.correct, r.total) - pct(prev.correct, prev.total) : null;
                return (
                  <tr key={r.id}>
                    <td><strong>{r.name}</strong>{r.sample && <div className="small muted">Sample</div>}</td>
                    <td>{date(r.completedAt)}</td>
                    <td className="num"><strong>{r.correct}/{r.total}</strong> <span className="muted">({pct(r.correct, r.total)}%)</span></td>
                    <td className="num">{change === null ? <span className="muted">First</span> : `${change > 0 ? '+' : change < 0 ? '−' : '±'}${Math.abs(change)} pts`}</td>
                    {TOPICS.map((t) => <td key={t}><TopicCell c={r.byTopic[t].correct} t={r.byTopic[t].total} /></td>)}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
