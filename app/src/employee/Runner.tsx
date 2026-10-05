import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Outbox,
  currentQuestionId,
  effectiveTimeLimit,
  reduce,
  remainingSeconds,
  replay,
  sectionAt,
  unansweredInSection,
  verifyMedia,
  type Action,
  type AssessmentDefinition,
  type MediaRef,
  type RenderedContent,
  type SessionOptions,
  type SessionState,
  type SyncStatus,
  type Transport,
} from '../../../src/runner/index.js';
import type { ServerSnapshot } from './backend.js';

const SESSION_KEY = 'focusiq-demo-session';

/**
 * One colour per section, so people can see where they are (validated with the
 * dataviz validator). Identity only: a chosen answer is shown in the section's
 * colour, never as right or wrong, and every coloured mark also has the
 * section's number or name. Amber and red stay reserved for the timer.
 */
const SECTION_COLOURS = [
  // solid: bars and borders · badge: behind the white numbers (≥ 4.5:1) · tint: backgrounds · text: on the tint
  { solid: '#1e7a46', badge: '#1e7a46', tint: '#ddf2e4', ink: '#ffffff', text: '#1e7a46' },
  { solid: '#2a78d6', badge: '#2470cc', tint: '#e3eefb', ink: '#ffffff', text: '#1f5fae' },
  { solid: '#4a3aa7', badge: '#4a3aa7', tint: '#ebe8f7', ink: '#ffffff', text: '#4a3aa7' },
  { solid: '#e87ba4', badge: '#e87ba4', tint: '#fbe7ef', ink: '#17120e', text: '#a2385f' },
];
const sectionColour = (i: number) => SECTION_COLOURS[i % SECTION_COLOURS.length]!;
const sectionVars = (i: number) => {
  const c = sectionColour(i);
  return { '--sec': c.solid, '--sec-badge': c.badge, '--sec-tint': c.tint, '--sec-ink': c.ink, '--sec-text': c.text } as React.CSSProperties;
};

