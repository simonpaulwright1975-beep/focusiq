/**
 * Assessment day: is everyone ready, what do people need on the day, a
 * suggested session plan for completing everyone in one office day, and live
 * progress on the day. Director-only.
 *
 * Shows agreed arrangement labels only: never adjustment request text or
 * internal notes.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  DAY_STATUS_LABELS,
  DEFAULT_DAY_SETTINGS,
  NOTICE_V1,
  assessReadiness,
  dayStatus,
  planDay,
  summariseDay,
  type AcknowledgementSummary,
  type AssessmentProgress,
  type DayEmployee,
  type DaySettings,
  type DayStatus,
  type PersonReadiness,
} from '../../../src/participation/index.js';
import { Stat } from '../components/ui.js';
import { DEMO_ASSESSMENT } from '../demo/assessment.js';
import { demoAcknowledgements } from '../demo/daySeed.js';
import { demoAcknowledgement, demoProgress, readJson, subscribeParticipation, writeJson } from '../shared/participationStore.js';
import { useStore } from '../state.js';
import { useAdjustmentRequests } from './AdjustmentsView.js';
import { useRightsRequests } from './QuestionsView.js';

const SETTINGS_KEY = 'focusiq-demo-day';
const PINS_KEY = 'focusiq-demo-day-pins';
const LIVE_EMPLOYEE = 's4';
const TOTAL_QUESTIONS = DEMO_ASSESSMENT.sections.reduce((n, s) => n + s.questions.length, 0);

/** Next working day (Mon–Fri) after today, as YYYY-MM-DD. */
function nextWorkingDay(from = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return localDate(d);
}
const localDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const longDay = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

const followUps = (n: number) => (n === 0 ? 'No other follow-ups' : `${n} other follow-up${n === 1 ? '' : 's'}`);

type Filter = 'all' | 'not_ready' | 'arrangements';
type Section = 'Adjustments' | 'Questions & concerns';

function useLiveRevision(): number {
  const [rev, setRev] = useState(0);
  useEffect(() => subscribeParticipation(() => setRev((r) => r + 1)), []);
  return rev;
}

function useNow(everyMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}

function ReadinessTag({ person }: { person: PersonReadiness }) {
  if (person.ready) return <span className="tag tag-green">✓ Ready</span>;
  const blocking = person.actions.filter((a) => a.blocking);
  if (blocking.some((a) => a.owner === 'director')) return <span className="tag tag-red">⚠ Action for you</span>;
  return <span className="tag tag-amber">● Waiting on employee</span>;
}

function StatusTag({ status, progress }: { status: DayStatus; progress: AssessmentProgress | null }) {
  const count = progress?.startedAt && !progress.completedAt ? ` · ${progress.answered}/${progress.total}` : '';
  const cls = { waiting: 'tag', not_arrived: 'tag tag-amber', in_progress: 'tag tag-accent', check_in: 'tag tag-amber', finished: 'tag tag-green' }[status];
  const icon = { waiting: '○', not_arrived: '⚠', in_progress: '▶', check_in: '●', finished: '✓' }[status];
  return <span className={cls}>{icon} {DAY_STATUS_LABELS[status]}{count}</span>;
}

function NumberField({ id, label, value, onChange, min = 0, max = 999 }: { id: string; label: string; value: number; onChange: (n: number) => void; min?: number; max?: number }) {
  return (
    <div className="field day-field">
      <label htmlFor={id}>{label}</label>
      <input id={id} type="number" min={min} max={max} value={value} onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value) || 0)))} />
    </div>
  );
}

