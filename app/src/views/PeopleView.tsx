import { useMemo, useState } from 'react';
import { compareEmployees, individualHeatmap, revealNames, type EmployeeComparison } from '../../../src/benchmarking/index.js';
import { Card, bandStyle, fmt } from '../components/ui.js';
import { CORE_KEYS, expectationBands, metricLabel, useStore } from '../state.js';

const COMPARE_KEYS = ['accuracy', 'avg_response_seconds', 'recheck_rate', ...CORE_KEYS];

export function PeopleView({ onOpenEmployee }: { onOpenEmployee: (id: string) => void }) {
  const { data, filters, actor } = useStore();
  const [showExcluded, setShowExcluded] = useState(false);
  const [sortBy, setSortBy] = useState<string>('');
  const [selected, setSelected] = useState<string[]>([]);
  const [blind, setBlind] = useState(false);
  const [comparison, setComparison] = useState<EmployeeComparison | null>(null);

  const heat = useMemo(
    () =>
      individualHeatmap(actor, data, {
        ...(filters.department !== 'all' ? { department: filters.department } : {}),
        ...(filters.version !== 'all' ? { assessmentVersion: filters.version } : {}),
        hiddenEmployeeIds: filters.hidden,
        showExcluded,
        includeFormer: filters.population === 'historical',
        ...(sortBy ? { sortBy: { metricKey: sortBy, direction: 'desc' as const } } : {}),
      }),
    [data, filters, showExcluded, sortBy],
  );

  // Heatmap columns are core dimensions, which share one set of expectations.
  const bands = expectationBands(CORE_KEYS[0]!);

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const runCompare = () => setComparison(compareEmployees(actor, data, selected, COMPARE_KEYS, { blind, blindSeed: selected.join('|') }));

  return (
    <div className="stack">
      <Card
        title="Individual heatmap"
        sub="Cells show the score, shaded by FocusiQ expectations as on the charts (not a ranking). Hover a cell for the band and colleague percentile."
        actions={
          <div className="row">
            <label className="row small">
              Sort by
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} aria-label="Sort by dimension">
                <option value="">Name order</option>
                {heat.metrics.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
              </select>
            </label>
            <label className="row small"><input type="checkbox" checked={showExcluded} onChange={(e) => setShowExcluded(e.target.checked)} />Show excluded records</label>
          </div>
        }
      >
        <div className="table-wrap">
          <table className="heat">
            <thead>
              <tr>
                <th aria-label="Select for comparison" />
                <th>Employee</th>
                {heat.metrics.map((m) => <th key={m.key} className="num">{m.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {heat.rows.map((r) => (
                <tr key={r.employeeId} className={r.excluded ? 'excluded' : undefined}>
                  <td><input type="checkbox" aria-label={`Select ${r.label}`} checked={selected.includes(r.employeeId)} onChange={() => toggle(r.employeeId)} /></td>
                  <td>
                    <button className="btn link" onClick={() => onOpenEmployee(r.employeeId)}>{r.label}</button>
                    <div className="small muted">{r.department}{r.excluded ? ` · excluded (${r.exclusionReason?.replaceAll('_', ' ')})` : ''}</div>
                  </td>
                  {heat.metrics.map((m) => {
                    const v = r.values[m.key];
                    const band = r.bands[m.key] ?? null;
                    const pct = r.percentiles[m.key];
                    return (
                      <td
                        key={m.key}
                        className="cell"
                        style={r.excluded ? undefined : bandStyle(band)}
                        title={`${r.label} · ${m.label}: ${fmt(v)} – ${band ?? 'no band'}${pct != null ? ` · ${pct}th percentile among shown colleagues` : ''}`}
                      >
                        {fmt(v)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="legend">
          {bands && (
            <>
              <span><span className="swatch" style={{ background: 'var(--zone-develop)', border: '1px solid var(--muted)' }} />Development &lt; {bands.development} (unshaded)</span>
              <span><span className="swatch" style={{ background: 'var(--zone-expected)', border: '1px solid var(--line)' }} />Expected {bands.development} to under {bands.strong}</span>
              <span><span className="swatch" style={{ background: 'var(--zone-strong)', border: '1px solid var(--line)' }} />Strong ≥ {bands.strong}</span>
            </>
          )}
          <span>{bands?.note === 'provisional' ? 'Bands use provisional expectations. ' : ''}There is deliberately no overall score or ranking.</span>
        </div>
      </Card>

      <Card
        title="Compare selected employees"
        sub="Director-only. Shows the full profile – different profiles can produce similar results."
        actions={
          <div className="row">
            <label className="row small"><input type="checkbox" checked={blind} onChange={(e) => setBlind(e.target.checked)} />Blind comparison (hide names)</label>
            <button className="btn" disabled={selected.length < 2} onClick={runCompare}>Compare {selected.length || ''} selected</button>
            {comparison?.blind && <button className="btn secondary" onClick={() => setComparison(revealNames(actor, data, comparison))}>Reveal names</button>}
          </div>
        }
      >
        {!comparison ? (
          <p className="empty">Tick two or more employees in the heatmap, then choose Compare.</p>
        ) : (
          <>
            {comparison.interpretation.length > 0 && (
              <div className="quote">{comparison.interpretation.map((t) => <p key={t} className="statement">{t}</p>)}</div>
            )}
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Measure</th>{comparison.columns.map((c) => <th key={c.label} className="num">{c.label}</th>)}</tr>
                </thead>
                <tbody>
                  {comparison.metrics.map((m) => (
                    <tr key={m.key}>
                      <td>{metricLabel(m.key)}{m.unit === 'seconds' ? ' (s)' : m.unit === 'percent' ? ' (%)' : ''}</td>
                      {comparison.columns.map((c) => <td key={c.label} className="num">{fmt(c.values[m.key])}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
