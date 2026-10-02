/**
 * Management content for each pattern (Insight §204–§225).
 *
 * Wording rules: no pronouns are inferred (sentences use the employee's name
 * or neutral phrasing); no medical or "learning style" claims; no
 * dismissal/demotion/promotion advice; responsibility is not assumed to sit
 * with the employee – each development pattern considers individual,
 * management/clarity and business-process explanations (§228).
 */
import type {
  Attribution,
  ManagementStyle,
  MotivatorKey,
  PatternKey,
  Recommendation,
} from './types.js';

// ---------------------------------------------------------------------------
// Recommendation catalogue (§204, §205, §229, §231)
// ---------------------------------------------------------------------------
const rec = (r: Recommendation) => r;

export const RECOMMENDATIONS = {
  completion_criteria: rec({
    id: 'completion_criteria',
    title: 'Clear completion criteria',
    category: 'Process Change',
    target: 'business',
    detail: 'Define when recurring tasks are considered complete.',
    example: 'Instead of "Check this carefully", use "Verify A, B and C. If all three agree, complete the task and move on."',
    impact: 'High',
    effort: 'Low',
  }),
  time_boundaries: rec({
    id: 'time_boundaries',
    title: 'Time boundaries for lower-risk work',
    category: 'Management Style',
    target: 'management',
    detail: 'Use reasonable time limits for lower-risk recurring activities.',
    example: 'Prospect research: maximum 10 minutes before making contact.',
    impact: 'High',
    effort: 'Low',
  }),
  priority_principles: rec({
    id: 'priority_principles',
    title: 'Clear priority principles',
    category: 'Work Prioritisation',
    target: 'management',
    detail: 'Where several competing tasks exist, define priority principles rather than giving individual instructions each time.',
    example: '1. Customer impact  2. Commercial value  3. Deadline  4. Internal administration',
    impact: 'High',
    effort: 'Low',
  }),
  decision_authority: rec({
    id: 'decision_authority',
    title: 'Define decision authority',
    category: 'Decision Authority',
    target: 'management',
    detail: 'State clearly which decisions the employee can make independently, with examples. This can reduce unnecessary approval-seeking.',
    impact: 'High',
    effort: 'Low',
  }),
  materiality_thresholds: rec({
    id: 'materiality_thresholds',
    title: 'Risk / materiality thresholds',
    category: 'Process Change',
    target: 'business',
    detail: 'Agree thresholds that separate work needing careful checking from work where speed matters more.',
    impact: 'Medium',
    effort: 'Medium',
  }),
  critical_checklists: rec({
    id: 'critical_checklists',
    title: 'Short checklists for critical tasks',
    category: 'Tools / Automation',
    target: 'business',
    detail: 'Use short completion checklists on high-risk tasks and flag which tasks need additional checking.',
    impact: 'High',
    effort: 'Low',
  }),
  pause_before_submit: rec({
    id: 'pause_before_submit',
    title: 'Brief pause before final submission',
    category: 'Coaching',
    target: 'employee',
    detail: 'Coach a brief confirmation step before submitting multi-stage or high-risk work.',
    impact: 'Medium',
    effort: 'Low',
  }),
  review_speed_need: rec({
    id: 'review_speed_need',
    title: 'Confirm whether more speed is needed',
    category: 'Role Clarity',
    target: 'management',
    detail: 'Determine whether additional speed is actually necessary for the role. Where it is, introduce gradual time targets.',
    impact: 'Medium',
    effort: 'Low',
  }),
  streamline_process: rec({
    id: 'streamline_process',
    title: 'Streamline the process',
    category: 'Process Change',
    target: 'business',
    detail: 'Remove unnecessary steps from the employee\'s regular workflows.',
    impact: 'Medium',
    effort: 'Medium',
  }),
  autonomy_ownership: rec({
    id: 'autonomy_ownership',
    title: 'Autonomy and outcome ownership',
    category: 'Development Opportunity',
    target: 'management',
    detail: 'Provide autonomy and ownership of outcomes, involve the employee in improvement projects and avoid unnecessary micromanagement – while keeping initiative aligned with agreed priorities and authority.',
    impact: 'High',
    effort: 'Low',
  }),
  coach_through_decisions: rec({
    id: 'coach_through_decisions',
    title: 'Coach through decisions',
    category: 'Coaching',
    target: 'management',
    detail: 'When asked for approval, coach through the decision rather than simply answering it.',
    impact: 'Medium',
    effort: 'Medium',
  }),
  shorter_written_instructions: rec({
    id: 'shorter_written_instructions',
    title: 'Concise written instructions and follow-up',
    category: 'Management Style',
    target: 'management',
    detail: 'Use concise written instructions, bullet points, confirmation of key actions, standard checklists, CRM notes and structured follow-up.',
    impact: 'Medium',
    effort: 'Low',
  }),
  reduce_information_load: rec({
    id: 'reduce_information_load',
    title: 'Reduce information overload',
    category: 'Process Change',
    target: 'business',
    detail: 'Review whether procedures present more information at once than is needed; use standard operating checklists.',
    impact: 'Medium',
    effort: 'Medium',
  }),
  visual_workflows: rec({
    id: 'visual_workflows',
    title: 'Visual workflows and dashboards',
    category: 'Tools / Automation',
    target: 'business',
    detail: 'Use visual workflows, diagrams, dashboards, worked examples and colour-coded priorities.',
    impact: 'Medium',
    effort: 'Medium',
  }),
  clear_worded_outcomes: rec({
    id: 'clear_worded_outcomes',
    title: 'Concise written explanations and conversation',
    category: 'Management Style',
    target: 'management',
    detail: 'Explain work through concise written explanations, conversation and clearly worded outcomes.',
    impact: 'Medium',
    effort: 'Low',
  }),
  work_blocks: rec({
    id: 'work_blocks',
    title: 'Structure work into defined blocks',
    category: 'Work Prioritisation',
    target: 'management',
    detail: 'Break complex work into defined blocks, alternate activity types, avoid very long uninterrupted administrative tasks and schedule important work earlier where practical.',
    impact: 'Medium',
    effort: 'Low',
  }),
  outcome_targets: rec({
    id: 'outcome_targets',
    title: 'Communicate outcomes, not activity counts',
    category: 'Management Style',
    target: 'management',
    detail: 'Ask "what result are we trying to achieve?", set shorter outcome-based targets, measure outcomes alongside activity, and give examples of discretionary next actions.',
    impact: 'High',
    effort: 'Low',
  }),
  what_else_coaching: rec({
    id: 'what_else_coaching',
    title: '"What else can I do?" coaching',
    category: 'Coaching',
    target: 'employee',
    detail: 'Coach "what else can I do?" thinking toward unresolved targets and recognise initiative when shown.',
    impact: 'Medium',
    effort: 'Medium',
  }),
  commercial_training: rec({
    id: 'commercial_training',
    title: 'Commercial awareness training',
    category: 'Commercial Education',
    target: 'employee',
    detail: 'Build understanding of sales, gross profit, margin, overhead, cash, customer retention, stock cost and the consequences of missed targets. The aim is understanding, not punishment.',
    impact: 'High',
    effort: 'Medium',
  }),
  sales_priorities: rec({
    id: 'sales_priorities',
    title: 'Reinforce opportunity progression as the primary objective',
    category: 'Work Prioritisation',
    target: 'management',
    detail: 'Review sales priorities and reinforce customer contact / opportunity progression ahead of routine administration.',
    impact: 'High',
    effort: 'Low',
  }),
  pressure_support: rec({
    id: 'pressure_support',
    title: 'Realistic deadlines for quality-critical work',
    category: 'Management Style',
    target: 'management',
    detail: 'Where accuracy matters, avoid unnecessarily tight deadlines; build in a short checking step on time-critical work.',
    impact: 'Medium',
    effort: 'Low',
  }),
  use_strengths: rec({
    id: 'use_strengths',
    title: 'Deploy demonstrated strengths deliberately',
    category: 'Development Opportunity',
    target: 'management',
    detail: 'Give the employee work that uses their demonstrated strengths (see Strength Utilisation).',
    impact: 'Medium',
    effort: 'Low',
  }),
} satisfies Record<string, Recommendation>;

