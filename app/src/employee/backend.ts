/**
 * Where the employee app's data lives.
 *
 * Demo: this browser's localStorage (nothing is sent anywhere).
 * Live: WG Main, as the signed-in person. Row-level security limits every
 * query to their own records, and the database functions enforce the rules
 * (acknowledge before starting; adjustment reviewed first; answers only while
 * the assessment is open; summaries only once released).
 *
 * The employee bundle must never see answer keys: live question content comes
 * from assessment_content_for(), which returns display fields only.
 */
import { createContext, useContext } from 'react';
import {
  NOTICE_V1,
  currentRelease,
  markReleaseRead,
  type AcknowledgementRecord,
  type AdjustmentRequest,
  type EmployeeRecordDetails,
  type EmployeeSummary,
  type PrivacyNotice,
  type RightsRequest,
  type RightsRequestType,
  createRequest,
  employeeFollowUp,
} from '../../../src/participation/index.js';
import type { AssessmentDefinition, Presentation, QuestionDef, RunnerEvent, SectionDef, SessionOptions, Transport } from '../../../src/runner/index.js';
import { DEMO_ASSESSMENT } from '../demo/assessment.js';
import { WG_WAY_TOPICS, type WgWayTopic } from '../demo/wgWayBank.js';
import { latestRequestFor, subscribe as subscribeAdjustments, upsertRequest } from '../shared/adjustmentStore.js';
import { ACK_KEY, RUN_KEY, readJson, writeJson } from '../shared/participationStore.js';
import { requestsForEmployee, subscribeRightsRequests, upsertRightsRequest } from '../shared/requestStore.js';
import { listReleases, saveRelease, subscribeReleases } from '../shared/summaryStore.js';
import { PREVIEW_SAMPLE_RELEASE, subscribeWgWayReleases, wgWayReleasesFor, type WgWayRelease } from '../shared/wgWayReleaseStore.js';
import { check, db, LIVE } from '../shared/supabase.js';
import { demoTransport, serverSnapshot } from './demoTransport.js';

export type RunOptions = Omit<SessionOptions, 'definition'>;

export interface ServerSnapshot {
  events: number;
  presentationIds: string[];
  completed: boolean;
}

export interface MySummaryView {
  summary: EmployeeSummary;
  readAt: string | null;
}

export interface Loaded {
  me: EmployeeRecordDetails;
  notice: PrivacyNotice | null;
  acknowledgement: AcknowledgementRecord | null;
  adjustment: AdjustmentRequest | null;
  /** An assessment in progress, or the latest finished one. */
  run: RunOptions | null;
  completed: boolean;
}

/** What the readiness page needs: sections and timings, no questions. */
export interface AssessmentOutline {
  title: string;
  estimatedMinutes: number;
  sections: { title: string; timeLimitSeconds?: number }[];
}

export const outlineOf = (d: AssessmentDefinition): AssessmentOutline => ({
  title: d.title,
  estimatedMinutes: d.estimatedMinutes,
  sections: d.sections.map((s) => ({ title: s.title, timeLimitSeconds: s.timeLimitSeconds })),
});

