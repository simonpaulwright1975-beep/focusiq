import { useEffect, useState } from 'react';
import { FiltersBar } from './components/FiltersBar.js';
import { EligibilityView } from './views/EligibilityView.js';
import { EmployeeView } from './views/EmployeeView.js';
import { OverviewView } from './views/OverviewView.js';
import { PeopleView } from './views/PeopleView.js';

const TABS = ['Overview', 'People', 'Employee report', 'Eligibility & audit'] as const;
type Tab = (typeof TABS)[number];

export function App() {
  const [tab, setTab] = useState<Tab>('Overview');
  const [employeeId, setEmployeeId] = useState<string>('s1');
  const [theme, setTheme] = useState<'system' | 'light' | 'dark'>('system');
  useEffect(() => {
    if (theme === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);
  const openEmployee = (id: string) => {
    setEmployeeId(id);
    setTab('Employee report');
  };
  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <h1>FocusiQ</h1>
          <small>Director dashboard · Walter Geering</small>
        </div>
        <nav className="tabs" role="tablist" aria-label="Dashboard sections">
          {TABS.map((t) => (
            <button key={t} role="tab" className="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{t}</button>
          ))}
        </nav>
        <button
          className="icon-btn"
          aria-label="Change colour theme"
          onClick={() => setTheme(theme === 'system' ? 'dark' : theme === 'dark' ? 'light' : 'system')}
        >
          Theme: {theme}
        </button>
      </header>
      <div className="banner" role="note">
        <strong>Demo data.</strong> All names and results are fictional and generated for demonstration. Connect a
        FocusiQ Supabase project to use real assessments. Expectation bands marked * are provisional.
      </div>
      <FiltersBar />
      <main role="tabpanel" aria-label={tab}>
        {tab === 'Overview' && <OverviewView onOpenEmployee={openEmployee} />}
        {tab === 'People' && <PeopleView onOpenEmployee={openEmployee} />}
        {tab === 'Employee report' && <EmployeeView employeeId={employeeId} onSelect={setEmployeeId} />}
        {tab === 'Eligibility & audit' && <EligibilityView />}
      </main>
    </div>
  );
}
