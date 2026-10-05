/**
 * Band charts: results coloured by FocusiQ expectation band, in plain view.
 *
 * Palette (validated with the dataviz validator): Strong #1e7a46, Expected
 * #5fb57f, Development #e09a1f. The two lighter colours are below 3:1 against
 * white, so every mark also prints its score and band name; colour is never
 * the only cue. Amber, never red: a development area is not a failure.
 */
import type { ReactNode } from 'react';
import { BAND_FILL, BAND_INK, BAND_LABEL, BAND_MEANING, BAND_ORDER, bandKey, pct, type BandCounts, type BandKey, type ExpectationBands } from '../bands.js';
import { useTooltip } from './ui.js';

const W = 640;

export function BandLegend({ bands }: { bands?: ExpectationBands }) {
  return (
    <>
      {BAND_ORDER.map((k) => (
        <span key={k}>
          <span className="swatch" style={{ background: BAND_FILL[k] }} />
          {BAND_LABEL[k]}
          {bands ? (k === 'strong' ? ` ${bands.strong}+` : k === 'expected' ? ` ${bands.development}–${bands.strong - 1}` : ` under ${bands.development}`) : ''}
        </span>
      ))}
      {bands?.note && <span className="muted">Expectations: {bands.note}</span>}
    </>
  );
}

/**
 * One bar per dimension, filled to the score (0–100) in its band colour, with
 * the score and band printed at the end. An optional marker (e.g. a median)
 * is drawn as a dark tick across the bar.
 */
