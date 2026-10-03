/**
 * Hand-built SVG charts following the data-viz method: one axis, thin marks,
 * hairline grid, hover tooltips, legends for ≥2 series, and a table twin.
 */
import { useMemo, useRef, useState } from 'react';
import { useTooltip } from './ui.js';

const W = 640;

function ticks(min: number, max: number, count = 5) {
  const step = Math.max(1, Math.round((max - min) / count / 5) * 5);
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max; v += step) out.push(v);
  return out;
}

/** FocusiQ expectations for a higher-is-better 0–100 score (see absoluteBandFor). */
export interface ExpectationBands {
  /** Below this: Development Opportunity. */
  development: number;
  /** At or above this: Strong. */
  strong: number;
  /** Shown in the legend, e.g. "provisional". */
  note?: string;
}

export const bandName = (b: ExpectationBands, v: number) =>
  v >= b.strong ? 'Strong' : v < b.development ? 'Development opportunity' : 'Expected';

/** The expectation zones that fall inside [min, max]: pale shading, always named in text. */
function expectationZones(bands: ExpectationBands | undefined, min: number, max: number) {
  if (!bands) return [];
  return [
    { key: 'develop', from: min, to: bands.development, label: 'Development', legend: `Development < ${bands.development}`, fill: 'var(--zone-develop)' },
    { key: 'expected', from: bands.development, to: bands.strong, label: 'Expected', legend: `Expected ${bands.development} to under ${bands.strong}`, fill: 'var(--zone-expected)' },
    { key: 'strong', from: bands.strong, to: max, label: 'Strong', legend: `Strong ≥ ${bands.strong}`, fill: 'var(--zone-strong)' },
  ]
    .map((z) => ({ ...z, from: Math.max(min, z.from), to: Math.min(max, z.to) }))
    .filter((z) => z.to > z.from);
}

function ZoneLegend({ bands, zones }: { bands?: ExpectationBands; zones: ReturnType<typeof expectationZones> }) {
  return (
    <>
      {zones.map((z) => (
        <span key={z.key}><span className="swatch" style={{ background: z.fill, border: '1px solid var(--line)' }} />{z.legend}</span>
      ))}
      {bands?.note && <span className="muted">Expectations: {bands.note}</span>}
    </>
  );
}

/**
 * Dumbbell: series dot (filled) vs context ring (hollow) per dimension, e.g. a
 * person or department against the company median. With `bands`, the plot is
 * shaded by FocusiQ expectation zones; each zone is also named in text and
 * bounded by a dashed line, so the shading never carries meaning alone.
 */
