import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  RIGHTS_REQUEST_LABELS,
  agreedTimeMultiplier,
  canStartAssessment,
  employeeAdjustmentView,
  type AdjustmentRequest,
  createAcknowledgement,
  emptyForm,
  placeholdersIn,
  validateAcknowledgement,
  type AcknowledgementForm,
  type AcknowledgementRecord,
  type EmployeeRecordDetails,
  type FormErrors,
  type PrivacyNotice,
  type RightsRequestType,
} from '../../../src/participation/index.js';
import { Modal } from '../components/Modal.js';
import { clearDemoServer } from './demoTransport.js';
import { resetRequests } from '../shared/adjustmentStore.js';
import { resetRightsRequests } from '../shared/requestStore.js';
import { MyRequests } from './MyRequests.js';
import { MySummary } from './MySummary.js';
import { MyWgWay } from './MyWgWay.js';
import { resetReleases } from '../shared/summaryStore.js';
import { ACK_KEY, RUN_KEY } from '../shared/participationStore.js';
import { Runner, clearSavedSession } from './Runner.js';
import { LOGO_SRC } from '../shared/Landing.js';
import { useSignedIn } from '../shared/auth.js';
import { useBackend, type AssessmentOutline, type Loaded, type RunOptions, type ServerSnapshot } from './backend.js';
import { ReadyPage } from './ReadyPage.js';
import type { AssessmentDefinition } from '../../../src/runner/index.js';

const STEPS = ['About FocusiQ', 'Privacy notice', 'Your details', 'Statements', 'Adjustments', 'Review and sign', 'Done'] as const;
const STEP_ERRORS: Partial<Record<number, (keyof FormErrors)[]>> = { 2: ['details'], 3: ['ticked'], 4: ['adjustment'], 5: ['typedName', 'notice'] };

/** Renders text with [[placeholders]] highlighted. */
function Text({ children }: { children: string }) {
  const parts = children.split(/(\[\[[^\]]+\]\])/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('[[') ? (
          <span key={i} className="placeholder" title="To be completed by Walter Geering before go-live">{p.slice(2, -2)}</span>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}

const dateLong = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

export function EmployeeApp() {
  const backend = useBackend();
  const [loaded, setLoaded] = useState<Loaded | null | undefined>(undefined);
  const [failure, setFailure] = useState<string | null>(null);
  useEffect(() => {
    backend.load().then(setLoaded, (e: Error) => setFailure(e.message));
  }, [backend]);
  if (failure) return <Shell me={null}><main className="card panel"><h2>FocusiQ could not load</h2><p>{failure}</p><p className="small muted">Please refresh the page. If it keeps happening, tell a Director.</p></main></Shell>;
  if (loaded === undefined) return <Shell me={null}><main className="card panel"><p aria-busy="true">Loading your FocusiQ page…</p></main></Shell>;
  if (loaded === null) {
    return (
      <Shell me={null}>
        <main className="card panel">
          <h2>No FocusiQ record yet</h2>
          <p>Your Walter Geering account is not linked to a FocusiQ employee record. If you were expecting to take part, please speak to a Director.</p>
        </main>
      </Shell>
    );
  }
  if (!loaded.notice) {
    return (
      <Shell me={loaded.me}>
        <main className="card panel">
          <h2>FocusiQ is not open yet</h2>
          <p>Walter Geering has not published the FocusiQ privacy notice yet, so there is nothing to do for now. You will get an email when it is ready.</p>
        </main>
      </Shell>
    );
  }
  return <Participation loaded={loaded} notice={loaded.notice} />;
}

/** Header and layout around every employee page. */
function Shell({ me, children, placeholders = 0 }: { me: EmployeeRecordDetails | null; children: ReactNode; placeholders?: number }) {
  const backend = useBackend();
  const who = useSignedIn();
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    const b = backend as { contentNote?: () => Promise<string | null> };
    b.contentNote?.().then(setNote, () => undefined);
  }, [backend]);
  return (
    <div className="emp-shell">
      <header className="emp-top">
        <img className="brand-logo" src={LOGO_SRC} alt="FocusiQ" />
        <span className="lbl">Walter Geering</span>
        <span className="who">
          {backend.preview ? (
            <>
              Preview as “{me?.fullName ?? 'Sam Example'}” ·{' '}
              <button className="btn link" onClick={() => window.location.reload()}>Start again</button>
            </>
          ) : backend.live ? (
            <>
              {me ? <>Signed in as {me.fullName} · </> : null}
              {who && <button className="btn link" onClick={() => who.signOut()}>Sign out</button>}
            </>
          ) : (
            <>
              Signed in as {me?.fullName ?? 'Stan'} (demo) ·{' '}
              <button
                className="btn link"
                onClick={() => {
                  for (const k of [ACK_KEY, RUN_KEY]) localStorage.removeItem(k);
                  clearSavedSession();
                  clearDemoServer();
                  resetRequests();
                  resetRightsRequests();
                  resetReleases();
                  window.location.reload();
                }}
              >
                Reset demo
              </button>
            </>
          )}
        </span>
      </header>
      {backend.preview && (
        <div className="banner banner-preview" role="note">
          <strong>Preview – this is exactly what staff see.</strong> Nothing you enter is saved, sent or emailed.{' '}
          {note}
          {placeholders > 0 && <> Highlighted text ({placeholders} items) must be completed by Walter Geering before go-live.</>}
        </div>
      )}
      {!backend.live && !backend.preview && (
        <div className="banner" role="note">
          <strong>Demo.</strong> Nothing you enter is sent anywhere.{' '}
          {placeholders > 0 && <>Highlighted text ({placeholders} items) must be completed by Walter Geering before go-live.</>}
        </div>
      )}
      {children}
    </div>
  );
}

