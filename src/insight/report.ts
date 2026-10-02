/**
 * Assembles the Director insight report (Insight §201–§235) and the
 * constructive employee-facing summary (§233) from detected findings.
 */
import { detectPatterns, type DetectionContext } from './detectors.js';
import { assertSafeLanguage } from './language.js';
import {
  MANAGEMENT_STYLE_RATIONALE,
  MOTIVATORS,
  PATTERNS,
  RECOMMENDATIONS,
  type RecommendationId,
} from './library.js';
import { DEFAULT_RULES } from './rules.js';
import type {
  Attribution,
  ExerciseEvidence,
  Finding,
  InsightBenchmarkContext,
  Level,
  ManagementStyle,
  MotivationProfile,
  NotConcluded,
  PatternKey,
  Recommendation,
  Statement,
} from './types.js';

/** Narrative order – mirrors the flow of the §232 example summary. */
const PATTERN_ORDER: PatternKey[] = [
  'strength_information_retention',
  'strength_attention_to_detail',
  'strength_decision_quality',
  'over_processing',
  'rushing',
  'slow_but_controlled',
  'efficient_under_pressure',
  'quality_drops_under_pressure',
  'needs_defined_priorities',
  'high_initiative',
  'high_escalation',
  'outcome_orientation',
  'task_orientation',
  'strength_customer_ownership',
  'commercial_understanding',
  'routine_over_opportunity',
  'retention_support',
  'visual_processing',
  'verbal_processing',
  'sustained_attention',
];

/** Style patterns that also represent a development opportunity. */
const OPPORTUNITY_STYLES = new Set<PatternKey>([
  'over_processing',
  'rushing',
  'high_escalation',
  'quality_drops_under_pressure',
  'task_orientation',
]);

export const isOpportunity = (f: Finding) =>
  f.kind === 'development' || OPPORTUNITY_STYLES.has(f.key);

const PRIORITY_LABELS = {
  1: 'Priority 1 – greatest likely impact',
  2: 'Priority 2 – secondary opportunity',
  3: 'Priority 3 – optional improvement',
} as const;

export interface PrioritisedRecommendation extends Recommendation {
  priority: 1 | 2 | 3;
  priorityLabel: string;
  /** Findings that led to this recommendation – traceability. */
  linkedFindings: PatternKey[];
}

export interface BusinessChange {
  findingKey: PatternKey;
  insight: string;
  /** §205 – "Could the business make the task easier to perform effectively?" */
  question: string;
  /** §228 – the three possibilities, none assumed. */
  considerations: { attribution: Attribution; text: string }[];
  possibleReasons?: string[];
  businessRecommendations: Recommendation[];
}

export interface DirectorSummarySection {
  heading: string;
  statements: Statement[];
}

export interface InsightReport {
  interpretationVersion: string;
  generatedAt: string;
  employeeId: string;
  assessmentId: string;
  /** §201 – the four headline questions. */
  fourQuestions: {
    whatThisTellsUs: Statement[];
    howTheBusinessCanSupport: PrioritisedRecommendation[];
    whatTheBusinessCouldChange: BusinessChange[];
    overallSummary: Statement[];
  };
  /** §203 – every finding with its evidence ("View Evidence" drill-down). */
  findings: Finding[];
  /** Patterns considered but not concluded because evidence was insufficient. */
  notConcluded: NotConcluded[];
  /** §206 headline section. */
  howToGetTheBest: Statement[];
  /** §207 */
  managementStyle: { style: ManagementStyle; rationale: string; findingKeys: PatternKey[] }[];
  /** §208 */
  strengthUtilisation: { strength: string; uses: string[]; caution?: string; findingKey: PatternKey }[];
  /** §209 */
  roleFit: { observations: Statement[]; note: string };
  /** §210 */
  motivation: MotivationInsight | null;
  /** §224, §225 */
  conversationGuide: { opener: string; questions: string[]; findingKey: PatternKey } | null;
  /** §230, §231 – at most three, each with impact and effort. */
  recommendations: PrioritisedRecommendation[];
  /** §234 signature structure. */
  directorSummary: DirectorSummarySection[];
  /** §235 */
  monitorAtNextReview: string[];
  /** §233 */
  employeeFacing: EmployeeFacingSummary;
}

export interface MotivationInsight {
  primaryMotivators: string[];
  whatThisCouldMean: string;
  businessResponse: string[];
  note: string;
}

export interface EmployeeFacingSummary {
  paragraphs: string[];
}

export interface InsightInput {
  employee: { id: string; name: string };
  assessmentId: string;
  exercises: readonly ExerciseEvidence[];
  motivation?: MotivationProfile;
  benchmark?: InsightBenchmarkContext;
  /** Role demands for neutral role-fit observations, phrased as tasks, e.g. "rapid commercial prioritisation". */
  roleDemands?: string[];
  context?: Omit<DetectionContext, 'benchmark'>;
  now?: Date;
}