export type RecommendationId = keyof typeof RECOMMENDATIONS;

// ---------------------------------------------------------------------------
// Management styles (§207)
// ---------------------------------------------------------------------------
export const MANAGEMENT_STYLE_RATIONALE: Record<ManagementStyle, string> = {
  'Give Clear Outcomes': 'Useful for employees who become task-focused when instructions are overly prescriptive.',
  'Provide Time Boundaries': 'Useful where additional time is frequently spent without improving outcomes.',
  'Increase Autonomy': 'Useful where judgement is strong but approval is sought unnecessarily.',
  'Provide More Structure': 'Useful where prioritisation decreases when multiple competing demands are presented.',
  'Use Shorter Instructions': 'Useful where multi-stage instruction retention is comparatively weaker.',
  'Use Written Follow-Up': 'Useful where verbal or short-term retention requires reinforcement.',
  'Set Commercial Context': 'Useful where tasks are completed correctly but commercial prioritisation is weaker.',
  'Use Regular Check-ins': 'Useful for employees who benefit from shorter feedback cycles.',
  'Allow Independent Problem Solving': 'Useful where initiative and decision quality are strong.',
};

// ---------------------------------------------------------------------------
// Pattern content
// ---------------------------------------------------------------------------
export interface PatternContent {
  title: string;
  /** Director summary section(s) this pattern informs (§234). */
  informs: ('decisions' | 'information' | 'prioritise' | 'pressure' | 'style')[];
  /** Third-person sentence for the narrative; {name} is replaced. */
  summarySentence: string;
  whatThisTellsUs: string;
  /** Explanations FocusiQ must not choose between (e.g. §218). */
  possibleReasons?: string[];
  /** §228 – individual, management/clarity and process explanations. */
  attribution?: Partial<Record<Attribution, string>>;
  /** The §205 question for development/style patterns. */
  businessQuestion?: string;
  recommendations: RecommendationId[];
  managementStyles: ManagementStyle[];
  /** §206 */
  getTheBest: string;
  /** Short condition used in "may perform best when given …". */
  bestCondition?: string;
  /** §224 */
  conversationOpener?: string;
  /** §225 – 3–5 questions. */
  managerQuestions?: string[];
  /** §233 – constructive wording for the employee; null = not shown to the employee. */
  employeeFacing: string | null;
  /** §208 – where to use the strength, and a balancing caution. */
  strengthUses?: string[];
  strengthCaution?: string;
  /** Short phrase used in role-fit observations (§209). */
  roleFitPhrase: string;
  /** §235 – what to monitor at the next review. */
  monitor: string;
  /** Style word for the "demonstrated working style" sentence. */
  styleWords?: string[];
}