export function ScoreBars({
  rows,
  bands,
  valueLabel,
  markerLabel,
}: {
  rows: { label: string; value: number | null; marker?: number | null; note?: string }[];
  bands: ExpectationBands;
  valueLabel: string;
  markerLabel?: string;
}) {
  const tip = useTooltip();
  const rowH = 36;
  const barH = 20;
  const left = 118;
  const right = 118;
  const top = 26;
  const h = top + rows.length * rowH + 22;
  const x = (v: number) => left + (Math.max(0, Math.min(100, v)) / 100) * (W - left - right);
  const zones: { k: BandKey; from: number; to: number }[] = [
    { k: 'develop', from: 0, to: bands.development },
    { k: 'expected', from: bands.development, to: bands.strong },
    { k: 'strong', from: bands.strong, to: 100 },
  ];
  const hasMarker = rows.some((r) => r.marker != null);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${h}`} width="100%" role="img" aria-label={`${valueLabel} by dimension, coloured by FocusiQ expectation band`}>
        {zones.map((z) => (
          <text key={z.k} x={(x(z.from) + x(z.to)) / 2} y={14} fontSize="12" fontWeight="700" textAnchor="middle" fill="var(--ink-soft)">
            {BAND_LABEL[z.k]}
          </text>
        ))}
        <rect x={x(0)} y={top - 4} width={x(100) - x(0)} height={h - top - 12} fill="var(--track)" opacity="0.45" rx="6" />
        {[0, 100].map((v) => <text key={`a${v}`} x={x(v)} y={h - 3} fontSize="11" textAnchor="middle" fill="var(--muted)">{v}</text>)}
        {[bands.development, bands.strong].map((v) => (
          <g key={v}>
            <line x1={x(v)} x2={x(v)} y1={top - 4} y2={h - 16} stroke="var(--muted)" strokeDasharray="3 3" />
            <text x={x(v)} y={h - 3} fontSize="11" textAnchor="middle" fill="var(--muted)">{v}</text>
          </g>
        ))}
        {rows.map((r, i) => {
          const y = top + i * rowH + (rowH - barH) / 2;
          const k = r.value == null ? null : bandKey(bands, r.value);
          return (
            <g
              key={r.label}
              onMouseMove={(e) =>
                tip.show(e.clientX, e.clientY, (
                  <>
                    <strong>{r.label}</strong><br />
                    {valueLabel}: {r.value ?? 'unavailable'}{k ? ` (${BAND_LABEL[k]})` : ''}
                    {markerLabel && r.marker != null ? <><br />{markerLabel}: {r.marker} ({BAND_LABEL[bandKey(bands, r.marker)]})</> : null}
                    {r.note ? <><br />{r.note}</> : null}
                  </>
                ))
              }
              onMouseLeave={tip.hide}
            >
              <rect x={0} y={y - (rowH - barH) / 2} width={W} height={rowH} fill="transparent" />
              <text x={left - 12} y={y + barH / 2 + 5} fontSize="14" textAnchor="end" fill="var(--ink)">{r.label}</text>
              {k && r.value != null ? (
                <>
                  <rect x={x(0)} y={y} width={Math.max(4, x(r.value) - x(0))} height={barH} rx="4" fill={BAND_FILL[k]} />
                  <text x={W - right + 12} y={y + barH / 2 + 5} fontSize="14" fontWeight="700" fill="var(--ink)">
                    {r.value} <tspan fontWeight="400" fill="var(--ink-soft)">{BAND_LABEL[k]}</tspan>
                  </text>
                </>
              ) : (
                <text x={W - right + 12} y={y + barH / 2 + 5} fontSize="13" fill="var(--muted)">n/a</text>
              )}
              {r.marker != null && (
                <rect x={x(r.marker) - 1.5} y={y - 5} width={3} height={barH + 10} rx="1.5" fill="var(--ink)" stroke="var(--card)" strokeWidth="1" />
              )}
            </g>
          );
        })}
      </svg>
      <div className="legend">
        <BandLegend bands={bands} />
        {hasMarker && markerLabel && (
          <span><span className="swatch" style={{ background: 'var(--ink)', width: 3, borderRadius: 2 }} />{markerLabel}</span>
        )}
      </div>
      {tip.node}
    </div>
  );
}

/** Donut of how results split across the three bands, with counts and percentages beside it. */
export function BandDonut({ counts, noun, centre }: { counts: BandCounts; noun: string; centre?: { value: string; label: string } }) {
  const total = BAND_ORDER.reduce((s, k) => s + counts[k], 0);
  const size = 180;
  const r = 70;
  const stroke = 22;
  const c = 2 * Math.PI * r;
  const gap = BAND_ORDER.filter((k) => counts[k] > 0).length > 1 ? 3 : 0;
  let offset = 0;
  const atOrAbove = counts.strong + counts.expected;
  return (
    <div className="donut">
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img"
        aria-label={BAND_ORDER.map((k) => `${BAND_LABEL[k]} ${counts[k]} of ${total}`).join(', ')}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--track)" strokeWidth={stroke} />
        {total > 0 && BAND_ORDER.map((k) => {
          const len = (counts[k] / total) * c;
          if (len <= 0) return null;
          const seg = (
            <circle key={k} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={BAND_FILL[k]} strokeWidth={stroke}
              strokeDasharray={`${Math.max(0, len - gap)} ${c}`} strokeDashoffset={-offset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`} />
          );
          offset += len;
          return seg;
        })}
        <text x={size / 2} y={size / 2 - 2} fontSize={(centre?.value.length ?? 0) > 5 ? 23 : 28} fontWeight="800" textAnchor="middle" fill="var(--ink)">
          {centre?.value ?? `${pct(atOrAbove, total)}%`}
        </text>
        {(centre?.label ?? 'meet or exceed\nexpectations').split('\n').map((line, i) => (
          <text key={line} x={size / 2} y={size / 2 + 18 + i * 14} fontSize="12" textAnchor="middle" fill="var(--ink-soft)">{line}</text>
        ))}
      </svg>
      <ul className="donut-key">
        {BAND_ORDER.map((k) => (
          <li key={k}>
            <span className="swatch" style={{ background: BAND_FILL[k] }} />
            <span className="donut-band"><strong>{BAND_LABEL[k]}</strong><span className="muted small">{BAND_MEANING[k]}</span></span>
            <span className="donut-num">{pct(counts[k], total)}%</span>
            <span className="muted small">{counts[k]} {noun}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 100% stacked bar per row: the share of people in each band, with percentages printed on wide segments. */
export function BandSplit({ rows, noun = 'people' }: { rows: { label: string; counts: BandCounts }[]; noun?: string }) {
  const tip = useTooltip();
  const rowH = 34;
  const barH = 22;
  const left = 118;
  const right = 70;
  const h = rows.length * rowH + 4;
  const span = W - left - right;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${h}`} width="100%" role="img" aria-label={`Share of ${noun} in each expectation band, by dimension`}>
        {rows.map((r, i) => {
          const y = i * rowH + (rowH - barH) / 2;
          const total = BAND_ORDER.reduce((s, k) => s + r.counts[k], 0);
          let at = left;
          return (
            <g
              key={r.label}
              onMouseMove={(e) =>
                tip.show(e.clientX, e.clientY, (
                  <>
                    <strong>{r.label}</strong>
                    {BAND_ORDER.map((k) => <div key={k}>{BAND_LABEL[k]}: {pct(r.counts[k], total)}% ({r.counts[k]} {noun})</div>)}
                  </>
                ))
              }
              onMouseLeave={tip.hide}
            >
              <rect x={0} y={y - (rowH - barH) / 2} width={W} height={rowH} fill="transparent" />
              <text x={left - 12} y={y + barH / 2 + 5} fontSize="14" textAnchor="end" fill="var(--ink)">{r.label}</text>
              {BAND_ORDER.map((k) => {
                const wSeg = total ? (r.counts[k] / total) * span : 0;
                const sx = at;
                at += wSeg;
                if (wSeg <= 0) return null;
                const p = pct(r.counts[k], total);
                return (
                  <g key={k}>
                    <rect x={sx} y={y} width={Math.max(0, wSeg - 2)} height={barH} rx="4" fill={BAND_FILL[k]} />
                    {wSeg >= 38 && (
                      <text x={sx + (wSeg - 2) / 2} y={y + barH / 2 + 4} fontSize="12" fontWeight="700" textAnchor="middle" fill={BAND_INK[k]}>{p}%</text>
                    )}
                  </g>
                );
              })}
              <text x={W - right + 10} y={y + barH / 2 + 5} fontSize="12" fill="var(--muted)">{total} {noun}</text>
            </g>
          );
        })}
      </svg>
      <div className="legend"><BandLegend /></div>
      {tip.node}
    </div>
  );
}

/** A large plain-English summary line. */
export function Headline({ children }: { children: ReactNode }) {
  return <p className="headline">{children}</p>;
}
