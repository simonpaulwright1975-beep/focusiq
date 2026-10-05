import { useEffect, useMemo, useState } from 'react';
import { compareEmployeeByDimension, personalImprovement, tenureBandFor } from '../../../src/benchmarking/index.js';
import type { ExerciseEvidence, Finding, InsightReport } from '../../../src/insight/index.js';
import { BAND_LABEL, bandKey, emptyCounts, personHeadline } from '../bands.js';
import { SAMPLE_EMPLOYEE_ID } from '../demo/dataset.js';
import { WG_WAY_TOPICS } from '../demo/wgWayBank.js';
import { pct, TOPICS as WG_TOPICS } from './wgWayResults.js';
import { useWgWayResults } from './WgWayView.js';
import { BandDonut, Headline, ScoreBars, ScoreDonut } from '../components/bandCharts.js';
import { Trend } from '../components/charts.js';
import { ReleasePanel } from './ReleasePanel.js';
import { BandChip, Card, ConfidenceBadge, Explanation, fmt, ordinal } from '../components/ui.js';
import { buildInsightReports } from '../insights.js';
import { CORE_KEYS, definitionFor, expectationBands, metricLabel, useStore } from '../state.js';

const DETAIL_KEYS = [...CORE_KEYS, 'decision_efficiency', 'accuracy', 'recheck_rate', 'avg_response_seconds', 'commercial_awareness', 'customer_judgement'];
const TREND_KEYS = ['decision_efficiency', 'accuracy', 'recheck_rate', ...CORE_KEYS];

