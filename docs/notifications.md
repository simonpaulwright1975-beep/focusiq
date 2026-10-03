# FocusiQ – email notifications

FocusiQ emails people when something needs their attention.

## What an email may contain

**Emails are a nudge to sign in, never a copy of the content.** Email is less secure than FocusiQ, and much of what FocusiQ holds is personal or health information.

An email **never** contains:
- the content of adjustment requests, decisions or internal notes;
- the text of questions, requests or replies;
- summaries or results;
- anyone else's name, or the name of any Director.

Employee emails come from **Walter Geering** and greet the person by their first name. The Director email is a daily summary of counts only. `assertSafeEmail()` also refuses gendered pronouns.

## Who is emailed, and when

| Email | Sent when | Notes |
|---|---|---|
| Adjustment decision | A Director decides or changes an adjustment request | |
| Reply to a question or request | A Director replies | Internal notes never trigger an email |
| Request response date extended | The response date of a statutory request is extended | |
| Question or request closed | A question or request is closed | |
| Summary ready | A Director releases a summary | Cancelled if the summary is withdrawn before the email is sent |
| Assessment day invitation | A Director clicks **Email invitations…** on *Assessment day* | Date, time, room and expected minutes. Adds a request to acknowledge if that's still outstanding. People with an open objection aren't invited. Sending fixes everyone's session |
| Assessment day change | Invitations are emailed again after a booking that was already sent has changed | Unchanged bookings are not re-sent |
| Acknowledgement reminder | A Director clicks **Email reminders** on *Assessment day* | At most once every 3 days per person |
| Director daily summary | Weekdays at 08:00 UK time | Only when something needs attention: pending adjustments, overdue requests, requests due within 7 days, and people not ready for an assessment day in the next 3 days. Each Director can turn it off |

**Merging:** several updates about the same thing before an email goes out (for example three quick replies, or a reply and then closing the request) are merged into one email. Each email records a *coalesce key*.

## How it works

1. **Queueing.** Emails are queued in `notification_outbox` (`20261002090900_focusiq_notifications.sql`) by:
   - database triggers on `adjustment_decisions`, `rights_request_messages`, `rights_requests`, `summary_releases` and `summary_withdrawals`;
   - the Director-only functions `send_assessment_day_invitations()` and `send_acknowledgement_reminders()`;
   - `queue_director_digests()`, which is scheduled.
