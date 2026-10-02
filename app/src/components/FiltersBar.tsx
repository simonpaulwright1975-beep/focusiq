import { useState } from 'react';
import { DEPARTMENTS, type Department } from '../../../src/benchmarking/index.js';
import { useStore, type DateWindow } from '../state.js';
import { Modal } from './ui.js';

/** §201 top controls – one filter row scoping every view below it. */
export function FiltersBar() {
  const { filters, setFilters, demo } = useStore();
  const [hideOpen, setHideOpen] = useState(false);
  const versions = [...new Set(demo.assessments.map((a) => a.version))];
  const people = demo.employees.filter((e) => filters.department === 'all' || e.department === filters.department);
  return (
    <div className="card filters" role="search" aria-label="Dashboard filters">
      <div className="field">
        <label htmlFor="f-dept">Department</label>
        <select id="f-dept" value={filters.department} onChange={(e) => setFilters({ department: e.target.value as Department | 'all' })}>
          <option value="all">All departments</option>
          {DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="f-ver">Assessment</label>
        <select id="f-ver" value={filters.version} onChange={(e) => setFilters({ version: e.target.value })}>
          <option value="all">All versions</option>
          {versions.map((v) => <option key={v}>{v}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="f-win">Date range</label>
        <select id="f-win" value={filters.window} onChange={(e) => setFilters({ window: e.target.value as DateWindow })}>
          <option value="latest">Latest assessment</option>
          <option value="last_6">Last 6 months</option>
          <option value="last_12">Last 12 months</option>
          <option value="custom">Custom dates</option>
        </select>
      </div>
      {filters.window === 'custom' && (
        <>
          <div className="field" style={{ minWidth: 130 }}>
            <label htmlFor="f-from">From</label>
            <input id="f-from" type="date" value={filters.from} onChange={(e) => setFilters({ from: e.target.value })} />
          </div>
          <div className="field" style={{ minWidth: 130 }}>
            <label htmlFor="f-to">To</label>
            <input id="f-to" type="date" value={filters.to} onChange={(e) => setFilters({ to: e.target.value })} />
          </div>
        </>
      )}
      <div className="field">
        <label htmlFor="f-pop">Benchmark population</label>
        <select id="f-pop" value={filters.population} onChange={(e) => setFilters({ population: e.target.value as 'current' | 'historical' })}>
          <option value="current">Current workforce</option>
          <option value="historical">Historical (incl. former)</option>
        </select>
      </div>
      <div className="field">
        <span className="label">Staff shown</span>
        <button className="btn secondary" onClick={() => setHideOpen(true)}>
          {filters.hidden.length ? `${filters.hidden.length} hidden from view` : 'Hide staff from view…'}
        </button>
      </div>
      {hideOpen && (
        <Modal title="Hide staff from comparison views" onClose={() => setHideOpen(false)}>
          <p className="secondary small">
            Hiding only removes people from comparison views. It does not change benchmark eligibility — use the
            Eligibility tab to exclude someone from benchmarks, with a recorded reason.
          </p>
          <div className="stack" style={{ maxHeight: 360, overflow: 'auto' }}>
            {people.map((e) => (
              <label key={e.id} className="row">
                <input
                  type="checkbox"
                  checked={!filters.hidden.includes(e.id)}
                  onChange={(ev) =>
                    setFilters({ hidden: ev.target.checked ? filters.hidden.filter((h) => h !== e.id) : [...filters.hidden, e.id] })
                  }
                />
                {e.displayName} <span className="muted small">{e.department}{e.status !== 'active' ? ` · ${e.status}` : ''}</span>
              </label>
            ))}
          </div>
          <div className="actions">
            <button className="btn secondary" onClick={() => setFilters({ hidden: [] })}>Show everyone</button>
            <button className="btn" onClick={() => setHideOpen(false)}>Done</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
