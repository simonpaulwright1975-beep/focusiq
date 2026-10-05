/**
 * "Live the Walter Geering Way – Put the Playbook into Practice": a separate,
 * 10-minute knowledge check for sales staff. 25 questions are drawn per sitting
 * (balanced by topic) from the Walter Geering bank. Staff never see the answers,
 * so later retests stay meaningful; Directors see scores by topic.
 *
 * DEMO only for now: sittings are kept in this browser. In live mode the page
 * says it is not open yet (see docs/going-live.md).
 */
import { useState } from 'react';
import { WG_WAY_TEST } from '../demo/wgWayBank.js';
import { demoTransport, serverSnapshot } from '../employee/demoTransport.js';
import { Runner } from '../employee/Runner.js';
import { LOGO_SRC } from '../shared/Landing.js';
import { LIVE } from '../shared/supabase.js';
import { addSitting, listSittings, WG_WAY_SESSION_KEY, type WgWaySitting } from './store.js';

/** The demo employee (as on the employee page). */
const DEMO_EMPLOYEE = 'stan';

function current(): WgWaySitting | null {
  const mine = listSittings().filter((s) => s.employeeId === DEMO_EMPLOYEE);
  const last = mine.at(-1);
  return last && !serverSnapshot(last.assessmentId).completed ? last : null;
}

export function WgWayApp() {
  const [sitting, setSitting] = useState<WgWaySitting | null>(current);
  const done = listSittings().filter((s) => s.employeeId === DEMO_EMPLOYEE && serverSnapshot(s.assessmentId).completed).length;

  return (
    <div className="emp-shell">
      <header className="emp-top">
        <img className="brand-logo" src={LOGO_SRC} alt="FocusiQ" />
        <span className="lbl">Walter Geering</span>
        <span className="who">{LIVE ? null : 'Signed in as Stan (demo)'}</span>
      </header>
      {LIVE ? (
        <main className="card panel">
          <h2>Not open yet</h2>
          <p>This check is not open yet. Your Director will send you the link when it is.</p>
        </main>
      ) : sitting ? (
        <Runner
          definition={WG_WAY_TEST}
          options={{ assessmentId: sitting.assessmentId, seed: sitting.seed, timeMultiplier: 1 }}
          transport={demoTransport}
          snapshot={serverSnapshot(sitting.assessmentId)}
          storageKey={WG_WAY_SESSION_KEY}
          finishMessage="Thank you – your answers have been recorded. The answers are not shown, so that later checks stay fair. Your Director will talk you through how it went."
        />
      ) : (
        <main className="card panel">
          <div className="lbl">Walter Geering · sales team</div>
          <h2>Live the Walter Geering Way</h2>
          <p className="lead">Put the Playbook into Practice: a quick check of what you know about Walter Geering.</p>
          <ul>
            <li><strong>25 quick questions in 10 minutes</strong> – our history and DNA, the Walter Geering Way, products, lead times, the Playbook and how we win new business.</li>
            <li>Go with your first answer. You won’t see the answers afterwards, so that later checks stay fair.</li>
            <li>It helps us plan training. You will take it again after the Playbook is shared, and later in the year.</li>
          </ul>
          {done > 0 && <p className="small secondary">You have completed this check {done === 1 ? 'once' : `${done} times`} in this demo.</p>}
          <div className="nav">
            <span />
            <button className="btn" onClick={() => setSitting(addSitting(DEMO_EMPLOYEE))}>
              {done > 0 ? 'Start another sitting (demo)' : 'Start'}
            </button>
          </div>
        </main>
      )}
    </div>
  );
}