export const PATTERNS: Record<PatternKey, PatternContent> = {
  over_processing: {
    title: 'Over-Processing Profile',
    informs: ['decisions', 'style'],
    summarySentence:
      '{name} generally reached appropriate decisions but showed a tendency to continue checking after reaching the correct answer, particularly on lower-risk work.',
    whatThisTellsUs:
      'The employee appears conscientious and accuracy-focused but may spend disproportionate time seeking further certainty after a correct decision has already been reached.',
    attribution: {
      'Individual Behaviour': 'A preference for additional certainty before committing – may benefit from coaching on proportionate checking.',
      'Management / Clarity': 'Expectations about when a task is complete, and what can be decided independently, may be unclear.',
      'Business Process': 'If procedures do not define what constitutes completion, employees may reasonably continue checking.',
    },
    businessQuestion: 'Could the business make it clearer when lower-risk work is complete?',
    recommendations: ['completion_criteria', 'time_boundaries', 'materiality_thresholds', 'decision_authority'],
    managementStyles: ['Provide Time Boundaries', 'Give Clear Outcomes'],
    getTheBest:
      'Use this careful approach on important, higher-risk work, while helping the employee distinguish it from lower-value work where speed matters more. Feedback should cover both quality and efficiency rather than simply asking them to "work faster".',
    bestCondition: 'defined boundaries around when lower-risk work is considered complete',
    conversationOpener:
      '"Your assessment shows that your first decision was often accurate, but you sometimes spent additional time checking before committing. I\'d like to understand whether you feel you need more certainty, clearer authority or clearer expectations about when a task is complete."',
    managerQuestions: [
      'What makes you feel a task is finished?',
      "Are there areas where you're unsure what authority you have?",
      'Which tasks do you feel require the most checking?',
      'Would clearer time expectations help?',
      'Are there processes that feel unnecessarily complicated?',
    ],
    employeeFacing: 'One opportunity is to build confidence in completing lower-risk decisions once the required checks have been made.',
    roleFitPhrase: 'careful checking',
    monitor: 'Time spent on lower-risk tasks after the required standard is met.',
    styleWords: ['careful', 'methodical'],
  },
  rushing: {
    title: 'Rushing Profile',
    informs: ['decisions', 'information', 'style'],
    summarySentence:
      '{name} acted quickly and decisively, with reduced accuracy on multi-stage instructions where not all the information had yet been processed.',
    whatThisTellsUs:
      'The employee appears comfortable acting quickly but may occasionally act before fully processing all available information.',
    attribution: {
      'Individual Behaviour': 'A natural preference for pace – may benefit from a brief confirmation step on critical work.',
      'Management / Clarity': 'It may be unclear which tasks need extra care and which reward speed.',
      'Business Process': 'Multi-stage instructions may be delivered in a format that is easy to skim.',
    },
    businessQuestion: 'Could high-risk tasks be flagged more clearly so proportionate checking happens at the right points?',
    recommendations: ['critical_checklists', 'pause_before_submit', 'shorter_written_instructions'],
    managementStyles: ['Use Shorter Instructions', 'Use Regular Check-ins'],
    getTheBest:
      'Their speed and willingness to act can be valuable in fast-moving situations. The objective is to preserve this strength while introducing proportionate checking at higher-risk points.',
    bestCondition: 'short checklists at higher-risk points',
    conversationOpener:
      '"Your assessment shows you are comfortable making decisions quickly, which is valuable. On some multi-step tasks a detail was missed. Which of your tasks do you think would benefit from a quick final check?"',
    managerQuestions: [
      'Which tasks do you feel need the most care?',
      'Are instructions usually clear about which steps are critical?',
      'Would a short checklist help on certain tasks?',
      'When do you feel under pressure to move quickly?',
    ],
    employeeFacing: 'Your speed and willingness to act are strengths; a brief final check on multi-step tasks could make them even more effective.',
    roleFitPhrase: 'rapid action',
    monitor: 'Accuracy on multi-stage and high-risk tasks.',
    styleWords: ['quick', 'decisive'],
  },
  slow_but_controlled: {
    title: 'Slow but Controlled Profile',
    informs: ['decisions', 'style'],
    summarySentence:
      '{name} worked at a measured pace – longer than most colleagues – with high accuracy and stable decisions.',
    whatThisTellsUs:
      'Processing took longer than the comparison group, but accuracy was high and decisions were stable. This is not automatically over-processing.',
    attribution: {
      'Individual Behaviour': 'A measured, controlled working style.',
      'Management / Clarity': 'It may not be defined whether more speed is required in the role.',
      'Business Process': 'Workflows may contain steps that add time without adding value.',
    },
    businessQuestion: 'Is additional speed actually necessary for this role?',
    recommendations: ['review_speed_need', 'streamline_process'],
    managementStyles: ['Give Clear Outcomes'],
    getTheBest:
      'Value the accuracy and stability this brings. Where more speed is genuinely needed, introduce gradual time targets and remove unnecessary steps rather than simply asking for faster work.',
    bestCondition: 'clear expectations about the pace the role requires',
    conversationOpener:
      '"Your results were accurate and consistent. I\'d like to talk about which parts of your role need more pace and whether anything in our processes slows you down."',
    managerQuestions: [
      'Which tasks take longer than you would like?',
      'Are there steps in your work that feel unnecessary?',
      'Would time targets on some tasks be helpful or unhelpful?',
    ],
    employeeFacing: 'You worked accurately and consistently; we will look together at where pace matters most in your role.',
    roleFitPhrase: 'measured, controlled work',
    monitor: 'Whether pace meets the role\'s actual needs without loss of accuracy.',
    styleWords: ['measured', 'controlled'],
  },
  high_initiative: {
    title: 'High Initiative Profile',
    informs: ['decisions', 'style'],
    summarySentence: '{name} frequently identified relevant next actions without being directed.',
    whatThisTellsUs: 'The employee frequently identifies relevant next actions without being explicitly directed.',
    recommendations: ['autonomy_ownership'],
    managementStyles: ['Allow Independent Problem Solving', 'Increase Autonomy'],
    getTheBest:
      'Provide autonomy and outcome ownership, involve them in improvement projects and avoid unnecessary micromanagement. Ensure initiative stays aligned with agreed priorities and authority.',
    bestCondition: 'appropriate autonomy',
    employeeFacing: 'You regularly identified useful next steps without needing to be asked.',
    strengthUses: ['improvement projects', 'resolving open customer issues', 'new processes needing an owner'],
    strengthCaution: 'Ensure initiative remains aligned with agreed priorities and decision authority.',
    roleFitPhrase: 'initiative',
    monitor: 'Alignment of self-directed actions with agreed priorities.',
    styleWords: ['proactive'],
  },
  high_escalation: {
    title: 'High Escalation Profile',
    informs: ['decisions'],
    summarySentence: '{name} frequently sought additional approval before acting, including on decisions that could be made independently.',
    whatThisTellsUs: 'The employee frequently seeks additional approval before acting. FocusiQ does not assume which reason applies.',
    possibleReasons: ['unclear authority', 'low decision confidence', 'previous management culture', 'genuine risk sensitivity'],
    attribution: {
      'Individual Behaviour': 'Decision confidence may benefit from coaching.',
      'Management / Clarity': 'Decision boundaries may not be clearly defined.',
      'Business Process': 'Escalation routes may require approval more often than necessary.',
    },
    businessQuestion: 'Is it clear which decisions can be made without approval?',
    recommendations: ['decision_authority', 'coach_through_decisions'],
    managementStyles: ['Increase Autonomy', 'Use Regular Check-ins'],
    getTheBest:
      'Define decision boundaries with examples of what can be decided independently, and coach through decisions rather than simply answering them.',
    bestCondition: 'clearly defined decision authority',
    conversationOpener:
      '"In several scenarios you chose to check with someone before acting. I\'d like to understand what would help you feel able to make those decisions yourself."',
    managerQuestions: [
      'Which decisions do you feel you can make on your own today?',
      'Where are you unsure what authority you have?',
      'What would make you more confident deciding without approval?',
      'Has checking first been expected in previous roles or teams?',
    ],
    employeeFacing: 'We will clarify which decisions you can make independently, so you can act with confidence.',
    roleFitPhrase: 'independent decision-making',
    monitor: 'Approval requests on decisions within agreed authority.',
  },
  efficient_under_pressure: {
    title: 'Pressure Response – efficient under time boundaries',
    informs: ['pressure'],
    summarySentence:
      'Under timed conditions {name} worked significantly faster while maintaining comparable accuracy, suggesting that clear deadlines and completion criteria may support efficient working.',
    whatThisTellsUs: 'Clear deadlines appear to increase decision efficiency without materially reducing quality.',
    recommendations: ['time_boundaries'],
    managementStyles: ['Provide Time Boundaries'],
    getTheBest: 'Sensible time boundaries may help complete lower-risk work more efficiently.',
    bestCondition: 'sensible time boundaries',
    employeeFacing: 'You worked efficiently and accurately when there was a clear time frame.',
    roleFitPhrase: 'working to deadlines',
    monitor: 'Turnaround on lower-risk work with agreed time boundaries.',
  },
  quality_drops_under_pressure: {
    title: 'Pressure Response – accuracy reduces under time pressure',
    informs: ['pressure'],
    summarySentence: 'Under timed conditions {name}\'s accuracy reduced noticeably.',
    whatThisTellsUs: 'Accuracy reduces noticeably under time constraint; quality-critical work may benefit from realistic deadlines.',
    attribution: {
      'Individual Behaviour': 'May benefit from coaching on prioritising critical checks when time is short.',
      'Management / Clarity': 'Deadlines may be set tighter than the task requires.',
      'Business Process': 'Time-critical work may lack a quick checking step.',
    },
    businessQuestion: 'Are deadlines on quality-critical work realistic?',
    recommendations: ['pressure_support', 'critical_checklists'],
    managementStyles: ['Use Regular Check-ins'],
    getTheBest: 'Give realistic deadlines on quality-critical work and build in a brief checking step where time is tight.',
    bestCondition: 'realistic deadlines on quality-critical work',
    managerQuestions: [
      'Which deadlines feel hardest to meet without compromising quality?',
      'What helps you stay accurate when time is short?',
      'Are there tasks where the deadline could reasonably be extended?',
    ],
    employeeFacing: 'You were most accurate when there was enough time to complete the task properly.',
    roleFitPhrase: 'accuracy under time pressure',
    monitor: 'Accuracy on time-critical tasks.',
  },
  needs_defined_priorities: {
    title: 'Prioritisation – stronger with defined priorities',
    informs: ['prioritise'],
    summarySentence:
      '{name} performed more strongly when priorities were clearly defined than when several competing tasks required independent prioritisation.',
    whatThisTellsUs:
      'Performance was stronger when priorities were clearly defined than when several competing tasks required independent prioritisation.',
    attribution: {
      'Individual Behaviour': 'Independent prioritisation may benefit from coaching.',
      'Management / Clarity': 'Priority principles may not be clearly communicated.',
      'Business Process': 'Competing demands may arrive without an agreed order of importance.',
    },
    businessQuestion: 'Does the team have agreed principles for ordering competing work?',
    recommendations: ['priority_principles'],
    managementStyles: ['Provide More Structure'],
    getTheBest: 'Provide priority principles so competing work can be ordered consistently without waiting for instructions.',
    bestCondition: 'clear priorities',
    managerQuestions: [
      'When several things land at once, how do you decide what comes first?',
      'Which priorities feel unclear?',
      'Would a simple priority order help?',
    ],
    employeeFacing: 'You performed particularly well when priorities were clear.',
    roleFitPhrase: 'independent prioritisation of competing tasks',
    monitor: 'Handling of competing priorities once principles are agreed.',
  },
  retention_support: {
    title: 'Information Retention Support',
    informs: ['information'],
    summarySentence: '{name} may benefit from key information being reinforced in writing.',
    whatThisTellsUs: 'Retention of multi-step or detailed information appears to benefit from reinforcement.',
    attribution: {
      'Individual Behaviour': 'May benefit from structured note-taking and confirmation of key actions.',
      'Management / Clarity': 'Instructions may be given verbally or all at once.',
      'Business Process': 'Procedures may present more information at once than is needed.',
    },
    businessQuestion: 'Could instructions be shorter, written down and confirmed?',
    recommendations: ['shorter_written_instructions', 'reduce_information_load'],
    managementStyles: ['Use Written Follow-Up', 'Use Shorter Instructions'],
    getTheBest: 'Give concise written instructions with bullet points and confirm key actions; use checklists, CRM notes and structured follow-up.',
    bestCondition: 'concise written instructions',
    managerQuestions: [
      'How do you prefer to receive instructions?',
      'Which information do you find hardest to keep track of?',
      'Would written follow-ups after conversations help?',
    ],
    employeeFacing: 'Written notes and checklists may help you keep track of detailed instructions.',
    roleFitPhrase: 'retaining multi-step information',
    monitor: 'Follow-through on multi-step instructions with written support in place.',
  },
  visual_processing: {
    title: 'Strong Visual Processing',
    informs: ['information'],
    summarySentence: '{name} handled image and pattern information particularly effectively.',
    whatThisTellsUs: 'The employee may process visual information particularly effectively. This is an observed preference, not a permanent learning-style diagnosis.',
    recommendations: ['visual_workflows'],
    managementStyles: [],
    getTheBest: 'Use visual workflows, diagrams, dashboards, examples and colour-coded priorities where practical.',
    bestCondition: 'visual examples and workflows',
    employeeFacing: 'You worked particularly well with visual information such as diagrams and patterns.',
    strengthUses: ['dashboard and report review', 'visual stock or layout checks', 'process mapping'],
    roleFitPhrase: 'visual information',
    monitor: 'Whether visual workflows improve speed or accuracy.',
  },
  verbal_processing: {
    title: 'Strong Verbal Processing',
    informs: ['information'],
    summarySentence: '{name} worked particularly effectively with words and scenarios.',
    whatThisTellsUs: 'Word and scenario exercises were significantly stronger than visual or numerical tasks. This is an observed preference, not a fixed learning style.',
    recommendations: ['clear_worded_outcomes'],
    managementStyles: [],
    getTheBest: 'Use concise written explanations, conversation and clearly worded outcomes.',
    bestCondition: 'clearly worded outcomes',
    employeeFacing: 'You worked particularly well with written and scenario-based information.',
    strengthUses: ['customer correspondence', 'writing procedures', 'handling complex customer conversations'],
    roleFitPhrase: 'written and verbal information',
    monitor: 'Effectiveness when work is explained in clear written terms.',
  },
  sustained_attention: {
    title: 'Sustained Attention',
    informs: ['information'],
    summarySentence: '{name}\'s accuracy reduced during the later part of the assessment.',
    whatThisTellsUs:
      'Performance dropped noticeably during the later part of the assessment. No medical or personal explanation should be inferred.',
    attribution: {
      'Individual Behaviour': 'May benefit from structuring work into blocks.',
      'Management / Clarity': 'Important work may be scheduled late in long sessions.',
      'Business Process': 'Some roles may involve long uninterrupted administrative tasks.',
    },
    businessQuestion: 'Could long uninterrupted tasks be broken up or re-sequenced?',
    recommendations: ['work_blocks'],
    managementStyles: ['Use Regular Check-ins'],
    getTheBest: 'Break complex work into defined blocks, alternate activity types and schedule important work earlier where practical.',
    bestCondition: 'work structured into defined blocks',
    managerQuestions: [
      'When in the day do you do your best work?',
      'Are there long tasks that feel hard to sustain?',
      'Would alternating types of work help?',
    ],
    employeeFacing: 'Breaking longer tasks into blocks may help you keep your strongest performance throughout.',
    roleFitPhrase: 'long uninterrupted tasks',
    monitor: 'Accuracy across longer work sessions.',
  },
  task_orientation: {
    title: 'Task Orientation',
    informs: ['style', 'prioritise'],
    summarySentence:
      '{name} consistently completed assigned activities but was less likely to change approach when the desired result had not yet been achieved – a stronger task-completion orientation than outcome ownership.',
    whatThisTellsUs:
      'In several scenarios the employee chose completion of planned activity over additional action toward an unresolved target. This may indicate a stronger task-completion orientation than outcome ownership – it is not evidence of a lack of motivation.',
    attribution: {
      'Individual Behaviour': 'May benefit from coaching "what else can I do?" thinking.',
      'Management / Clarity': 'Targets may be expressed as activities rather than results.',
      'Business Process': 'Performance measures may reward activity counts over outcomes.',
    },
    businessQuestion: 'Are targets and measures framed around outcomes or activity?',
    recommendations: ['outcome_targets', 'what_else_coaching'],
    managementStyles: ['Give Clear Outcomes', 'Set Commercial Context'],
    getTheBest:
      'Communicate the result being sought rather than an activity count, give clearer ownership of results and recognise initiative when it is shown.',
    bestCondition: 'clear objectives and ownership of the result',
    conversationOpener:
      '"In some scenarios you completed the planned work, but the target was still open. I\'d like to talk about what result we\'re really aiming for and what else might move it forward."',
    managerQuestions: [
      'What result do you think this work is trying to achieve?',
      'When a task is done but the target is not, what usually happens next?',
      'Are your targets described as activities or results?',
      'What would help you feel ownership of the outcome?',
    ],
    employeeFacing: 'Thinking about the end result, and what else could move it forward, is a development opportunity.',
    roleFitPhrase: 'outcome ownership',
    monitor: 'Actions taken toward unresolved targets.',
  },
  outcome_orientation: {
    title: 'Outcome Orientation',
    informs: ['style'],
    summarySentence: '{name} consistently pursued the intended result rather than stopping at the planned activity.',
    whatThisTellsUs: 'The employee consistently pursued the intended result rather than stopping at the planned activity.',
    recommendations: ['autonomy_ownership'],
    managementStyles: ['Give Clear Outcomes'],
    getTheBest: 'Give ownership of results rather than a long checklist of individual activities.',
    bestCondition: 'ownership of the result',
    employeeFacing: 'You consistently focused on achieving the end result.',
    strengthUses: ['owning customer issues to resolution', 'target-bearing work', 'projects with a clear outcome'],
    roleFitPhrase: 'outcome ownership',
    monitor: 'Continued outcome focus as responsibility grows.',
    styleWords: ['outcome-focused'],
  },
  commercial_understanding: {
    title: 'Commercial Understanding',
    informs: ['prioritise'],
    summarySentence:
      '{name} demonstrated good task accuracy but a weaker understanding of how missed sales, margin and delays translate into business performance.',
    whatThisTellsUs:
      'Good task accuracy, but a weaker understanding of how missed sales, margin and delays translate into business performance.',
    attribution: {
      'Individual Behaviour': 'Commercial knowledge may need developing.',
      'Management / Clarity': 'The commercial context of tasks may not be explained.',
      'Business Process': 'Commercial information (margin, stock cost) may not be visible in day-to-day work.',
    },
    businessQuestion: 'Is the commercial impact of everyday work visible to the team?',
    recommendations: ['commercial_training'],
    managementStyles: ['Set Commercial Context'],
    getTheBest: 'Explain the commercial "why" behind tasks; the aim is understanding rather than punishment.',
    bestCondition: 'commercial context for their work',
    managerQuestions: [
      'How do you think this task affects margin or customer retention?',
      'What commercial information would help you prioritise?',
      'Would a short session on how the business makes money be useful?',
    ],
    employeeFacing: 'Learning more about how everyday decisions affect sales, margin and cash is a development opportunity.',
    roleFitPhrase: 'rapid commercial prioritisation',
    monitor: 'Commercial reasoning in prioritisation decisions.',
  },
  routine_over_opportunity: {
    title: 'Routine Activity over Live Opportunity',
    informs: ['prioritise'],
    summarySentence: '{name} tended to prioritise routine administration above live commercial opportunities.',
    whatThisTellsUs: 'Routine administration was prioritised above live commercial opportunities in several scenarios.',
    attribution: {
      'Individual Behaviour': 'May benefit from coaching on opportunity-first prioritisation.',
      'Management / Clarity': 'The relative priority of admin and opportunities may not be explicit.',
      'Business Process': 'Administrative requirements (e.g. CRM completeness) may be measured more visibly than opportunity progression.',
    },
    businessQuestion: 'Do current measures signal that live opportunities come first?',
    recommendations: ['sales_priorities', 'priority_principles'],
    managementStyles: ['Set Commercial Context', 'Provide More Structure'],
    getTheBest: 'Reinforce customer contact and opportunity progression as the primary objective, with admin scheduled around it.',
    bestCondition: 'clear commercial priorities',
    managerQuestions: [
      'When admin and a live opportunity compete, which do you choose and why?',
      'Which admin tasks feel most urgent, and who asks for them?',
      'What would make it easier to prioritise opportunities?',
    ],
    employeeFacing: 'Prioritising live customer opportunities ahead of routine admin is a development opportunity.',
    roleFitPhrase: 'commercial prioritisation',
    monitor: 'Opportunity progression relative to routine activity.',
  },
  strength_attention_to_detail: {
    title: 'Strong Attention to Detail',
    informs: ['decisions', 'information'],
    summarySentence: '{name} showed strong attention to detail on important, higher-risk work.',
    whatThisTellsUs: 'The employee shows strong attention to detail on important, higher-risk work.',
    recommendations: ['use_strengths'],
    managementStyles: [],
    getTheBest: 'Where accuracy is important, this careful approach is an advantage.',
    employeeFacing: 'You demonstrated strong accuracy on important, detailed work.',
    strengthUses: ['checking important quotations', 'reviewing customer data', 'financial or stock-related accuracy', 'quality control'],
    strengthCaution:
      'Avoid making this employee the default checker of every low-risk task, as this may reinforce over-processing behaviour.',
    roleFitPhrase: 'accuracy and detail recognition',
    monitor: 'Use of attention to detail on genuinely high-value checks.',
    styleWords: ['accurate'],
  },
  strength_information_retention: {
    title: 'Strong Information Retention',
    informs: ['information'],
    summarySentence: '{name} absorbed information well and retained key details throughout the assessment.',
    whatThisTellsUs: 'The employee demonstrates strong information retention and generally understands instructions accurately first time.',
    recommendations: ['use_strengths'],
    managementStyles: [],
    getTheBest: 'Can be trusted with multi-step instructions and detailed handovers.',
    employeeFacing: 'You demonstrated strong information retention.',
    strengthUses: ['complex handovers', 'multi-step customer orders', 'learning new systems and passing knowledge on'],
    roleFitPhrase: 'memory',
    monitor: 'Opportunities to share knowledge with colleagues.',
  },
  strength_decision_quality: {
    title: 'Strong Decision Quality',
    informs: ['decisions'],
    summarySentence: '{name} generally reached the correct decision first time.',
    whatThisTellsUs: 'The employee generally reaches the correct decision first time.',
    recommendations: ['use_strengths'],
    managementStyles: ['Allow Independent Problem Solving'],
    getTheBest: 'Their first judgement is usually sound; trust it on routine decisions.',
    employeeFacing: 'Your first decision was usually the right one.',
    strengthUses: ['first-line decisions on routine queries', 'triage of incoming work'],
    roleFitPhrase: 'sound first-time judgement',
    monitor: 'Confidence in acting on first judgement.',
  },
  strength_customer_ownership: {
    title: 'Customer Ownership',
    informs: ['style'],
    summarySentence: '{name} demonstrated good ownership of customer outcomes and responded strongly to scenarios involving responsibility and customer impact.',
    whatThisTellsUs: 'The employee responded particularly strongly to scenarios involving responsibility and customer impact.',
    recommendations: ['use_strengths'],
    managementStyles: ['Give Clear Outcomes'],
    getTheBest: 'Connect work to its customer impact and give responsibility for customer outcomes.',
    bestCondition: 'responsibility for customer outcomes',
    employeeFacing: 'You demonstrated strong customer judgement and ownership of customer outcomes.',
    strengthUses: ['key customer accounts', 'complaint resolution', 'customer-facing improvement work'],
    roleFitPhrase: 'customer ownership',
    monitor: 'Customer outcomes on accounts they own.',
  },
};