export function Dumbbell({
  rows,
  seriesLabel,
  contextLabel,
  bands,
}: {
  rows: { label: string; value: number | null; context: number | null; note?: string }[];
  seriesLabel: string;
  contextLabel: string;
  bands?: ExpectationBands;
}) {
  const tip = useTooltip();
  const rowH = 28;
  const left = 110;
  const right = 40;
  const top = bands ? 22 : 0;
  const h = rows.length * rowH + 28 + top;
  const vals = rows.flatMap((r) => [r.value, r.context]).filter((v): v is number => v != null);
  // With bands, keep every zone wide enough to read: 10 points either side of Expected.
  const min = Math.max(0, Math.floor((Math.min(...vals, bands ? bands.development - 5 : 60) - 5) / 5) * 5);
  const max = Math.min(100, Math.ceil((Math.max(...vals, bands ? bands.strong + 5 : 80) + 5) / 5) * 5);
  const x = (v: number) => left + ((Math.min(max, Math.max(min, v)) - min) / (max - min)) * (W - left - right);
  const zones = expectationZones(bands, min, max);
  const withBand = (v: number | null) => (v == null ? 'unavailable' : bands ? `${v} (${bandName(bands, v)})` : v);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${h}`} width="100%" role="img" aria-label={`${seriesLabel} compared with ${contextLabel} by dimension${bands ? ', shaded by FocusiQ expectations' : ''}`}>
        {zones.map((z) => (
          <g key={z.key}>
            <rect x={x(z.from)} y={0} width={x(z.to) - x(z.from)} height={h - 22} fill={z.fill} />
            <text x={(x(z.from) + x(z.to)) / 2} y={14} fontSize="11" fontWeight="700" textAnchor="middle" fill="var(--text-secondary)">{z.label}</text>
          </g>
        ))}
        {ticks(min, max).map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={top} y2={h - 22} stroke="var(--grid)" />
            <text x={x(t)} y={h - 6} fontSize="11" textAnchor="middle" fill="var(--text-muted)">{t}</text>
          </g>
        ))}
        {bands && [bands.development, bands.strong].filter((v) => v > min && v < max).map((v) => (
          <line key={`b${v}`} x1={x(v)} x2={x(v)} y1={0} y2={h - 22} stroke="var(--text-muted)" strokeDasharray="3 3" />
        ))}
        {rows.map((r, i) => {
          const y = top + i * rowH + 14;
          return (
            <g
              key={r.label}
              onMouseMove={(e) => tip.show(e.clientX, e.clientY, <><strong>{r.label}</strong><br />{seriesLabel}: {withBand(r.value)}<br />{contextLabel}: {withBand(r.context)}{r.note ? <><br />{r.note}</> : null}</>)}
              onMouseLeave={tip.hide}
            >
              <rect x={0} y={y - rowH / 2} width={W} height={rowH} fill="transparent" />
              <text x={left - 10} y={y + 4} fontSize="12" textAnchor="end" fill="var(--text-secondary)">{r.label}</text>
              {r.value != null && r.context != null && (
                <line x1={x(r.context)} x2={x(r.value)} y1={y} y2={y} stroke="var(--axis)" strokeWidth="2" />
              )}
              {r.context != null && <circle cx={x(r.context)} cy={y} r="5" fill="var(--surface-1)" stroke={bands ? 'var(--ink-soft)' : 'var(--text-muted)'} strokeWidth="2" />}
              {r.value != null ? (
                <circle cx={x(r.value)} cy={y} r="5" fill="var(--series-1)" stroke="var(--surface-1)" strokeWidth="2" />
              ) : (
                <text x={W - right} y={y + 4} fontSize="11" textAnchor="end" fill="var(--text-muted)">n/a</text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="legend">
        <span><span className="swatch" style={{ background: 'var(--series-1)', borderRadius: '50%' }} />{seriesLabel}</span>
        {rows.some((r) => r.context != null) && (
          <span><span className="swatch" style={{ border: `2px solid ${bands ? 'var(--ink-soft)' : 'var(--text-muted)'}`, borderRadius: '50%' }} />{contextLabel}</span>
        )}
        <ZoneLegend bands={bands} zones={zones} />
      </div>
      {tip.node}
    </div>
  );
}

export interface ScatterPoint {
  id: string;
  label: string;
  x: number;
  y: number;
  highlighted: boolean;
}

/** Scatter with nearest-point hover; highlighted points in slot 1, others as grey context. */
export function Scatter({
  points,
  xLabel,
  yLabel,
  highlightLabel,
  contextLabel,
  onSelect,
}: {
  points: ScatterPoint[];
  xLabel: string;
  yLabel: string;
  highlightLabel: string;
  contextLabel: string;
  onSelect?: (id: string) => void;
}) {
  const tip = useTooltip();
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<string | null>(null);
  const H = 300;
  const pad = { l: 44, r: 16, t: 12, b: 40 };
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const xMin = Math.floor(Math.min(...xs, 15) / 5) * 5;
  const xMax = Math.ceil(Math.max(...xs, 60) / 5) * 5;
  const yMin = Math.floor(Math.min(...ys, 70) / 5) * 5;
  const yMax = Math.min(100, Math.ceil(Math.max(...ys, 95) / 5) * 5);
  const sx = (v: number) => pad.l + ((v - xMin) / (xMax - xMin)) * (W - pad.l - pad.r);
  const sy = (v: number) => H - pad.b - ((v - yMin) / (yMax - yMin)) * (H - pad.t - pad.b);
  const ordered = useMemo(() => [...points].sort((a, b) => Number(a.highlighted) - Number(b.highlighted)), [points]);

  const onMove = (e: React.MouseEvent) => {
    const svg = ref.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const scale = W / rect.width;
    const mx = (e.clientX - rect.left) * scale;
    const my = (e.clientY - rect.top) * scale;
    let best: ScatterPoint | null = null;
    let bestD = 24 * scale;
    for (const p of points) {
      const d = Math.hypot(sx(p.x) - mx, sy(p.y) - my);
      if (d < bestD) { bestD = d; best = p; }
    }
    setHover(best?.id ?? null);
    if (best) tip.show(e.clientX, e.clientY, <><strong>{best.label}</strong><br />{xLabel}: {best.x}<br />{yLabel}: {best.y}</>);
    else tip.hide();
  };

  return (
    <div>
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label={`${yLabel} against ${xLabel}`}
        onMouseMove={onMove}
        onMouseLeave={() => { setHover(null); tip.hide(); }}
        onClick={() => hover && onSelect?.(hover)}
        style={{ cursor: hover && onSelect ? 'pointer' : 'default' }}
      >
        {ticks(yMin, yMax).map((t) => (
          <g key={`y${t}`}>
            <line x1={pad.l} x2={W - pad.r} y1={sy(t)} y2={sy(t)} stroke="var(--grid)" />
            <text x={pad.l - 6} y={sy(t) + 4} fontSize="11" textAnchor="end" fill="var(--text-muted)">{t}</text>
          </g>
        ))}
        {ticks(xMin, xMax).map((t) => (
          <text key={`x${t}`} x={sx(t)} y={H - pad.b + 16} fontSize="11" textAnchor="middle" fill="var(--text-muted)">{t}</text>
        ))}
        <line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} stroke="var(--axis)" />
        <text x={(pad.l + W - pad.r) / 2} y={H - 6} fontSize="12" textAnchor="middle" fill="var(--text-secondary)">{xLabel}</text>
        <text x={12} y={(H - pad.b) / 2} fontSize="12" textAnchor="middle" fill="var(--text-secondary)" transform={`rotate(-90 12 ${(H - pad.b) / 2})`}>{yLabel}</text>
        {ordered.map((p) => (
          <circle
            key={p.id}
            cx={sx(p.x)}
            cy={sy(p.y)}
            r={hover === p.id ? 7 : 5}
            fill={p.highlighted ? 'var(--series-1)' : 'var(--context)'}
            stroke="var(--surface-1)"
            strokeWidth="2"
          />
        ))}
      </svg>
      <div className="legend">
        <span><span className="swatch" style={{ background: 'var(--series-1)', borderRadius: '50%' }} />{highlightLabel}</span>
        {points.some((p) => !p.highlighted) && (
          <span><span className="swatch" style={{ background: 'var(--context)', borderRadius: '50%' }} />{contextLabel}</span>
        )}
      </div>
      {tip.node}
    </div>
  );
}

/** Single-series trend with crosshair tooltip and endpoint label; optionally shaded by expectation zones. */
export function Trend({ points, label, bands }: { points: { date: string; value: number }[]; label: string; bands?: ExpectationBands }) {
  const tip = useTooltip();
  const ref = useRef<SVGSVGElement>(null);
  const [active, setActive] = useState<number | null>(null);
  const H = 180;
  const pad = { l: 36, r: 40, t: 14, b: 28 };
  if (points.length === 0) return <p className="empty">No valid assessments for this measure.</p>;
  const vals = points.map((p) => p.value);
  // With bands, keep the zone boundaries in view (as in the Dumbbell).
  const yMin = Math.max(bands ? 0 : -Infinity, Math.floor((Math.min(...vals, ...(bands ? [bands.development - 5] : [])) - 8) / 5) * 5);
  const yMax = Math.min(bands ? 100 : Infinity, Math.ceil((Math.max(...vals, ...(bands ? [bands.strong + 5] : [])) + 8) / 5) * 5);
  const zones = expectationZones(bands, yMin, yMax);
  const t0 = Date.parse(points[0]!.date);
  const t1 = Math.max(Date.parse(points.at(-1)!.date), t0 + 1);
  const sx = (d: string) => (points.length === 1 ? (pad.l + W - pad.r) / 2 : pad.l + ((Date.parse(d) - t0) / (t1 - t0)) * (W - pad.l - pad.r));
  const sy = (v: number) => H - pad.b - ((v - yMin) / (yMax - yMin)) * (H - pad.t - pad.b);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.date)},${sy(p.value)}`).join(' ');
  const last = points.at(-1)!;
  const onMove = (e: React.MouseEvent) => {
    const rect = ref.current!.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0;
    points.forEach((p, i) => { if (Math.abs(sx(p.date) - mx) < Math.abs(sx(points[best]!.date) - mx)) best = i; });
    setActive(best);
    const p = points[best]!;
    tip.show(e.clientX, e.clientY, <><strong>{new Date(p.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</strong><br />{label}: {p.value}{bands ? ` (${bandName(bands, p.value)})` : ''}</>);
  };
  return (
    <div>
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${label} over time${bands ? ', shaded by FocusiQ expectations' : ''}`} onMouseMove={onMove} onMouseLeave={() => { setActive(null); tip.hide(); }}>
        {zones.map((z) => (
          <g key={z.key}>
            <rect x={pad.l} y={sy(z.to)} width={W - pad.l - pad.r} height={sy(z.from) - sy(z.to)} fill={z.fill} />
            {sy(z.from) - sy(z.to) >= 16 && (
              <text x={pad.l + 6} y={sy(z.to) + 13} fontSize="11" fontWeight="700" fill="var(--text-secondary)">{z.label}</text>
            )}
          </g>
        ))}
        {bands && [bands.development, bands.strong].filter((v) => v > yMin && v < yMax).map((v) => (
          <line key={`b${v}`} x1={pad.l} x2={W - pad.r} y1={sy(v)} y2={sy(v)} stroke="var(--text-muted)" strokeDasharray="3 3" />
        ))}
        {ticks(yMin, yMax, 4).map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={sy(t)} y2={sy(t)} stroke="var(--grid)" />
            <text x={pad.l - 6} y={sy(t) + 4} fontSize="11" textAnchor="end" fill="var(--text-muted)">{t}</text>
          </g>
        ))}
        {points.map((p) => (
          <text key={p.date} x={sx(p.date)} y={H - 8} fontSize="11" textAnchor="middle" fill="var(--text-muted)">
            {new Date(p.date).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })}
          </text>
        ))}
        {active != null && <line x1={sx(points[active]!.date)} x2={sx(points[active]!.date)} y1={pad.t} y2={H - pad.b} stroke="var(--axis)" />}
        <path d={path} fill="none" stroke="var(--series-1)" strokeWidth="2" />
        {points.map((p, i) => (
          <circle key={p.date} cx={sx(p.date)} cy={sy(p.value)} r={active === i ? 6 : 4} fill="var(--series-1)" stroke="var(--surface-1)" strokeWidth="2" />
        ))}
        <text x={sx(last.date) + 8} y={sy(last.value) + 4} fontSize="12" fill="var(--text-primary)">{last.value}</text>
      </svg>
      {zones.length > 0 && <div className="legend"><ZoneLegend bands={bands} zones={zones} /></div>}
      {tip.node}
    </div>
  );
}

/** Horizontal bars, one series, value labels at bar end. */
export function BarList({ rows, unit }: { rows: { label: string; value: number }[]; unit?: string }) {
  const tip = useTooltip();
  const max = Math.max(1, ...rows.map((r) => r.value));
  const rowH = 26;
  const left = 130;
  const H = rows.length * rowH + 4;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Bar chart">
        {rows.map((r, i) => {
          const y = i * rowH + 4;
          const w = (r.value / max) * (W - left - 60);
          return (
            <g key={r.label} onMouseMove={(e) => tip.show(e.clientX, e.clientY, <>{r.label}: {r.value}{unit ? ` ${unit}` : ''}</>)} onMouseLeave={tip.hide}>
              <rect x={0} y={y - 2} width={W} height={rowH} fill="transparent" />
              <text x={left - 10} y={y + 13} fontSize="12" textAnchor="end" fill="var(--text-secondary)">{r.label}</text>
              {r.value > 0 && <rect x={left} y={y + 3} width={Math.max(4, w)} height={14} rx="4" fill="var(--series-1)" />}
              <text x={left + Math.max(4, w) + 6} y={y + 14} fontSize="12" fill="var(--text-primary)">{r.value}</text>
            </g>
          );
        })}
      </svg>
      {tip.node}
    </div>
  );
}
