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

## 2. Still to build

- **Assessment runner:**
  - shows each question version, with questions and options shuffled per person;
  - records presentations and response events;
  - timed sections;
  - images from locked Supabase Storage.
- **Employee summary page:** the constructive summary only (`my_insight_summaries()`).
- **Director side of participation:** a Director can see who has acknowledged, decide adjustment requests (linking agreed ones to the *Adjusted Assessment* flag), and respond to rights requests.