// ---------------------------------------------------------------------------
// Motivation (§210) – no motivator is described as superior
// ---------------------------------------------------------------------------
export const MOTIVATORS: Record<MotivatorKey, { label: string; actions: string[] }> = {
  progression: {
    label: 'Progression',
    actions: ['establish progression milestones', 'increase responsibility where appropriate'],
  },
  recognition: {
    label: 'Recognition',
    actions: ['recognise successful outcomes', 'give visible ownership of projects'],
  },
  autonomy: {
    label: 'Autonomy',
    actions: ['agree outcomes and leave the method to them', 'reduce unnecessary approval steps'],
  },
  financial_reward: {
    label: 'Financial reward',
    actions: ['transparent bonus opportunities', 'measurable performance goals', 'visible reward thresholds'],
  },
  security: {
    label: 'Security',
    actions: ['clear expectations and consistent communication', 'early notice of changes'],
  },
  mastery: {
    label: 'Mastery',
    actions: ['training and skill-development opportunities', 'complex problems that stretch their expertise'],
  },
  team: {
    label: 'Team belonging',
    actions: ['collaborative projects', 'team-based goals and recognition'],
  },
  customer_impact: {
    label: 'Customer impact',
    actions: ['share customer feedback and outcomes', 'connect tasks to their effect on customers'],
  },
};