export interface EmployeeBackend {
  live: boolean;
  /** A Director's practice copy: nothing is saved anywhere. */
  preview?: boolean;
  /** Where the runner keeps the in-progress session on this device. */
  runnerStorageKey: string;
  /** Sections and timings of the assessment the person will take (for "Are you prepared and ready?"). */
  outline(): Promise<AssessmentOutline | null>;
  /** Null when the signed-in person has no FocusiQ employee record. */
  load(): Promise<Loaded | null>;
  saveAcknowledgement(record: AcknowledgementRecord, me: EmployeeRecordDetails): Promise<AcknowledgementRecord>;
  watchAdjustment(me: EmployeeRecordDetails, onChange: (a: AdjustmentRequest | null) => void): () => void;
  /** Starts a new assessment, or returns the one already open. */
  start(timeMultiplier: number): Promise<RunOptions>;
  /** Question content and what the server already holds, for an assessment in progress. */
  open(run: RunOptions): Promise<{ definition: AssessmentDefinition; snapshot: ServerSnapshot }>;
  transport: Transport;
  sendRequest(me: EmployeeRecordDetails, type: RightsRequestType, message: string): Promise<{ dueAt: string }>;
  watchRequests(me: EmployeeRecordDetails, onChange: (r: RightsRequest[]) => void): () => void;
  followUp(me: EmployeeRecordDetails, request: RightsRequest, body: string): Promise<void>;
  watchSummary(me: EmployeeRecordDetails, onChange: (s: MySummaryView | null) => void): () => void;
  markSummaryRead(me: EmployeeRecordDetails): Promise<void>;
  /** "Live the Walter Geering Way" results a Director has shared with the person, latest first (score and topic counts only). */
  watchWgWay(me: EmployeeRecordDetails, onChange: (r: WgWayRelease[]) => void): () => void;
}

// ---------------------------------------------------------------------------
// Demo
// ---------------------------------------------------------------------------
/**
 * DEMO: the notice is shown as published so the flow can be tried, with its
 * unfilled placeholders highlighted. A real deployment publishes only a
 * completed notice (the database refuses placeholders).
 */
const DEMO_NOTICE: PrivacyNotice = { ...NOTICE_V1, publishedAt: '2026-10-01T00:00:00Z' };
// Demo: the employee page signs in as Stan, the fictional sample profile (SAMPLE_EMPLOYEE_ID in the Director demo data).
const DEMO_ME: EmployeeRecordDetails = { employeeId: 'stan', fullName: 'Stan', department: 'Sales', jobRole: 'Director', startDate: '2012-05-14' };

const demoBackend: EmployeeBackend = {
  live: false,
  runnerStorageKey: 'focusiq-demo-session',
  async outline() {
    return outlineOf(DEMO_ASSESSMENT);
  },
  async load() {
    const run = readJson<RunOptions>(RUN_KEY);
    return {
      me: DEMO_ME,
      notice: DEMO_NOTICE,
      acknowledgement: readJson<AcknowledgementRecord>(ACK_KEY),
      adjustment: latestRequestFor(DEMO_ME.employeeId),
      run,
      completed: run ? serverSnapshot(run.assessmentId).completed : false,
    };
  },
  async saveAcknowledgement(record, me) {
    writeJson(ACK_KEY, record);
    if (record.adjustmentRequested) {
      upsertRequest({
        id: record.id,
        employeeId: me.employeeId,
        employeeName: me.fullName,
        department: me.department,
        description: record.adjustmentDescription!,
        createdAt: record.acknowledgedAt,
        status: 'pending',
        history: [],
      });
    }
    return record;
  },
  watchAdjustment(me, onChange) {
    return subscribeAdjustments(() => onChange(latestRequestFor(me.employeeId)));
  },
  async start(timeMultiplier) {
    const id = globalThis.crypto.randomUUID();
    const options = { assessmentId: id, seed: id, timeMultiplier };
    writeJson(RUN_KEY, options);
    return options;
  },
  async open(run) {
    return { definition: DEMO_ASSESSMENT, snapshot: serverSnapshot(run.assessmentId) };
  },
  transport: demoTransport,
  async sendRequest(me, type, message) {
    const created = createRequest({ employeeId: me.employeeId, employeeName: me.fullName, department: me.department, type, message, now: new Date() });
    upsertRightsRequest(created);
    return { dueAt: created.dueAt };
  },
  watchRequests(me, onChange) {
    onChange(requestsForEmployee(me.employeeId));
    return subscribeRightsRequests(() => onChange(requestsForEmployee(me.employeeId)));
  },
  async followUp(me, request, body) {
    upsertRightsRequest(employeeFollowUp(request, me.employeeId, body, new Date()));
  },
  watchSummary(me, onChange) {
    const emit = () => {
      const r = currentRelease(listReleases(), me.employeeId);
      onChange(r ? { summary: r.summary, readAt: r.readAt } : null);
    };
    emit();
    return subscribeReleases(emit);
  },
  async markSummaryRead(me) {
    const r = currentRelease(listReleases(), me.employeeId);
    if (r) saveRelease(markReleaseRead(r, me.employeeId, new Date()));
  },
  watchWgWay(me, onChange) {
    onChange(wgWayReleasesFor(me.employeeId));
    return subscribeWgWayReleases(() => onChange(wgWayReleasesFor(me.employeeId)));
  },
};

