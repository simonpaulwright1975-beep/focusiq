/**
 * Resolves a population definition (§150, §163, §165, §195) into the set of
 * eligible assessments, while counting what was excluded and why (§154).
 */
import { DEFAULT_TENURE_BANDS, tenureBandFor, type TenureBand } from './tenure.js';
import type {
  Assessment,
  Department,
  EligibilityState,
  Employee,
  ExclusionReason,
  MetricDefinition,
  PopulationCounts,
  PopulationDefinition,
  PopulationScope,
} from './types.js';

export interface BenchmarkDataset {
  employees: readonly Employee[];
  assessments: readonly Assessment[];
  metrics: readonly MetricDefinition[];
  eligibility: EligibilityState;
}

export interface ResolvedPopulation {
  definition: PopulationDefinition;
  label: string;
  /** Eligible assessments grouped per employee, oldest first. */
  byEmployee: Map<string, Assessment[]>;
  counts: PopulationCounts;
  /** Departments of the people actually in the population. */
  departments: Set<Department>;
  /** Departments the scope covers, whether or not they have eligible data. */
  scopeDepartments: Set<Department>;
  versions: Set<string>;
  dateRange: { from: string | null; to: string | null };
}

/** §165 – "Current Benchmark = active employees only." */
export const CURRENT_WORKFORCE: PopulationDefinition['include'] = {
  active: true,
  former: false,
  pilot: false,
  test: false,
};

/** §165 – Historical benchmark optionally includes former eligible employees. */
export const HISTORICAL: PopulationDefinition['include'] = {
  active: true,
  former: true,
  pilot: false,
  test: false,
};

export function populationLabel(scope: PopulationScope): string {
  switch (scope.kind) {
    case 'company':
      return 'Company';
    case 'department':
      return scope.department;
    case 'role':
      return `Role: ${scope.role}`;
    case 'cohort':
    case 'employees':
      return scope.name;
  }
}

function inScope(employee: Employee, scope: PopulationScope): boolean {
  switch (scope.kind) {
    case 'company':
      return true;
    case 'department':
      return employee.department === scope.department;
    case 'role':
      return employee.role !== undefined && employee.role === scope.role;
    case 'cohort': {
      const byDept = scope.departments?.includes(employee.department) ?? false;
      const byTag = scope.cohortTags?.some((t) => employee.cohortTags.includes(t)) ?? false;
      return byDept || byTag;
    }
    case 'employees':
      return scope.employeeIds.includes(employee.id);
  }
}

function statusIncluded(employee: Employee, include: PopulationDefinition['include']): boolean {
  if (employee.status === 'active') return include.active;
  if (employee.status === 'former') return include.former;
  return include.test;
}

function windowStart(def: PopulationDefinition, asOf: Date): Date | null {
  if (def.window.kind === 'last_months') {
    const d = new Date(asOf);
    d.setUTCMonth(d.getUTCMonth() - def.window.months);
    return d;
  }
  if (def.window.kind === 'range') return new Date(def.window.from);
  return null;
}

function windowEnd(def: PopulationDefinition, asOf: Date): Date {
  if (def.window.kind === 'range') {
    const end = new Date(def.window.to);
    // A bare date means "to the end of that day".
    if (/^\d{4}-\d{2}-\d{2}$/.test(def.window.to)) end.setUTCHours(23, 59, 59, 999);
    return end;
  }
  return asOf;
}

/**
 * Why an in-scope assessment is excluded from benchmark calculations, or null
 * when it is eligible. Excluded data is never removed – only not counted.
 */
export function exclusionReasonFor(
  assessment: Assessment,
  eligibility: EligibilityState,
): ExclusionReason | 'invalid_or_incomplete' | null {
  const employeeExclusion = eligibility.employees.get(assessment.employeeId);
  if (employeeExclusion) return employeeExclusion.reason;
  const assessmentExclusion = eligibility.assessments.get(assessment.id);
  if (assessmentExclusion) return assessmentExclusion.reason;
  if (!assessment.complete) return 'incomplete_assessment';
  const validity = eligibility.validity?.get(assessment.id) ?? assessment.validity;
  if (validity === 'invalidated') return 'assessment_invalidated';
  if (validity === 'review_required') return 'invalid_or_incomplete';
  return null;
}

function isPilot(assessment: Assessment, eligibility: EligibilityState): boolean {
  const validity = eligibility.validity?.get(assessment.id) ?? assessment.validity;
  return assessment.type === 'pilot' || validity === 'pilot';
}

export interface ResolveOptions {
  /** Only count assessments that carry a value for this metric. */
  metricKey?: string;
  tenureBands?: readonly TenureBand[];
  now?: Date;
}

