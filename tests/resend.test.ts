import { describe as suite, expect, it } from 'vitest';
import {
  classifyResponse,
  deliveryUpdate,
  idempotencyKey,
  redact,
  resendPayload,
  sendBatch,
  sendOne,
  svixSignature,
  verifyWebhook,
  type OutgoingEmail,
  type ResendConfig,
  type SendOutcome,
} from '../supabase/functions/_shared/resend';

const email = (id: string, over: Partial<OutgoingEmail> = {}): OutgoingEmail => ({
  id,
  kind: 'request_reply',
  audience: 'employee',
  email: 'grace@example.test',
  subject: 'New reply to your FocusiQ question or request',
  body: 'Hello Grace,\n\nWalter Geering has replied. Sign in:\n{{link}}\n',
  ...over,
});

function fakeFetch(responses: Array<{ status: number; body: unknown; headers?: Record<string, string> } | Error>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const r = responses[Math.min(calls.length - 1, responses.length - 1)]!;
    if (r instanceof Error) throw r;
    return new Response(JSON.stringify(r.body), { status: r.status, headers: r.headers });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

const cfg = (f: typeof fetch, over: Partial<ResendConfig> = {}): ResendConfig => ({
  apiKey: 're_test',
  from: 'Walter Geering <focusiq@waltergeering.co.uk>',
  employeeUrl: 'https://focusiq.example/employee.html',
  directorUrl: 'https://focusiq.example/',
  fetch: f,
  ...over,
});

suite('sending through Resend', () => {
  it('sends plain text from Walter Geering with the right link and no personal data in tags', async () => {
    const { fn, calls } = fakeFetch([{ status: 200, body: { id: 'msg_1' } }]);
    expect(await sendOne(email('n1'), cfg(fn))).toEqual({ outcome: 'sent', messageId: 'msg_1' });
    const { url, init } = calls[0]!;
    expect(url).toBe('https://api.resend.com/emails');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer re_test');
    expect(headers['Idempotency-Key']).toMatch(/^focusiq-n1-[0-9a-f]+$/);
    expect(JSON.parse(init.body as string)).toEqual({
      from: 'Walter Geering <focusiq@waltergeering.co.uk>',
      to: ['grace@example.test'],
      subject: 'New reply to your FocusiQ question or request',
      text: 'Hello Grace,\n\nWalter Geering has replied. Sign in:\nhttps://focusiq.example/employee.html\n',
      tags: [{ name: 'focusiq_kind', value: 'request_reply' }],
    });
    expect((resendPayload(email('n2', { audience: 'director' }), cfg(fn)).text as string)).toContain('https://focusiq.example/\n');
  });

  it('test mode sends everything to one address', () => {
    const p = resendPayload(email('n1'), cfg(fetch, { redirectTo: 'simon@example.test' }));
    expect(p.to).toEqual(['simon@example.test']);
    expect(p.subject).toBe('[Test for grace@example.test] New reply to your FocusiQ question or request');
  });

  it('keeps the idempotency key for a retry of the same email, and changes it when the content changes', () => {
    expect(idempotencyKey('n1', 'a')).toBe(idempotencyKey('n1', 'a'));
    expect(idempotencyKey('n1', 'a')).not.toBe(idempotencyKey('n1', 'b'));
    expect(idempotencyKey('n1', 'a')).not.toBe(idempotencyKey('n2', 'a'));
  });

  it('tells temporary problems from permanent ones and from our own setup', async () => {
    expect(classifyResponse(500, null, 'oops').outcome).toBe('retry');
    expect(classifyResponse(409, null, 'concurrent').outcome).toBe('retry');
    expect(classifyResponse(422, null, 'Invalid `to` field: grace@@example')).toEqual({ outcome: 'permanent', detail: 'Resend 422: Invalid `to` field: [address]' });
    expect(classifyResponse(429, '7', 'slow down')).toMatchObject({ outcome: 'requeue', retryAfterSeconds: 7 });
    expect(classifyResponse(403, null, 'domain not verified')).toMatchObject({ outcome: 'requeue', retryAfterSeconds: 900 });
    const { fn } = fakeFetch([new Error('connect ECONNRESET')]);
    expect(await sendOne(email('n1'), cfg(fn))).toEqual({ outcome: 'retry', detail: 'Network error: connect ECONNRESET' });
    const bad = fakeFetch([{ status: 422, body: { message: 'Invalid `to` field. grace@example.test is not valid' } }]);
    expect(await sendOne(email('n1'), cfg(bad.fn))).toEqual({ outcome: 'permanent', detail: 'Resend 422: Invalid `to` field. [address] is not valid' });
    expect(redact('Contact <a.b@c.co.uk>, "x@y.z"')).toBe('Contact <[address]>, "[address]"');
  });

  it('paces sends and puts the rest of the batch back when rate-limited', async () => {
    const { fn, calls } = fakeFetch([
      { status: 200, body: { id: 'm1' } },
      { status: 429, body: { message: 'Too many requests' }, headers: { 'retry-after': '2' } },
    ]);
    const recorded: [string, SendOutcome][] = [];
    const sleeps: number[] = [];
    const totals = await sendBatch([email('a'), email('b'), email('c'), email('d')], cfg(fn), async (id, r) => { recorded.push([id, r]); }, async (ms) => { sleeps.push(ms); });
    expect(calls).toHaveLength(2);
    expect(sleeps).toEqual([550]);
    expect(totals).toEqual({ sent: 1, failed: 0, requeued: 3 });
    expect(recorded.map(([id, r]) => [id, r.outcome])).toEqual([['a', 'sent'], ['b', 'requeue'], ['c', 'requeue'], ['d', 'requeue']]);
    expect(recorded[2]![1]).toMatchObject({ retryAfterSeconds: 2, detail: 'Not attempted: Resend 429: Too many requests' });
  });
});

suite('Resend delivery webhooks', () => {
  const secret = 'whsec_' + Buffer.from('a-test-signing-secret-32-bytes!!').toString('base64');
  const body = JSON.stringify({ type: 'email.bounced', created_at: '2026-10-03T09:00:00.000Z', data: { email_id: 'msg_1', to: ['grace@example.test'] } });
  const now = 1_790_000_000;

  it('accepts a correctly signed, recent webhook and rejects anything else', async () => {
    const sig = await svixSignature(secret, 'msg_abc', String(now), body);
    const headers = { id: 'msg_abc', timestamp: String(now), signature: `v1,${sig}` };
    expect(await verifyWebhook(secret, headers, body, now)).toBe(true);
    expect(await verifyWebhook(secret, { ...headers, signature: `v1,bogus v1,${sig}` }, body, now)).toBe(true);
    expect(await verifyWebhook(secret, headers, body.replace('bounced', 'delivered'), now)).toBe(false);
    expect(await verifyWebhook(secret, headers, body, now + 301)).toBe(false);
    expect(await verifyWebhook('', headers, body, now)).toBe(false);
    expect(await verifyWebhook(secret, { ...headers, signature: null }, body, now)).toBe(false);
  });

  it('records delivery outcomes only, never opens or clicks', () => {
    expect(deliveryUpdate(JSON.parse(body))).toEqual({ messageId: 'msg_1', status: 'bounced', at: '2026-10-03T09:00:00.000Z' });
    expect(deliveryUpdate({ type: 'email.delivered', data: { email_id: 'm' } })?.status).toBe('delivered');
    expect(deliveryUpdate({ type: 'email.complained', data: { email_id: 'm' } })?.status).toBe('complained');
    expect(deliveryUpdate({ type: 'email.opened', data: { email_id: 'm' } })).toBeNull();
    expect(deliveryUpdate({ type: 'email.clicked', data: { email_id: 'm' } })).toBeNull();
    expect(deliveryUpdate(null)).toBeNull();
  });
});