// ---------------------------------------------------------------------------
// Live
// ---------------------------------------------------------------------------
/** How often to look for a Director's decision, reply or released summary. */
const POLL_MS = 30_000;

function poll<T>(fetch: () => Promise<T>, onChange: (v: T) => void): () => void {
  let alive = true;
  let last = '';
  const run = () =>
    fetch().then(
      (v) => {
        const key = JSON.stringify(v);
        if (alive && key !== last) {
          last = key;
          onChange(v);
        }
      },
      () => undefined, // keep the last known state; try again next time
    );
  run();
  const t = setInterval(run, POLL_MS);
  const onFocus = () => run();
  const win = typeof window === 'undefined' ? null : window;
  win?.addEventListener('focus', onFocus);
  return () => {
    alive = false;
    clearInterval(t);
    win?.removeEventListener('focus', onFocus);
  };
}

interface NoticeRow { version: string | null; title: string; content: Omit<PrivacyNotice, 'version' | 'title' | 'publishedAt'>; published_at: string | null }
interface AckRow {
  id: string; employee_id: string; notice_version: string; notice_sha256: string; acknowledged_items: { id: string; text: string }[];
  details_confirmed: EmployeeRecordDetails; details_correct: boolean; details_correction: string | null;
  adjustment_requested: boolean; adjustment_description: string | null; typed_name: string; acknowledged_at: string;
}
interface AdjustmentRow {
  id: string; description: string; status: AdjustmentRequest['status']; arrangements: string[] | null; employee_message: string | null;
  time_multiplier: number | null; decided_at: string | null; created_at: string;
}

const ackFromRow = (r: AckRow): AcknowledgementRecord => ({
  id: r.id,
  employeeId: r.employee_id,
  noticeVersion: r.notice_version,
  noticeSha256: r.notice_sha256,
  acknowledgedItems: r.acknowledged_items,
  detailsConfirmed: r.details_confirmed,
  detailsCorrect: r.details_correct,
  detailsCorrection: r.details_correction,
  adjustmentRequested: r.adjustment_requested,
  adjustmentDescription: r.adjustment_description,
  typedName: r.typed_name,
  acknowledgedAt: r.acknowledged_at,
} as AcknowledgementRecord);

/** The employee's own row holds the outcome and their message – never internal notes or who decided. */
const adjustmentFromRow = (r: AdjustmentRow, me: EmployeeRecordDetails): AdjustmentRequest => ({
  id: r.id,
  employeeId: me.employeeId,
  employeeName: me.fullName,
  department: me.department,
  description: r.description,
  createdAt: r.created_at,
  status: r.status,
  history:
    r.status === 'pending'
      ? []
      : [{
          status: r.status,
          arrangements: (r.arrangements ?? []) as AdjustmentRequest['history'][number]['arrangements'],
          timeMultiplier: r.time_multiplier,
          employeeMessage: r.employee_message ?? '',
          internalNote: null,
          decidedBy: '',
          decidedByName: 'Walter Geering',
          decidedAt: r.decided_at ?? r.created_at,
          revisionReason: null,
        }],
});

async function latestAdjustment(me: EmployeeRecordDetails): Promise<AdjustmentRequest | null> {
  const rows = check(
    await db().from('adjustment_requests')
      .select('id, description, status, arrangements, employee_message, time_multiplier, decided_at, created_at')
      .eq('employee_id', me.employeeId).order('created_at', { ascending: false }).limit(1),
  ) as AdjustmentRow[];
  return rows[0] ? adjustmentFromRow(rows[0], me) : null;
}