/** Loads the question content for an assessment in progress, then runs it. */
function RunnerHost({ run }: { run: RunOptions }) {
  const backend = useBackend();
  const [opened, setOpened] = useState<{ definition: AssessmentDefinition; snapshot: ServerSnapshot } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    backend.open(run).then(setOpened, (e: Error) => setError(e.message));
  }, [run, backend]);
  if (error) return <main className="card panel"><h2>The assessment could not open</h2><p>{error}</p><p className="small muted">Your answers so far are saved. Please refresh the page to try again.</p></main>;
  if (!opened) return <main className="card panel"><p aria-busy="true">Opening your assessment…</p></main>;
  return <Runner definition={opened.definition} options={run} transport={backend.transport} snapshot={opened.snapshot} storageKey={backend.runnerStorageKey} />;
}

function Participation({ loaded, notice }: { loaded: Loaded; notice: PrivacyNotice }) {
  const backend = useBackend();
  const NOTICE = notice;
  // "Are you prepared and ready?": 'start' before starting, 'read' to read ahead.
  const [readyView, setReadyView] = useState<'start' | 'read' | null>(null);
  const [outline, setOutline] = useState<AssessmentOutline | null>(null);
  useEffect(() => {
    backend.outline().then(setOutline, () => undefined);
  }, [backend]);
  const ME = loaded.me;
  const [record, setRecord] = useState<AcknowledgementRecord | null>(loaded.acknowledgement);
  const [step, setStep] = useState(() => (record ? STEPS.length - 1 : 0));
  const [run, setRun] = useState<RunOptions | null>(loaded.run);
  const [completed] = useState(loaded.completed);
  const [adjustment, setAdjustment] = useState<AdjustmentRequest | null>(loaded.adjustment);
  // A Director's decision (another tab in the demo; the database when live) updates this page.
  useEffect(() => backend.watchAdjustment(ME, setAdjustment), [ME, backend]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [form, setForm] = useState<AcknowledgementForm>(emptyForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const [asking, setAsking] = useState(false);
  const [lastSent, setLastSent] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const placeholders = placeholdersIn(NOTICE);

  useEffect(() => {
    headingRef.current?.focus();
    window.scrollTo({ top: 0 });
  }, [step, readyView]);

  const startAssessment = async () => {
    setStarting(true);
    setSaveError(null);
    try {
      setRun(await backend.start(agreedTimeMultiplier(adjustment)));
      setReadyView(null);
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setStarting(false);
    }
  };
  const readAhead = (
    <p className="ready-link no-print">
      <button className="btn link" onClick={() => setReadyView('read')}>Are you prepared and ready?</button>{' '}
      <span className="small muted">What you need, what to expect and what is expected of you.</span>
    </p>
  );

  const update = (f: Partial<AcknowledgementForm>) => setForm((prev) => ({ ...prev, ...f }));
  const stepErrors = (s: number, all: FormErrors): FormErrors =>
    Object.fromEntries((STEP_ERRORS[s] ?? []).filter((k) => all[k]).map((k) => [k, all[k]]));

  const next = async () => {
    const errs = stepErrors(step, validateAcknowledgement(form, NOTICE, ME));
    setErrors(errs);
    if (Object.keys(errs).length) {
      document.getElementById('error-summary')?.focus();
      return;
    }
    if (step === 5) {
      setSaveError(null);
      try {
        const created = await createAcknowledgement(form, NOTICE, ME);
        const saved = await backend.saveAcknowledgement(created, ME);
        setRecord(saved);
        // Shown as being reviewed straight away; the Director's decision arrives through watchAdjustment.
        if (saved.adjustmentRequested) {
          setAdjustment({ id: saved.id, employeeId: ME.employeeId, employeeName: ME.fullName, department: ME.department, description: saved.adjustmentDescription ?? '', createdAt: saved.acknowledgedAt, status: 'pending', history: [] });
        }
      } catch (e) {
        setSaveError(`Your acknowledgement could not be saved: ${(e as Error).message} Please try again.`);
        return;
      }
    }
    setStep(step + 1);
  };

  const heading = (text: string) => (
    <h2 ref={headingRef} tabIndex={-1}>{text}</h2>
  );
  const fieldError = (k: keyof FormErrors) => (errors[k] ? <p className="field-error" id={`err-${k}`}>{errors[k]}</p> : null);

  let body: ReactNode;
  switch (step) {
    case 0:
      body = (
        <>
          {heading('Before you start your FocusiQ assessment')}
          <p className="lead">This takes about 5 minutes. Please read how your information will be used and confirm a few details.</p>
          <ul>
            {NOTICE.summary.map((s) => <li key={s}><Text>{s}</Text></li>)}
          </ul>
          <p>You will:</p>
          <ol>
            <li>read the privacy notice;</li>
            <li>check your details are correct;</li>
            <li>tick to confirm you understand how FocusiQ works;</li>
            <li>tell us if anything would help you complete the assessment fairly;</li>
            <li>type your name to sign.</li>
          </ol>
          {readAhead}
        </>
      );
      break;
    case 1:
      body = (
        <>
          {heading(NOTICE.title)}
          <p className="small muted">Version {NOTICE.version}</p>
          {NOTICE.sections.map((s) => (
            <section key={s.id} className="notice-section">
              <h3>{s.heading}</h3>
              {s.paragraphs.map((p) => <p key={p}><Text>{p}</Text></p>)}
            </section>
          ))}
        </>
      );
      break;
    case 2:
      body = (
        <>
          {heading('Check your details')}
          <p>These come from your employee record.</p>
          <dl className="details-grid">
            <dt>Name</dt><dd>{ME.fullName}</dd>
            <dt>Department</dt><dd>{ME.department}</dd>
            <dt>Job role</dt><dd>{ME.jobRole}</dd>
            <dt>Start date</dt><dd>{dateLong(ME.startDate)}</dd>
          </dl>
          <fieldset aria-describedby={errors.details ? 'err-details' : undefined}>
            <legend>Are these details correct?</legend>
            {fieldError('details')}
            <label className="choice"><input type="radio" name="details" checked={form.detailsCorrect === true} onChange={() => update({ detailsCorrect: true })} />Yes, these are correct</label>
            <label className="choice"><input type="radio" name="details" checked={form.detailsCorrect === false} onChange={() => update({ detailsCorrect: false })} />Something needs correcting</label>
          </fieldset>
          {form.detailsCorrect === false && (
            <div className="field" style={{ marginTop: 8 }}>
              <label htmlFor="correction">What needs correcting? HR will update your record.</label>
              <textarea id="correction" value={form.detailsCorrection} onChange={(e) => update({ detailsCorrection: e.target.value })} />
            </div>
          )}
        </>
      );
      break;
    case 3: {
      body = (
        <>
          {heading('Please confirm you understand')}
          <p>Please read and tick each statement. These record that you have read and understood the notice.</p>
          <fieldset aria-describedby={errors.ticked ? 'err-ticked' : undefined}>
            <legend className="sr-only">Statements</legend>
            {fieldError('ticked')}
            {NOTICE.acknowledgements.map((a) => (
              <label key={a.id} className="choice">
                <input type="checkbox" checked={!!form.ticked[a.id]} onChange={(e) => update({ ticked: { ...form.ticked, [a.id]: e.target.checked } })} />
                <span><Text>{a.text}</Text></span>
              </label>
            ))}
          </fieldset>
          <p className="small muted">If you are unsure about anything, use “Questions or concerns” before continuing.</p>
        </>
      );
      break;
    }
    case 4:
      body = (
        <>
          {heading('Is there anything that would help?')}
          <p>
            If anything would help you complete the assessment fairly – for example extra time, a screen reader, larger
            text or breaks – let us know. You don't need to share medical details, just what would help.
          </p>
          <fieldset aria-describedby={errors.adjustment ? 'err-adjustment' : undefined}>
            <legend>Would you like an adjustment?</legend>
            {fieldError('adjustment')}
            <label className="choice"><input type="radio" name="adj" checked={form.adjustmentRequested === false} onChange={() => update({ adjustmentRequested: false })} />No, I don't need an adjustment</label>
            <label className="choice"><input type="radio" name="adj" checked={form.adjustmentRequested === true} onChange={() => update({ adjustmentRequested: true })} />Yes, I would like to ask for an adjustment</label>
          </fieldset>
          {form.adjustmentRequested && (
            <div className="field" style={{ marginTop: 8 }}>
              <label htmlFor="adj-desc">What would help?</label>
              <textarea id="adj-desc" value={form.adjustmentDescription} onChange={(e) => update({ adjustmentDescription: e.target.value })} />
              <p className="small muted">A Director will review this before your assessment. An adjustment does not count against you.</p>
            </div>
          )}
        </>
      );
      break;
    case 5:
      body = (
        <>
          {heading('Review and sign')}
          <dl className="details-grid">
            <dt>Notice</dt><dd>{NOTICE.version}</dd>
            <dt>Your details</dt><dd>{form.detailsCorrect ? 'Confirmed correct' : `Correction requested: ${form.detailsCorrection}`}</dd>
            <dt>Statements</dt><dd>All {NOTICE.acknowledgements.length} confirmed</dd>
            <dt>Adjustment</dt><dd>{form.adjustmentRequested ? `Requested: ${form.adjustmentDescription}` : 'None requested'}</dd>
          </dl>
          <div className="field">
            <label htmlFor="typed-name">Type your full name to sign</label>
            {fieldError('typedName')}
            {fieldError('notice')}
            <input
              id="typed-name"
              type="text"
              autoComplete="name"
              value={form.typedName}
              aria-describedby={errors.typedName ? 'err-typedName' : undefined}
              onChange={(e) => update({ typedName: e.target.value })}
            />
          </div>
          <p className="small muted">Your acknowledgement is saved with the date, time and exact version of the notice. It cannot be changed afterwards; if the notice is updated you will be asked to read the new version.</p>
        </>
      );
      break;
    default: {
      const check = record ? canStartAssessment([record], NOTICE, ME.employeeId) : null;
      const adjustmentView = record?.adjustmentRequested && adjustment ? employeeAdjustmentView(adjustment) : null;
      body = record && (
        <div className="record">
          <div className="row no-print">
            <div className="done-mark" aria-hidden="true">✓</div>
            {heading(adjustmentView && !adjustmentView.canStart ? 'Thank you – your acknowledgement is saved' : 'Thank you – you are ready to start')}
          </div>
          {adjustmentView && !adjustmentView.canStart && (
            <p className="no-print">Your assessment will open once a Director has reviewed your adjustment request. You don't need to do anything else for now.</p>
          )}
          <h2 className="print-only">FocusiQ acknowledgement record</h2>
          <dl className="details-grid">
            <dt>Name</dt><dd>{ME.fullName}</dd>
            <dt>Signed as</dt><dd>{record.typedName}</dd>
            <dt>Date and time</dt><dd>{new Date(record.acknowledgedAt).toLocaleString('en-GB')}</dd>
            <dt>Notice version</dt><dd>{record.noticeVersion}</dd>
            <dt>Details</dt><dd>{record.detailsCorrect ? 'Confirmed correct' : `Correction requested – HR will be in touch`}</dd>
            <dt>Adjustment</dt><dd>{record.adjustmentRequested ? 'Requested' : 'None requested'}</dd>
          </dl>
          <h3>You confirmed</h3>
          <ul>{record.acknowledgedItems.map((i) => <li key={i.id}><Text>{i.text}</Text></li>)}</ul>
          <p className="small muted">Notice fingerprint (SHA-256): <span className="fingerprint">{record.noticeSha256}</span></p>
          {adjustmentView && (
            <div className={`adjustment-status adjustment-${adjustmentView.status} no-print`} role="status" aria-live="polite">
              <strong>{adjustmentView.headline}</strong>
              {adjustmentView.arrangements.length > 0 && (
                <ul>{adjustmentView.arrangements.map((a) => <li key={a}>{a}</li>)}</ul>
              )}
              {adjustmentView.message && <p>{adjustmentView.message}</p>}
              {adjustmentView.status === 'pending' && (
                <p className="small">
                  You will be able to start once a Director has reviewed it. This page updates automatically, and you will also get an email.{' '}
                  {!backend.live && (
                    <span className="muted">
                      Demo: open the <a href="./index.html#adjustments" target="_blank" rel="noreferrer">Director dashboard → Adjustments</a> in another tab to decide it.
                    </span>
                  )}
                </p>
              )}
              {adjustmentView.status === 'declined' && <p className="small">You can still take the assessment under the standard conditions.</p>}
            </div>
          )}
          {readAhead}
          <div className="nav no-print">
            <button className="btn secondary" onClick={() => window.print()}>Print or save a copy</button>
            <button
              className="btn"
              disabled={starting || !check?.allowed || (adjustmentView !== null && !adjustmentView.canStart)}
              title={adjustmentView && !adjustmentView.canStart ? 'Your adjustment request will be reviewed first' : undefined}
              onClick={() => setReadyView('start')}
            >
              {adjustmentView && !adjustmentView.canStart ? 'Assessment opens once your adjustment is reviewed' : starting ? 'Opening…' : 'Start my assessment'}
            </button>
          </div>
        </div>
      );
    }
  }

  const visibleErrors = Object.entries(errors).filter(([, v]) => v);
  return (
    <Shell me={ME} placeholders={placeholders.length}>
      <MySummary me={ME} onAsk={() => setAsking(true)} />
      <MyWgWay me={ME} />
      {saveError && <p className="error-summary" role="alert">{saveError}</p>}
      {completed && run ? (
        <main className="card panel">
          <div className="row"><div className="done-mark" aria-hidden="true">✓</div><h2>You have completed your FocusiQ assessment</h2></div>
          <p>Thank you. Your answers are saved. A Director will review the results, and you will receive your own summary here afterwards.</p>
        </main>
      ) : run && record ? (
        <RunnerHost run={run} />
      ) : readyView ? (
        <main className="card panel">
          <ReadyPage
            outline={outline}
            extraTimePercent={adjustment ? employeeAdjustmentView(adjustment).extraTimePercent : null}
            mode={readyView}
            starting={starting}
            onStart={startAssessment}
            onBack={() => setReadyView(null)}
            headingRef={headingRef}
          />
        </main>
      ) : (<>
      {step < STEPS.length - 1 && (
        <>
          <div className="progress" aria-hidden="true">{STEPS.slice(0, -1).map((s, i) => <span key={s} className={i <= step ? 'done' : ''} />)}</div>
          <div className="step-label lbl">Step {step + 1} of {STEPS.length - 1} · {STEPS[step]}</div>
        </>
      )}
      <main className="card panel">
        {visibleErrors.length > 0 && (
          <div className="error-summary" id="error-summary" tabIndex={-1} role="alert">
            <h2>There is a problem</h2>
            <ul>{visibleErrors.map(([k, v]) => <li key={k}><a href={`#err-${k}`}>{v}</a></li>)}</ul>
          </div>
        )}
        {body}
        {step < STEPS.length - 1 && (
          <div className="nav">
            {step > 0 ? <button className="btn secondary" onClick={() => { setErrors({}); setStep(step - 1); }}>Back</button> : <span />}
            <button className="btn" onClick={next}>{step === 5 ? 'Sign and submit' : step === 0 ? 'Start' : 'Continue'}</button>
          </div>
        )}
      </main>
      </>)}
      <p className="small no-print" style={{ marginTop: 16 }}>
        <button className="btn link" onClick={() => setAsking(true)}>Questions or concerns?</button>{' '}
        <span className="muted">Ask a question, request a copy of your information, or raise an objection.</span>
      </p>
      {lastSent && <p className="small secondary no-print" role="status">{lastSent}</p>}
      <MyRequests me={ME} />
      {asking && (
        <AskModal
          onClose={() => setAsking(false)}
          onSend={async ({ type, message }) => {
            const { dueAt } = await backend.sendRequest(ME, type, message);
            setLastSent(`Sent. Walter Geering will reply by ${new Date(`${dueAt}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.`);
            setAsking(false);
          }}
        />
      )}
    </Shell>
  );
}

function AskModal({ onClose, onSend }: { onClose: () => void; onSend: (r: { type: RightsRequestType; message: string }) => Promise<void> }) {
  const [type, setType] = useState<RightsRequestType>('question');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  return (
    <Modal title="Questions or concerns" onClose={onClose}>
      <div className="stack">
        <div className="field">
          <label htmlFor="ask-type">What would you like to do?</label>
          <select id="ask-type" value={type} onChange={(e) => setType(e.target.value as RightsRequestType)}>
            {(Object.keys(RIGHTS_REQUEST_LABELS) as RightsRequestType[]).map((t) => <option key={t} value={t}>{RIGHTS_REQUEST_LABELS[t]}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="ask-msg">Your message</label>
          <textarea id="ask-msg" value={message} onChange={(e) => setMessage(e.target.value)} />
        </div>
        {error && <p className="field-error" role="alert">{error}</p>}
        <p className="small muted">
          This goes to the Directors responsible for FocusiQ. Questions are usually answered within 5 working days. Requests for a copy of your
          information, a correction or an objection are answered within one month. You can follow progress below, and you can still carry on with the form.
        </p>
      </div>
      <div className="actions">
        <button className="btn secondary" onClick={onClose}>Cancel</button>
        <button
          className="btn"
          disabled={!message.trim() || sending}
          onClick={async () => {
            setSending(true);
            setError(null);
            try {
              await onSend({ type, message });
            } catch (e) {
              setError(`Not sent: ${(e as Error).message}`);
              setSending(false);
            }
          }}
        >
          {sending ? 'Sending…' : 'Send'}
        </button>
      </div>
    </Modal>
  );
}