export function EmployeeView({ employeeId, onSelect }: { employeeId: string; onSelect: (id: string) => void }) {
  const { data, demo, filters, now, revision } = useStore();
  const employee = data.employees.find((e) => e.id === employeeId)!;
  const [trendKey, setTrendKey] = useState('decision_efficiency');
  const [openEvidence, setOpenEvidence] = useState<string | null>(null);
  // A printed report includes the full details.
  useEffect(() => {
    const open = () => document.querySelectorAll<HTMLDetailsElement>('details.more').forEach((d) => (d.open = true));
    window.addEventListener('beforeprint', open);
    return () => window.removeEventListener('beforeprint', open);
  }, []);

  const def = definitionFor(filters, now, employee.department);
  const rows = useMemo(
    () => compareEmployeeByDimension(data, employeeId, def, DETAIL_KEYS, { now }).filter((r) => r.employeeValue != null),
    [data, employeeId, filters],
  );
  const trend = useMemo(() => personalImprovement(data, employeeId, trendKey), [data, employeeId, trendKey]);
  const reports = useMemo(() => buildInsightReports(demo, now), [demo, revision]);
  const insight = reports.get(employeeId);
  const exercises = insight ? demo.exercises.get(insight.assessmentId) ?? [] : [];
  const exclusion = data.eligibility.employees.get(employeeId);
  const tenure = tenureBandFor(employee, now);

  // Core dimensions: this person against the department median, shaded by FocusiQ expectations.
  const dimensionRows = rows
    .filter((r) => CORE_KEYS.includes(r.metricKey))
    .map((r) => ({
      label: r.metricLabel,
      value: r.employeeValue == null ? null : Math.round(r.employeeValue),
      marker: r.benchmark.available && r.benchmarkMedian != null ? Math.round(r.benchmarkMedian) : null,
      note: r.benchmark.available ? undefined : `${employee.department} median unavailable: ${r.benchmark.unavailableReason ?? 'too few colleagues'}`,
    }));
  const level = employee.expectations ?? 'standard';
  const leader = level === 'leader';
  const bands = expectationBands(CORE_KEYS[0]!, level);
  const banded = bands
    ? dimensionRows.flatMap((r) => (r.value == null ? [] : [{ label: r.label, band: bandKey(bands, r.value) }]))
    : [];
  const bandCounts = banded.reduce((c, r) => ({ ...c, [r.band]: c[r.band] + 1 }), emptyCounts());
  // Only the sample reference profile shows an average: for everyone else there is no overall score.
  const scored = dimensionRows.flatMap((r) => (r.value == null ? [] : [r.value]));
  const average = employee.id === SAMPLE_EMPLOYEE_ID && scored.length ? Math.round(scored.reduce((a, b) => a + b, 0) / scored.length) : null;
  // Live the Walter Geering Way: the separate knowledge check, shown on its own card.
  const wgAll = useWgWayResults();
  const wgWay = useMemo(() => wgAll.filter((r) => r.employeeId === employee.id), [wgAll, employee]);
  const wgLatest = wgWay.at(-1);

  return (
    <div className="stack">
      <div className="card">
        <div className="row">
          <label className="row">
            <span className="secondary small">Employee</span>
            <select value={employeeId} onChange={(e) => onSelect(e.target.value)} aria-label="Choose employee">
              {data.employees.map((e) => <option key={e.id} value={e.id}>{e.displayName} – {e.department}</option>)}
            </select>
          </label>
          <span className="tag">{employee.role}</span>
          <span className="tag">{tenure?.label ?? '—'} service</span>
          {leader && <span className="tag">Leader expectations</span>}
          {employee.status !== 'active' && <span className="tag">{employee.status === 'former' ? 'Former employee' : 'Test user'}</span>}
          {exclusion && <span className="tag">Excluded from benchmarks: {exclusion.reason.replaceAll('_', ' ')}</span>}
          {employee.cohortTags.map((t) => <span key={t} className="tag">{t}</span>)}
          <span className="spacer" />
          <button className="btn secondary no-print" onClick={() => window.print()}>Print or save as PDF</button>
        </div>
      </div>

      {banded.length > 0 && (
        <Card
          title="At a glance"
          sub={`Against FocusiQ ${leader ? 'leader ' : ''}expectations${bands?.note === 'provisional' ? ' (provisional)' : ''}${leader && bands ? ` – Strong ${bands.strong}+, Expected ${bands.development}–${bands.strong - 1}` : ''}`}
        >
          <div className="glance">
            <div className="glance-text">
              <Headline>{personHeadline(employee.displayName, banded)}</Headline>
              {average != null && bands && (
                <p className="glance-average">
                  Average across the {scored.length} dimensions: <strong>{average}</strong> out of 100 ({BAND_LABEL[bandKey(bands, average)]}) –
                  sample reference profile
                </p>
              )}
            </div>
            <BandDonut
              counts={bandCounts}
              noun={banded.length === 1 ? 'area' : 'areas'}
              centre={
                average != null
                  ? { value: String(average), label: 'average\nout of 100' }
                  : { value: `${bandCounts.strong} of ${banded.length}`, label: 'areas above\nexpectations' }
              }
            />
          </div>
        </Card>
      )}

      {wgLatest && (
        <Card
          title="Live the Walter Geering Way"
          sub={`Knowledge check (right or wrong) – kept separate from the working-style results above${wgLatest.sample ? ' · sample: the whole 70-question bank' : ''}`}
        >
          <div className="glance">
            <div className="glance-text">
              <p className="headline">
                {employee.displayName} scored <strong>{wgLatest.correct}/{wgLatest.total}</strong> ({pct(wgLatest.correct, wgLatest.total)}%) on{' '}
                {new Date(wgLatest.completedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.
              </p>
              {wgWay.length > 1 && <p className="small secondary">{wgWay.length} sittings – see the WG Way check tab for each one.</p>}
            </div>
            <ScoreDonut correct={wgLatest.correct} total={wgLatest.total} />
            <ul className="wg-topics">
              {WG_TOPICS.filter((t) => wgLatest.byTopic[t].total > 0).map((t) => (
                <li key={t}>
                  <span>{WG_WAY_TOPICS[t]}</span>
                  <span className="wg-topic">
                    <span className="wg-bar" aria-hidden="true"><span style={{ width: `${pct(wgLatest.byTopic[t].correct, wgLatest.byTopic[t].total)}%` }} /></span>
                    {wgLatest.byTopic[t].correct}/{wgLatest.byTopic[t].total}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      )}

      <div className="grid cols-3-1">
        {bands && dimensionRows.length > 0 ? (
          <Card
            title="Dimensions against expectations"
            sub={`${employee.displayName}'s score in each dimension, with the ${employee.department} median marked`}
          >
            <ScoreBars rows={dimensionRows} bands={bands} valueLabel={employee.displayName} markerLabel={`${employee.department} median`} />
          </Card>
        ) : (
          <Card title="Dimensions against expectations"><p className="empty">No core dimension results for this employee.</p></Card>
        )}
        <Card title="ME vs ME" sub="Every valid assessment – earlier results stay in the trend even though benchmarks use only the latest">
          <select value={trendKey} onChange={(e) => setTrendKey(e.target.value)} aria-label="Trend measure">
            {TREND_KEYS.map((k) => <option key={k} value={k}>{metricLabel(k)}</option>)}
          </select>
          <Trend points={trend.series.map((s) => ({ date: s.completedAt, value: s.value }))} label={trend.metricLabel} bands={expectationBands(trendKey, level)} />
          {trend.change != null ? (
            <p className="small">
              Previous {fmt(trend.previous)} → current {fmt(trend.current)} ({trend.changeLabel}) –{' '}
              <strong>{trend.direction === 'improved' ? 'improved' : trend.direction === 'declined' ? 'declined' : 'unchanged'}</strong>
              {trend.versionWarning && <span className="muted"> · {trend.versionWarning}</span>}
            </p>
          ) : (
            <p className="empty">Only one assessment so far.</p>
          )}
        </Card>
      </div>

      <Card
        title="Full results"
        sub="Every measure with its band, percentile and notes"
      >
        <details className="more">
        <summary>Show full details</summary>
        <p className="small secondary">
          Band = is the behaviour effective? Percentile = how unusual compared with {employee.department} colleagues (the employee is not in their own comparison group).
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Measure</th><th className="num">Score</th><th>Absolute band</th><th className="num">{employee.department} percentile</th><th>Comparison</th><th>Notes</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const p = r.position!;
                return (
                  <tr key={r.metricKey}>
                    <td>{r.metricLabel}</td>
                    <td className="num">{fmt(r.employeeValue)}</td>
                    <td><BandChip band={p.absolute.band} status={p.absolute.status} /></td>
                    <td className="num">{p.percentile != null ? ordinal(p.percentile) : '—'}</td>
                    <td className="small">
                      {p.comparison.comparisonPopulationSize} colleagues <ConfidenceBadge confidence={p.comparison.confidence} />
                    </td>
                    <td className="small secondary">
                      {p.outlier && <div><strong>Significant Outlier</strong> – statistically unusual ({p.outlier.direction} the group, {p.outlier.method.toUpperCase()}). Not a judgement of performance.</div>}
                      {p.context && <div>{p.context}</div>}
                      {p.percentile == null && <div>{r.benchmark.unavailableReason ?? 'Too few colleagues for a percentile.'}</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="small muted">* Provisional expectations – not yet validated.</p>
        {rows[0] && <Explanation benchmark={rows[0].benchmark} />}
        </details>
      </Card>

      {!insight ? (
        <Card title="Insight report"><p className="empty">No exercise evidence is available for this employee.</p></Card>
      ) : (
        <>
          <div className="no-print"><ReleasePanel employeeId={employee.id} name={employee.displayName} assessmentId={insight.assessmentId} report={insight.report} /></div>
          <InsightSection
            report={insight.report}
            exercises={exercises}
            name={employee.displayName}
            openEvidence={openEvidence}
            setOpenEvidence={setOpenEvidence}
          />
        </>
      )}
    </div>
  );
}

function EvidenceTable({ ids, exercises }: { ids: string[]; exercises: ExerciseEvidence[] }) {
  const [all, setAll] = useState(false);
  const matching = exercises.filter((e) => ids.includes(e.exerciseId));
  const rows = all ? matching : matching.slice(0, 10);
  const yes = (b: boolean | undefined) => (b == null ? '—' : b ? 'Yes' : 'No');
  return (
    <div className="table-wrap">
      <table className="small">
        <thead><tr><th>Exercise</th><th>Type</th><th>Risk</th><th>Timed</th><th>First answer correct</th><th>Final correct</th><th>Reopened</th><th className="num">Time (s)</th><th className="num">Extra review (s)</th></tr></thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.exerciseId}>
              <td>#{e.sequence} {e.family}</td>
              <td>{e.dimension} · {e.modality}</td>
              <td>{e.risk}</td>
              <td>{yes(e.timed)}</td>
              <td>{yes(e.firstAnswerCorrect)}</td>
              <td>{yes(e.correct)}</td>
              <td>{yes(e.reopened)}</td>
              <td className="num">{Math.round(e.responseSeconds)}</td>
              <td className="num">{Math.round(e.reviewSecondsAfterFirstAnswer)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {matching.length > 10 && (
        <button className="btn link small" onClick={() => setAll(!all)}>{all ? 'Show first 10' : `Show all ${matching.length} exercises`}</button>
      )}
    </div>
  );
}

function InsightSection(props: {
  report: InsightReport;
  exercises: ExerciseEvidence[];
  name: string;
  openEvidence: string | null;
  setOpenEvidence: (k: string | null) => void;
}) {
  const { report, exercises, openEvidence, setOpenEvidence } = props;
  const q = report.fourQuestions;
  const findingCard = (f: Finding) => (
    <div className="rec" key={f.key}>
      <div className="row">
        <strong>{f.insight}</strong>
        <span className="spacer" />
        <span className="small muted">Evidence: {f.evidenceCount} exercises{f.consistentCount != null ? ` · consistent ${f.consistentCount}/${f.evidenceCount}` : ''} · confidence {f.confidence}</span>
      </div>
      <ul className="evidence-list">
        {f.evidence.map((e, i) => {
          const key = `${f.key}:${i}`;
          return (
            <li key={key}>
              {e.label}{' '}
              {e.exerciseIds.length > 0 && (
                <button className="btn link small" aria-expanded={openEvidence === key} onClick={() => setOpenEvidence(openEvidence === key ? null : key)}>
                  {openEvidence === key ? 'Hide evidence' : 'View evidence'}
                </button>
              )}
              {openEvidence === key && <EvidenceTable ids={e.exerciseIds} exercises={exercises} />}
            </li>
          );
        })}
      </ul>
    </div>
  );

  return (
    <div className="stack">
      <Card
        title={`FocusiQ summary – ${props.name}`}
        sub={`Interpretation ${report.interpretationVersion} · generated from exercise evidence · a conversation starter, not unquestionable fact`}
      >
        {q.overallSummary.map((s) => <p key={s.text} className="statement">{s.text}</p>)}
      </Card>

      <div className="grid cols-2">
        <Card title="1. What does this tell us?">
          {q.whatThisTellsUs.map((s) => <p key={s.text} className="statement">{s.text}</p>)}
        </Card>
        <Card title="2. How can the business support this employee?" sub="At most three, prioritised by likely impact">
          {q.howTheBusinessCanSupport.length === 0 && <p className="empty">No recommendations – not enough evidence.</p>}
          {q.howTheBusinessCanSupport.map((r) => (
            <div className="rec" key={r.id}>
              <div className="row"><strong>{r.priorityLabel}</strong></div>
              <div><strong>{r.title}</strong> <span className="tag">{r.category}</span></div>
              <p className="small" style={{ margin: '4px 0' }}>{r.detail}</p>
              {r.example && <p className="small secondary" style={{ margin: 0 }}>Example: {r.example}</p>}
              <p className="small muted" style={{ margin: '4px 0 0' }}>Impact {r.impact} · Effort {r.effort}</p>
            </div>
          ))}
        </Card>
        <Card title="3. What could the business change?" sub="Employee behaviour, management clarity or business process – responsibility is not assumed">
          {q.whatTheBusinessCouldChange.length === 0 && <p className="empty">No development patterns concluded.</p>}
          {q.whatTheBusinessCouldChange.map((b) => (
            <div className="rec" key={b.findingKey}>
              <strong>{b.question}</strong>
              <ul className="evidence-list">
                {b.considerations.map((c) => <li key={c.attribution}><strong>{c.attribution}:</strong> {c.text}</li>)}
              </ul>
              {b.possibleReasons && <p className="small secondary" style={{ margin: '6px 0 0' }}>Possible reasons (FocusiQ does not assume which applies): {b.possibleReasons.join('; ')}.</p>}
            </div>
          ))}
        </Card>
        <Card title="4. How to get the best from this person">
          {report.howToGetTheBest.slice(0, 5).map((s) => <p key={s.text} className="statement">{s.text}</p>)}
          {report.managementStyle.length > 0 && (
            <>
              <h3 style={{ marginTop: 12 }}>Suggested management approach</h3>
              <ul className="evidence-list">{report.managementStyle.map((m) => <li key={m.style}><strong>{m.style}</strong> – {m.rationale}</li>)}</ul>
            </>
          )}
        </Card>
      </div>

      <Card title="Evidence behind the summary" sub="Every statement is traceable. Open “View evidence” to see the underlying exercises.">
        {report.findings.map(findingCard)}
        {report.notConcluded.length > 0 && (
          <details className="explain">
            <summary>{report.notConcluded.length} pattern(s) considered but not concluded – insufficient evidence</summary>
            <ul className="evidence-list">{report.notConcluded.map((n) => <li key={n.key}>{n.key.replaceAll('_', ' ')}: {n.reason}</li>)}</ul>
          </details>
        )}
      </Card>

      <div className="grid cols-2">
        <Card title="Coaching conversation" sub="Encourage discussion rather than treating the report as fact">
          {report.conversationGuide ? (
            <>
              <div className="quote">{report.conversationGuide.opener}</div>
              <h3>Questions to ask</h3>
              <ul className="evidence-list">{report.conversationGuide.questions.map((qq) => <li key={qq}>{qq}</li>)}</ul>
            </>
          ) : (
            <p className="empty">No development pattern to discuss.</p>
          )}
        </Card>
        <Card title="Strengths, motivation and role fit">
          {report.strengthUtilisation.map((s) => (
            <div key={s.findingKey} className="statement">
              <strong>{s.strength}</strong> – potentially valuable for {s.uses.join(', ')}.
              {s.caution && <div className="small secondary">{s.caution}</div>}
            </div>
          ))}
          {report.motivation && (
            <div className="statement">
              <strong>Primary motivators:</strong> {report.motivation.primaryMotivators.join(', ')}. {report.motivation.whatThisCouldMean}
              <div className="small secondary">Possible actions: {report.motivation.businessResponse.join('; ')}.</div>
            </div>
          )}
          {report.roleFit.observations.map((o) => <p key={o.text} className="statement small">{o.text}</p>)}
          <p className="small muted">{report.roleFit.note}</p>
        </Card>
      </div>

      <Card title="Summary of the person" sub="Signature FocusiQ structure">
        <div className="grid cols-2 section-list">
          {report.directorSummary.map((s) => (
            <div key={s.heading}>
              <h4>{s.heading}</h4>
              <ul>{s.statements.map((st) => <li key={st.text}>{st.text}</li>)}</ul>
            </div>
          ))}
        </div>
        <h4 style={{ marginTop: 16 }}>Monitor at next review</h4>
        <ul className="evidence-list">{report.monitorAtNextReview.map((m) => <li key={m}>{m}</li>)}</ul>
      </Card>
    </div>
  );
}
