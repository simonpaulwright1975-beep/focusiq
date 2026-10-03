import { useMemo, useState } from 'react';
import {
  computeBenchmark,
  confidenceFor,
  departmentHeatmap,
  resolveConfig,
  resolvePopulation,
  type BenchmarkComputation,
} from '../../../src/benchmarking/index.js';
import { MOTIVATORS, organisationInsights } from '../../../src/insight/index.js';
import { BarList, Dumbbell, Scatter } from '../components/charts.js';
import { Card, ConfidenceBadge, Explanation, Stat, fmt } from '../components/ui.js';
import { buildInsightReports } from '../insights.js';
import { baseDefinition, CORE_KEYS, definitionFor, expectationBands, metricLabel, useStore } from '../state.js';

const SEQ = ['--seq-100', '--seq-200', '--seq-300', '--seq-400', '--seq-500', '--seq-600'];

export function OverviewView({ onOpenEmployee }: { onOpenEmployee: (id: string) => void }) {
  const { data, demo, filters, actor, now, revision } = useStore();
  const [showTable, setShowTable] = useState(false);
  const [allInsights, setAllInsights] = useState(false);
  const [personId, setPersonId] = useState('');
  const def = definitionFor(filters, now);
  const scopeLabel = filters.department === 'all' ? 'Company' : filters.department;

  const population = useMemo(() => resolvePopulation(data, def), [data, filters]);
  const counts = population.counts;
  const confidence = confidenceFor(counts.eligibleEmployees, resolveConfig());

  const benchmarks = useMemo(() => {
    const m = new Map<string, { scope: BenchmarkComputation; company: BenchmarkComputation }>();
    for (const k of CORE_KEYS) {
      m.set(k, {
        scope: computeBenchmark(data, def, k, { now }),
        company: computeBenchmark(data, definitionFor(filters, now, 'all'), k, { now }),
      });
    }
    return m;
  }, [data, filters]);

  const heat = useMemo(() => departmentHeatmap(actor, data, baseDefinition(filters, now), { now }), [data, filters]);
  const allMedians = heat.rows.flatMap((r) => r.cells.map((c) => c.median)).filter((v): v is number => v != null);
  const hMin = Math.min(...allMedians);
  const hMax = Math.max(...allMedians);
  const step = (v: number) => Math.min(5, Math.floor(((v - hMin) / Math.max(1, hMax - hMin)) * 6));

  // Accuracy vs speed – company population, selected department highlighted.
  const company = useMemo(() => resolvePopulation(data, definitionFor(filters, now, 'all')), [data, filters]);
  const points = [...company.byEmployee].flatMap(([id, a]) => {
    const e = data.employees.find((x) => x.id === id)!;
    if (filters.hidden.includes(id)) return [];
    const x = a.scores.avg_response_seconds;
    const y = a.scores.accuracy;
    if (x == null || y == null) return [];
    return [{ id, label: `${e.displayName} (${e.department})`, x, y, highlighted: filters.department === 'all' || e.department === filters.department }];
  });

  // Re-checking by department (median unnecessary re-check rate).
  const recheck = heat.rows.map((r) => {
    const b = computeBenchmark(data, { ...baseDefinition(filters, now), scope: { kind: 'department', department: r.department } }, 'unnecessary_recheck_rate', { now });
    return { label: r.department, value: b.stats ? Math.round(b.stats.median) : 0, available: b.available };
  });

  // Motivation – top-ranked motivator among eligible people in scope.
  const motivationCounts = new Map<string, number>();
  for (const [id] of population.byEmployee) {
    const latest = [...demo.motivation].find(([aid]) => aid.startsWith(`${id}-`));
    const top = latest?.[1].ranked[0];
    if (top) motivationCounts.set(MOTIVATORS[top].label, (motivationCounts.get(MOTIVATORS[top].label) ?? 0) + 1);
  }
  const motivationRows = [...motivationCounts].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);

  // Organisation-level insight (§226–§227) from eligible people only.
  const reports = useMemo(() => buildInsightReports(demo, now), [demo, revision]);
  const org = useMemo(() => {
    const members = [...company.byEmployee.keys()].flatMap((id) => {
      const r = reports.get(id);
      const e = data.employees.find((x) => x.id === id)!;
      return r ? [{ employeeId: id, group: e.department, findings: r.report.findings }] : [];
    });
    return organisationInsights(actor, members).filter((o) => filters.department === 'all' || o.group === filters.department);
  }, [company, reports]);

  // A person to plot against the median in scope (eligible people only).
  const people = [...population.byEmployee.keys()]
    .filter((id) => !filters.hidden.includes(id))
    .map((id) => data.employees.find((e) => e.id === id)!)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
  const person = people.find((e) => e.id === personId) ?? null;
  const personScores = person ? population.byEmployee.get(person.id)!.scores : null;

  // FocusiQ expectations (the same thresholds for every core dimension).
  const bands = expectationBands(CORE_KEYS[0]!);

  const scopeMedian = (k: string) => {
    const st = benchmarks.get(k)!.scope.stats;
    return st ? Math.round(st.median) : null;
  };
  const dumbbellRows = CORE_KEYS.map((k) => {
    const b = benchmarks.get(k)!;
    const note = b.scope.available ? `${b.scope.explanation.sampleSize} people · ${b.scope.confidence} confidence` : b.scope.unavailableReason;
    if (personScores) {
      const v = personScores[k];
      return { label: metricLabel(k), value: v == null ? null : Math.round(v), context: scopeMedian(k), note };
    }
    return {
      label: metricLabel(k),
      value: scopeMedian(k),
      context: filters.department === 'all' ? null : b.company.stats ? Math.round(b.company.stats.median) : null,
      note,
    };
  });
  const first = benchmarks.get(CORE_KEYS[0]!)!.scope;

  return (
    <div className="stack">
      <div className="grid cols-4">
        <Stat label="Eligible employees" value={counts.eligibleEmployees} sub={`${scopeLabel} · one result per person`} />
        <Stat label="Excluded" value={counts.excludedAssessments} sub={`assessments · ${counts.excludedEmployees} employee-level exclusion${counts.excludedEmployees === 1 ? '' : 's'}`} />
        <Stat label="Assessments" value={counts.eligibleAssessments + counts.supersededAssessments} sub={`${counts.eligibleAssessments} in benchmark · ${counts.supersededAssessments} earlier kept for trends`} />
        <Stat label="Benchmark reliability" value={<ConfidenceBadge confidence={confidence} />} sub={`${counts.eligibleEmployees} people in comparison`} />
      </div>

      <div className="grid cols-3-1">
        <Card
          title="Dimension comparison"
          sub={
            person
              ? `${person.displayName} vs ${scopeLabel} median · shaded by FocusiQ expectations`
              : `${filters.department === 'all' ? 'Company median per dimension' : `${scopeLabel} median vs company median`} · shaded by FocusiQ expectations`
          }
          actions={
            <div className="row">
              <select aria-label="Show a person on the chart" value={person?.id ?? ''} onChange={(e) => setPersonId(e.target.value)}>
                <option value="">No person – medians only</option>
                {people.map((e) => <option key={e.id} value={e.id}>{e.displayName}</option>)}
              </select>
              <button className="btn link" onClick={() => setShowTable(!showTable)}>{showTable ? 'Show chart' : 'Show table'}</button>
            </div>
          }
        >
          {first.available ? (
            showTable ? (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Dimension</th>{person && <th className="num">{person.displayName}</th>}{bands && <th>{person ? 'Band' : `${scopeLabel} band`}</th>}<th className="num">{scopeLabel}</th><th className="num">Company</th><th className="num">People</th><th>Confidence</th></tr></thead>
                  <tbody>
                    {CORE_KEYS.map((k) => {
                      const b = benchmarks.get(k)!;
                      const shown = personScores ? personScores[k] : b.scope.stats?.median;
                      const band = shown == null || !bands ? null : shown >= bands.strong ? 'Strong' : shown < bands.development ? 'Development opportunity' : 'Expected';
                      return (
                        <tr key={k}>
                          <td>{metricLabel(k)}</td>
                          {person && <td className="num">{fmt(personScores?.[k])}</td>}
                          {bands && <td>{band ?? '—'}</td>}
                          <td className="num">{fmt(b.scope.stats?.median)}</td>
                          <td className="num">{fmt(b.company.stats?.median)}</td>
                          <td className="num">{b.scope.explanation.sampleSize}</td>
                          <td><ConfidenceBadge confidence={b.scope.confidence} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <Dumbbell
                rows={dumbbellRows}
                seriesLabel={person ? person.displayName : `${scopeLabel} median`}
                contextLabel={person ? `${scopeLabel} median` : 'Company median'}
                bands={bands}
              />
            )
          ) : (
            <p className="empty">{first.unavailableReason} {first.sampleSizeLabel}</p>
          )}
          <p className="small muted" style={{ marginTop: 8 }}>{first.sampleSizeLabel}</p>
          <Explanation benchmark={first} />
        </Card>

        <Card title="Organisation insight" sub="Patterns shared by many people may point to a process issue, not individual problems">
          {org.length === 0 ? (
            <p className="empty">No shared patterns meet the threshold (≥ 5 people in the group, ≥ 3 and ≥ 50 % showing the pattern).</p>
          ) : (
            (allInsights ? org : org.slice(0, 3)).map((o) => (
              <div className="rec" key={o.group + o.patternKey}>
                <strong>{o.observation}</strong>
                <p className="small secondary" style={{ margin: '4px 0' }}>{o.interpretation}</p>
                <p className="small" style={{ margin: 0 }}>Suggested response: {o.suggestedResponse}</p>
              </div>
            ))
          )}
          {org.length > 3 && (
            <button className="btn link small" style={{ marginTop: 8 }} onClick={() => setAllInsights(!allInsights)}>
              {allInsights ? 'Show fewer' : `Show all ${org.length} observations`}
            </button>
          )}
        </Card>
      </div>

      <Card title="Department heatmap" sub="Median per dimension · latest eligible assessment per person · stronger shade = higher median">
        <div className="table-wrap">
          <table className="heat">
            <thead>
              <tr>
                <th>Department</th>
                {heat.metrics.map((m) => <th key={m.key} className="num">{m.label}</th>)}
                <th className="num">People</th>
              </tr>
            </thead>
            <tbody>
              {heat.rows.map((r) => (
                <tr key={r.department}>
                  <td>{r.department}</td>
                  {r.cells.map((c) =>
                    c.available && c.median != null ? (
                      <td
                        key={c.metricKey}
                        className="cell"
                        title={`${r.department} · ${metricLabel(c.metricKey)}: ${c.median} (n=${c.n}${c.vsCompany != null ? `, ${c.vsCompany >= 0 ? '+' : ''}${c.vsCompany} vs company` : ''})`}
                        style={{ background: `var(${SEQ[step(c.median)]})`, color: `var(--seq-ink-${step(c.median)})` }}
                      >
                        {Math.round(c.median)}
                      </td>
                    ) : (
                      <td key={c.metricKey} className="cell na" title={`Fewer than 5 eligible people (n=${c.n})`}>n&lt;5</td>
                    ),
                  )}
                  <td className="num">{r.cells[0]?.n ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="legend">
          {SEQ.map((s, i) => <span key={s}><span className="swatch" style={{ background: `var(${s})` }} />{i === 0 ? `${Math.round(hMin)} (lowest)` : i === 5 ? `${Math.round(hMax)} (highest)` : ''}</span>)}
          <span><span className="swatch" style={{ background: 'repeating-linear-gradient(45deg, transparent 0 3px, var(--axis) 3px 4px)' }} />Benchmark unavailable – fewer than 5 people</span>
        </div>
      </Card>

      <div className="grid cols-2">
        <Card title="Accuracy vs speed" sub="Latest eligible assessment per person · click a point to open the report">
          <Scatter
            points={points}
            xLabel="Average response time (seconds)"
            yLabel="Accuracy (%)"
            highlightLabel={filters.department === 'all' ? 'All departments' : filters.department}
            contextLabel="Other departments"
            onSelect={onOpenEmployee}
          />
          <p className="small muted">Faster is not automatically better: compare accuracy, re-checking and the role's need for pace.</p>
        </Card>
        <div className="stack">
          <Card title="Unnecessary re-checking" sub="Median % of exercises re-checked after a correct first answer">
            <BarList rows={recheck.filter((r) => r.available)} unit="%" />
            {recheck.some((r) => !r.available) && (
              <p className="small muted">Not shown (fewer than 5 people): {recheck.filter((r) => !r.available).map((r) => r.label).join(', ')}</p>
            )}
          </Card>
          <Card title="Motivation" sub={`Top-ranked motivator · ${scopeLabel} · no motivator is better than another`}>
            {motivationRows.length ? <BarList rows={motivationRows} unit="people" /> : <p className="empty">No motivation profiles.</p>}
          </Card>
        </div>
      </div>
    </div>
  );
}
