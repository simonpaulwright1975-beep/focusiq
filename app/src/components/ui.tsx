import { useState, type ReactNode } from 'react';
export { Modal } from './Modal.js';
import type { AbsoluteBandResult, BenchmarkResult, Confidence } from '../../../src/benchmarking/index.js';
import { EXCLUSION_REASON_LABELS } from '../../../src/benchmarking/index.js';

export function Card({ title, sub, actions, children }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h2>{title}</h2>
          {sub && <p>{sub}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="card stat">
      <div className="lbl">{label}</div>
      <div className="value">{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

/** Absolute bands use the Director app's band colours (see components/bandCharts.tsx). */
const BAND_VAR: Record<string, string> = {
  'Development Opportunity': '--band-develop',
  'Expected / Typical': '--band-expected',
  Strong: '--band-strong',
};

/** Absolute band: colour swatch + text label (never colour alone). */
export function BandChip({ band, status }: { band: string | null; status?: AbsoluteBandResult['status'] }) {
  if (!band) return <span className="muted small">No expectation set</span>;
  return (
    <span className="tag" title={status === 'provisional' ? 'Provisional expectations – not yet validated' : undefined}>
      <span className="dot" style={{ background: `var(${BAND_VAR[band]})` }} />
      {band}
      {status === 'provisional' && <span className="muted">*</span>}
    </span>
  );
}

/** Heatmap cell colour by absolute band; the score is always printed in the cell. */
export function bandStyle(band: string | null) {
  if (!band) return {};
  const v = BAND_VAR[band]!;
  return { background: `var(${v})`, color: `var(${v}-ink)` };
}

const CONF_ICON: Record<Confidence, { fill: string; label: string }> = {
  Insufficient: { fill: 'var(--critical)', label: 'Insufficient' },
  Limited: { fill: 'var(--serious)', label: 'Limited' },
  Moderate: { fill: 'var(--warning)', label: 'Moderate' },
  Good: { fill: 'var(--good)', label: 'Good' },
  High: { fill: 'var(--good)', label: 'High' },
};

/** Status: icon + label, never colour alone. */
export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  const c = CONF_ICON[confidence];
  const bars = { Insufficient: 1, Limited: 2, Moderate: 3, Good: 4, High: 5 }[confidence];
  return (
    <span className="status" aria-label={`Confidence: ${c.label}`}>
      <svg width="20" height="12" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <rect key={i} x={i * 4} y={10 - (i + 1) * 2} width="3" height={(i + 1) * 2} rx="1" fill={i < bars ? c.fill : 'var(--grid)'} />
        ))}
      </svg>
      {c.label}
    </span>
  );
}

/** §192 "How is this benchmark calculated?" */
export function Explanation({ benchmark }: { benchmark: BenchmarkResult }) {
  const e = benchmark.explanation;
  const reasons = Object.entries(e.counts.exclusionsByReason);
  const w = e.definition.window;
  return (
    <details className="explain">
      <summary>How is this benchmark calculated?</summary>
      <dl>
        <dt>Population</dt><dd>{e.populationLabel} · {e.definition.include.former ? 'historical (incl. former employees)' : 'current workforce'}</dd>
        <dt>Window</dt><dd>{w.kind === 'latest' ? 'Latest assessment' : w.kind === 'last_months' ? `Last ${w.months} months` : `${w.from} – ${w.to}`}</dd>
        <dt>Basis</dt><dd>{e.statisticBasis}</dd>
        <dt>Sample size</dt><dd>{e.sampleSize} employees · {e.counts.supersededAssessments} earlier assessments kept for trends only</dd>
        <dt>Exclusions</dt><dd>{reasons.length ? reasons.map(([r, n]) => `${EXCLUSION_REASON_LABELS[r as keyof typeof EXCLUSION_REASON_LABELS] ?? 'Review required'}: ${n}`).join(' · ') : 'None'}</dd>
        <dt>Adjusted</dt><dd>{e.counts.adjustedAssessments} ({e.counts.adjustedPendingReview} awaiting decision)</dd>
        <dt>Versions</dt><dd>{e.assessmentVersions.join(', ') || '—'} · scoring {e.scoringVersions.join(', ') || '—'}</dd>
        <dt>Normalisation</dt><dd>{e.normalisation === 'none' ? 'Raw scores' : 'Difficulty-normalised'}</dd>
        <dt>Date range</dt><dd>{e.dateRange.from?.slice(0, 10) ?? '—'} to {e.dateRange.to?.slice(0, 10) ?? '—'}</dd>
        <dt>Minimum cohort</dt><dd>{e.minimumCohortSize} people</dd>
        <dt>Engine</dt><dd>{e.engineVersion}</dd>
      </dl>
    </details>
  );
}

export function useTooltip() {
  const [tip, setTip] = useState<{ x: number; y: number; content: ReactNode } | null>(null);
  const node = tip ? (
    <div className="tooltip" role="status" style={{ left: tip.x + 12, top: tip.y + 12 }}>
      {tip.content}
    </div>
  ) : null;
  return { show: (x: number, y: number, content: ReactNode) => setTip({ x, y, content }), hide: () => setTip(null), node };
}

export const fmt = (v: number | null | undefined, dp = 0) => (v == null || Number.isNaN(v) ? '—' : v.toFixed(dp));
export const ordinal = (n: number) => {
  const r = Math.round(n);
  const m = r % 100;
  return `${r}${m >= 11 && m <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[r % 10] ?? 'th'}`;
};
