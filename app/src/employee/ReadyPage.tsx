/**
 * "Are you prepared and ready?" – read before the assessment starts (and any
 * time before, from the link at the top). The ticks are a personal check: they
 * are not saved anywhere.
 */
import { useState } from 'react';
import type { AssessmentOutline } from './backend.js';

const minutes = (s: number) => (s % 60 === 0 ? `${s / 60} minute${s === 60 ? '' : 's'}` : `${Math.floor(s / 60)} min ${s % 60} s`);

const CHECKS = (total: number) => [
  { id: 'time', text: `I have about ${total} minutes free, without interruptions.` },
  { id: 'quiet', text: 'I am somewhere quiet where I can concentrate.' },
  { id: 'device', text: 'I am on a computer or laptop if possible (a phone works, but a bigger screen is easier), and it is charged or plugged in.' },
  { id: 'comfort', text: 'I have anything I normally use to work comfortably – glasses, a drink, headphones or other aids – plus a calculator and paper for the sales figures.' },
  { id: 'own', text: 'I will do this on my own, without help from anyone, and not share the questions with anyone.' },
];

export function ReadyPage({
  outline,
  extraTimePercent,
  mode,
  starting,
  onStart,
  onBack,
  headingRef,
}: {
  outline: AssessmentOutline | null;
  /** Agreed extra time on timed sections, if any. */
  extraTimePercent: number | null;
  /** 'start': ticks then start; 'read': reading ahead, no start button. */
  mode: 'start' | 'read';
  starting?: boolean;
  onStart?: () => void;
  onBack: () => void;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  const factor = 1 + (extraTimePercent ?? 0) / 100;
  // The estimate, plus agreed extra time, plus a few minutes to settle in; rounded up to 5.
  const total = Math.ceil(((outline?.estimatedMinutes ?? 15) * factor + 5) / 5) * 5;
  const checks = CHECKS(total);
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const allTicked = checks.every((c) => ticked[c.id]);
  const timed = outline?.sections.filter((s) => s.timeLimitSeconds) ?? [];

  return (
    <div className="ready">
      <div className="ready-hero">
        <div className="ready-icon" aria-hidden="true">✓</div>
        <div>
          <h2 ref={headingRef} tabIndex={-1}>Are you prepared and ready?</h2>
          <p className="lead">
            A few minutes now helps you show how you really work. There is nothing to revise, no trick questions, and it is not a pass/fail test.
          </p>
        </div>
      </div>

      <section className="ready-card ready-check">
        <h3>Before you start</h3>
        {mode === 'start' && <p className="small secondary">Tick each one when it is true. This is just for you – it is not saved.</p>}
        <ul className="ready-list">
          {checks.map((c) => (
            <li key={c.id}>
              {mode === 'start' ? (
                <label className="choice">
                  <input type="checkbox" checked={!!ticked[c.id]} onChange={(e) => setTicked({ ...ticked, [c.id]: e.target.checked })} />
                  <span>{c.text}</span>
                </label>
              ) : (
                <span className="ready-item"><span className="ready-dot" aria-hidden="true" />{c.text}</span>
              )}
            </li>
          ))}
        </ul>
        {extraTimePercent ? (
          <p className="ready-note">Your agreed adjustment is applied automatically: {extraTimePercent}% extra time on timed sections.</p>
        ) : null}
      </section>

      <section className="ready-card">
        <h3>What to expect</h3>
        {outline ? (
          <ol className="ready-sections">
            {outline.sections.map((s, i) => (
              <li key={s.title} className={`ready-sec ready-sec-${i % 4}`}>
                <span className="ready-sec-num" aria-hidden="true">{i + 1}</span>
                <span><strong>{s.title}</strong><span className="small secondary"> · {s.timeLimitSeconds ? `timed: ${minutes(Math.round(s.timeLimitSeconds * factor))}` : 'no time limit'}</span></span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="small secondary">The sections will be shown when the assessment opens.</p>
        )}
        <ul>
          <li>The sections are taken in order. Within a section you can go back and change answers; once you submit a section you cannot return to it.</li>
          {timed.length > 0 && <li>In a timed section a clock shows the time left. If it runs out, your answers so far are saved – an unanswered question is better than a rushed guess.</li>}
          <li>You can take a short break between sections: the clock only runs inside a timed section.</li>
          <li>Your answers save as you go. If your connection drops, carry on – they are sent when you reconnect.</li>
          <li>As the privacy notice explains, FocusiQ also records how you work through the questions: time taken, changed answers and questions you return to.</li>
        </ul>
      </section>

      <section className="ready-card">
        <h3>What is expected of you</h3>
        <ul>
          <li>Work as you normally would. Don’t rush, and don’t overthink.</li>
          <li>Use only the information on the screen – some sections show facts you will need later, so read them carefully.</li>
          <li>Please don’t discuss the questions with colleagues, before or after.</li>
          <li>If something goes wrong, or you feel unwell, stop and use “Questions or concerns”. Your answers so far are kept.</li>
        </ul>
      </section>

      <section className="ready-card">
        <h3>Afterwards</h3>
        <p>You will see a thank-you screen and get a short email. A Director reviews the results, and you receive your own summary here afterwards. Your results are confidential and are not used on their own for decisions about your employment.</p>
      </section>

      <div className="nav">
        <button className="btn secondary" onClick={onBack}>{mode === 'start' ? 'Not now' : 'Back'}</button>
        {mode === 'start' && (
          <button className="btn" disabled={!allTicked || starting} onClick={onStart} title={allTicked ? undefined : 'Tick each item first'}>
            {starting ? 'Opening…' : 'I’m ready – start my assessment'}
          </button>
        )}
      </div>
    </div>
  );
}
