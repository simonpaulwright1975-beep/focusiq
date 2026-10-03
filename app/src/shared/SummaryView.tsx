/**
 * The employee's FocusiQ summary as they see it. Shared by the employee app
 * and the Director's release preview, so the preview is exactly what is sent.
 * No engine imports.
 *
 * Colour and pictures, but no numbers: no scores, percentiles or comparisons
 * with colleagues. Bands appear only when a Director released them, and
 * "since last time" compares only with the person's own previous assessment.
 * Band colours match the Director app (Strength green, Expected light green,
 * Development amber), always with the band name written out.
 */
import type { ReactNode } from 'react';
import { BAND_EXPLANATIONS, CHANGE_LABELS, type EmployeeBand, type EmployeeSummary } from '../../../src/participation/index.js';

const BANDS: EmployeeBand[] = ['Strength', 'Expected', 'Development opportunity'];
const BAND_CLASS: Record<EmployeeBand, string> = {
  Strength: 'band-strength',
  Expected: 'band-expected',
  'Development opportunity': 'band-develop',
};
const BAND_FILL: Record<EmployeeBand, string> = {
  Strength: 'var(--band-strong)',
  Expected: 'var(--band-expected)',
  'Development opportunity': 'var(--band-develop)',
};
const CHANGE_ICON = { higher: '↑', similar: '→', lower: '↓' } as const;
const longDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const areas = (n: number) => `${n} area${n === 1 ? '' : 's'}`;

/** Small line icons for the section headings (decorative). */
const ICONS: Record<string, ReactNode> = {
  saw: <><circle cx="12" cy="12" r="3" /><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /></>,
  style: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
  support: <><path d="M12 21s-7-4.5-9.5-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 6c-2.5 4.5-9.5 9-9.5 9z" /></>,
  matters: <><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" /></>,
  note: <><path d="M4 5h16v11H8l-4 4z" /></>,
};

function Heading({ icon, tone, children }: { icon: keyof typeof ICONS; tone: 'green' | 'amber' | 'mint'; children: ReactNode }) {
  return (
    <h3 className="summary-h3">
      <span className={`summary-icon tone-${tone}`} aria-hidden="true">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {ICONS[icon]}
        </svg>
      </span>
      {children}
    </h3>
  );
}

/** The person's own bands as a donut: how many areas fall in each band. No scores. */
function OwnBandsDonut({ counts }: { counts: Record<EmployeeBand, number> }) {
  const total = BANDS.reduce((s, b) => s + counts[b], 0);
  const size = 132;
  const r = 50;
  const c = 2 * Math.PI * r;
  const gap = BANDS.filter((b) => counts[b] > 0).length > 1 ? 3 : 0;
  let offset = 0;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img"
      aria-label={BANDS.map((b) => `${b}: ${areas(counts[b])}`).join(', ')}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--track)" strokeWidth="18" />
      {BANDS.map((b) => {
        const len = total ? (counts[b] / total) * c : 0;
        if (len <= 0) return null;
        const seg = (
          <circle key={b} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={BAND_FILL[b]} strokeWidth="18"
            strokeDasharray={`${Math.max(0, len - gap)} ${c}`} strokeDashoffset={-offset} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        );
        offset += len;
        return seg;
      })}
      <text x={size / 2} y={size / 2 + 2} fontSize="24" fontWeight="800" textAnchor="middle" fill="var(--ink)">{total}</text>
      <text x={size / 2} y={size / 2 + 20} fontSize="11" textAnchor="middle" fill="var(--ink-soft)">areas</text>
    </svg>
  );
}

/** Three steps with the person's band filled: a picture of the band, not a score. */
function BandSteps({ band }: { band: EmployeeBand }) {
  const level = band === 'Strength' ? 3 : band === 'Expected' ? 2 : 1;
  return (
    <span className="band-steps" aria-hidden="true">
      {[1, 2, 3].map((i) => <span key={i} style={i <= level ? { background: BAND_FILL[band] } : undefined} />)}
    </span>
  );
}

