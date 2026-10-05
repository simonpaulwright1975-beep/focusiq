import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import {
  CURRENT_WORKFORCE,
  HISTORICAL,
  type BenchmarkDataset,
  type Department,
  type PopulationDefinition,
} from '../../src/benchmarking/index.js';
import { buildDemoData, DEMO_DIRECTOR, DEMO_NOW, METRICS, type DemoData } from './demo/dataset.js';
import type { ExpectationBands } from './bands.js';
import { LIVE } from './shared/supabase.js';

export type DateWindow = 'latest' | 'last_6' | 'last_12' | 'custom';

export interface Filters {
  department: Department | 'all';
  version: string | 'all';
  window: DateWindow;
  from: string;
  to: string;
  population: 'current' | 'historical';
  /** §164 – hidden from comparison views only; eligibility is unchanged. */
  hidden: string[];
}

interface Store {
  demo: DemoData;
  data: BenchmarkDataset;
  filters: Filters;
  setFilters: (f: Partial<Filters>) => void;
  /** Call after any ledger mutation so views recompute. */
  bump: () => void;
  revision: number;
  actor: typeof DEMO_DIRECTOR;
  now: Date;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  // Live: no fictional staff, only the labelled sample profile until real results are connected.
  const [demo] = useState(() => buildDemoData({ sampleOnly: LIVE }));
  const [revision, setRevision] = useState(0);
  const [filters, set] = useState<Filters>({
    department: 'all',
    version: 'all',
    window: 'latest',
    from: '2026-01-01',
    to: '2026-10-02',
    population: 'current',
    hidden: [],
  });
  const data = useMemo<BenchmarkDataset>(
    () => ({ employees: demo.employees, assessments: demo.assessments, metrics: METRICS, eligibility: demo.ledger.state() }),
    [demo, revision],
  );
  const setFilters = useCallback((f: Partial<Filters>) => set((prev) => ({ ...prev, ...f })), []);
  const bump = useCallback(() => setRevision((r) => r + 1), []);
  const value = useMemo(
    () => ({ demo, data, filters, setFilters, bump, revision, actor: DEMO_DIRECTOR, now: DEMO_NOW }),
    [demo, data, filters, setFilters, bump, revision],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider missing');
  return s;
}

/** Filters → population definition (without scope). */
export function baseDefinition(f: Filters, now: Date): Omit<PopulationDefinition, 'scope'> {
  const window: PopulationDefinition['window'] =
    f.window === 'latest'
      ? { kind: 'latest' }
      : f.window === 'last_6'
        ? { kind: 'last_months', months: 6 }
        : f.window === 'last_12'
          ? { kind: 'last_months', months: 12 }
          : { kind: 'range', from: f.from, to: f.to };
  return {
    include: f.population === 'current' ? CURRENT_WORKFORCE : HISTORICAL,
    window,
    ...(f.version !== 'all' ? { assessmentVersions: [f.version] } : {}),
    asOf: now.toISOString(),
  };
}

export function definitionFor(f: Filters, now: Date, department?: Department | 'all'): PopulationDefinition {
  const dept = department ?? f.department;
  return {
    ...baseDefinition(f, now),
    scope: dept === 'all' ? { kind: 'company' } : { kind: 'department', department: dept },
  };
}

export const CORE_KEYS = ['think', 'absorb', 'remember', 'prioritise', 'decide', 'act', 'own', 'drive', 'complete', 'focus'];
export const metricLabel = (key: string) => METRICS.find((m) => m.key === key)?.label ?? key;
export const metricOf = (key: string) => METRICS.find((m) => m.key === key)!;
/** FocusiQ expectation zones for charts: higher-is-better 0–100 scores with thresholds only. */
export function expectationBands(key: string): ExpectationBands | undefined {
  const m = METRICS.find((x) => x.key === key);
  const t = m?.absoluteBands;
  if (!m || !t || !m.higherIsBetter || m.unit !== 'score') return undefined;
  return { development: t.development, strong: t.strong, note: t.validated ? undefined : 'provisional' };
}
