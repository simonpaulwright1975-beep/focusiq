// FocusiQ: sending through Resend, and verifying Resend's delivery webhooks.
//
// No imports and only web-standard APIs (fetch, crypto.subtle), so the same
// file runs in the Supabase Edge Functions (Deno) and in the Vitest tests
// (tests/resend.test.ts).

/** A queued email as returned by claim_notifications(). */
export interface OutgoingEmail {
  id: string;
  kind: string;
  audience: 'employee' | 'director';
  email: string;
  subject: string;
  body: string;
}

export interface ResendConfig {
  apiKey: string;
  /** A verified sender, e.g. "Walter Geering <focusiq@wghub.uk>". */
  from: string;
  employeeUrl: string;
  directorUrl: string;
  /** Test mode: send every email to this address instead of the real recipient. */
  redirectTo?: string;
  /** Plain text only (no HTML version), e.g. while a mail filter holds the styled emails. */
  textOnly?: boolean;
  fetch?: typeof fetch;
}

/** What to record for one email; mirrors complete_notification()'s outcomes. */
export type SendOutcome =
  | { outcome: 'sent'; messageId: string }
  /** Temporary problem (Resend 5xx, network): retry with back-off. */
  | { outcome: 'retry'; detail: string }
  /** Resend will never accept this email (e.g. invalid address): don't retry. */
  | { outcome: 'permanent'; detail: string }
  /** Put back without counting an attempt (rate limit, or our configuration is wrong). */
  | { outcome: 'requeue'; detail: string; retryAfterSeconds: number };

export const RESEND_ENDPOINT = 'https://api.resend.com/emails';
/** Resend's default limit is 2 requests a second; stay under it. */
export const SEND_INTERVAL_MS = 550;
const LINK_TOKEN = '{{link}}';

export function resendPayload(n: OutgoingEmail, cfg: ResendConfig): Record<string, unknown> {
  const link = n.audience === 'director' ? cfg.directorUrl : cfg.employeeUrl;
  return {
    from: cfg.from,
    to: [cfg.redirectTo || n.email],
    subject: cfg.redirectTo ? `[Test for ${n.email}] ${n.subject}` : n.subject,
    text: n.body.replaceAll(LINK_TOKEN, link),
    ...(cfg.textOnly ? {} : { html: emailHtml(n.body, link, n.audience === 'director' ? 'Open the FocusiQ dashboard' : 'Open FocusiQ', iconUrl(cfg.employeeUrl)) }),
    // Kind only: no personal data in tags.
    tags: [{ name: 'focusiq_kind', value: n.kind }],
  };
}

// ---------------------------------------------------------------------------
// HTML version: the Walter Geering house style, built from the text body so the
// two always say the same thing. Simple tables and inline styles so it renders
// in Outlook. No tracking pixels or tracked links.
// ---------------------------------------------------------------------------
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const iconUrl = (employeeUrl: string) => {
  try {
    return new URL('brand/focusiq-icon.png', new URL('.', employeeUrl)).href;
  } catch {
    return '';
  }
};

const FONT = "'Segoe UI', Arial, Helvetica, sans-serif";
const P = `margin:0 0 14px;font-family:${FONT};font-size:15px;line-height:1.55;color:#4a4038`;

/**
 * Text → HTML. A blank line separates paragraphs; lines starting "- " are a
 * list; a short line without a full stop between a blank line and more text is
 * a heading; the {{link}} line becomes a button (with the address under it).
 */