2. **Sending through [Resend](https://resend.com).** The Edge Function `supabase/functions/send-notifications` runs every minute. It claims up to 50 waiting emails (`claim_notifications()`) and sends them one at a time, keeping under Resend's default limit of 2 requests a second. Each result is recorded with `complete_notification()`.
3. **Delivery reports.** Resend calls `supabase/functions/resend-webhook`, which checks the signature and records *Delivered*, *Delivery delayed*, *Bounced* or *Marked as spam* (`record_email_event()`, `20261002091000_focusiq_resend_delivery.sql`). Opens and clicks are never tracked.
4. **Who can see the outbox.** Directors can read it on the **Notifications** tab, including delivery. The daily summary counts emails not delivered in the last 7 days. Employees can't read the outbox.

**Shared code:** the sending and webhook logic is in `supabase/functions/_shared/resend.ts`, which has no imports, so it runs in the Edge Functions and is tested in `tests/resend.test.ts`.

**What happens to each email:**

| Resend says | FocusiQ does |
|---|---|
| Accepted | *Sent*, with Resend's message id kept for delivery reports |
| 5xx, network error, or 409 (being sent concurrently) | Retries after 2, 4, 8 and 16 minutes, then *Failed* |
| 400 or 422 (e.g. invalid address) | *Failed* straight away (retrying wouldn't help) |
| 429 (rate limited) | Puts it and the rest of the batch back for Resend's `retry-after`, without counting an attempt |
| 401 or 403 (bad key, or domain not verified) | Our setup is wrong, not the email: puts the batch back for 15 minutes, without counting an attempt |

**Other safeguards:**
- **No duplicates.** Each send carries an idempotency key (the email's id plus a hash of its content). A retry after a timeout can't send the same email twice, and an email replaced by a newer update gets a new key.
- **Merging.** If a newer update is already waiting when a send fails, the failed email is cancelled and the newer one goes instead.
- **Stuck emails.** An email stuck mid-send for 10 minutes is released.
- **Not sent.** An email with no address on record, or still waiting after 7 days, is marked *Not sent*.
- **No addresses in logs.** Errors stored or logged have email addresses replaced with `[address]`. Logs never contain email content.

**Wording:** the email wording lives in `src/participation/notifications.ts` and is mirrored in the SQL. `tests/notifications.test.ts` checks the two match.

## Setting up Resend (simple steps)

FocusiQ uses the Hub's Resend account and its verified domain `wghub.uk`, so there's no new domain and no DNS work. The database is in WG Main (see `docs/database.md`).

**In Resend** ([resend.com](https://resend.com)):
1. **Domains → `wghub.uk` → Configuration:** make sure *Open tracking* and *Click tracking* are both **off**.
2. **API Keys:** the key *FocusiQ – sending* (Sending access, `wghub.uk` only). Keep its `re_…` value for step 5.
3. **Webhooks → Add Webhook:**
   - **Endpoint URL:** `https://hlfhyzqkzqgyuohhmzzu.supabase.co/functions/v1/resend-webhook`
   - **Events:** `email.delivered`, `email.delivery_delayed`, `email.bounced` and `email.complained`.
   - Save, then copy the **Signing secret** (`whsec_…`).

**In Supabase** ([supabase.com/dashboard](https://supabase.com/dashboard) → project **WG Main**):

4. **Project Settings → Data API → Exposed schemas:** add `focusiq` and save.
5. **Edge Functions → Secrets:** add these. Each one is a name and a value.

   Leave the existing `RESEND_API_KEY` alone: it belongs to the Hub's functions. Secrets are shared by every function in WG Main, so FocusiQ's all start with `FOCUSIQ_`.

   | Name | Value |
   |---|---|
   | `FOCUSIQ_RESEND_API_KEY` | the `re_…` key from step 2 |
   | `FOCUSIQ_RESEND_WEBHOOK_SECRET` | the `whsec_…` secret from step 3 |
   | `FOCUSIQ_EMAIL_FROM` | `Walter Geering <focusiq@wghub.uk>` |
   | `FOCUSIQ_EMPLOYEE_APP_URL` | FocusiQ's web address followed by `/employee.html` |
   | `FOCUSIQ_DIRECTOR_APP_URL` | FocusiQ's web address |
   | `FOCUSIQ_EMAIL_REDIRECT_TO` | your own email address (test mode, see below) |

   **Test mode:** while `FOCUSIQ_EMAIL_REDIRECT_TO` is set, every email goes to you instead of staff, with the intended recipient shown in the subject. Delete that secret when you're ready to go live.

6. **Deploy the two email functions and schedule them.** Done in WG Main on 3 October 2026; only repeat this after changing a function. To do it by hand:
   ```
   supabase functions deploy send-notifications --no-verify-jwt
   supabase functions deploy resend-webhook --no-verify-jwt
   ```
   Then run this in the SQL editor:
   ```sql
   select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'focusiq_cron_secret', 'FocusiQ scheduler token');
   select cron.schedule('focusiq-send-notifications', '* * * * *', $$
     select net.http_post(
       url := 'https://hlfhyzqkzqgyuohhmzzu.supabase.co/functions/v1/send-notifications',
       headers := jsonb_build_object('Authorization', 'Bearer ' ||
         (select decrypted_secret from vault.decrypted_secrets where name = 'focusiq_cron_secret')))
   $$);
   -- 07:00 and 08:00 UTC on weekdays; sends at 08:00 UK time all year.
   select cron.schedule('focusiq-director-digest', '0 7,8 * * 1-5', 'select focusiq.queue_director_digests()');
   select cron.schedule('focusiq-staff-sync', '15 2 * * *', 'select focusiq.sync_staff_directory()');
   ```
   The scheduler's token is generated and kept in Vault, so there's nothing to copy.

**In Netlify:** remove `RESEND_API_KEY` from the *focus-iq* site's environment variables. FocusiQ's emails are sent from Supabase, so nothing in Netlify uses it.

**Paperwork (for whoever handles data protection):**
- Resend processes staff email addresses; the emails themselves carry no personal content.
- If Resend's data processing agreement and UK GDPR transfer safeguard are already in place for the Hub, extend them to FocusiQ.
- List Resend as a processor in the FocusiQ privacy notice.

**Things to know:**
- Employee email addresses come from their WG login. Someone without a login isn't emailed, and the email shows as *Not sent*.
- The Hub and FocusiQ share one Resend quota. An assessment day sends about two emails per person.
- Nothing is sent until `FOCUSIQ_RESEND_API_KEY` and `FOCUSIQ_EMAIL_FROM` are set; emails wait in the outbox.

## Demo

The Director dashboard keeps a demo outbox in the browser, and nothing is emailed. The **Notifications** tab shows:
- every queued email, with a preview of exactly what would be sent;
- the daily summary for today;
- **Mark as sent (demo)**, which stands in for the sender.
