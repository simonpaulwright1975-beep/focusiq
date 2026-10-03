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

## Setting up Resend

Do this once the Supabase project exists.

**FocusiQ uses the Walter Geering Hub's Resend account.** The Hub (`wg-hub`) already sends through Resend from the verified domain `wghub.uk`, both for its Supabase Auth emails and its Edge Functions. FocusiQ uses the same account and domain, so there's no new domain and no DNS work.

1. **Sending domain.** Use `wghub.uk`, which is already verified. FocusiQ sends as `Walter Geering <focusiq@wghub.uk>`; any address on a verified domain works.
2. **Open and click tracking** is a per-domain setting in Resend. Make sure it's off for `wghub.uk`: FocusiQ doesn't track whether people open emails, and click tracking would rewrite the sign-in links. This also applies to the Hub's emails.
3. **Create a separate API key for FocusiQ** with *Sending access* for `wghub.uk` only. Don't reuse the Hub's key: each app can then be revoked on its own, and Resend shows which app sent what.
4. **Add a webhook** pointing at `https://<project-ref>.supabase.co/functions/v1/resend-webhook`. Resend webhooks cover the whole account, so this one also receives events for the Hub's emails; FocusiQ ignores message ids it didn't send.
   - Events: `email.delivered`, `email.delivery_delayed`, `email.bounced` and `email.complained`.
   - Copy its signing secret (`whsec_…`).
5. **Set the secrets and deploy.** Both functions check their own credentials, so JWT checks are off:
   ```
   supabase secrets set RESEND_API_KEY=re_… RESEND_WEBHOOK_SECRET=whsec_… \
     EMAIL_FROM="Walter Geering <focusiq@wghub.uk>" \
     EMPLOYEE_APP_URL=https://…/employee.html DIRECTOR_APP_URL=https://…/ \
     CRON_SECRET=<long random string> \
     EMAIL_REDIRECT_TO=<your own address>   # test mode: remove before go-live
   supabase functions deploy send-notifications --no-verify-jwt
   supabase functions deploy resend-webhook --no-verify-jwt
   ```
   **Test mode.** While `EMAIL_REDIRECT_TO` is set, every email goes to that one address. The subject shows who it was for, so the whole flow can be tried with real data before staff receive anything. Remove it with `supabase secrets unset EMAIL_REDIRECT_TO`.

   **Nothing is lost without credentials.** Without `RESEND_API_KEY` and `EMAIL_FROM`, the function sends nothing and emails stay queued.
6. **Schedule it** with `pg_cron` and `pg_net` (enable both extensions first). Store the cron secret in Vault rather than in the job text:
   ```sql
   select cron.schedule('focusiq-send-notifications', '* * * * *', $$
     select net.http_post(
       url := 'https://<project-ref>.supabase.co/functions/v1/send-notifications',
       headers := jsonb_build_object('Authorization', 'Bearer ' ||
         (select decrypted_secret from vault.decrypted_secrets where name = 'focusiq_cron_secret')))
   $$);
   -- 07:00 and 08:00 UTC on weekdays; the function sends at 08:00 UK time (GMT or BST).
   select cron.schedule('focusiq-director-digest', '0 7,8 * * 1-5', 'select focusiq.queue_director_digests()');
   ```
7. **Employee email addresses** come from Supabase Auth (`auth.users.email`) through `employees.user_id`. An employee without an account is not emailed, and the email is recorded as *Not sent*.
8. **Data protection (for whoever handles this at Walter Geering).**
   - Resend processes staff email addresses and these content-free emails.
   - Sign Resend's data processing agreement.
   - Confirm the safeguard for the transfer to a US provider under UK GDPR, for example the UK Addendum or the UK Extension to the Data Privacy Framework if Resend is certified.
   - List Resend as a processor in the FocusiQ privacy notice; one of its placeholders covers this.
   - Resend may already be covered for the Hub; extend the same paperwork to FocusiQ.
   - Check the plan's limits. The Hub and FocusiQ share the account's quota, and an assessment day sends about two emails per person.

## Demo

The Director dashboard keeps a demo outbox in the browser, and nothing is emailed. The **Notifications** tab shows:
- every queued email, with a preview of exactly what would be sent;
- the daily summary for today;
- **Mark as sent (demo)**, which stands in for the sender.
