import {
  DEFAULT_METRICS,
  EligibilityLedger,
  type Actor,
  type Assessment,
  type BenchmarkDataset,
  type Department,
  type Employee,
  type PopulationDefinition,
} from '../src/benchmarking/index.js';

export const NOW = new Date('2026-10-02T12:00:00Z');

export const director: Actor = { id: 'u-dir', name: 'Simon (Director)', role: 'director' };
export const manager: Actor = { id: 'u-mgr', name: 'Sales Manager', role: 'manager' };
export const employeeActor: Actor = { id: 'u-emp', name: 'Katie', role: 'employee' };

let seq = 0;
function emp(
  id: string,
  displayName: string,
  department: Department,
  extra: Partial<Employee> = {},
): Employee {
  return {
    id,
    displayName,
    department,
    role: department === 'Sales' ? 'Salesperson' : undefined,
    status: 'active',
    startDate: '2022-01-10',
    cohortTags: [],
    ...extra,
  };
}

export function assessment(
  employeeId: string,
  completedAt: string,
  scores: Record<string, number>,
  extra: Partial<Assessment> = {},
): Assessment {
  seq += 1;
  return {
    id: extra.id ?? `a${seq}`,
    employeeId,
    version: 'v1',
    type: 'full',
    completedAt,
    complete: true,
    validity: 'valid',
    scores,
    ...extra,
  };
}

export function buildDataset(): BenchmarkDataset & { ledger: EligibilityLedger } {
  seq = 0;
  const employees: Employee[] = [
    emp('derry', 'Derry', 'Sales', { cohortTags: ['Customer-facing', 'Target bearing'] }),
    emp('katie', 'Katie', 'Sales', { cohortTags: ['Customer-facing', 'Target bearing'] }),
    emp('donna', 'Donna', 'Sales', { cohortTags: ['Customer-facing'] }),
    emp('sam', 'Sam', 'Sales', { startDate: '2026-08-01', cohortTags: ['New starter'] }),
    emp('ola', 'Ola', 'Sales'),
    emp('raj', 'Raj', 'Sales'),
    emp('dirtest', 'Director Test Account', 'Sales', { status: 'test' }),
    emp('former', 'Former Seller', 'Sales', { status: 'former', leftDate: '2026-05-01' }),
    ...['m1', 'm2', 'm3', 'm4', 'm5'].map((id) => emp(id, id.toUpperCase(), 'Marketing')),
    ...['c1', 'c2', 'c3', 'c4', 'c5'].map((id) =>
      emp(id, id.toUpperCase(), 'Customer Service', { cohortTags: ['Customer-facing'] }),
    ),
    ...['s1', 's2', 's3'].map((id) => emp(id, id.toUpperCase(), 'Stock Control')),
    ...['f1', 'f2', 'f3', 'f4', 'f5'].map((id) => emp(id, id.toUpperCase(), 'Finance')),
  ];

  const d = (de: number, ac = 85, extra: Record<string, number> = {}) => ({
    decision_efficiency: de,
    accuracy: ac,
    think: de,
    absorb: de + 5,
    remember: de - 2,
    prioritise: de + 1,
    decide: de,
    act: de + 3,
    own: de,
    drive: de + 2,
    complete: de - 1,
    focus: de,
    ...extra,
  });

  const assessments: Assessment[] = [
    // Derry – three assessments (personal benchmark §150 example 61 → 69 → 76)
    assessment('derry', '2026-01-15T10:00:00Z', d(61, 84, { recheck_rate: 40 }), { id: 'derry-jan' }),
    assessment('derry', '2026-04-15T10:00:00Z', d(69, 85, { recheck_rate: 30 }), { id: 'derry-apr' }),
    assessment('derry', '2026-09-20T10:00:00Z', d(76, 86, { recheck_rate: 20 }), { id: 'derry-sep' }),
    assessment('katie', '2026-09-10T10:00:00Z', d(68, 91, { avg_response_seconds: 44, recheck_rate: 47, commercial_awareness: 80 }), { id: 'katie-sep' }),
    assessment('donna', '2026-09-11T10:00:00Z', d(72, 89, { avg_response_seconds: 23, recheck_rate: 12, commercial_awareness: 70 }), { id: 'donna-sep' }),
    assessment('sam', '2026-09-12T10:00:00Z', d(60, 80), { id: 'sam-sep' }),
    assessment('ola', '2026-09-13T10:00:00Z', d(70, 88), { id: 'ola-sep' }),
    assessment('raj', '2026-09-14T10:00:00Z', d(74, 90), { id: 'raj-sep' }),
    assessment('dirtest', '2026-09-15T10:00:00Z', d(99, 100), { id: 'dirtest-sep' }),
    assessment('former', '2026-03-01T10:00:00Z', d(50, 70), { id: 'former-mar' }),
    // Incomplete attempt – never eligible.
    assessment('raj', '2026-09-01T10:00:00Z', d(10, 20), { id: 'raj-incomplete', complete: false }),
    ...['m1', 'm2', 'm3', 'm4', 'm5'].map((id, i) =>
      assessment(id, '2026-09-05T10:00:00Z', d(60 + i * 3, 82 + i)),
    ),
    ...['c1', 'c2', 'c3', 'c4', 'c5'].map((id, i) =>
      assessment(id, '2026-09-06T10:00:00Z', d(64 + i * 2, 86 + i)),
    ),
    ...['s1', 's2', 's3'].map((id, i) => assessment(id, '2026-09-07T10:00:00Z', d(65 + i, 85))),
    ...['f1', 'f2', 'f3', 'f4', 'f5'].map((id, i) =>
      assessment(id, '2026-09-08T10:00:00Z', d(70 + i, 92)),
    ),
  ];

  const ledger = new EligibilityLedger({ now: () => NOW });
  return {
    employees,
    assessments,
    metrics: DEFAULT_METRICS,
    get eligibility() {
      return ledger.state();
    },
    ledger,
  };
}

export const salesCurrent: PopulationDefinition = {
  scope: { kind: 'department', department: 'Sales' },
  include: { active: true, former: false, pilot: false, test: false },
  window: { kind: 'latest' },
  asOf: NOW.toISOString(),
};