/** Rebuilds the runner's definition from the published version: sections from `definition`, questions by id. */
export function definitionFromContent(content: {
  version: string; title: string;
  definition: { estimatedMinutes?: number; sections: (Omit<SectionDef, 'questions'> & { questionVersionIds: string[] })[] };
  questions: Record<string, Omit<QuestionDef, 'questionVersionId'>>;
}): AssessmentDefinition {
  return {
    version: content.version,
    title: content.title,
    estimatedMinutes: content.definition.estimatedMinutes ?? 15,
    sections: content.definition.sections.map(({ questionVersionIds, ...s }) => ({
      ...s,
      questions: questionVersionIds.map((id) => {
        const q = content.questions[id];
        if (!q) throw new Error('This assessment is missing a question. Please tell a Director.');
        return { ...q, questionVersionId: id };
      }),
    })),
  };
}

const liveTransport: Transport = {
  async save({ presentations, events }) {
    if (presentations.length) {
      check(await db().from('assessment_presentations').upsert(
        presentations.map((p: Presentation) => ({
          id: p.id,
          assessment_id: p.assessmentId,
          question_version_id: p.questionVersionId,
          sequence: p.sequence,
          presented_at: p.presentedAt,
          rendered_content: p.renderedContent,
          timed: p.timed,
          time_limit_seconds: p.timeLimitSeconds,
        })),
        { onConflict: 'id', ignoreDuplicates: true },
      ));
    }
    if (events.length) {
      check(await db().from('response_events').upsert(
        events.map((e: RunnerEvent) => ({
          assessment_id: e.assessmentId,
          presentation_id: e.presentationId,
          client_sequence: e.clientSequence,
          event_type: e.type,
          occurred_at: e.occurredAt,
          payload: e.payload,
        })),
        { onConflict: 'assessment_id,client_sequence', ignoreDuplicates: true },
      ));
    }
  },
  async complete(assessmentId, completedAt) {
    check(await db().rpc('employee_complete_assessment', { p_assessment_id: assessmentId, p_completed_at: completedAt }));
  },
};

interface MyRequestRow {
  id: string; type: RightsRequestType; status: RightsRequest['status']; created_at: string; respond_by: string; extended: boolean;
  outcome: RightsRequest['outcome']; messages: { from: string; kind: RightsRequest['messages'][number]['kind']; body: string; at: string }[];
}

/** The published assessment's definition (sections and timings; the questions are listed by id only). */
async function publishedDefinition(): Promise<{ id: string; title: string; definition: { estimatedMinutes?: number; sections: (Omit<SectionDef, 'questions'> & { questionVersionIds: string[] })[] } } | null> {
  const rows = check(
    await db().from('assessment_versions').select('id, title, definition').not('published_at', 'is', null).is('retired_at', null).order('published_at', { ascending: false }).limit(1),
  ) as { id: string; title: string; definition: { estimatedMinutes?: number; sections: (Omit<SectionDef, 'questions'> & { questionVersionIds: string[] })[] } }[];
  return rows[0] ?? null;
}