/** The whole assessment as coloured segments: one per section, filled as questions are answered. */
function SectionProgress({ state, current, finished }: { state: SessionState; current: number | null; finished: boolean }) {
  const sections = state.order;
  return (
    <ol className="sec-progress" aria-label="Your progress through the assessment">
      {sections.map((o, i) => {
        const def = sectionAt(state, i);
        const total = o.questionIds.length;
        const answered = o.questionIds.filter((q) => state.answers[q] !== undefined).length;
        const submitted = finished || state.submittedSections.includes(def.id);
        const fill = submitted ? 1 : total ? answered / total : 0;
        const status = submitted ? 'done' : i === current ? 'now' : 'next';
        return (
          <li key={def.id} className={`sec-${status}`} style={sectionVars(i)}>
            <span className="sec-bar"><span style={{ width: `${Math.round(fill * 100)}%` }} /></span>
            <span className="sec-name">
              <span className="sec-num" aria-hidden="true">{submitted ? '✓' : i + 1}</span>
              {def.title}
              <span className="sr-only">{status === 'done' ? ' – done' : status === 'now' ? ' – in progress' : ' – to come'}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

interface Saved {
  options: SessionOptions;
  actions: Action[];
}

function load(key: string): Saved | null {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '') as Saved;
  } catch {
    return null;
  }
}

function persist(key: string, saved: Saved) {
  try {
    localStorage.setItem(key, JSON.stringify(saved));
  } catch {
    /* demo only */
  }
}

export function clearSavedSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export function hasSavedSession(): boolean {
  return load(SESSION_KEY) !== null;
}

const fmtClock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const fmtDuration = (s: number) => (s % 60 === 0 ? `${s / 60} minutes` : `${Math.floor(s / 60)} min ${s % 60} s`);

export function Runner({
  definition,
  options,
  transport,
  snapshot,
  storageKey = SESSION_KEY,
}: {
  definition: AssessmentDefinition;
  options: Omit<SessionOptions, 'definition'>;
  /** Saves answers (demo: this browser; live: WG Main). */
  transport: Transport;
  /** What the server already holds, so a reload resumes without re-sending. */
  snapshot: ServerSnapshot;
  /** Where the in-progress session is kept on this device. */
  storageKey?: string;
}) {
  const savedRef = useRef<Saved>(
    (() => {
      const existing = load(storageKey);
      if (existing && existing.options.assessmentId === options.assessmentId) return { ...existing, options: { ...existing.options, definition } };
      return { options: { ...options, definition }, actions: [] };
    })(),
  );
  const [state, setState] = useState<SessionState>(() => replay(savedRef.current.options, savedRef.current.actions));
  const stateRef = useRef(state);
  const [now, setNow] = useState(() => new Date().toISOString());
  const [sync, setSync] = useState<SyncStatus>({ kind: 'saved', savedEvents: 0 });
  const [online, setOnline] = useState(() => navigator.onLine);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const outbox = useMemo(() => {
    const o = new Outbox({ transport, onStatus: setSync });
    // Resume: the server already holds events saved before the reload.
    o.markSaved(Math.min(snapshot.events, state.events.length), snapshot.presentationIds, snapshot.completed);
    return o;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.assessmentId]);

  const dispatch = useCallback(
    (make: (at: string) => Action) => {
      const action = make(new Date().toISOString());
      const prev = stateRef.current;
      const next = reduce(prev, action);
      if (next === prev) return;
      stateRef.current = next;
      savedRef.current = { ...savedRef.current, actions: [...savedRef.current.actions, action] };
      // The definition is not stored – it is reloaded from the published version.
      const { definition: _omit, ...options } = savedRef.current.options;
      persist(storageKey, { options: options as SessionOptions, actions: savedRef.current.actions });
      setState(next);
    },
    [],
  );

  // Send new events whenever the session changes.
  useEffect(() => {
    void outbox.push({
      assessmentId: state.assessmentId,
      presentations: Object.values(state.presentations),
      events: state.events,
      completedAt: state.completedAt,
    });
  }, [state, outbox]);

  // Timer: tick every second during a timed section.
  useEffect(() => {
    if (!state.sectionDeadline) return;
    const id = setInterval(() => {
      const t = new Date().toISOString();
      setNow(t);
      dispatch(() => ({ type: 'tick', at: t }));
    }, 1000);
    return () => clearInterval(id);
  }, [state.sectionDeadline, dispatch]);

  // Resumed after a reload/close: the page was hidden when it unloaded, so record the return.
  useEffect(() => {
    if (stateRef.current.hidden && document.visibilityState === 'visible') {
      dispatch((at) => ({ type: 'visibility', hidden: false, at }));
    }
  }, [dispatch]);

  useEffect(() => {
    const onVis = () => dispatch((at) => ({ type: 'visibility', hidden: document.visibilityState === 'hidden', at }));
    const onOnline = () => { setOnline(true); void outbox.retryNow(); };
    const onOffline = () => setOnline(false);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [dispatch, outbox]);

  const phaseKey = JSON.stringify(state.phase);
  useEffect(() => {
    headingRef.current?.focus();
  }, [phaseKey]);

  const heading = (text: string) => <h2 ref={headingRef} tabIndex={-1}>{text}</h2>;
  const sections = definition.sections;

  let body: React.ReactNode;
  const phase = state.phase;
  if (phase.kind === 'intro') {
    body = (
      <>
        {heading(definition.title)}
        <p className="lead">About {definition.estimatedMinutes} minutes. Find somewhere you won’t be interrupted.</p>
        <ul className="section-plan">
          {sections.map((s, i) => {
            const limit = effectiveTimeLimit(state, s);
            return (
              <li key={s.id} style={sectionVars(i)}>
                <span className="plan-num" aria-hidden="true">{i + 1}</span>
                <span><span className="lbl">Section {i + 1}</span><strong>{s.title}</strong></span>
                <span className="tag">{limit ? `Timed · ${fmtDuration(limit)}` : 'No time limit'}</span>
              </li>
            );
          })}
        </ul>
        {state.timeMultiplier !== 1 && (
          <p className="adjust-note">Your agreed adjustment is applied: timed sections give you {Math.round((state.timeMultiplier - 1) * 100)}% extra time.</p>
        )}
        <h3>Before you start</h3>
        <ul>
          <li>Work in the way you normally would. There are no trick questions.</li>
          <li>You can move between questions within a section, but not back to a section once it is submitted.</li>
          <li>Your answers save automatically as you go. If you lose connection, they are kept on this device and sent when you reconnect.</li>
          <li>FocusiQ records how you work through the questions – time taken, changed answers and questions you return to – as explained in the privacy notice.</li>
        </ul>
        <div className="nav"><span /><button className="btn" onClick={() => dispatch((at) => ({ type: 'start', at }))}>Begin</button></div>
      </>
    );
  } else if (phase.kind === 'section_intro') {
    const s = sectionAt(state, phase.section);
    const limit = effectiveTimeLimit(state, s);
    body = (
      <>
        <div className="sec-banner">
          <span className="sec-banner-num" aria-hidden="true">{phase.section + 1}</span>
          <div>
            <div className="lbl">Section {phase.section + 1} of {sections.length}</div>
            {heading(s.title)}
          </div>
        </div>
        <ul>{s.instructions.map((t) => <li key={t}>{t}</li>)}</ul>
        {limit && (
          <p className="timer-note">
            You will have <strong>{fmtDuration(limit)}</strong> for this section
            {state.timeMultiplier !== 1 ? ' (including your agreed extra time)' : ''}. The clock starts when you press Start.
          </p>
        )}
        {s.rememberThis && (
          <div className="remember">
            <div className="lbl">Read carefully – you will need this later</div>
            <ul>{s.rememberThis.map((t) => <li key={t}>{t}</li>)}</ul>
            <p className="small muted">You won’t be able to see this again once you start.</p>
          </div>
        )}
        <div className="nav"><span /><button className="btn" onClick={() => dispatch((at) => ({ type: 'start_section', at }))}>Start section</button></div>
      </>
    );
  } else if (phase.kind === 'question') {
    const id = currentQuestionId(state)!;
    const p = state.presentations[id]!;
    const ids = state.order[phase.section]!.questionIds;
    const last = phase.index === ids.length - 1;
    body = (
      <>
        <QuestionHeader state={state} now={now} section={phase.section} index={phase.index} onGo={(i) => dispatch((at) => ({ type: 'go', index: i, at }))} />
        <Question
          key={id}
          content={p.renderedContent}
          answer={state.answers[id]}
          headingRef={headingRef}
          onAnswer={(value) => dispatch((at) => ({ type: 'answer', value, at }))}
        />
        <div className="nav">
          {phase.index > 0 ? (
            <button className="btn secondary" onClick={() => dispatch((at) => ({ type: 'go', index: phase.index - 1, at }))}>Previous</button>
          ) : <span />}
          {last ? (
            <button className="btn" onClick={() => dispatch((at) => ({ type: 'review', at }))}>Review section</button>
          ) : (
            <button className="btn" onClick={() => dispatch((at) => ({ type: 'go', index: phase.index + 1, at }))}>Next</button>
          )}
        </div>
      </>
    );
  } else if (phase.kind === 'section_review') {
    const s = sectionAt(state, phase.section);
    const unanswered = unansweredInSection(state, phase.section);
    const ids = state.order[phase.section]!.questionIds;
    body = (
      <>
        <div className="row"><span className="lbl">Section {phase.section + 1} of {sections.length}</span><span className="spacer" /><TimerPill state={state} now={now} /></div>
        {heading(`Check your answers – ${s.title}`)}
        <ul className="review-list">
          {ids.map((qid, i) => (
            <li key={qid}>
              <span>Question {i + 1}</span>
              {state.answers[qid] !== undefined ? <span className="tag answered">✓ Answered</span> : <span className="tag unanswered">Not answered</span>}
              <button className="btn link" onClick={() => dispatch((at) => ({ type: 'go', index: i, at }))}>Go to question</button>
            </li>
          ))}
        </ul>
        {unanswered.length > 0 && (
          <p className="warn" role="status">
            {unanswered.length} question{unanswered.length === 1 ? ' is' : 's are'} not answered. You won’t be able to return to this section after submitting it.
          </p>
        )}
        <div className="nav">
          <button className="btn secondary" onClick={() => dispatch((at) => ({ type: 'go', index: ids.length - 1, at }))}>Back to questions</button>
          <button className="btn" onClick={() => dispatch((at) => ({ type: 'submit_section', at }))}>
            {phase.section === sections.length - 1 ? 'Submit assessment' : 'Submit section'}
          </button>
        </div>
      </>
    );
  } else {
    body = (
      <div className="record">
        <div className="row"><div className="done-mark" aria-hidden="true">✓</div>{heading('Thank you – you have finished')}</div>
        <p>Your responses have been recorded. A Director will review the results, and you will receive your own summary afterwards.</p>
        <ul className="done-sections">
          {sections.map((sec, i) => (
            <li key={sec.id} style={sectionVars(i)}><span aria-hidden="true">✓</span>{sec.title}</li>
          ))}
        </ul>
        <p className="small muted">You can close this page once your answers show as saved below.</p>
      </div>
    );
  }

  const currentSection = 'section' in phase ? phase.section : null;
  const showProgress = phase.kind !== 'intro';
  return (
    <>
      {showProgress && <SectionProgress state={state} current={currentSection} finished={phase.kind === 'complete'} />}
      <main
        className={`card panel runner${currentSection !== null ? ' in-section' : ''}`}
        style={currentSection !== null ? sectionVars(currentSection) : undefined}
        aria-live="off"
      >
        {body}
      </main>
      <SaveStatus sync={sync} online={online} />
    </>
  );
}

function TimerPill({ state, now }: { state: SessionState; now: string }) {
  const left = remainingSeconds(state, now);
  if (left === null) return null;
  const level = left <= 10 ? 'critical' : left <= 30 ? 'low' : 'ok';
  return (
    <span className={`timer timer-${level}`} role="timer" aria-live={level === 'ok' ? 'off' : 'polite'}>
      <span aria-hidden="true">⏱</span> {fmtClock(left)} left{level === 'critical' ? ' – answers so far will be saved' : ''}
    </span>
  );
}

function QuestionHeader({ state, now, section, index, onGo }: { state: SessionState; now: string; section: number; index: number; onGo: (i: number) => void }) {
  const ids = state.order[section]!.questionIds;
  const s = sectionAt(state, section);
  return (
    <div className="q-head">
      <div className="row">
        <span className="q-title">
          <span className="q-num" aria-hidden="true">{index + 1}</span>
          <span className="lbl">{s.title} · Question {index + 1} of {ids.length}</span>
        </span>
        <span className="spacer" />
        <TimerPill state={state} now={now} />
      </div>
      <nav className="q-dots" aria-label="Questions in this section">
        {ids.map((qid, i) => (
          <button
            key={qid}
            className={`q-dot${i === index ? ' current' : ''}${state.answers[qid] !== undefined ? ' answered' : ''}`}
            aria-label={`Question ${i + 1}${state.answers[qid] !== undefined ? ', answered' : ', not answered'}`}
            aria-current={i === index ? 'step' : undefined}
            onClick={() => onGo(i)}
          >
            {i + 1}
          </button>
        ))}
      </nav>
    </div>
  );
}

function Question({
  content,
  answer,
  onAnswer,
  headingRef,
}: {
  content: RenderedContent;
  answer: string | undefined;
  onAnswer: (v: string) => void;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  return (
    <>
      <h2 ref={headingRef} tabIndex={-1} className="stem">{content.stem}</h2>
      {content.detail && (
        <div className="detail">{content.detail.map((d) => <div key={d}>{d}</div>)}</div>
      )}
      {content.image && <VerifiedImage media={content.image} className="stem-image" />}
      {content.kind === 'single_choice' ? (
        <fieldset>
          <legend className="sr-only">Choose one answer</legend>
          <div className={content.options.some((o) => o.image) ? `option-grid${content.options.length > 4 ? ' option-grid-many' : ''}` : undefined}>
            {content.options.map((o) => (
              <label key={o.id} className="choice">
                <input type="radio" name={content.questionVersionId} checked={answer === o.id} onChange={() => onAnswer(o.id)} />
                {o.image ? <VerifiedImage media={o.image} className="option-image" /> : <span>{o.text}</span>}
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
        <Ranking content={content} answer={answer} onAnswer={onAnswer} />
      )}
    </>
  );
}

function Ranking({ content, answer, onAnswer }: { content: RenderedContent; answer: string | undefined; onAnswer: (v: string) => void }) {
  const order = answer ? answer.split('>') : content.options.map((o) => o.id);
  const byId = new Map(content.options.map((o) => [o.id, o]));
  const move = (i: number, d: -1 | 1) => {
    const next = [...order];
    [next[i], next[i + d]] = [next[i + d]!, next[i]!];
    onAnswer(next.join('>'));
  };
  return (
    <>
      <ol className="ranking" aria-label="Your order, most important first">
        {order.map((id, i) => (
          <li key={id}>
            <span className="rank-pos" aria-hidden="true">{i + 1}</span>
            <span className="rank-text">{byId.get(id)!.text}</span>
            <span className="rank-moves">
              <button className="btn secondary" disabled={i === 0} aria-label={`Move “${byId.get(id)!.text}” up`} onClick={() => move(i, -1)}>↑</button>
              <button className="btn secondary" disabled={i === order.length - 1} aria-label={`Move “${byId.get(id)!.text}” down`} onClick={() => move(i, 1)}>↓</button>
            </span>
          </li>
        ))}
      </ol>
      {!answer && (
        <button className="btn link" onClick={() => onAnswer(order.join('>'))}>This order is right – keep it</button>
      )}
      {answer && <p className="small muted">Your order is saved. You can still change it.</p>}
    </>
  );
}

/** Shows an image only if its bytes match the recorded SHA-256 fingerprint. */
function VerifiedImage({ media, className }: { media: MediaRef; className?: string }) {
  const [state, setState] = useState<{ url: string } | { error: string } | null>(null);
  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(media.src);
        const bytes = await res.arrayBuffer();
        if (!(await verifyMedia(bytes, media.sha256))) throw new Error('mismatch');
        url = URL.createObjectURL(new Blob([bytes], { type: res.headers.get('content-type') ?? 'image/svg+xml' }));
        if (!cancelled) setState({ url });
      } catch {
        if (!cancelled) setState({ error: 'This image could not be verified, so it is not shown. Please tell the person responsible for FocusiQ.' });
      }
    })();
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [media.src, media.sha256]);
  if (!state) return <div className={`${className ?? ''} img-loading`} aria-busy="true" />;
  if ('error' in state) return <p className="field-error" role="alert">{state.error}</p>;
  return <img className={className} src={state.url} alt={media.alt} />;
}

function SaveStatus({ sync, online }: { sync: SyncStatus; online: boolean }) {
  let content: React.ReactNode;
  if (!online || sync.kind === 'retrying') {
    content = <span className="tag save-offline">⚠ Not connected – your latest answers are kept on this device and will be sent automatically when you reconnect</span>;
  } else if (sync.kind === 'saving') {
    content = <span className="tag">Saving…</span>;
  } else {
    content = <span className="tag save-ok">✓ All answers saved</span>;
  }
  return <p className="save-status" role="status">{content}</p>;
}