export function emailHtml(text: string, link: string, buttonLabel: string, icon = ''): string {
  const lines = text.split('\n');
  const out: string[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) out.push(`<ul style="margin:0 0 14px;padding-left:20px;font-family:${FONT};font-size:15px;line-height:1.55;color:#4a4038">${list.map((l) => `<li style="margin:0 0 6px">${esc(l)}</li>`).join('')}</ul>`);
    list = [];
  };
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (line.startsWith('- ')) return void list.push(line.slice(2));
    flush();
    if (!line) return;
    const isFooter = i === lines.length - 1 && i > 0 && lines[i - 1] === '';
    if (line === LINK_TOKEN) {
      out.push(
        `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 10px"><tr><td style="border-radius:999px;background:#17120e">` +
          `<a href="${esc(link)}" style="display:inline-block;padding:14px 30px;font-family:${FONT};font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:999px">${esc(buttonLabel)} &rarr;</a></td></tr></table>` +
          `<p style="margin:0 0 18px;font-family:${FONT};font-size:12px;line-height:1.5;color:#8a7a6d">Or copy this address into your browser: <a href="${esc(link)}" style="color:#0d5a3b">${esc(link)}</a></p>`,
      );
    } else if (isFooter) {
      out.push(`<p style="margin:18px 0 0;padding-top:14px;border-top:1px solid #ede0d5;font-family:${FONT};font-size:12px;line-height:1.5;color:#8a7a6d">${esc(line)}</p>`);
    } else if ((i === 0 || lines[i - 1] === '') && lines[i + 1] && lines[i + 1] !== '' && line.length <= 40 && !/[.:,!?]$/.test(line) && i > 1) {
      out.push(`<h2 style="margin:22px 0 8px;font-family:Georgia, 'Times New Roman', serif;font-size:18px;font-weight:800;letter-spacing:-0.2px;color:#17120e">${esc(line)}</h2>`);
    } else {
      out.push(`<p style="${P}">${esc(line)}</p>`);
    }
  });
  flush();
  const logo = icon ? `<img src="${esc(icon)}" width="32" height="32" alt="" style="display:block;border:0;border-radius:8px">` : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>FocusiQ</title></head>` +
    `<body style="margin:0;padding:0;background:#f7efe9">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7efe9"><tr><td align="center" style="padding:28px 12px">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">` +
    `<tr><td style="background:#0d5a3b;border-radius:16px 16px 0 0;padding:18px 28px">` +
    `<table role="presentation" cellpadding="0" cellspacing="0"><tr>${logo ? `<td style="padding-right:12px">${logo}</td>` : ''}` +
    `<td style="font-family:${FONT};font-size:20px;font-weight:800;color:#ffffff">FocusiQ</td>` +
    `<td style="padding-left:12px;font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#a8e8c8">Walter Geering</td></tr></table>` +
    `</td></tr>` +
    `<tr><td style="background:#ffffff;border:1px solid #ede0d5;border-top:0;border-radius:0 0 16px 16px;padding:28px">${out.join('')}</td></tr>` +
    `</table></td></tr></table></body></html>`;
}

/**
 * A retry after a timeout must not send the same email twice, so the key is
 * stable for the same email. It includes a hash of the content because Resend
 * refuses a reused key with a different payload (a waiting email can be
 * replaced by a newer update after a failed attempt).
 */
export function idempotencyKey(id: string, payload: string): string {
  let h = 0x811c9dc5; // FNV-1a
  for (let i = 0; i < payload.length; i++) {
    h ^= payload.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `focusiq-${id}-${h.toString(16)}`;
}

/** Error text is stored and logged: never keep email addresses in it. */
export const redact = (text: string) => text.replace(/[^\s<>"'`,;:()]*@[^\s<>"'`,;:()]*/g, '[address]');

/** Turns Resend's response into what to record. */
export function classifyResponse(status: number, retryAfter: string | null, detail: string): SendOutcome {
  const d = redact(`Resend ${status}: ${detail}`).slice(0, 300);
  if (status === 429) return { outcome: 'requeue', detail: d, retryAfterSeconds: Math.max(1, Number(retryAfter) || 60) };
  // Bad API key, unverified domain or missing permission: our setup, not the email.
  if (status === 401 || status === 403) return { outcome: 'requeue', detail: d, retryAfterSeconds: 15 * 60 };
  // 409: the same email is being sent concurrently; 5xx: Resend is having problems.
  if (status === 409 || status >= 500) return { outcome: 'retry', detail: d };
  return { outcome: 'permanent', detail: d };
}

export async function sendOne(n: OutgoingEmail, cfg: ResendConfig): Promise<SendOutcome> {
  const doFetch = cfg.fetch ?? fetch;
  const body = JSON.stringify(resendPayload(n, cfg));
  let res: Response;
  try {
    res = await doFetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey(n.id, body),
      },
      body,
    });
  } catch (e) {
    return { outcome: 'retry', detail: redact(`Network error: ${(e as Error).message}`).slice(0, 300) };
  }
  const text = await res.text();
  if (res.ok) {
    try {
      const id = (JSON.parse(text) as { id?: string }).id;
      if (id) return { outcome: 'sent', messageId: id };
    } catch {
      /* fall through */
    }
    return { outcome: 'sent', messageId: '' };
  }
  let message = text;
  try {
    message = (JSON.parse(text) as { message?: string }).message ?? text;
  } catch {
    /* not JSON */
  }
  return classifyResponse(res.status, res.headers.get('retry-after'), message);
}