export function AssessmentDayView({ onOpen }: { onOpen: (section: Section) => void }) {
  const { demo } = useStore();
  const adjustments = useAdjustmentRequests();
  const rightsRequests = useRightsRequests();
  const live = useLiveRevision();
  const now = useNow();
  const [settings, setSettingsState] = useState<DaySettings>(() => ({
    ...DEFAULT_DAY_SETTINGS,
    date: nextWorkingDay(),
    assessmentMinutes: DEMO_ASSESSMENT.estimatedMinutes,
    ...readJson<Partial<DaySettings>>(SETTINGS_KEY),
  }));
  const setSettings = (patch: Partial<DaySettings>) =>
    setSettingsState((prev) => {
      const next = { ...prev, ...patch };
      writeJson(SETTINGS_KEY, next);
      return next;
    });
  const [pins, setPinsState] = useState<Record<string, number>>(() => readJson<Record<string, number>>(PINS_KEY) ?? {});
  const setPin = (id: string, n: number | null) =>
    setPinsState((prev) => {
      const next = { ...prev };
      if (n === null) delete next[id];
      else next[id] = n;
      writeJson(PINS_KEY, next);
      return next;
    });
  const setAllPins = (next: Record<string, number>) => {
    writeJson(PINS_KEY, next);
    setPinsState(next);
  };
  const [filter, setFilter] = useState<Filter>('all');

  const employees: DayEmployee[] = useMemo(
    () => demo.employees.map((e) => ({ employeeId: e.id, name: e.displayName, department: e.department, jobRole: e.role ?? '', status: e.status })),
    [demo],
  );
  const acknowledgements: AcknowledgementSummary[] = useMemo(() => {
    const seeded = demoAcknowledgements(employees.map((e) => e.employeeId), NOTICE_V1.version);
    const mine = demoAcknowledgement();
    return mine
      ? [...seeded, { employeeId: LIVE_EMPLOYEE, noticeVersion: mine.noticeVersion, detailsCorrect: mine.detailsCorrect, acknowledgedAt: mine.acknowledgedAt }]
      : seeded;
  }, [employees, live]);
  const progress = useMemo(() => {
    const p = demoProgress(LIVE_EMPLOYEE, TOTAL_QUESTIONS);
    return p ? { [LIVE_EMPLOYEE]: p } : ({} as Record<string, AssessmentProgress>);
  }, [live, now]);

  const { people, notTakingPart } = useMemo(
    () => assessReadiness({ employees, currentNoticeVersion: NOTICE_V1.version, acknowledgements, adjustments, rightsRequests }, settings),
    [employees, acknowledgements, adjustments, rightsRequests, settings],
  );
  const plan = useMemo(() => planDay(people, settings, pins), [people, settings, pins]);
  const sessionOf = (id: string) => plan.sessions.find((s) => s.number === plan.assignment[id]) ?? null;
  const statuses = useMemo(() => {
    const out: Record<string, DayStatus> = {};
    for (const p of people) {
      const s = sessionOf(p.employee.employeeId);
      out[p.employee.employeeId] = dayStatus(progress[p.employee.employeeId] ?? null, s ? new Date(`${settings.date}T${s.start}:00`) : null, now);
    }
    return out;
  }, [people, plan, progress, now, settings.date]);
  const summary = summariseDay(people, statuses);
  const byId = new Map(people.map((p) => [p.employee.employeeId, p]));
  const forDirector = people.flatMap((p) => p.actions.filter((a) => a.owner === 'director').map((a) => ({ person: p, action: a })));
  const forEmployees = people.flatMap((p) => p.actions.filter((a) => a.owner === 'employee').map((a) => ({ person: p, action: a })));
  const shown = people
    .filter((p) => filter === 'all' || (filter === 'not_ready' ? !p.ready : p.needs.arrangements.length > 0))
    .sort((a, b) => (plan.assignment[a.employee.employeeId] ?? 99) - (plan.assignment[b.employee.employeeId] ?? 99) || a.employee.name.localeCompare(b.employee.name));
  const fixed = people.length > 0 && people.every((p) => pins[p.employee.employeeId] !== undefined);
  const used = plan.sessions.filter((s) => s.main.length + s.quiet.length > 0);
  const isToday = settings.date === localDate(now);

  return (
    <div className="stack day">
      <section className="card">
        <div className="card-head">
          <div>
            <h2>Assessment day</h2>
            <p>
              {longDay(settings.date)} · {summary.takingPart} people taking part
              {notTakingPart.length > 0 && <> ({notTakingPart.length} former or test accounts left out)</>}
            </p>
          </div>
          <button className="btn secondary no-print" onClick={() => window.print()}>Print day sheet</button>
        </div>
        <div className="row day-settings no-print">
          <div className="field day-field">
            <label htmlFor="day-date">Date</label>
            <input id="day-date" type="date" value={settings.date} onChange={(e) => e.target.value && setSettings({ date: e.target.value })} />
          </div>
          <div className="field day-field">
            <label htmlFor="day-start">First session</label>
            <input id="day-start" type="time" value={settings.firstStart} onChange={(e) => e.target.value && setSettings({ firstStart: e.target.value })} />
          </div>
          <div className="field day-field">
            <label htmlFor="day-end">Finish by</label>
            <input id="day-end" type="time" value={settings.endBy} onChange={(e) => e.target.value && setSettings({ endBy: e.target.value })} />
          </div>
          <NumberField id="day-seats" label="Seats, main room" value={settings.seats} min={1} max={200} onChange={(n) => setSettings({ seats: n })} />
          <NumberField id="day-quiet" label="Seats, quiet room" value={settings.quietSeats} max={20} onChange={(n) => setSettings({ quietSeats: n })} />
          <NumberField id="day-length" label="Assessment (min)" value={settings.assessmentMinutes} min={1} max={240} onChange={(n) => setSettings({ assessmentMinutes: n })} />
        </div>
        <details className="explain no-print">
          <summary>More settings</summary>
          <div className="row day-settings" style={{ marginTop: 10 }}>
            <div className="field day-field">
              <label htmlFor="day-slot">Session length (min)</label>
              <input
                id="day-slot"
                type="number"
                min={15}
                max={480}
                placeholder={`Auto (${plan.suggestedSessionMinutes})`}
                value={settings.sessionMinutes ?? ''}
                onChange={(e) => setSettings({ sessionMinutes: e.target.value ? Math.max(15, Number(e.target.value)) : null })}
              />
            </div>
            <NumberField id="day-gap" label="Gap between (min)" value={settings.gapMinutes} max={120} onChange={(n) => setSettings({ gapMinutes: n })} />
            <NumberField id="day-settle" label="Settling in (min)" value={settings.settlingMinutes} max={60} onChange={(n) => setSettings({ settlingMinutes: n })} />
            <NumberField id="day-breaks" label="Rest-break allowance (min)" value={settings.restBreakMinutes} max={60} onChange={(n) => setSettings({ restBreakMinutes: n })} />
            <div className="field day-field">
              <label htmlFor="day-lunch">Lunch from</label>
              <input
                id="day-lunch"
                type="time"
                value={settings.lunch?.start ?? ''}
                onChange={(e) => setSettings({ lunch: e.target.value ? { start: e.target.value, minutes: settings.lunch?.minutes ?? 45 } : null })}
              />
            </div>
            <NumberField
              id="day-lunch-min"
              label="Lunch (min, 0 = none)"
              value={settings.lunch?.minutes ?? 0}
              max={120}
              onChange={(n) => setSettings({ lunch: n > 0 ? { start: settings.lunch?.start ?? '12:30', minutes: n } : null })}
            />
          </div>
          <p className="small muted" style={{ marginBottom: 0 }}>
            Expected time = settling in + assessment length (with any agreed extra time) + the rest-break allowance where breaks are agreed.
            Quiet-room and paper or assisted arrangements use the quiet room. The assessment length is an estimate until the final content is written.
          </p>
        </details>
      </section>

      <div className="grid cols-4">
        <Stat label="Ready to start" value={<>{summary.ready}<span className="of"> / {summary.takingPart}</span></>} sub={summary.blocked ? `${summary.blocked} not ready yet` : 'Everyone is ready'} />
        <Stat label="Actions for you" value={forDirector.filter((x) => x.action.blocking).length} sub={followUps(forDirector.length - forDirector.filter((x) => x.action.blocking).length)} />
        <Stat label="Arrangements" value={summary.quietRoom + summary.extraTime + summary.otherArrangements} sub={`${summary.quietRoom} quiet room · ${summary.extraTime} extra time`} />
        <Stat label="Finishes at" value={plan.finishesAt ?? '—'} sub={`${used.length} session${used.length === 1 ? '' : 's'} of ${plan.sessionMinutes} min`} />
      </div>

      {plan.warnings.length > 0 && (
        <div className="notice-sensitive day-warnings" role="status">
          <strong>Check the plan</strong>
          <ul>{plan.warnings.map((w) => <li key={w.message}>⚠ {w.message}</li>)}</ul>
        </div>
      )}

      <section className="card">
        <div className="card-head">
          <div>
            <h2>On the day</h2>
            <p>{isToday ? 'Live: updates as people start and finish.' : 'Fills in live as people start and finish on the day.'}</p>
          </div>
        </div>
        <div className="row">
          {(['finished', 'in_progress', 'check_in', 'not_arrived', 'waiting'] as DayStatus[]).map((s) => (
            <span key={s} className="day-count"><StatusTag status={s} progress={null} /> <strong>{summary.byStatus[s]}</strong></span>
          ))}
        </div>
      </section>

      <div className="grid cols-2 no-print">
        <section className="card">
          <div className="card-head"><div><h2>Before the day: for you</h2><p>Decisions and follow-ups that need a Director.</p></div></div>
          {forDirector.length === 0 ? (
            <p className="small">✓ Nothing outstanding.</p>
          ) : (
            <ul className="todo">
              {forDirector.map(({ person, action }) => (
                <li key={person.employee.employeeId + action.code}>
                  <span>
                    <strong>{person.employee.name}</strong> · {action.label}
                    {!action.blocking && <span className="muted"> (doesn’t stop them starting)</span>}
                  </span>
                  <button className="btn link" onClick={() => onOpen(action.code === 'adjustment_pending' ? 'Adjustments' : 'Questions & concerns')}>
                    {action.code === 'adjustment_pending' ? 'Open adjustments' : 'Open questions & concerns'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card">
          <div className="card-head"><div><h2>Before the day: waiting on employees</h2><p>They need to do this before they can start.</p></div></div>
          {forEmployees.length === 0 ? (
            <p className="small">✓ Everyone has acknowledged the current privacy notice.</p>
          ) : (
            <ul className="todo">
              {forEmployees.map(({ person, action }) => (
                <li key={person.employee.employeeId + action.code}>
                  <span><strong>{person.employee.name}</strong> · {person.employee.department} · {action.label}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="card">
        <div className="card-head">
          <div>
            <h2>Session plan</h2>
            <p>
              Each department is spread across the day so teams keep cover. Move anyone using the Session column below.
              {!fixed && ' Automatic sessions can change as arrangements are agreed: fix them once you have shared the plan.'}
            </p>
          </div>
          {fixed ? (
            <span className="row no-print">
              <span className="tag tag-green">✓ Sessions fixed</span>
              <button className="btn link" onClick={() => setAllPins({})}>Unfix</button>
            </span>
          ) : (
            <button className="btn secondary no-print" onClick={() => setAllPins(plan.assignment)}>Fix sessions</button>
          )}
        </div>
        <div className="sessions">
          {used.map((s) => (
            <div key={s.number} className="session">
              <div className="session-head">
                <strong>Session {s.number}</strong>
                <span className="secondary">{s.start}–{s.end}</span>
              </div>
              <div className="lbl">Main room · {s.main.length}/{settings.seats}</div>
              <ul>
                {s.main.map((id) => <SessionPerson key={id} person={byId.get(id)!} status={statuses[id]!} />)}
              </ul>
              {s.quiet.length > 0 && (
                <>
                  <div className="lbl">Quiet room · {s.quiet.length}/{settings.quietSeats}</div>
                  <ul>{s.quiet.map((id) => <SessionPerson key={id} person={byId.get(id)!} status={statuses[id]!} />)}</ul>
                </>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <div><h2>Everyone taking part</h2></div>
          <div className="row no-print" role="group" aria-label="Show">
            {([['all', 'All'], ['not_ready', 'Not ready'], ['arrangements', 'With arrangements']] as [Filter, string][]).map(([f, label]) => (
              <button key={f} className={filter === f ? 'chip sel' : 'chip'} aria-pressed={filter === f} onClick={() => setFilter(f)}>{label}</button>
            ))}
          </div>
        </div>
        <div className="table-wrap">
          <table className="day-table">
            <thead>
              <tr>
                <th>Person</th>
                <th>Session</th>
                <th>Ready</th>
                <th>Needs on the day</th>
                <th className="num">Time</th>
                <th>On the day</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => {
                const id = p.employee.employeeId;
                const s = sessionOf(id);
                return (
                  <tr key={id}>
                    <td>
                      <strong>{p.employee.name}</strong>
                      <div className="small muted">{p.employee.department} · {p.employee.jobRole}</div>
                    </td>
                    <td>
                      <select
                        className="no-print"
                        aria-label={`Session for ${p.employee.name}`}
                        value={pins[id] ?? ''}
                        onChange={(e) => setPin(id, e.target.value ? Number(e.target.value) : null)}
                      >
                        <option value="">Auto ({plan.assignment[id] ?? '—'})</option>
                        {Array.from({ length: plan.sessions.length + 1 }, (_, i) => <option key={i} value={i + 1}>Session {i + 1}</option>)}
                      </select>
                      {s && <div className="small secondary">{s.start}–{s.end}{p.needs.quietRoom ? ' · quiet room' : ''}</div>}
                    </td>
                    <td>
                      <ReadinessTag person={p} />
                      {p.actions.map((a) => <div key={a.code} className="small secondary">{a.label}</div>)}
                    </td>
                    <td className="small">{p.needs.arrangements.length ? p.needs.arrangements.join(' · ') : <span className="muted">None</span>}</td>
                    <td className="num">{p.expectedMinutes} min</td>
                    <td><StatusTag status={statuses[id]!} progress={progress[id] ?? null} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="small muted" style={{ marginBottom: 0 }}>
          Arrangements show what was agreed, never what the employee wrote. Check in with anyone who has made no progress for 10 minutes.
          Demo: Grace Okafor’s row is live from the employee page; other rows are generated.
        </p>
      </section>
    </div>
  );
}

function SessionPerson({ person, status }: { person: PersonReadiness; status: DayStatus }) {
  return (
    <li>
      <span>{person.employee.name}</span>
      <span className="small muted"> · {person.employee.department}</span>
      {person.needs.extraTimePercent && <span className="tag tag-small">+{person.needs.extraTimePercent}% time</span>}
      {!person.ready && <span className="tag tag-small tag-amber">● Not ready</span>}
      {status !== 'waiting' && <StatusTag status={status} progress={null} />}
    </li>
  );
}
