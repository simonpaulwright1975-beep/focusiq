/**
 * DRAFT data export for a "copy of my information" request (Director app only).
 * Gathers what this demo holds about one employee. A Director must review it
 * before sending: some content (e.g. internal notes, third-party information)
 * may need advice on whether it should be disclosed.
 */
import { currentDecision, employeeRequestView } from '../../../src/participation/index.js';
import type { DemoData } from '../demo/dataset.js';
import { listRequests } from '../shared/adjustmentStore.js';
import { listRightsRequests } from '../shared/requestStore.js';

function readJson(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null');
  } catch {
    return null;
  }
}

export function buildDataExport(demo: DemoData, employeeId: string, now: Date) {
  const employee = demo.employees.find((e) => e.id === employeeId);
  const ack = readJson('focusiq-demo-ack') as { employeeId?: string } | null;
  const adjustments = listRequests().filter((r) => r.employeeId === employeeId);
  const internalNotes = adjustments.reduce((n, r) => n + r.history.filter((h) => h.internalNote).length, 0);
  const requests = listRightsRequests().filter((r) => r.employeeId === employeeId);
  const requestInternalNotes = requests.reduce((n, r) => n + r.messages.filter((m) => m.kind === 'internal').length, 0);
  const assessments = demo.assessments
    .filter((a) => a.employeeId === employeeId)
    .map((a) => ({ id: a.id, version: a.version, completedAt: a.completedAt, complete: a.complete, scores: a.scores }));
  const responseRecords = Object.keys(localStorage)
    .filter((k) => k.startsWith('focusiq-demo-server:'))
    .map((k) => readJson(k))
    .filter(Boolean);

  return {
    status: 'DRAFT – review before sending',
    generatedAt: now.toISOString(),
    reviewNotes: [
      'Check every section before sending. Take advice on anything that may be exempt or contains information about other people.',
      internalNotes + requestInternalNotes > 0
        ? `${internalNotes + requestInternalNotes} internal note(s) exist about this employee and are NOT included below – decide whether they must be disclosed.`
        : 'No internal notes exist about this employee.',
    ],
    employeeRecord: employee
      ? { name: employee.displayName, department: employee.department, role: employee.role, startDate: employee.startDate, status: employee.status, cohortTags: employee.cohortTags }
      : null,
    privacyAcknowledgements: ack && ack.employeeId === employeeId ? [ack] : [],
    adjustmentRequests: adjustments.map((r) => ({
      requested: r.createdAt,
      request: r.description,
      status: r.status,
      decision: currentDecision(r) ? { arrangements: currentDecision(r)!.arrangements, extraTime: currentDecision(r)!.timeMultiplier, messageToEmployee: currentDecision(r)!.employeeMessage } : null,
    })),
    questionsAndRequests: requests.map(employeeRequestView),
    assessments,
    assessmentResponseRecords: employeeId === 's4' ? responseRecords : [],
  };
}

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
