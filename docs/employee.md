# FocusiQ – Employee side

## 1. Privacy notice and acknowledgement (built)

Before their first assessment, and again whenever the notice changes, each employee completes a short form at `employee.html`:

1. **About FocusiQ** – a plain-language summary.
2. **Privacy notice** – the full, versioned notice.
3. **Your details** – the name, department, role and start date from their record. The employee confirms them, or says what is wrong, which automatically opens a correction request for HR.
4. **Statements** – eight statements, each ticked individually:
   - read the notice;
   - a development tool, not pass/fail;
   - confidential and internal only, never public;
   - interactions (time, changed answers, revisits) are recorded;
   - Directors see the full report and the employee gets a summary;
   - not the sole basis for employment decisions;
   - knows their rights;
   - will do the assessment personally and not share the questions.
5. **Adjustments** – "Is there anything that would help?", without asking for medical details. A request automatically creates an adjustment request for a Director.
6. **Review and sign** – the typed name must match the record.
7. **Confirmation** – a printable record showing the date and time, notice version and a SHA-256 fingerprint of the exact wording. If an adjustment was requested, the assessment opens only after a Director reviews it.

**Questions or concerns** is available on every step: ask a question, request a copy of their information, ask for a correction, or object.

### Why "acknowledgement", not "consent"

Under UK GDPR an employer can rarely rely on employee consent, because it isn't freely given in an employment relationship. The notice states **legitimate interests** as the lawful basis. The tick boxes record that the employee has read and understood the notice; they are not consent. **Please have HR or your legal adviser review the wording.**

### Placeholders Walter Geering must complete

The notice (`src/participation/notice.ts`) contains `[[placeholders]]`, highlighted in the demo:

- legal entity name;
- HR / data protection contact (two places);
- whether taking part is voluntary or expected, and what happens if someone doesn't take part;
- retention period;
- hosting location.

`publishNotice()` refuses to publish while any placeholder remains, and so does a database check constraint.

### What the database enforces (`20261002090300_focusiq_participation.sql`)

| Rule | How |
|---|---|
| No assessment without an acknowledgement of the **current** notice | Trigger on `assessments` insert |
| A new notice version requires re-acknowledgement | `current_privacy_notice()` + the trigger above |
| The acknowledgement matches the exact published wording | The fingerprint must equal `privacy_notices.content_sha256` |
| Every statement ticked | Item ids must equal the notice's acknowledgement ids |
| Employees acknowledge only for themselves | RLS (`my_employee_id()`) |
| Records can't be changed or deleted | Append-only trigger |
| Published notices can't be edited | Immutable once published (only retirement allowed) |
| Corrections and adjustment requests are followed up | `rights_requests` / `adjustment_requests` rows created automatically |
| Privacy | Employees see only their own records; Directors see all |

The employee page is a separate build entry. It loads none of the Director dashboard or benchmarking code.

## 2. Assessment runner (built)

After acknowledging the notice, the employee selects **Start my assessment**. The engine is in `src/runner/` (pure, tested) and the screen in `app/src/employee/Runner.tsx`.

**What the employee sees**
- **Intro:** the sections, which ones are timed, any agreed extra time, and how it works. This includes that time taken, changed answers and revisits are recorded.
- **Section intro:** instructions and the time allowed. Where a later question relies on it, there's a "Read carefully – you will need this later" box, which can't be viewed again.
- **Questions:**
  - single choice with text or image options, or ranking with accessible ↑/↓ buttons;
  - numbered dots to move around the section, with answered questions shown;
  - Previous/Next.
- **Section review:** answered and unanswered questions, a warning before submitting with gaps, and no return to a submitted section.
- **Timer:** for timed sections a pill shows the time left. It turns amber at 30 seconds and red at 10 seconds, with text. When time runs out, the answers given so far are submitted automatically.
- **Save status:**
  - "✓ All answers saved";
  - "Saving…";
  - "⚠ Not connected – your latest answers are kept on this device and will be sent automatically when you reconnect".
- **Resume:** closing or reloading the page resumes exactly where the employee left off, with the same question and option order.

**How it records evidence**
- **Per-person order:** questions and options are shuffled per person from a seed set by the server. Sections are never reordered, and options are kept in order where order matters.
- **What was shown:** the exact content each person saw, including option order, is recorded as `assessment_presentations.rendered_content`.
- **Interaction events:** every interaction becomes a `response_event`:
  - presented, viewed, left (with time on screen), revisited;
  - answer selected, changed (with the previous answer), submitted;
  - timer started or expired;
  - focus lost or returned.

  These are exactly the events the insight engine reads, and a test runs them end to end through `deriveExerciseEvidence`.