const liveBackend: EmployeeBackend = {
  live: true,
  runnerStorageKey: 'focusiq-live-session',
  async outline() {
    const v = await publishedDefinition();
    if (!v) return null;
    return { title: v.title, estimatedMinutes: v.definition.estimatedMinutes ?? 15, sections: v.definition.sections.map((s) => ({ title: s.title, timeLimitSeconds: s.timeLimitSeconds })) };
  },
  async load() {
    // The database works out who is signed in (a Director can read everyone, so never guess from a list).
    const myId = check(await db().rpc('my_employee_id')) as string | null;
    if (!myId) return null;
    const emp = check(
      await db().from('employees').select('id, display_name, department, job_role, start_date').eq('id', myId).maybeSingle(),
    ) as { id: string; display_name: string; department: string; job_role: string | null; start_date: string } | null;
    if (!emp) return null;
    const me: EmployeeRecordDetails = { employeeId: emp.id, fullName: emp.display_name, department: emp.department, jobRole: emp.job_role ?? '', startDate: emp.start_date };

    const noticeRow = check(await db().rpc('current_privacy_notice')) as NoticeRow | NoticeRow[] | null;
    const n = Array.isArray(noticeRow) ? noticeRow[0] : noticeRow;
    const notice: PrivacyNotice | null = n?.version ? { ...n.content, version: n.version, title: n.title, publishedAt: n.published_at } : null;

    const acks = check(
      await db().from('participation_acknowledgements').select('*').eq('employee_id', me.employeeId).order('acknowledged_at', { ascending: false }).limit(1),
    ) as AckRow[];
    const latest = check(
      await db().from('assessments').select('id, complete, delivery_context').eq('employee_id', me.employeeId).order('created_at', { ascending: false }).limit(1),
    ) as { id: string; complete: boolean; delivery_context: { seed?: string; time_multiplier?: number } }[];
    const a = latest[0];
    return {
      me,
      notice,
      acknowledgement: acks[0] ? ackFromRow(acks[0]) : null,
      adjustment: await latestAdjustment(me),
      run: a ? { assessmentId: a.id, seed: a.delivery_context?.seed ?? a.id, timeMultiplier: Number(a.delivery_context?.time_multiplier ?? 1) } : null,
      completed: a?.complete ?? false,
    };
  },
  async saveAcknowledgement(record, me) {
    // The database stamps the time, checks the wording and opens any adjustment or correction request.
    const row = check(
      await db().from('participation_acknowledgements').insert({
        id: record.id,
        employee_id: me.employeeId,
        notice_version: record.noticeVersion,
        notice_sha256: record.noticeSha256,
        acknowledged_items: record.acknowledgedItems,
        details_confirmed: record.detailsConfirmed,
        details_correct: record.detailsCorrect,
        details_correction: record.detailsCorrection,
        adjustment_requested: record.adjustmentRequested,
        adjustment_description: record.adjustmentDescription,
        typed_name: record.typedName,
        user_agent: navigator.userAgent.slice(0, 300),
      }).select('*').single(),
    ) as AckRow;
    return ackFromRow(row);
  },
  watchAdjustment(me, onChange) {
    return poll(() => latestAdjustment(me), onChange);
  },
  async start() {
    // The time multiplier comes from the agreed adjustment on the server, not from the browser.
    const versions = check(
      await db().from('assessment_versions').select('id').not('published_at', 'is', null).is('retired_at', null).order('published_at', { ascending: false }).limit(1),
    ) as { id: string }[];
    if (!versions[0]) throw new Error('The FocusiQ assessment is not open yet. Please try again later.');
    const rows = check(await db().rpc('employee_start_assessment', { p_version: versions[0].id })) as { assessment_id: string; seed: string; time_multiplier: number }[];
    const r = rows[0]!;
    return { assessmentId: r.assessment_id, seed: r.seed, timeMultiplier: Number(r.time_multiplier ?? 1) };
  },
  async open(run) {
    const content = check(await db().rpc('assessment_content_for', { p_assessment_id: run.assessmentId }));
    const events = check(await db().from('response_events').select('client_sequence').eq('assessment_id', run.assessmentId)) as { client_sequence: number }[];
    const shown = check(await db().from('assessment_presentations').select('id').eq('assessment_id', run.assessmentId)) as { id: string }[];
    // Events are sent in order, so the count is how far the server has got.
    return {
      definition: definitionFromContent(content as Parameters<typeof definitionFromContent>[0]),
      snapshot: { events: events.length, presentationIds: shown.map((p) => p.id), completed: false },
    };
  },
  transport: liveTransport,
  async sendRequest(me, type, message) {
    const row = check(
      await db().from('rights_requests').insert({ employee_id: me.employeeId, request_type: type, message: message.trim() }).select('due_at').single(),
    ) as { due_at: string };
    return { dueAt: row.due_at };
  },
  watchRequests(me, onChange) {
    return poll(async () => {
      const rows = (check(await db().rpc('my_rights_requests')) ?? []) as MyRequestRow[];
      return rows.map((r): RightsRequest => ({
        id: r.id,
        employeeId: me.employeeId,
        employeeName: me.fullName,
        department: me.department,
        type: r.type,
        createdAt: r.created_at,
        status: r.status,
        dueAt: r.respond_by,
        extended: r.extended ? { reason: '', at: '', by: '' } : null,
        outcome: r.outcome,
        closedAt: null,
        messages: r.messages.map((m, i) => ({ id: `${r.id}-${i}`, kind: m.kind, visibleToEmployee: true, authorId: '', authorName: m.from, body: m.body, at: m.at })),
      }));
    }, onChange);
  },
  async followUp(_me, request, body) {
    if (!body.trim()) throw new Error('Write a message first.');
    check(await db().rpc('follow_up_rights_request', { p_id: request.id, p_body: body }));
  },
  watchSummary(_me, onChange) {
    return poll(async () => {
      const rows = check(await db().rpc('my_summary')) as { release_id: string; content: EmployeeSummary; read_at: string | null }[];
      return rows[0] ? { summary: rows[0].content, readAt: rows[0].read_at } : null;
    }, onChange);
  },
  async markSummaryRead() {
    const rows = check(await db().rpc('my_summary')) as { release_id: string }[];
    if (rows[0]) check(await db().rpc('mark_summary_read', { p_release_id: rows[0].release_id }));
  },
  watchWgWay(me, onChange) {
    // Score and topic counts only, once a Director has shared them (never the questions or answers).
    return poll(async () => {
      const rows = (check(await db().rpc('my_wg_way_results')) ?? []) as {
        sitting_id: string; completed_at: string; correct: number; total: number;
        by_topic: Record<string, { correct: number; total: number }> | null; shared_at: string;
      }[];
      return rows.map((r): WgWayRelease => ({
        sittingId: r.sitting_id,
        employeeId: me.employeeId,
        completedAt: r.completed_at,
        correct: r.correct,
        total: r.total,
        byTopic: (Object.keys(WG_WAY_TOPICS) as WgWayTopic[]).flatMap((t) => {
          const c = r.by_topic?.[t];
          return c && c.total > 0 ? [{ topic: t, label: WG_WAY_TOPICS[t], correct: c.correct, total: c.total }] : [];
        }),
        releasedAt: r.shared_at,
      }));
    }, onChange);
  },
};

