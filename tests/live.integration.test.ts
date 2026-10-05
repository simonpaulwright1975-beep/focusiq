/**
 * End-to-end check of live mode: the real app data code (employee backend,
 * Staff tab, Director request handling) against a FocusiQ database through
 * PostgREST, as different signed-in people.
 *
 * Opt-in. It needs a TEST database with every migration applied, content
 * loaded with `scripts/content-sql.ts --test-fill`, a Director user
 * 00000000-0000-0000-0000-0000000000d1, and a staff-directory person
 * 44444444-4444-4444-4444-444444444444 with login 00000000-0000-0000-0000-0000000000e2.
 *
 *   FOCUSIQ_LIVE_TEST_URL=http://localhost:3100 FOCUSIQ_LIVE_TEST_SECRET=<jwt secret> npx vitest run tests/live.integration.test.ts
 *
 * Never point it at WG Main: it creates people, acknowledgements and requests.
 */
import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createAcknowledgement, emptyForm, type RightsRequest } from '../src/participation/index.js';
import { createSession, reduce } from '../src/runner/index.js';
import { DEMO_DIRECTOR, buildDemoData } from '../app/src/demo/dataset.js';
import { DEMO_ASSESSMENT } from '../app/src/demo/assessment.js';

const URL = process.env.FOCUSIQ_LIVE_TEST_URL;
const SECRET = process.env.FOCUSIQ_LIVE_TEST_SECRET ?? '';
const DIRECTOR = '00000000-0000-0000-0000-0000000000d1';
const EMPLOYEE = '00000000-0000-0000-0000-0000000000e2';
const STAFF_ID = '44444444-4444-4444-4444-444444444444';

