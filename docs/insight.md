# FocusiQ – Employee Insight & Business Support

Implementation notes for the Insight spec §201–§235.

> **FocusiQ's question is not "what score did this employee get?" but "what does this person need to perform at their best?"**

## How an insight is produced

```
response_events + assessment_presentations      (exactly what was seen and done)
        │  deriveExerciseEvidence()
        ▼
ExerciseEvidence per exercise                    (first answer, final answer, reopened, changed,
        │                                         time, review time after first answer, scenario choices)
        │  detectPatterns()  – versioned rules (interpretation/1.0.0)
        ▼
Findings  (only at Moderate / High evidence confidence; otherwise "not concluded")
        │  generateInsightReport()
        ▼
Director report  +  employee-facing summary      (language safeguard runs on every string)
```

- **Evidence-based (§202):** nothing is free text. Every sentence is a `Statement` carrying the `findingKeys` it came from.
- **Traceable (§203):** every finding lists evidence items, each with `exerciseIds` (presentation ids) for the *View Evidence* drill-down. For example:
  - *9 of 13 relevant exercises were reopened*
  - *First answer was already correct in 7 of those 9*
  - *Additional checking improved only 1 outcome*
  - *Average additional review time: 21 seconds*
  - *Timed-task accuracy remained within 4% of untimed accuracy*
- **Minimum evidence:** detectors use the same evidence rules as dimensions, so no conclusion comes from two questions. Patterns with too little evidence are listed in `notConcluded` with the reason.
- **Reproducible:** every report records its interpretation version. Rules live in `src/insight/rules.ts` and the `interpretation_versions` table.

## Patterns detected

| Pattern | Spec | Rule (defaults) |
|---|---|---|
| Over-Processing | §215, §203 | Lower-risk exercises: ≥ 50 % reopened, ≥ 60 % of those already correct, ≤ 25 % improved by re-checking, overall accuracy ≥ 80 % |
| Rushing | §214 | Multi-stage accuracy ≥ 15 pts below single-stage; most errors were fast and not reviewed |
| Slow but Controlled | §216 | Slower than the comparison group's P75, accuracy ≥ 85 %, ≤ 15 % answer changes, and not over-processing. Needs benchmark context. |
| High Initiative | §217 | Relevant next action identified in ≥ 70 % of initiative scenarios |
| High Escalation | §218 | Unnecessary approval sought in ≥ 50 % of scenarios. Four possible reasons are listed; none is assumed. |
| Pressure response | §223 | Timed vs untimed. **Efficient** = ≥ 20 % faster with ≤ 5 pt accuracy loss. **Quality drops** = ≥ 10 pt loss. Each leads to different advice. |
| Needs defined priorities | §202, §207 | Accuracy ≥ 15 pts higher with defined priorities than with competing ones |
| Retention support / strength | §219 | Retention accuracy < 60 % (support) / ≥ 85 % (strength) |
| Visual / verbal processing | §220, §221 | ≥ 20 pt modality gap. Framed as an observed preference, never a learning style. |
| Sustained attention | §222 | First-third vs final-third accuracy drop ≥ 20 pts. No medical inference. |
| Task vs outcome orientation | §211, §213 | Outcome action chosen ≤ 35 % (task) / ≥ 70 % (outcome). Never described as lacking motivation. |
| Commercial understanding | §212 | Commercial items < 60 % while overall accuracy ≥ 75 % |
| Routine over live opportunity | §227 | Routine activity chosen in ≥ 2 scenarios and ≥ 50 % of them |
| Strengths | §208 | Attention to detail, information retention, decision quality, customer ownership |

All thresholds are in `DEFAULT_RULES` and versioned.

## Report contents

| Section | Spec | Field |
|---|---|---|
| The four questions | §201 | `fourQuestions.whatThisTellsUs`, `howTheBusinessCanSupport`, `whatTheBusinessCouldChange`, `overallSummary` |
| Evidence | §203 | `findings[].evidence` |
| Business change vs employee change | §205, §228 | `whatTheBusinessCouldChange[]` (see below) |
| How to Get the Best From This Person | §206 | `howToGetTheBest` |
| Management style | §207 | `managementStyle` (up to 4, each with its rationale) |
| Strength utilisation | §208 | `strengthUtilisation`, with a balancing caution. For example, the attention-to-detail strength warns against making the employee the default checker when over-processing was also observed. |
| Role fit | §209 | `roleFit`: neutral observations only, with an explicit note |
| Motivation | §210 | `motivation`: primary motivators, what this could mean, business response. No motivator is described as superior. |
| Conversation guide & questions | §224, §225 | `conversationGuide` (opener + 3–5 questions) |
| Recommendations | §229–§231 | `recommendations`: at most 3, Priority 1/2/3, categorised, with impact and effort |
| Narrative summary | §232 | `fourQuestions.overallSummary`, written from findings using the employee's name. No pronouns are inferred. |
| Employee-facing summary | §233 | `employeeFacing`: strengths and up to two constructive opportunities. No percentiles, attribution or motivation analysis. |
| Signature structure | §234 | `directorSummary`: the 12 sections in order. Empty sections say plainly that there was not enough evidence. |
| What to monitor | §235 | `monitorAtNextReview` |

Each `whatTheBusinessCouldChange[]` entry contains:
- the §205 question (*"Could the business make…?"*);
- all three explanations: Individual Behaviour, Management / Clarity and Business Process;
- business- and management-side recommendations only.

**Prioritisation:**
- Recommendations linked to development and style findings add up, so several patterns pointing to the same change strengthen it.
- Strength findings count once at half weight, so "use strengths" never crowds out a change that addresses an opportunity.
- Low-effort changes get a bonus.

## Organisation level (§226–§228)

`organisationInsights` groups findings (e.g. by department). A pattern is reported when it meets all of these:
- the group has at least 5 people;
- at least 3 people show the pattern;
- they make up at least 50 % of the group.

The output reads, for example:
- *"7 of 10 Customer Service employees (70%) demonstrated uncertainty around escalation decisions."*
- *"This may indicate a business process or clarity issue rather than 7 individual problems."*

Each observation comes with a group-level response. Smaller groups are never reported, and the feature is Director-only.

## Language safeguard

`assertSafeLanguage` scans every generated string and refuses to return a report containing:
- dismissal, demotion or promotion advice, or suitability verdicts;
- "lacks motivation" or similar;
- medical terms;
- learning-style labels;
- pejorative labels;
- gendered pronouns (pronouns are never inferred).

## Database (`20261002090200_focusiq_insight.sql`)

| Table | Purpose |
|---|---|
| `question_versions.scoring_meta` | Exercise metadata the detectors need (documented on the column) |
| `motivation_profiles` | Ranked motivators per assessment |
| `insight_findings`, `insight_not_concluded` | Findings with evidence and exercise ids; append-only |
| `employee_insight_reports` | Frozen Director report and employee-facing summary; append-only |
| `my_insight_summaries()` | Removed in `20261002090700_focusiq_summary_release.sql`. Employees now read only Director-released summaries through `my_summary()` (see `docs/employee.md` §5) |
| `organisation_insights` | Group observations (group size ≥ 5 enforced); append-only |
| `insight_actions` | Converts recommendations into tracked actions (status, owner, due date) for an employee or a group |

## Content still to be written

Assessment authors need to tag each exercise's `scoring_meta` before these patterns can be detected:
- risk;
- modality;
- multi-stage;
- priority context;
- scenario option mappings.

Exercises without those tags are simply not used for the patterns that need them.
