import { useState } from 'react';
import { FiltersBar } from './components/FiltersBar.js';
import { EligibilityView } from './views/EligibilityView.js';
import { EmployeeView } from './views/EmployeeView.js';
import { OverviewView } from './views/OverviewView.js';
import { PeopleView } from './views/PeopleView.js';
import { AdjustmentsView, useAdjustmentRequests } from './views/AdjustmentsView.js';
import { QuestionsView, useRightsRequests } from './views/QuestionsView.js';
import { AssessmentDayView } from './views/AssessmentDayView.js';
import { NotificationsView } from './views/NotificationsView.js';
import { StaffView } from './views/StaffView.js';
import { StaffPreviewView } from './views/StaffPreviewView.js';
import { LOGO_SRC } from './shared/Landing.js';
import { useSignedIn } from './shared/auth.js';
import { LIVE } from './shared/supabase.js';
import { SAMPLE_EMPLOYEE_ID } from './demo/dataset.js';

const TABS = ['Overview', 'People', 'Employee report', 'Eligibility & audit', 'Staff', 'Staff view', 'Adjustments', 'Questions & concerns', 'Assessment day', 'Notifications'] as const;
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
          : window.location.hash === '#notifications'
            ? 'Notifications'
            : 'Overview',
  );
  const who = useSignedIn();
  const pendingAdjustments = useAdjustmentRequests().filter((r) => r.status === 'pending').length;
  const openQuestions = useRightsRequests().filter((r) => r.status !== 'closed').length;
  const [employeeId, setEmployeeId] = useState<string>(LIVE ? SAMPLE_EMPLOYEE_ID : 's1');
  const openEmployee = (id: string) => {
    setEmployeeId(id);
    setTab('Employee report');
  };
  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <h1 style={{ margin: 0, lineHeight: 0 }}><img className="brand-logo" src={LOGO_SRC} alt="FocusiQ" /></h1>
          <span className="lbl">Director dashboard · Walter Geering</span>
          {who && (
            <span className="small secondary topbar-who">
              {who.email} · <button className="btn link" onClick={() => who.signOut()}>Sign out</button>
            </span>
          )}
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
      {LIVE ? (
        <div className="banner" role="note">
          <strong>Live.</strong> Staff, Adjustments and Questions &amp; concerns use real FocusiQ data. Results are not connected
          yet: Overview, People, Employee report, Eligibility &amp; audit and Assessment day show only <strong>Stan</strong>, a
          fictional sample profile for reference, and Notifications shows example emails. Expectation bands marked * are provisional.
        </div>
      ) : (
        <div className="banner" role="note">
          <strong>Demo data.</strong> All names and results are fictional and generated for demonstration. Connect a
          FocusiQ Supabase project to use real assessments. Expectation bands marked * are provisional.
        </div>
      )}
      {FILTERED.includes(tab) && <FiltersBar />}
      <main role="tabpanel" aria-label={tab}>
        {tab === 'Overview' && <OverviewView onOpenEmployee={openEmployee} />}
        {tab === 'People' && <PeopleView onOpenEmployee={openEmployee} />}
        {tab === 'Employee report' && <EmployeeView employeeId={employeeId} onSelect={setEmployeeId} />}
        {tab === 'Eligibility & audit' && <EligibilityView />}
        {tab === 'Staff' && <StaffView />}
        {tab === 'Staff view' && <StaffPreviewView />}
        {tab === 'Adjustments' && <AdjustmentsView />}
        {tab === 'Questions & concerns' && <QuestionsView />}
        {tab === 'Assessment day' && <AssessmentDayView onOpen={setTab} />}
        {tab === 'Notifications' && <NotificationsView />}
      </main>
    </div>
  );
}
