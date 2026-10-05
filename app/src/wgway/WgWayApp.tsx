/**
 * "Live the Walter Geering Way – Put the Playbook into Practice": a separate,
 * 10-minute knowledge check for sales staff. 25 questions are drawn per sitting
 * (balanced by topic) from the Walter Geering bank. Staff never see the answers,
 * so later retests stay meaningful; Directors see scores by topic.
 *
 * Demo: sittings are kept in this browser. Live: WG Main draws and scores
 * each sitting (./live.ts); the answer key never reaches this page.
 */
import { useState } from 'react';
import { WG_WAY_TEST } from '../demo/wgWayBank.js';
import { demoTransport, serverSnapshot } from '../employee/demoTransport.js';
import { Runner } from '../employee/Runner.js';
import { LOGO_SRC } from '../shared/Landing.js';
import { LIVE } from '../shared/supabase.js';
import { liveTransport, startLiveSitting, type LiveSitting } from './live.js';
import { addSitting, listSittings, WG_WAY_SESSION_KEY, type WgWaySitting } from './store.js';

const LIVE_SESSION_KEY = 'focusiq-live-wgway-session';
const FINISH = 'Thank you – your answers have been recorded. The answers are not shown, so that later checks stay fair. Your Director will talk you through how it went.';

/** The demo employee (as on the employee page). */
const DEMO_EMPLOYEE = 'stan';

function current(): WgWaySitting | null {
  const mine = listSittings().filter((s) => s.employeeId === DEMO_EMPLOYEE);
  const last = mine.at(-1);
  return last && !serverSnapshot(last.assessmentId).completed ? last : null;
}

function Intro({ note, startLabel, starting, error, onStart }: { note?: string | null; startLabel: string; starting?: boolean; error?: string | null; onStart: () => void }) {
  return (
    <main className="card panel">
      <div className="lbl">Walter Geering · sales team</div>
      <h2>Live the Walter Geering Way</h2>
      <p className="lead">Put the Playbook into Practice: a quick check of what you know about Walter Geering.</p>
      <ul>
        <li><strong>25 quick questions in 10 minutes</strong> – our history and DNA, the Walter Geering Way, products, lead times, the Playbook and how we win new business.</li>
        <li>Go with your first answer. You won’t see the answers afterwards, so that later checks stay fair.</li>
        <li>It helps us plan training. You will take it again after the Playbook is shared, and later in the year.</li>
      </ul>
      {note && <p className="small secondary">{note}</p>}
      {error && <p className="error-summary" role="alert">{error}</p>}
      <div className="nav">
        <span />
        <button className="btn" disabled={starting} onClick={onStart}>{starting ? 'Opening…' : startLabel}</button>
      </div>
    </main>
  );
}

/** Live: WG Main draws the questions and scores the sitting. */
function LiveCheck() {
  const [sitting, setSitting] = useState<LiveSitting | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (sitting) {
    return (
      <Runner
        definition={sitting.definition}
        options={{ assessmentId: sitting.sittingId, seed: sitting.sittingId, timeMultiplier: 1 }}
        transport={liveTransport}
        snapshot={sitting.snapshot}
        storageKey={LIVE_SESSION_KEY}
        finishMessage={FINISH}
      />
    );
  }
  return (
    <Intro
      startLabel="Start"
      starting={starting}
      error={error}
      onStart={() => {
        setStarting(true);
        setError(null);
        startLiveSitting().then(setSitting, (e: Error) => {
          setError(e.message);
          setStarting(false);
        });
      }}
    />
  );
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
        <LiveCheck />
      ) : sitting ? (
        <Runner
          definition={WG_WAY_TEST}
          options={{ assessmentId: sitting.assessmentId, seed: sitting.seed, timeMultiplier: 1 }}
          transport={demoTransport}
          snapshot={serverSnapshot(sitting.assessmentId)}
          storageKey={WG_WAY_SESSION_KEY}
          finishMessage={FINISH}
        />
      ) : (
        <Intro
          note={done > 0 ? `You have completed this check ${done === 1 ? 'once' : `${done} times`} in this demo.` : null}
          startLabel={done > 0 ? 'Start another sitting (demo)' : 'Start'}
          onStart={() => setSitting(addSitting(DEMO_EMPLOYEE))}
        />
      )}
    </div>
  );
}
