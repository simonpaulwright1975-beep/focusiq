/**
 * The employee's FocusiQ summary as they see it. Shared by the employee app
 * and the Director's release preview, so the preview is exactly what is sent.
 * No engine imports.
 */
import { BAND_EXPLANATIONS, CHANGE_LABELS, type EmployeeBand, type EmployeeSummary } from '../../../src/participation/index.js';

const BAND_CLASS: Record<EmployeeBand, string> = {
  Strength: 'band-strength',
  Expected: 'band-expected',
  'Development opportunity': 'band-develop',
};
const CHANGE_ICON = { higher: '↑', similar: '→', lower: '↓' } as const;
const longDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

export function SummaryView({ summary, firstName }: { summary: EmployeeSummary; firstName: string }) {
  return (
    <article className="summary">
      <div className="lbl">Your FocusiQ summary · assessment on {longDate(summary.assessmentDate)}</div>
      <h2>Hello {firstName}</h2>
      <p className="lead">
        This is a starting point for a conversation, not a score or a pass/fail result. It describes how you approached the
        assessment and how Walter Geering can support you.
      </p>

      {summary.personalMessage && (
        <div className="summary-message">
          <div className="lbl">A note from Walter Geering</div>
          <p>{summary.personalMessage}</p>
        </div>
      )}

      <section>
        <h3>What we saw</h3>
        {summary.paragraphs.map((p) => <p key={p}>{p}</p>)}
      </section>

      {summary.dimensions.length > 0 && (
        <section>
          <h3>Your working style in more detail</h3>
          {summary.bandsProvisional && (
            <p className="small summary-provisional">
              These descriptions use FocusiQ’s first set of expectations, which are still being confirmed. Treat them as a guide for discussion.
            </p>
          )}
          <ul className="summary-dimensions">
            {summary.dimensions.map((d) => (
              <li key={d.key}>
                <div>
                  <strong>{d.label}</strong>
                  <div className="small muted">{d.description}</div>
                </div>
                <div className="summary-dim-right">
                  <span className={`tag ${BAND_CLASS[d.band]}`} title={BAND_EXPLANATIONS[d.band]}>{d.band}</span>
                  {d.change && <span className="small muted">{CHANGE_ICON[d.change]} {CHANGE_LABELS[d.change]}</span>}
                </div>
              </li>
            ))}
          </ul>
          <dl className="summary-key small">
            {(Object.keys(BAND_EXPLANATIONS) as EmployeeBand[]).map((b) => (
              <div key={b}><dt><span className={`tag ${BAND_CLASS[b]}`}>{b}</span></dt><dd>{BAND_EXPLANATIONS[b]}</dd></div>
            ))}
          </dl>
          {summary.previousAssessmentDate && (
            <p className="small muted">“Since last time” compares with your own assessment on {longDate(summary.previousAssessmentDate)} – never with anyone else.</p>
          )}
        </section>
      )}

      {summary.support.length > 0 && (
        <section>
          <h3>How we will support you</h3>
          <ul className="summary-support">
            {summary.support.map((s) => (
              <li key={s.title}><strong>{s.title}</strong><p>{s.detail}</p></li>
            ))}
          </ul>
        </section>
      )}

      {summary.motivators.length > 0 && (
        <section>
          <h3>What you told us matters most to you</h3>
          <ol className="summary-motivators">{summary.motivators.map((m) => <li key={m}>{m}</li>)}</ol>
        </section>
      )}

      <p className="small muted">
        Your results are confidential and used only within Walter Geering. They are never compared with named colleagues in anything you
        or others receive, and they are not used on their own for decisions about your employment.
      </p>
    </article>
  );
}
