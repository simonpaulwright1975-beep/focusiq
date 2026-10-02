import { useState } from 'react';
import { FiltersBar } from './components/FiltersBar.js';
import { EligibilityView } from './views/EligibilityView.js';
import { EmployeeView } from './views/EmployeeView.js';
import { OverviewView } from './views/OverviewView.js';
import { PeopleView } from './views/PeopleView.js';
import { AdjustmentsView, useAdjustmentRequests } from './views/AdjustmentsView.js';
import { QuestionsView, useRightsRequests } from './views/QuestionsView.js';
import { AssessmentDayView } from './views/AssessmentDayView.js';

const TABS = ['Overview', 'People', 'Employee report', 'Eligibility & audit', 'Adjustments', 'Questions & concerns', 'Assessment day'] as const;
type Tab = (typeof TABS)[number];
/** Tabs that use the analytics filter row. */
const FILTERED: Tab[] = ['Overview', 'People', 'Employee report', 'Eligibility & audit'];

export function App() {
  const [tab, setTab] = useState<Tab>(() =>
    window.location.hash === '#adjustments'
      ? 'Adjustments'
      : window.location.hash === '#questions'
        ? 'Questions & concerns'
        : window.location.hash === '#day'
          ? 'Assessment day'
          : 'Overview',
  );
  const pendingAdjustments = useAdjustmentRequests().filter((r) => r.status === 'pending').length;
  const openQuestions = useRightsRequests().filter((r) => r.status !== 'closed').length;
  const [employeeId, setEmployeeId] = useState<string>('s1');
  const openEmployee = (id: string) => {
    setEmployeeId(id);
    setTab('Employee report');
  };
  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <h1>FocusiQ</h1>
          <span className="lbl">Director dashboard · Walter Geering</span>
        </div>
        <nav className="tabs" role="tablist" aria-label="Dashboard sections">
          {TABS.map((t) => (
            <button key={t} role="tab" className={tab === t ? 'chip sel' : 'chip'} aria-selected={tab === t} onClick={() => setTab(t)}>
              {t}
              {t === 'Adjustments' && pendingAdjustments > 0 && (
                <span className="tab-count" aria-label={`${pendingAdjustments} awaiting a decision`}>{pendingAdjustments}</span>
              )}
              {t === 'Questions & concerns' && openQuestions > 0 && (
                <span className="tab-count" aria-label={`${openQuestions} open`}>{openQuestions}</span>
              )}
            </button>
          ))}
        </nav>
      </header>
      <div className="banner" role="note">
        <strong>Demo data.</strong> All names and results are fictional and generated for demonstration. Connect a
        FocusiQ Supabase project to use real assessments. Expectation bands marked * are provisional.
      </div>
      {FILTERED.includes(tab) && <FiltersBar />}
      <main role="tabpanel" aria-label={tab}>
        {tab === 'Overview' && <OverviewView onOpenEmployee={openEmployee} />}
        {tab === 'People' && <PeopleView onOpenEmployee={openEmployee} />}
        {tab === 'Employee report' && <EmployeeView employeeId={employeeId} onSelect={setEmployeeId} />}
        {tab === 'Eligibility & audit' && <EligibilityView />}
        {tab === 'Adjustments' && <AdjustmentsView />}
        {tab === 'Questions & concerns' && <QuestionsView />}
        {tab === 'Assessment day' && <AssessmentDayView onOpen={setTab} />}
      </main>
    </div>
  );
}