/**
 * Sends a claimed batch one at a time within Resend's rate limit. When
 * Resend rate-limits us or rejects our credentials, the rest of the batch is
 * put back untouched.
 */
export async function sendBatch(
  batch: readonly OutgoingEmail[],
  cfg: ResendConfig,
  record: (id: string, result: SendOutcome) => Promise<void>,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<{ sent: number; failed: number; requeued: number }> {
  const totals = { sent: 0, failed: 0, requeued: 0 };
  for (let i = 0; i < batch.length; i++) {
    if (i > 0) await sleep(SEND_INTERVAL_MS);
    const result = await sendOne(batch[i]!, cfg);
    await record(batch[i]!.id, result);
    if (result.outcome === 'sent') totals.sent++;
    else if (result.outcome === 'requeue') {
      totals.requeued++;
      for (const rest of batch.slice(i + 1)) {
        await record(rest.id, { outcome: 'requeue', detail: 'Not attempted: ' + result.detail, retryAfterSeconds: result.retryAfterSeconds });
        totals.requeued++;
      }
      break;
    } else totals.failed++;
  }
  return totals;
}

// ---------------------------------------------------------------------------
// Delivery webhooks (Resend signs them with Svix)
// ---------------------------------------------------------------------------
const b64ToBytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const bytesToB64 = (bytes: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(bytes)));

/** Signs `${id}.${timestamp}.${body}` the way Svix does (used by the tests too). */
export async function svixSignature(secret: string, id: string, timestamp: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', b64ToBytes(secret.replace(/^whsec_/, '')), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return bytesToB64(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${timestamp}.${body}`)));
}

/** Constant-time comparison of two strings. */
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Checks a webhook's svix-id / svix-timestamp / svix-signature headers. Rejects anything older than 5 minutes. */
export async function verifyWebhook(
  secret: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  body: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  const { id, timestamp, signature } = headers;
  if (!secret || !id || !timestamp || !signature) return false;
  if (!/^\d+$/.test(timestamp) || Math.abs(nowSeconds - Number(timestamp)) > 300) return false;
  const expected = await svixSignature(secret, id, timestamp, body);
  // The header may carry several space-separated "v1,<signature>" entries.
  return signature.split(' ').some((part) => {
    const [version, sig] = part.split(',');
    return version === 'v1' && !!sig && same(sig, expected);
  });
}

export type DeliveryStatus = 'delivered' | 'delayed' | 'bounced' | 'complained';

const EVENT_STATUS: Record<string, DeliveryStatus> = {
  'email.delivered': 'delivered',
  'email.delivery_delayed': 'delayed',
  'email.bounced': 'bounced',
  'email.complained': 'complained',
};

/** The delivery update in a webhook, or null for events FocusiQ ignores (opens and clicks are never tracked). */
export function deliveryUpdate(event: unknown): { messageId: string; status: DeliveryStatus; at: string } | null {
  const e = event as { type?: string; created_at?: string; data?: { email_id?: string } };
  const status = e?.type ? EVENT_STATUS[e.type] : undefined;
  const messageId = e?.data?.email_id;
  if (!status || !messageId) return null;
  return { messageId, status, at: e.created_at ?? new Date().toISOString() };
}