export function resolvePopulation(
  data: BenchmarkDataset,
  definition: PopulationDefinition,
  options: ResolveOptions = {},
): ResolvedPopulation {
  const asOf = definition.asOf ? new Date(definition.asOf) : (options.now ?? new Date());
  const start = windowStart(definition, asOf);
  const end = windowEnd(definition, asOf);
  const bands = options.tenureBands ?? DEFAULT_TENURE_BANDS;
  const employeesById = new Map(data.employees.map((e) => [e.id, e]));

  const counts: PopulationCounts = {
    eligibleEmployees: 0,
    eligibleAssessments: 0,
    excludedAssessments: 0,
    excludedEmployees: 0,
    exclusionsByReason: {},
  };
  const excludedEmployeeIds = new Set<string>();
  const candidates = new Map<string, Assessment[]>();
  const scopeDepartments = new Set<Department>();
  for (const e of data.employees) {
    if (inScope(e, definition.scope) && statusIncluded(e, definition.include)) {
      scopeDepartments.add(e.department);
    }
  }

  for (const a of data.assessments) {
    const employee = employeesById.get(a.employeeId);
    if (!employee) continue;
    if (!inScope(employee, definition.scope)) continue;
    if (!statusIncluded(employee, definition.include)) continue;
    if (!definition.include.pilot && isPilot(a, data.eligibility)) continue;
    if (definition.assessmentTypes && !definition.assessmentTypes.includes(a.type)) continue;
    if (definition.assessmentVersions && !definition.assessmentVersions.includes(a.version)) {
      continue;
    }
    const completed = new Date(a.completedAt);
    if (completed > end || (start && completed < start)) continue;
    if (definition.tenureBands) {
      const band = tenureBandFor(employee, completed, bands);
      if (!band || !definition.tenureBands.includes(band.key)) continue;
    }
    if (options.metricKey !== undefined && !Number.isFinite(a.scores[options.metricKey])) {
      continue;
    }

    const reason = exclusionReasonFor(a, data.eligibility);
    if (reason) {
      counts.excludedAssessments += 1;
      counts.exclusionsByReason[reason] = (counts.exclusionsByReason[reason] ?? 0) + 1;
      if (data.eligibility.employees.has(a.employeeId)) excludedEmployeeIds.add(a.employeeId);
      continue;
    }
    const list = candidates.get(a.employeeId) ?? [];
    list.push(a);
    candidates.set(a.employeeId, list);
  }

  const byEmployee = new Map<string, Assessment[]>();
  const departments = new Set<Department>();
  const versions = new Set<string>();
  let from: string | null = null;
  let to: string | null = null;

  for (const [employeeId, list] of candidates) {
    list.sort((x, y) => x.completedAt.localeCompare(y.completedAt));
    const chosen = definition.window.kind === 'latest' ? [list[list.length - 1]!] : list;
    byEmployee.set(employeeId, chosen);
    departments.add(employeesById.get(employeeId)!.department);
    for (const a of chosen) {
      versions.add(a.version);
      if (from === null || a.completedAt < from) from = a.completedAt;
      if (to === null || a.completedAt > to) to = a.completedAt;
      counts.eligibleAssessments += 1;
    }
  }
  counts.eligibleEmployees = byEmployee.size;
  counts.excludedEmployees = excludedEmployeeIds.size;

  return {
    definition,
    label: populationLabel(definition.scope),
    byEmployee,
    counts,
    departments,
    scopeDepartments,
    versions,
    dateRange: { from, to },
  };
}

/**
 * True when a population compares people across departments – either by
 * definition (company scope, multi-department cohort) or because the people
 * actually resolved come from more than one department.
 */
export function isCrossDepartment(population: ResolvedPopulation): boolean {
  const scope = population.definition.scope;
  if (scope.kind === 'company') return true;
  if (scope.kind === 'cohort' && (scope.departments?.length ?? 0) > 1) return true;
  return population.scopeDepartments.size > 1 || population.departments.size > 1;
}

/**
 * §168 – A metric may only be benchmarked across departments when it is
 * `company_comparable`, and between colleagues when `department_comparable`.
 */
export function metricComparableFor(
  metric: MetricDefinition,
  crossDepartment: boolean,
): { comparable: boolean; reason?: string } {
  if (crossDepartment && !metric.companyComparable) {
    return {
      comparable: false,
      reason: `${metric.label} is not designed to be compared across departments.`,
    };
  }
  if (!crossDepartment && !metric.departmentComparable) {
    return {
      comparable: false,
      reason: `${metric.label} is not designed to be compared between colleagues.`,
    };
  }
  return { comparable: true };
}
