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
2. **Sending.** The Edge Function `supabase/functions/send-notifications` claims waiting emails (`claim_notifications()`), sends them, and records the result (`complete_notification()`).
3. **Failures.**
   - A failed email is retried after 2, 4, 8 and 16 minutes, then marked *Failed*.
   - If a newer update is already waiting, the failed one is cancelled instead.
   - Emails stuck mid-send for 10 minutes are released.
   - Emails with no address on record, or still waiting after 7 days, are marked *Not sent*.
4. **Who can see the outbox.** Directors can read it on the **Notifications** tab. Employees can't read it.

**Wording:** the email wording lives in `src/participation/notifications.ts` and is mirrored in the SQL. `tests/notifications.test.ts` checks the two match.

## Setting up sending (decision needed)

Until an email provider is chosen, the Edge Function sends nothing and emails wait in the outbox. Steps:

1. **Choose a provider.** The function supports [Resend](https://resend.com) as written; others (Postmark, SendGrid, Microsoft 365 SMTP relay) need a few lines.
2. **Verify the sending domain** with the provider (SPF and DKIM for `waltergeering.co.uk`).
3. **Set the function's secrets:**
   ```
   supabase secrets set EMAIL_PROVIDER=resend RESEND_API_KEY=… \
     EMAIL_FROM="Walter Geering <focusiq@waltergeering.co.uk>" \
     EMPLOYEE_APP_URL=https://…/employee.html DIRECTOR_APP_URL=https://…/ \
     CRON_SECRET=<long random string>
   supabase functions deploy send-notifications --no-verify-jwt
   ```
4. **Schedule it** with `pg_cron` and `pg_net` (enable both extensions first). Store the secret in Vault rather than in the job text:
   ```sql
   select cron.schedule('focusiq-send-notifications', '* * * * *', $$
     select net.http_post(
       url := 'https://<project-ref>.supabase.co/functions/v1/send-notifications',
       headers := jsonb_build_object('Authorization', 'Bearer ' ||
         (select decrypted_secret from vault.decrypted_secrets where name = 'focusiq_cron_secret')))
   $$);
   -- 07:00 and 08:00 UTC on weekdays; the function sends at 08:00 UK time (GMT or BST).
   select cron.schedule('focusiq-director-digest', '0 7,8 * * 1-5', 'select public.queue_director_digests()');
   ```
5. **Employee email addresses** come from Supabase Auth (`auth.users.email`) through `employees.user_id`. An employee without an account is not emailed, and the email is recorded as *Not sent*.

## Demo

The Director dashboard keeps a demo outbox in the browser, and nothing is emailed. The **Notifications** tab shows:
- every queued email, with a preview of exactly what would be sent;
- the daily summary for today;
- **Mark as sent (demo)**, which stands in for the sender.