function jwt(sub: string, email: string): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const head = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub, email, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}`;
  return `${head}.${createHmac('sha256', SECRET).update(head).digest('base64url')}`;
}

/** Fresh app modules signed in as `sub` (the publishable key slot carries the user's token). */
async function as(sub: string, email: string) {
  vi.resetModules();
  vi.stubEnv('VITE_SUPABASE_URL', URL!);
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', jwt(sub, email));
  return {
    backend: (await import('../app/src/employee/backend.js')).backend,
    staff: await import('../app/src/views/staffData.js'),
    requests: await import('../app/src/views/requestsData.js'),
    db: (await import('../app/src/shared/supabase.js')).db,
  };
}

/** First value a watch* function reports, then stop watching. */
function first<T>(watch: (cb: (v: T) => void) => () => void): Promise<T> {
  return new Promise((resolve) => {
    let stop = () => {};
    stop = watch((v) => {
      setTimeout(() => stop(), 0);
      resolve(v);
    });
  });
}

describe.skipIf(!URL)('live mode against a test database', () => {
  it('runs the whole journey: add, invite, acknowledge, adjustment, assessment, questions, emails', async () => {
    // ---- Director adds and invites the person -------------------------------
    let d = await as(DIRECTOR, 'director@example.test');
    const source = d.staff.staffSource(buildDemoData());
    expect(source.live).toBe(true);
    let row = (await source.list()).find((r) => r.staffId === STAFF_ID)!;
    expect(row.hasLogin).toBe(true);
    const employeeId = row.employeeId ?? (await source.add(STAFF_ID, 'Sales', null, 'leader'));
    expect(['invited', 'recently_invited']).toContain(await source.invite(employeeId));
    row = (await source.list()).find((r) => r.staffId === STAFF_ID)!;
    expect(row.department).toBe('Sales');
    expect(row.expectations).toBe('leader');
    await source.setExpectations(employeeId, 'standard');
    expect((await source.list()).find((r) => r.staffId === STAFF_ID)!.expectations).toBe('standard');
    expect(row.invitationStatus).toBeTruthy();

    // ---- Employee: own record and the published notice only ---------------
    let e = await as(EMPLOYEE, 'grace.test@example.test');
    const loaded = (await e.backend.load())!;
    expect(loaded.me.fullName).toBe('Grace Tester');
    expect(loaded.notice?.version).toMatch(/-test$/);
    const others = (await e.db().from('employees').select('id')).data ?? [];
    expect(others.map((x: { id: string }) => x.id)).toEqual([employeeId]);
    await expect(e.staff.staffSource(buildDemoData()).list()).rejects.toThrow(/Directors/);

    // Acknowledge with an adjustment request (the fingerprint survives jsonb).
    if (!loaded.acknowledgement) {
      const form = {
        ...emptyForm(),
        detailsCorrect: true,
        ticked: Object.fromEntries(loaded.notice!.acknowledgements.map((a) => [a.id, true])),
        adjustmentRequested: true,
        adjustmentDescription: 'A little extra time on timed sections would help.',
        typedName: 'Grace Tester',
      };
      const saved = await e.backend.saveAcknowledgement(await createAcknowledgement(form, loaded.notice!, loaded.me), loaded.me);
      expect(saved.employeeId).toBe(employeeId);
      // The adjustment must be reviewed before the assessment can start.
      await expect(e.backend.start(1)).rejects.toThrow();
    }

    // ---- Director agrees the adjustment ------------------------------------
    d = await as(DIRECTOR, 'director@example.test');
    const pending = (await d.requests.liveAdjustments()).find((r) => r.employeeId === employeeId && r.status === 'pending');
    if (pending) {
      await d.requests.saveDecision(pending, { status: 'agreed', arrangements: ['extra_time'], timeMultiplier: 1.25, employeeMessage: 'We have agreed 25% extra time.' }, DEMO_DIRECTOR, new Date());
    }
    expect((await d.requests.liveAdjustments()).find((r) => r.employeeId === employeeId)?.status).toBe('agreed');

    // ---- Employee takes the assessment -------------------------------------
    e = await as(EMPLOYEE, 'grace.test@example.test');
    const now = (await e.backend.load())!;
    expect(now.adjustment?.status).toBe('agreed');
    expect(now.adjustment?.history[0]?.internalNote).toBeNull();
    if (!now.completed) {
      const run = await e.backend.start(1);
      expect(run.timeMultiplier).toBe(1.25);
      const { definition, snapshot } = await e.backend.open(run);
      expect(definition.sections.flatMap((s) => s.questions)).toHaveLength(DEMO_ASSESSMENT.sections.flatMap((s) => s.questions).length);
      // Abstract puzzles keep their pictures, with fingerprints.
      expect(definition.sections.find((s) => s.id === 'abstract')?.questions[0]?.image?.sha256).toMatch(/^[0-9a-f]{64}$/);
      // No answer keys reach the employee.
      expect(JSON.stringify(definition)).not.toMatch(/correctAnswer|answer_key/);
      let s = createSession({ ...run, definition });
      const t = new Date().toISOString();
      s = reduce(s, { type: 'start', at: t });
      s = reduce(s, { type: 'start_section', at: t });
      s = reduce(s, { type: 'answer', value: definition.sections[0]!.questions[0]!.options[0]!.id, at: t });
      const batch = { presentations: Object.values(s.presentations), events: s.events.slice(snapshot.events) };
      await e.backend.transport.save(batch);
      await e.backend.transport.save(batch); // a retry must not duplicate anything
      const saved = await e.backend.open(run);
      expect(saved.snapshot.events).toBe(s.events.length);
      await e.backend.transport.complete(run.assessmentId, new Date().toISOString());
      expect((await e.backend.load())!.completed).toBe(true);
    }

    // ---- Questions & concerns, both ways -----------------------------------
    const { dueAt } = await e.backend.sendRequest(now.me, 'question', 'What happens after the assessment?');
    expect(dueAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    d = await as(DIRECTOR, 'director@example.test');
    const mine = (await d.requests.liveRightsRequests()).find((r) => r.employeeId === employeeId && r.status === 'open' && r.type === 'question')!;
    expect(mine).toBeTruthy();
    await d.requests.rightsActions.message(mine, DEMO_DIRECTOR, 'Internal: check with HR first.', true);
    await d.requests.rightsActions.message(mine, DEMO_DIRECTOR, 'You will receive your own summary afterwards.', false);
    e = await as(EMPLOYEE, 'grace.test@example.test');
    const seen = await first<RightsRequest[]>((cb) => e.backend.watchRequests(now.me, cb));
    const thread = seen.find((r) => r.id === mine.id)!;
    expect(thread.messages.map((m) => m.authorName)).toContain('Walter Geering');
    expect(JSON.stringify(thread)).not.toContain('Internal: check with HR');

    // ---- Emails queued by the database (content-free) ----------------------
    d = await as(DIRECTOR, 'director@example.test');
    const box = ((await d.db().from('notification_outbox').select('kind, recipient_employee_id, body')).data ?? []) as { kind: string; recipient_employee_id: string; body: string }[];
    const kinds = box.filter((n) => n.recipient_employee_id === employeeId).map((n) => n.kind);
    for (const k of ['focusiq_invitation', 'adjustment_decided', 'assessment_completed', 'request_reply']) expect(kinds).toContain(k);
    for (const n of box) expect(n.body).not.toContain('extra time on timed sections would help');
  }, 30_000);
});
