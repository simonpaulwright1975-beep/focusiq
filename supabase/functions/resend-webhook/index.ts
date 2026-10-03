// FocusiQ: Resend delivery webhooks (delivered, delayed, bounced, complained).
//
// Resend signs each webhook (Svix). Verified events update the email's
// delivery status in notification_outbox, so Directors can see when an email
// did not arrive. Open and click events are ignored: FocusiQ does not track them.
//
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_WEBHOOK_SECRET (whsec_…)
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { deliveryUpdate, verifyWebhook } from '../_shared/resend.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const body = await req.text();
  const ok = await verifyWebhook(Deno.env.get('RESEND_WEBHOOK_SECRET') ?? '', {
    id: req.headers.get('svix-id'),
    timestamp: req.headers.get('svix-timestamp'),
    signature: req.headers.get('svix-signature'),
  }, body);
  if (!ok) return new Response('Invalid signature', { status: 401 });

  let update;
  try {
    update = deliveryUpdate(JSON.parse(body));
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }
  if (!update) return Response.json({ ignored: true });

  const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', { auth: { persistSession: false } });
  const { error } = await db.rpc('record_email_event', { p_message_id: update.messageId, p_status: update.status, p_at: update.at });
  // A failure here makes Resend retry the webhook later.
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ recorded: true });
});
