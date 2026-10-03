// FocusiQ: send queued notification emails through Resend.
//
// Run every minute by pg_cron (see docs/notifications.md). Claims waiting
// emails from notification_outbox, sends each through Resend within its rate
// limit and records the result with complete_notification().
//
// Secrets:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY – provided by Supabase
//   CRON_SECRET        – shared secret the scheduler sends as a Bearer token
//   RESEND_API_KEY     – a sending-only Resend API key; without it nothing is sent
//   EMAIL_FROM         – a sender on the verified domain, e.g. "Walter Geering <focusiq@wghub.uk>"
//   EMPLOYEE_APP_URL   – link in employee emails
//   DIRECTOR_APP_URL   – link in Director emails
//   EMAIL_REDIRECT_TO  – optional test mode: every email goes to this address instead
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { sendBatch, type OutgoingEmail, type SendOutcome } from '../_shared/resend.ts';

const env = (k: string) => Deno.env.get(k) ?? '';

Deno.serve(async (req) => {
  if (!env('CRON_SECRET') || req.headers.get('Authorization') !== `Bearer ${env('CRON_SECRET')}`) {
    return new Response('Unauthorised', { status: 401 });
  }
  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
  await db.rpc('release_stuck_notifications');

  if (!env('RESEND_API_KEY') || !env('EMAIL_FROM')) {
    // Not configured: emails stay queued (Directors can see them on the Notifications tab).
    return Response.json({ sent: 0, note: 'Resend is not configured; nothing was sent.' });
  }

  const { data, error } = await db.rpc('claim_notifications', { p_limit: 50 });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const record = async (id: string, r: SendOutcome) => {
    const { error: e } = await db.rpc('complete_notification', {
      p_id: id,
      p_outcome: r.outcome,
      p_detail: r.outcome === 'sent' ? null : r.detail,
      p_message_id: r.outcome === 'sent' ? r.messageId || null : null,
      p_retry_after_seconds: r.outcome === 'requeue' ? r.retryAfterSeconds : null,
    });
    // Never log addresses or content; the id is enough to investigate.
    if (r.outcome !== 'sent') console.error(`notification ${id}: ${r.outcome} – ${r.detail}`);
    if (e) console.error(`notification ${id}: could not record result – ${e.message}`);
  };

  const totals = await sendBatch((data ?? []) as OutgoingEmail[], {
    apiKey: env('RESEND_API_KEY'),
    from: env('EMAIL_FROM'),
    employeeUrl: env('EMPLOYEE_APP_URL'),
    directorUrl: env('DIRECTOR_APP_URL'),
    redirectTo: env('EMAIL_REDIRECT_TO') || undefined,
  }, record);
  return Response.json({ claimed: data?.length ?? 0, ...totals, testMode: !!env('EMAIL_REDIRECT_TO') });
});