const LEVEL: Record<Level, number> = { High: 3, Medium: 2, Low: 1 };
const CONF_WEIGHT = { High: 1, Moderate: 0.75, Low: 0, Insufficient: 0 } as const;
const fill = (template: string, name: string) => template.replaceAll('{name}', name);
const listJoin = (xs: string[]) =>
  xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
const INSUFFICIENT: Statement = {
  text: 'No firm conclusion – there was not enough consistent evidence in this assessment.',
  findingKeys: [],
};

export function prioritiseRecommendations(findings: readonly Finding[], max: number): PrioritisedRecommendation[] {
  // Development/style findings add up (several patterns pointing at the same
  // change strengthen it); strength findings count once at half weight, so
  // "use strengths" never crowds out a change that addresses an opportunity.
  const scores = new Map<RecommendationId, { opportunity: number; strength: number; links: Set<PatternKey> }>();
  for (const f of findings) {
    for (const id of PATTERNS[f.key].recommendations) {
      const entry = scores.get(id) ?? { opportunity: 0, strength: 0, links: new Set<PatternKey>() };
      const value = LEVEL[RECOMMENDATIONS[id].impact] * CONF_WEIGHT[f.confidence];
      if (isOpportunity(f) || f.kind === 'style') entry.opportunity += value;
      else entry.strength = Math.max(entry.strength, value * 0.5);
      entry.links.add(f.key);
      scores.set(id, entry);
    }
  }
  return [...scores]
    .map(([id, s]) => ({
      id,
      score: s.opportunity + s.strength + (3 - LEVEL[RECOMMENDATIONS[id].effort]) * 0.5,
      links: s.links,
    }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, max)
    .map((s, i) => {
      const priority = (i + 1) as 1 | 2 | 3;
      return {
        ...RECOMMENDATIONS[s.id],
        priority,
        priorityLabel: PRIORITY_LABELS[priority],
        linkedFindings: [...s.links],
      };
    });
}

function motivationInsight(profile: MotivationProfile | undefined): MotivationInsight | null {
  if (!profile || profile.ranked.length < 2) return null;
  const labels = profile.ranked.map((k) => MOTIVATORS[k].label);
  const top = profile.ranked.slice(0, 2);
  const lowest = profile.ranked[profile.ranked.length - 1]!;
  return {
    primaryMotivators: labels.slice(0, 4),
    whatThisCouldMean: `The employee appears more strongly motivated by ${listJoin(
      top.map((k) => MOTIVATORS[k].label.toLowerCase()),
    )} than by ${MOTIVATORS[lowest].label.toLowerCase()}.`,
    businessResponse: top.flatMap((k) => MOTIVATORS[k].actions),
    note: 'No motivation type is better than another; these are suggestions for matching management to what this employee values.',
  };
}

export function generateInsightReport(input: InsightInput): InsightReport {
  const rules = input.context?.rules ?? DEFAULT_RULES;
  const { findings: raw, notConcluded } = detectPatterns(input.exercises, {
    ...input.context,
    benchmark: input.benchmark,
  });
  const findings = PATTERN_ORDER.flatMap((k) => raw.filter((f) => f.key === k));
  const has = (k: PatternKey) => findings.some((f) => f.key === k);
  const name = input.employee.name;
  const strengths = findings.filter((f) => f.kind === 'strength');
  const opportunities = findings.filter(isOpportunity);
  const st = (f: Finding, text: string): Statement => ({ text, findingKeys: [f.key] });

  // --- Q1 What this tells us (§202) --------------------------------------
  const whatThisTellsUs: Statement[] = findings.map((f) => st(f, PATTERNS[f.key].whatThisTellsUs));
  if (has('over_processing') && has('efficient_under_pressure')) {
    whatThisTellsUs.push({
      text: 'Together, these suggest the employee is capable of working more quickly than their natural working style currently demonstrates, particularly on lower-risk tasks.',
      findingKeys: ['over_processing', 'efficient_under_pressure'],
    });
  }

  // --- Recommendations (§204, §229–§231) ----------------------------------
  const recommendations = prioritiseRecommendations(findings, rules.maxRecommendations);

  // --- Q3 Business change (§205, §228) ------------------------------------
  const whatTheBusinessCouldChange: BusinessChange[] = opportunities
    .filter((f) => PATTERNS[f.key].attribution)
    .map((f) => {
      const c = PATTERNS[f.key];
      return {
        findingKey: f.key,
        insight: f.insight,
        question: c.businessQuestion ?? 'Could the business make the task easier to perform effectively?',
        considerations: (Object.entries(c.attribution!) as [Attribution, string][]).map(([attribution, text]) => ({ attribution, text })),
        ...(c.possibleReasons ? { possibleReasons: c.possibleReasons } : {}),
        businessRecommendations: c.recommendations
          .map((id) => RECOMMENDATIONS[id])
          .filter((r) => r.target !== 'employee'),
      };
    });

  // --- Q4 Overall summary (§232) ------------------------------------------
  const styleSources = findings.filter((f) => PATTERNS[f.key].styleWords);
  const styleWords = [...new Set(styleSources.flatMap((f) => PATTERNS[f.key].styleWords!))].slice(0, 3);
  const overallSummary: Statement[] = [];
  if (styleWords.length) {
    overallSummary.push({
      text: `${name} demonstrated ${/^[aeiou]/i.test(styleWords[0]!) ? 'an' : 'a'} ${listJoin(styleWords)} working style.`,
      findingKeys: styleSources.map((f) => f.key),
    });
  }
  for (const f of findings) overallSummary.push(st(f, fill(PATTERNS[f.key].summarySentence, name)));
  const bestSources = findings.filter((f) => PATTERNS[f.key].bestCondition);
  const conditions = [...new Set(bestSources.map((f) => PATTERNS[f.key].bestCondition!))].slice(0, 3);
  const bestSentence: Statement | null = conditions.length
    ? { text: `${name} may perform best when given ${listJoin(conditions)}.`, findingKeys: bestSources.map((f) => f.key) }
    : null;
  if (bestSentence) overallSummary.push(bestSentence);
  if (overallSummary.length === 0) overallSummary.push(INSUFFICIENT);

  // --- How to get the best (§206) -----------------------------------------
  const howToGetTheBest: Statement[] = [
    ...(bestSentence
      ? [{ ...bestSentence, text: bestSentence.text.replace(`${name} may`, 'This employee appears likely to') }]
      : []),
    ...findings.map((f) => st(f, PATTERNS[f.key].getTheBest)),
  ];

  // --- Management style (§207) --------------------------------------------
  const styleLinks = new Map<ManagementStyle, PatternKey[]>();
  for (const f of findings) {
    for (const s of PATTERNS[f.key].managementStyles) styleLinks.set(s, [...(styleLinks.get(s) ?? []), f.key]);
  }
  const managementStyle = [...styleLinks]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 4)
    .map(([style, findingKeys]) => ({ style, rationale: MANAGEMENT_STYLE_RATIONALE[style], findingKeys }));

  // --- Strength utilisation (§208) ----------------------------------------
  const overProcessing = has('over_processing');
  const strengthUtilisation = strengths
    .filter((f) => PATTERNS[f.key].strengthUses)
    .map((f) => {
      const c = PATTERNS[f.key];
      const caution =
        f.key === 'strength_attention_to_detail' && !overProcessing ? undefined : c.strengthCaution;
      return { strength: c.title, uses: c.strengthUses!, ...(caution ? { caution } : {}), findingKey: f.key };
    });

  // --- Role fit (§209) – neutral observations only -------------------------
  const strongPhrases = strengths.map((f) => PATTERNS[f.key].roleFitPhrase);
  const lowerPhrases = opportunities.map((f) => PATTERNS[f.key].roleFitPhrase);
  const roleObs: Statement[] = [];
  if (strongPhrases.length || lowerPhrases.length) {
    const parts = [
      strongPhrases.length ? `strong ${listJoin(strongPhrases)}` : '',
      lowerPhrases.length ? `${strongPhrases.length ? 'but ' : ''}lower performance in ${listJoin(lowerPhrases)}` : '',
    ].filter(Boolean);
    roleObs.push({ text: `The employee demonstrates ${parts.join(' ')}.`, findingKeys: [...strengths, ...opportunities].map((f) => f.key) });
    if (strongPhrases.length) {
      roleObs.push({
        text: `These characteristics may be particularly valuable in tasks requiring ${listJoin(strongPhrases)}.`,
        findingKeys: strengths.map((f) => f.key),
      });
    }
    for (const demand of input.roleDemands ?? []) {
      const related = opportunities.filter((f) => PATTERNS[f.key].roleFitPhrase === demand);
      if (related.length) {
        roleObs.push({
          text: `Where the role requires frequent ${demand}, additional coaching or clearer decision frameworks may help.`,
          findingKeys: related.map((f) => f.key),
        });
      }
    }
  }

  // --- Conversation guide (§224, §225) ------------------------------------
  const lead = opportunities.find((f) => PATTERNS[f.key].managerQuestions);
  const conversationGuide = lead
    ? {
        opener:
          PATTERNS[lead.key].conversationOpener ??
          `"I'd like to talk about one pattern from your assessment: ${lead.insight.replace(/^Employee /, 'you ').replace(/\.$/, '')}. How does that compare with how you experience your work?"`,
        questions: PATTERNS[lead.key].managerQuestions!.slice(0, 5),
        findingKey: lead.key,
      }
    : null;

  // --- Director summary (§234) --------------------------------------------
  const informs = (area: 'decisions' | 'information' | 'prioritise' | 'pressure') =>
    findings.filter((f) => PATTERNS[f.key].informs.includes(area)).map((f) => st(f, PATTERNS[f.key].whatThisTellsUs));
  const orInsufficient = (s: Statement[]) => (s.length ? s : [INSUFFICIENT]);
  const motivation = motivationInsight(input.motivation);
  const directorSummary: DirectorSummarySection[] = [
    { heading: 'Demonstrated Working Style', statements: orInsufficient(overallSummary.slice(0, styleWords.length ? 1 : 0).concat(findings.filter((f) => f.kind === 'style').map((f) => st(f, PATTERNS[f.key].whatThisTellsUs)))) },
    { heading: 'Key Strengths', statements: orInsufficient(strengths.map((f) => st(f, PATTERNS[f.key].whatThisTellsUs))) },
    { heading: 'Development Opportunities', statements: orInsufficient(opportunities.map((f) => st(f, PATTERNS[f.key].whatThisTellsUs))) },
    {
      heading: 'What Motivates Them',
      statements: motivation
        ? [{ text: `${motivation.whatThisCouldMean} Possible actions: ${motivation.businessResponse.join('; ')}.`, findingKeys: [] }]
        : [{ text: 'No motivation profile was captured for this assessment.', findingKeys: [] }],
    },
    { heading: 'How They Respond to Pressure', statements: orInsufficient(informs('pressure')) },
    { heading: 'How They Make Decisions', statements: orInsufficient(informs('decisions')) },
    { heading: 'How They Process Information', statements: orInsufficient(informs('information')) },
    { heading: 'How They Prioritise', statements: orInsufficient(informs('prioritise')) },
    {
      heading: 'What Management Should Do',
      statements: orInsufficient(managementStyle.map((m) => ({ text: `${m.style}: ${m.rationale}`, findingKeys: m.findingKeys }))),
    },
    {
      heading: 'What the Business Could Change',
      statements: orInsufficient(whatTheBusinessCouldChange.map((b) => ({ text: b.question, findingKeys: [b.findingKey] }))),
    },
    { heading: 'How to Get the Best From Them', statements: orInsufficient(howToGetTheBest.slice(0, 4)) },
    {
      heading: 'Recommended Next Actions',
      statements: orInsufficient([
        ...recommendations.map((r) => ({
          text: `${r.priorityLabel}: ${r.title} (${r.category}; impact ${r.impact}, effort ${r.effort}).`,
          findingKeys: r.linkedFindings,
        })),
        ...(conversationGuide
          ? [{ text: 'Hold a coaching conversation using the suggested opener and questions.', findingKeys: [conversationGuide.findingKey] }]
          : []),
      ]),
    },
  ];

  // --- Monitoring (§235) & employee-facing (§233) -------------------------
  const monitorAtNextReview = [...new Set([...opportunities, ...strengths].map((f) => PATTERNS[f.key].monitor))].slice(0, 5);
  const employeeFacing: EmployeeFacingSummary = {
    paragraphs: [
      ...new Set(
        [
          ...strengths.slice(0, 3).map((f) => PATTERNS[f.key].employeeFacing),
          ...opportunities.slice(0, 2).map((f) => PATTERNS[f.key].employeeFacing),
          ...findings
            .filter((f) => f.key === 'efficient_under_pressure' || f.key === 'needs_defined_priorities')
            .map((f) => PATTERNS[f.key].employeeFacing),
        ].filter((p): p is string => Boolean(p)),
      ),
    ],
  };

  const report: InsightReport = {
    interpretationVersion: rules.version,
    generatedAt: (input.now ?? new Date()).toISOString(),
    employeeId: input.employee.id,
    assessmentId: input.assessmentId,
    fourQuestions: {
      whatThisTellsUs: whatThisTellsUs.length ? whatThisTellsUs : [INSUFFICIENT],
      howTheBusinessCanSupport: recommendations,
      whatTheBusinessCouldChange,
      overallSummary,
    },
    findings,
    notConcluded,
    howToGetTheBest,
    managementStyle,
    strengthUtilisation,
    roleFit: {
      observations: roleObs,
      note: 'Neutral observations about how demonstrated strengths align with role demands. They are not a judgement of fit for any role and must not be used on their own for employment decisions.',
    },
    motivation,
    conversationGuide,
    recommendations,
    directorSummary,
    monitorAtNextReview,
    employeeFacing,
  };
  assertSafeLanguage(report, [name]);
  return report;
}
