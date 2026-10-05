/**
 * Directors' view of "Live the Walter Geering Way": each sitting's score and
 * topic breakdown, the change since the person's previous sitting, and the
 * team's weakest topics – to plan Playbook training. Staff never see answers.
 */
import { useEffect, useMemo, useState } from 'react';
import { ScoreDonut } from '../components/bandCharts.js';
import { Card } from '../components/ui.js';
import { WG_WAY_TOPICS } from '../demo/wgWayBank.js';
import { useStore } from '../state.js';
import { LIVE } from '../shared/supabase.js';
import { subscribeSittings } from '../wgway/store.js';
import { listWgWayReleases, subscribeWgWayReleases, type WgWayRelease } from '../shared/wgWayReleaseStore.js';
import { liveWgWayResults, setShared, subscribeLiveWgWay } from './wgWayData.js';
import { demoWgWayResults, pct, QUESTIONS_PER_SITTING, TOPICS, type WgWayResult } from './wgWayResults.js';

const date = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

function TopicCell({ c, t }: { c: number; t: number }) {
  if (t === 0) return <span className="muted">—</span>;
  return (
    <span className="wg-topic" title={`${c} of ${t} correct`}>
      <span className="wg-bar" aria-hidden="true"><span style={{ width: `${pct(c, t)}%` }} /></span>
      {c}/{t}
    </span>
  );
}

/** Every WG Way sitting, oldest first, kept up to date as sittings are saved or shared. */
export function useWgWayResults(): WgWayResult[] {
  const { data } = useStore();
  const names = useMemo(() => new Map(data.employees.map((e) => [e.id, e.displayName])), [data]);
  const [demo, setDemo] = useState<WgWayResult[]>(() => demoWgWayResults(names));
  const [live, setLive] = useState<WgWayResult[]>([]);
  useEffect(() => {
    setDemo(demoWgWayResults(names));
    return subscribeSittings(() => setDemo(demoWgWayResults(names)));
  }, [names]);
  useEffect(() => {
    let alive = true;
    const load = () => liveWgWayResults().then((r) => alive && setLive(r), () => undefined);
    load();
    const stop = subscribeLiveWgWay(load);
    return () => {
      alive = false;
      stop();
    };
  }, []);
  return useMemo(() => [...demo, ...live].sort((a, b) => a.name.localeCompare(b.name) || a.completedAt.localeCompare(b.completedAt)), [demo, live]);
}

/** Latest sitting per person, in first-sitting order. */
export const latestPerPerson = (results: WgWayResult[]) => [...new Map(results.map((r) => [r.employeeId, r])).values()];

/** One right/wrong donut per person (their latest sitting). */
export function WgWayDonuts({ latest }: { latest: WgWayResult[] }) {
  return (
    <div className="wg-donuts">
      {latest.map((r) => (
        <figure key={r.id} className="wg-donut">
          <ScoreDonut correct={r.correct} total={r.total} />
          <figcaption>
            <strong>{r.name}</strong>
            <span className="small muted">{date(r.completedAt)}{r.sample ? ' · sample' : ''}</span>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

/** Demo results shared with the person (this browser). Live results carry their own sharedAt. */
function useDemoReleases(): WgWayRelease[] {
  const [releases, setReleases] = useState(listWgWayReleases);
  useEffect(() => subscribeWgWayReleases(() => setReleases(listWgWayReleases())), []);
  return releases;
}

export function WgWayView() {
  const results = useWgWayResults();
  const demoShared = new Map(useDemoReleases().map((r) => [r.sittingId, r.releasedAt]));
  const sharedAt = (r: WgWayResult) => (r.live ? r.sharedAt ?? null : demoShared.get(r.id) ?? null);
  const [shareError, setShareError] = useState<string | null>(null);
  const share = (r: WgWayResult, on: boolean) => {
    setShareError(null);
    setShared(r, on).catch((e: Error) => setShareError(e.message));
  };

  // Latest sitting per person for the team view; the one before it for "change".
  const byPerson = new Map<string, WgWayResult[]>();
  for (const r of results) byPerson.set(r.employeeId, [...(byPerson.get(r.employeeId) ?? []), r]);
  const latest = [...byPerson.values()].map((rs) => rs.at(-1)!);
  // The team view leaves out Stan's sample once real results exist.
  const real = latest.filter((r) => !r.sample);
  const teamOf = real.length ? real : latest;
  const team = TOPICS.map((t) => {
    const c = teamOf.reduce((n, r) => n + r.byTopic[t].correct, 0);
    const n = teamOf.reduce((m, r) => m + r.byTopic[t].total, 0);
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
          <li>Staff never see the questions or answers. Results here are right or wrong only and are kept apart from the FocusiQ assessment.</li>
          <li>Choose <strong>Share with staff member</strong> to let the person see their own score and topic counts on their FocusiQ page – never the answers or anyone else’s score.</li>
        </ul>
        <p className="small muted">
          {LIVE
            ? 'Sittings are stored in WG Main, which draws and scores each one – the answers never reach staff browsers. Staff open the check at wg-way.html (sales team only). '
            : 'Demo: sittings are kept in this browser. '}
          Stan’s result is a sample covering the whole 70-question bank (67/70); a real sitting draws 25. Bank in use: 63 questions – Q25–30 wait for current figures (active lines, customers, targets) and Q31 repeats Q12.
        </p>
      </Card>

      {latest.length > 0 && (
        <Card title="Latest scores" sub="Each person’s most recent sitting – share of questions answered correctly">
          <WgWayDonuts latest={latest} />
        </Card>
      )}

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

      {shareError && <p className="error-summary" role="alert">{shareError}</p>}
      <Card title="Sittings" sub="Score (25 questions a sitting), each topic, and the change since the person’s previous sitting">
        <div className="table-wrap">
          <table className="small">
            <thead>
              <tr>
                <th>Person</th><th>Date</th><th className="num">Score</th><th className="num">Change</th><th>Staff member sees it</th>
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
                    <td>
                      {sharedAt(r) ? (
                        <>
                          <span className="tag">✓ Shared {date(sharedAt(r)!)}</span>{' '}
                          <button className="btn link" onClick={() => share(r, false)}>Stop sharing</button>
                        </>
                      ) : (
                        <button className="btn secondary small-btn" onClick={() => share(r, true)}>Share with staff member</button>
                      )}
                    </td>
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