export function SummaryView({ summary, firstName }: { summary: EmployeeSummary; firstName: string }) {
  const counts = BANDS.reduce((m, b) => ({ ...m, [b]: summary.dimensions.filter((d) => d.band === b).length }), {} as Record<EmployeeBand, number>);
  const changes = { higher: 0, similar: 0, lower: 0 };
  for (const d of summary.dimensions) if (d.change) changes[d.change]++;
  const hasChanges = changes.higher + changes.similar + changes.lower > 0;

  return (
    <article className="summary">
      <header className="summary-hero">
        <div className="lbl">Your FocusiQ summary · assessment on {longDate(summary.assessmentDate)}</div>
        <h2>Hello {firstName}</h2>
        <p className="lead">
          This is a starting point for a conversation, not a score or a pass/fail result. It describes how you approached the
          assessment and how Walter Geering can support you.
        </p>
      </header>

      {summary.personalMessage && (
        <div className="summary-message">
          <Heading icon="note" tone="mint">A note from Walter Geering</Heading>
          <p>{summary.personalMessage}</p>
        </div>
      )}

      <section className="summary-section">
        <Heading icon="saw" tone="green">What we saw</Heading>
        {summary.paragraphs.map((p) => <p key={p}>{p}</p>)}
      </section>

      {summary.dimensions.length > 0 && (
        <section className="summary-section">
          <Heading icon="style" tone="mint">Your working style in more detail</Heading>
          {summary.bandsProvisional && (
            <p className="small summary-provisional">
              These descriptions use FocusiQ’s first set of expectations, which are still being confirmed. Treat them as a guide for discussion.
            </p>
          )}

          <div className="summary-glance">
            <OwnBandsDonut counts={counts} />
            <div>
              <p className="summary-glance-text">
                {[
                  counts.Strength ? `You showed a clear strength in ${areas(counts.Strength)}` : null,
                  counts.Expected ? `${counts.Strength ? 'were' : 'You were'} in line with expectations in ${areas(counts.Expected)}` : null,
                ].filter(Boolean).join(' and ')}
                {counts['Development opportunity']
                  ? `${counts.Strength || counts.Expected ? ', and there' : 'There'} ${counts['Development opportunity'] === 1 ? 'is 1 area' : `are ${counts['Development opportunity']} areas`} where support or practice could help.`
                  : '.'}
              </p>
              <ul className="summary-glance-key">
                {BANDS.map((b) => (
                  <li key={b}><span className="swatch" style={{ background: BAND_FILL[b] }} />{b}: <strong>{areas(counts[b])}</strong></li>
                ))}
              </ul>
              {hasChanges && (
                <p className="small summary-since">
                  Since your last assessment:{' '}
                  {changes.higher > 0 && <span className="change change-higher">{CHANGE_ICON.higher} {changes.higher} higher</span>}{' '}
                  {changes.similar > 0 && <span className="change change-similar">{CHANGE_ICON.similar} {changes.similar} similar</span>}{' '}
                  {changes.lower > 0 && <span className="change change-lower">{CHANGE_ICON.lower} {changes.lower} lower</span>}
                </p>
              )}
            </div>
          </div>

          <ul className="summary-dimensions">
            {summary.dimensions.map((d) => (
              <li key={d.key} style={{ borderTopColor: BAND_FILL[d.band] }}>
                <div className="summary-dim-head">
                  <strong>{d.label}</strong>
                  <BandSteps band={d.band} />
                </div>
                <span className={`tag ${BAND_CLASS[d.band]}`} title={BAND_EXPLANATIONS[d.band]}>{d.band}</span>
                <div className="small summary-dim-desc">{d.description}</div>
                {d.change && <span className={`change change-${d.change}`}>{CHANGE_ICON[d.change]} {CHANGE_LABELS[d.change]}</span>}
              </li>
            ))}
          </ul>
          <dl className="summary-key small">
            {BANDS.map((b) => (
              <div key={b}><dt><span className={`tag ${BAND_CLASS[b]}`}>{b}</span></dt><dd>{BAND_EXPLANATIONS[b]}</dd></div>
            ))}
          </dl>
          {summary.previousAssessmentDate && (
            <p className="small muted">“Since last time” compares with your own assessment on {longDate(summary.previousAssessmentDate)} – never with anyone else.</p>
          )}
        </section>
      )}

      {summary.support.length > 0 && (
        <section className="summary-section">
          <Heading icon="support" tone="amber">How we will support you</Heading>
          <ol className="summary-support">
            {summary.support.map((s, i) => (
              <li key={s.title}>
                <span className="summary-num" aria-hidden="true">{i + 1}</span>
                <div><strong>{s.title}</strong><p>{s.detail}</p></div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {summary.motivators.length > 0 && (
        <section className="summary-section">
          <Heading icon="matters" tone="green">What you told us matters most to you</Heading>
          <ol className="summary-motivators">
            {summary.motivators.map((m, i) => <li key={m}><span className="summary-num" aria-hidden="true">{i + 1}</span>{m}</li>)}
          </ol>
        </section>
      )}

      <p className="small muted summary-footnote">
        Your results are confidential and used only within Walter Geering. They are never compared with named colleagues in anything you
        or others receive, and they are not used on their own for decisions about your employment.
      </p>
    </article>
  );
}
