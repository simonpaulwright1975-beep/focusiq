# Going live

FocusiQ runs in two modes:

- **Demo** (now): made-up people and results kept in each browser. Nothing is sent anywhere.
- **Live**: staff sign in with their normal Walter Geering account, and everything is saved in WG Main
  (schema `focusiq`). The switch is two settings in Netlify (step 7). Until then, nothing changes for anyone.

## What is already done in WG Main

- The whole `focusiq` schema, the staff-directory link and the email functions and schedules.
- Invitations, completion emails and the completion count in the Director daily summary
  (`20261005090000_focusiq_invitations_and_completion.sql`).
- No FocusiQ function can be called without signing in (`20261005090100_focusiq_no_anonymous_functions.sql`).
- Leader expectations (`20261005090200_focusiq_leader_expectations.sql`).
- The Director role for the Managing Director (the only Director).
- The retention guards from `20261005090300_focusiq_retention.sql`. **Still to do:** the clean-up function itself
  and its nightly schedule. The Supabase connector cannot run statements containing deletes, so paste
  the `apply_retention` part of that migration plus
  `select cron.schedule('focusiq-retention', '5 3 * * *', 'select focusiq.apply_retention()');` into the SQL editor.
  Until then nothing is deleted and the evidence tables stay locked as before.

## Steps, in order

1. **Expose the schema to the API.** Supabase → WG Main → Project Settings → API (Data API) →
   *Exposed schemas* → add `focusiq` → Save. Nothing live works until this is done. It does not change
   what anyone can see: row-level security still decides that.

2. **Allow FocusiQ's address for sign-in emails.** Supabase → Authentication → URL Configuration →
   *Redirect URLs* → add `https://focus-iq.netlify.app/**` → Save. This lets "Email me a sign-in link" and
   "Forgotten your password?" bring people back to FocusiQ. **Do not change the Site URL**: it belongs to
   the Hub.

3. **Privacy notice – done.** Walter Geering Ltd as controller; the Managing Director or a private comment in
   the Voice as the contact; expected as part of development reviews; hosted in the EU (Ireland); kept for
   24 months from the assessment date, then deleted automatically by `focusiq.apply_retention()`.

4. **Decide the questions.** The live assessment uses the demo's 13 questions in four sections, written
   around Walter Geering's customers (hotels, holiday parks and accommodation: housekeepers, purchasing,
   operations and accommodation managers). Directors review them in the question book
   (`scripts/question-book.ts`). Then load the content and the finished notice:

   ```
   npx vite-node scripts/content-sql.ts -- --out supabase/content/focusiq-2026.1.sql
   ```

   Review the file, then run it in the Supabase SQL editor (or ask Claude to apply it). The script refuses
   while the notice still has gaps. Published content can never be edited afterwards; to change questions,
   publish a new assessment version.

5. **Make the Directors Directors.** For each Director, add a row to `focusiq.user_roles` with role
   `director` (Claude can do this from their names). Directors must already have a WG login (set up in the Hub).

6. **Turn on email.** Follow `docs/notifications.md`: the `FOCUSIQ_` secrets, the Resend webhook, and test
   mode (`FOCUSIQ_EMAIL_REDIRECT_TO`) for the first emails.

7. **Switch the apps to live.** Netlify → focus-iq → Site configuration → Environment variables → add:

   | Key | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | `https://hlfhyzqkzqgyuohhmzzu.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | `sb_publishable_r9QqxX4eUYuMGngw325DKg_Z_YLhfTF` (WG Main's publishable key: safe to publish) |

   Then Deploys → Trigger deploy → Deploy site. Both apps now open on the sign-in screen.

8. **Add and invite staff.** Director dashboard → **Staff** → *Add…* for each person (FocusiQ department and
   start date), with "Email an invitation now" ticked. People without a WG login are set up in the Hub first,
   then invited from the Staff tab.

## What is live, and what is still example data

| Live (real data) | Still example data until results are connected |
|---|---|
| Sign-in and access (Directors only on the dashboard; employees see only their own record) | Overview, People, Employee report, Eligibility & audit (need scoring of real answers) |
| Staff tab: add, invite, assessment status | Assessment day, Notifications tab |
| Employee app: acknowledgement, adjustment request, the assessment, questions, released summary | |
| Adjustments and Questions & concerns tabs | |
| Emails: invitations, decisions, replies, completion, daily summary | |

The dashboard banner says which tabs are live. Results tabs need the scoring step (turning saved answers into
scores and insight), which is the next piece of work after go-live.

## Testing live mode safely

`tests/live.integration.test.ts` runs the real app code against a **test** database through PostgREST, as a
Director and an employee: add, invite, acknowledge, adjustment, assessment, questions and emails. It is skipped
unless `FOCUSIQ_LIVE_TEST_URL` is set. Never point it at WG Main: it creates people and requests.
