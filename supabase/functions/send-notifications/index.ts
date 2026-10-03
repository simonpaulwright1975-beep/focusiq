// FocusiQ: send queued notification emails.
//
// Run every minute by pg_cron (see docs/notifications.md). Claims pending
// emails from notification_outbox, sends each one and records the result.
// Failures are retried with back-off by complete_notification().
//
// Environment:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   – provided by Supabase
//   CRON_SECRET          – shared secret the scheduler sends as a Bearer token
//   EMAIL_PROVIDER       – "resend" to send; anything else (default "log") sends nothing
//   RESEND_API_KEY       – when EMAIL_PROVIDER=resend
//   EMAIL_FROM           – e.g. "Walter Geering <focusiq@waltergeering.co.uk>"
//   EMPLOYEE_APP_URL     – link in employee emails, e.g. https://focusiq.waltergeering.co.uk/employee.html
//   DIRECTOR_APP_URL     – link in Director emails, e.g. https://focusiq.waltergeering.co.uk/
import { createClient } from 'jsr:@supabase/supabase-js@2';

interface Claimed {
  id: string;
  kind: string;
  audience: 'employee' | 'director';
  email: string;
  subject: string;
  body: string;
}

const env = (k: string, fallback = '') => Deno.env.get(k) ?? fallback;

async function sendWithResend(to: string, subject: string, text: string): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env('EMAIL_FROM'), to: [to], subject, text }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

Deno.serve(async (req) => {
  if (req.headers.get('Authorization') !== `Bearer ${env('CRON_SECRET')}` || !env('CRON_SECRET')) {
    return new Response('Unauthorised', { status: 401 });
  }
  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
  const provider = env('EMAIL_PROVIDER', 'log');

  await db.rpc('release_stuck_notifications');
  if (provider !== 'resend') {
    // Not configured: leave emails queued (Directors can see them in the dashboard).
    return Response.json({ provider, sent: 0, note: 'Email sending is not configured; nothing was sent.' });
  }

  const { data, error } = await db.rpc('claim_notifications', { p_limit: 50 });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  let sent = 0;
  for (const n of (data ?? []) as Claimed[]) {
    const link = n.audience === 'director' ? env('DIRECTOR_APP_URL') : env('EMPLOYEE_APP_URL');
    try {
      await sendWithResend(n.email, n.subject, n.body.replaceAll('{{link}}', link));
      await db.rpc('complete_notification', { p_id: n.id, p_ok: true });
      sent++;
    } catch (e) {
      // Never log addresses or content; the id is enough to investigate.
      console.error(`notification ${n.id} failed: ${(e as Error).message}`);
      await db.rpc('complete_notification', { p_id: n.id, p_ok: false, p_error: (e as Error).message });
    }
  }
  return Response.json({ provider, sent, claimed: data?.length ?? 0 });
});
