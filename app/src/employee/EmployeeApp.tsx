import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  NOTICE_V1,
  RIGHTS_REQUEST_LABELS,
  agreedTimeMultiplier,
  canStartAssessment,
  createRequest,
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
import { DEMO_ASSESSMENT } from '../demo/assessment.js';
import { clearDemoServer } from './demoTransport.js';
import { latestRequestFor, resetRequests, subscribe, upsertRequest } from '../shared/adjustmentStore.js';
import { resetRightsRequests, upsertRightsRequest } from '../shared/requestStore.js';
import { MyRequests } from './MyRequests.js';
import { Runner, clearSavedSession, newDemoAssessment } from './Runner.js';

const ACK_KEY = 'focusiq-demo-ack';
const RUN_KEY = 'focusiq-demo-run';
const readJson = <T,>(key: string): T | null => {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '') as T;
  } catch {
    return null;
  }
};
const writeJson = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* demo only */
  }
};
type RunOptions = ReturnType<typeof newDemoAssessment>;

/**
 * DEMO: the notice is shown as published so the flow can be tried, with its
 * unfilled placeholders highlighted. A real deployment publishes only a
 * completed notice (publishNotice refuses placeholders).
 */
const NOTICE: PrivacyNotice = { ...NOTICE_V1, publishedAt: '2026-10-01T00:00:00Z' };
const ME: EmployeeRecordDetails = {
  employeeId: 's4',
  fullName: 'Grace Okafor',
  department: 'Sales',
  jobRole: 'Salesperson',
  startDate: '2025-11-03',
};

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
  const [record, setRecord] = useState<AcknowledgementRecord | null>(() => readJson<AcknowledgementRecord>(ACK_KEY));
  const [step, setStep] = useState(() => (record ? STEPS.length - 1 : 0));
  const [run, setRun] = useState<RunOptions | null>(() => readJson<RunOptions>(RUN_KEY));
  const [adjustment, setAdjustment] = useState<AdjustmentRequest | null>(() => latestRequestFor(ME.employeeId));
  // Live: a Director's decision (even in another tab) updates this page.
  useEffect(() => subscribe(() => setAdjustment(latestRequestFor(ME.employeeId))), []);
  const [form, setForm] = useState<AcknowledgementForm>(emptyForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const [asking, setAsking] = useState(false);
  const [lastSent, setLastSent] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const placeholders = placeholdersIn(NOTICE);

  useEffect(() => {
    headingRef.current?.focus();
    window.scrollTo({ top: 0 });
  }, [step]);

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
      const created = await createAcknowledgement(form, NOTICE, ME);
      writeJson(ACK_KEY, created);
      if (created.adjustmentRequested) {
        upsertRequest({
          id: created.id,
          employeeId: ME.employeeId,
          employeeName: ME.fullName,
          department: ME.department,
          description: created.adjustmentDescription!,
          createdAt: created.acknowledgedAt,
          status: 'pending',
          history: [],
        });
      }
      setRecord(created);
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
                  You will be able to start once a Director has reviewed it.{' '}
                  <span className="muted">
                    Demo: open the <a href="./index.html#adjustments" target="_blank" rel="noreferrer">Director dashboard → Adjustments</a> in another tab to decide it – this page updates automatically.
                  </span>
                </p>
              )}
              {adjustmentView.status === 'declined' && <p className="small">You can still take the assessment under the standard conditions.</p>}
            </div>
          )}
          <div className="nav no-print">
            <button className="btn secondary" onClick={() => window.print()}>Print or save a copy</button>
            <button
              className="btn"
              disabled={!check?.allowed || (adjustmentView !== null && !adjustmentView.canStart)}
              title={adjustmentView && !adjustmentView.canStart ? 'Your adjustment request will be reviewed first' : undefined}
              onClick={() => {
                const options = newDemoAssessment(agreedTimeMultiplier(adjustment));
                writeJson(RUN_KEY, options);
                setRun(options);
              }}
            >
              {adjustmentView && !adjustmentView.canStart ? 'Assessment opens once your adjustment is reviewed' : 'Start my assessment'}
            </button>
          </div>
        </div>
      );
    }
  }

  const visibleErrors = Object.entries(errors).filter(([, v]) => v);
  return (
    <div className="emp-shell">
      <header className="emp-top">
        <span className="brand-name">FocusiQ</span>
        <span className="lbl">Walter Geering</span>
        <span className="who">
          Signed in as {ME.fullName} (demo) ·{' '}
          <button
            className="btn link"
            onClick={() => {
              for (const k of [ACK_KEY, RUN_KEY]) localStorage.removeItem(k);
              clearSavedSession();
              clearDemoServer();
              resetRequests();
              resetRightsRequests();
              window.location.reload();
            }}
          >
            Reset demo
          </button>
        </span>
      </header>
      <div className="banner" role="note">
        <strong>Demo.</strong> Nothing you enter is sent anywhere.{' '}
        {placeholders.length > 0 && <>Highlighted text ({placeholders.length} items) must be completed by Walter Geering before go-live.</>}
      </div>
      {run && record ? (
        <Runner definition={DEMO_ASSESSMENT} options={run} />
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
      <MyRequests employeeId={ME.employeeId} />
      {asking && (
        <AskModal
          onClose={() => setAsking(false)}
          onSend={({ type, message }) => {
            const created = createRequest({ employeeId: ME.employeeId, employeeName: ME.fullName, department: ME.department, type, message, now: new Date() });
            upsertRightsRequest(created);
            setLastSent(`Sent. Walter Geering will reply by ${new Date(`${created.dueAt}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.`);
            setAsking(false);
          }}
        />
      )}
    </div>
  );
}

function AskModal({ onClose, onSend }: { onClose: () => void; onSend: (r: { type: RightsRequestType; message: string }) => void }) {
  const [type, setType] = useState<RightsRequestType>('question');
  const [message, setMessage] = useState('');
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
        <p className="small muted">
          This goes to the Directors responsible for FocusiQ. Questions are usually answered within 5 working days. Requests for a copy of your
          information, a correction or an objection are answered within one month. You can follow progress below, and you can still carry on with the form.
        </p>
      </div>
      <div className="actions">
        <button className="btn secondary" onClick={onClose}>Cancel</button>
        <button className="btn" disabled={!message.trim()} onClick={() => onSend({ type, message })}>Send</button>
      </div>
    </Modal>
  );
}