- **Motivation:** the motivation ranking is captured separately and is never used as performance evidence.
- **Images:** an image is shown only if its SHA-256 matches the fingerprint recorded with the question version. Otherwise the employee sees a message instead.

**Safety**
- **No answer keys in the browser:** the runner receives display content only. Answer keys and scoring tags stay server-side. A test walks the employee app's imports, and the built bundle is checked for answer keys.
- **Reliable saving:** an outbox sends events in order and retries with backoff when offline. Saves are idempotent (deterministic presentation ids; events unique on `(assessment_id, client_sequence)`). Completion is sent only after every earlier event is saved.

**Database** (`20261002090400_focusiq_runner.sql`)

| Function / object | Purpose |
|---|---|
| `employee_start_assessment(version)` | Sets the seed and time multiplier server-side. Blocks while an adjustment is pending. Resumes an open assessment rather than starting a second. Flags the assessment *Adjusted* when an agreed adjustment applies. |
| `assessment_content_for(id)` | Display content only, for the owner, while the assessment is open |
| `employee_complete_assessment(id, at)` | Marks it complete once. Idempotent, and clamps a client clock that is ahead of the server. |
| `adjustment_requests.time_multiplier` | Extra time a Director can agree (1–3×) |
| Storage bucket `assessment-media` | Private. Directors can upload; nobody can replace or delete, so the exact image shown can always be reproduced. |

**Demo limits**
- The demo saves to this browser's local storage in place of Supabase, and "Reset demo" clears it.
- A link simulates a Director agreeing 25% extra time.
- The demo assessment has 12 scored questions. That's enough to see the flow, but too few for most insight patterns to reach their minimum evidence, by design. A real assessment needs more exercises per pattern.
- Storage policies were checked against a minimal stand-in for Supabase Storage, not a live project.

## 3. Adjustment requests – Director decisions (built)

**Director dashboard → Adjustments.** The tab shows a count of pending requests, and `index.html#adjustments` opens it directly.

- **Confidentiality:** a reminder at the top. Requests may include health information, are Director-only, and internal notes are never shown to employees.
- **Awaiting a decision:** oldest first, showing the employee's own words.
- **Decided:** current arrangements, the message sent, who decided and when, **Change decision**, and the full **Decision history**, including internal notes and reasons for any change.

**Deciding** (`src/participation/adjustments.ts`):
- **Agree or Decline:** choose using the selectable chips.
- **Agree:** choose one or more arrangements. Only extra time is applied automatically: choose 25%, 50% or 100%, or "Other" up to 200%. The rest (rest breaks, larger text, screen reader, quiet room, paper or assisted version, other) are arranged by HR.
- **Message to the employee:** required. A suggested message updates with the choices until edited. The decline template has `[reason]` / `[alternative]` gaps that must be filled before sending.
- **Internal note:** optional and Directors-only.
- **Changing an earlier decision** requires a reason. Nothing is overwritten; every decision is appended.
- **Preview:** shows exactly what the employee will see.
- **Benchmarking:** agreed adjustments mark the assessment *Adjusted*. Comparability for benchmarking is decided separately in Eligibility & audit and is never automatic.

**Employee side.** The confirmation page shows the decision live (even when decided in another tab):
- **Pending:** the assessment is blocked.
- **Agreed:** the arrangements and message are shown, and the extra time is applied automatically when they start.
- **Declined:** the message is shown, and the employee can take the assessment under standard conditions.

**Database** (`20261002090500_focusiq_adjustment_decisions.sql`):
- **Decision function:** `decide_adjustment_request()` is the only way to decide. It is limited to Directors and authorised users, needs a reason to revise, and its checks match the app.
- **History:** `adjustment_decisions` is append-only and Director-only, and holds internal notes and revision reasons.
- **Employee-readable request row:** `adjustment_requests` holds only status, arrangements, extra time and the employee message. The old free-text `decision_note` column was removed.
- **Audit:** each decision is written to `benchmark_audit_log` without copying the request text.

In the demo, requests are shared between the employee page and the dashboard through this browser's local storage. Three fictional requests are seeded, one in each state.

## 4. Still to build

- **Employee summary page:** the constructive summary only (`my_insight_summaries()`).
- **Questions & rights requests:** a Director inbox for "Questions or concerns" and correction requests.
- **Acknowledgement overview:** who has and hasn't acknowledged the current notice.
- **Supabase transport:** replace the demo transport with real inserts once a FocusiQ project exists.
- **Scoring job:** turn submitted events into `assessment_scores` and `insight_findings`, using the server-side answer keys.