export const backend: EmployeeBackend = LIVE ? liveBackend : demoBackend;

// ---------------------------------------------------------------------------
// Preview: what staff see, for Directors. Everything stays in this page's
// memory; nothing is saved, sent or emailed. Live, it shows the published
// notice and questions (read with the Director's own access); before anything
// is published, the demo content.
// ---------------------------------------------------------------------------
const PREVIEW_ME: EmployeeRecordDetails = { employeeId: 'preview', fullName: 'Sam Example', department: 'Sales', jobRole: 'Account Manager', startDate: '2024-04-08' };

async function previewContent(): Promise<{ notice: PrivacyNotice; definition: AssessmentDefinition; note: string | null }> {
  if (!LIVE) return { notice: DEMO_NOTICE, definition: DEMO_ASSESSMENT, note: null };
  const noticeRow = check(await db().rpc('current_privacy_notice')) as NoticeRow | NoticeRow[] | null;
  const n = Array.isArray(noticeRow) ? noticeRow[0] : noticeRow;
  const notice = n?.version ? { ...n.content, version: n.version, title: n.title, publishedAt: n.published_at } : DEMO_NOTICE;
  const v = await publishedDefinition();
  let definition = DEMO_ASSESSMENT;
  if (v) {
    const ids = v.definition.sections.flatMap((s) => s.questionVersionIds);
    // Content only: Directors can read answer keys, but the preview never asks for them.
    const qs = check(await db().from('question_versions').select('id, content').in('id', ids)) as { id: string; content: Omit<QuestionDef, 'questionVersionId'> }[];
    definition = definitionFromContent({ version: v.id, title: v.title, definition: v.definition, questions: Object.fromEntries(qs.map((q) => [q.id, q.content])) });
  }
  const missing = [!n?.version && 'privacy notice', !v && 'assessment'].filter(Boolean);
  return { notice, definition, note: missing.length ? `Nothing is published yet for the ${missing.join(' or ')}, so the demo version is shown.` : null };
}

/** A fresh practice copy: everything in memory, gone on reload. */
export function createPreviewBackend(): EmployeeBackend & { contentNote(): Promise<string | null> } {
  const content = previewContent();
  let acknowledgement: AcknowledgementRecord | null = null;
  let adjustment: AdjustmentRequest | null = null;
  let requests: RightsRequest[] = [];
  const adjustmentWatchers = new Set<(a: AdjustmentRequest | null) => void>();
  const requestWatchers = new Set<(r: RightsRequest[]) => void>();
  return {
    live: false,
    preview: true,
    runnerStorageKey: `focusiq-preview-session-${globalThis.crypto.randomUUID()}`,
    async contentNote() {
      return (await content).note;
    },
    async outline() {
      return outlineOf((await content).definition);
    },
    async load() {
      return { me: PREVIEW_ME, notice: (await content).notice, acknowledgement, adjustment, run: null, completed: false };
    },
    async saveAcknowledgement(record) {
      acknowledgement = record;
      if (record.adjustmentRequested) {
        adjustment = { id: record.id, employeeId: PREVIEW_ME.employeeId, employeeName: PREVIEW_ME.fullName, department: PREVIEW_ME.department, description: record.adjustmentDescription ?? '', createdAt: record.acknowledgedAt, status: 'pending', history: [] };
        adjustmentWatchers.forEach((w) => w(adjustment));
      }
      return record;
    },
    watchAdjustment(_me, onChange) {
      adjustmentWatchers.add(onChange);
      return () => adjustmentWatchers.delete(onChange);
    },
    async start(timeMultiplier) {
      const id = globalThis.crypto.randomUUID();
      return { assessmentId: id, seed: id, timeMultiplier };
    },
    async open() {
      return { definition: (await content).definition, snapshot: { events: 0, presentationIds: [], completed: false } };
    },
    transport: { async save() {}, async complete() {} },
    async sendRequest(me, type, message) {
      const created = createRequest({ employeeId: me.employeeId, employeeName: me.fullName, department: me.department, type, message, now: new Date() });
      requests = [created, ...requests];
      requestWatchers.forEach((w) => w(requests));
      return { dueAt: created.dueAt };
    },
    watchRequests(_me, onChange) {
      onChange(requests);
      requestWatchers.add(onChange);
      return () => requestWatchers.delete(onChange);
    },
    async followUp(me, request, body) {
      const next = employeeFollowUp(request, me.employeeId, body, new Date());
      requests = requests.map((r) => (r.id === next.id ? next : r));
      requestWatchers.forEach((w) => w(requests));
    },
    watchSummary(_me, onChange) {
      onChange(null);
      return () => undefined;
    },
    async markSummaryRead() {},
    watchWgWay(_me, onChange) {
      // A made-up result, so Directors can see how a shared score looks to staff.
      onChange([PREVIEW_SAMPLE_RELEASE]);
      return () => undefined;
    },
  };
}

/** The data layer for the current page (the preview swaps in its own). */
export const BackendContext = createContext<EmployeeBackend>(backend);
export const useBackend = () => useContext(BackendContext);
