/**
 * Organisation-level insight (Insight §226–§228).
 *
 * When many people show the same pattern, it may be a business process issue
 * rather than several individual problems. Groups below the minimum size are
 * never reported, so individuals cannot be identified from aggregate output.
 */
import { assertCanViewDirectorComparisons } from '../benchmarking/audit.js';
import type { Actor } from '../benchmarking/types.js';
import { assertSafeLanguage } from './language.js';
import { PATTERNS, RECOMMENDATIONS } from './library.js';
import { isOpportunity } from './report.js';
import { DEFAULT_RULES, type InsightRules } from './rules.js';
import type { Finding, PatternKey, Recommendation } from './types.js';

/** Group-level wording and response per pattern. */
export const ORGANISATION_CONTENT: Partial<Record<PatternKey, { observed: string; response: string }>> = {
  high_escalation: {
    observed: 'demonstrated uncertainty around escalation decisions',
    response: 'Clarify escalation authority across the group.',
  },
  routine_over_opportunity: {
    observed: 'prioritised routine activity above live commercial opportunities in at least two scenarios',
    response: 'Review priorities and reinforce customer contact / opportunity progression as the primary objective.',
  },
  over_processing: {
    observed: 'continued checking lower-risk work after already reaching the correct answer',
    response: 'Introduce agreed completion criteria and materiality thresholds for lower-risk work.',
  },
  needs_defined_priorities: {
    observed: 'performed less well when competing priorities had to be ordered independently',
    response: 'Agree and communicate priority principles for the group.',
  },
  task_orientation: {
    observed: 'completed planned activity rather than acting further toward an unresolved outcome',
    response: 'Review whether targets and measures are framed around activity rather than outcomes.',
  },
  commercial_understanding: {
    observed: 'showed weaker understanding of the commercial impact of their decisions',
    response: 'Provide group commercial awareness training and make commercial impact visible in everyday work.',
  },
  rushing: {
    observed: 'missed details on multi-stage instructions when acting quickly',
    response: 'Review how multi-stage instructions are given and flag high-risk steps.',
  },
  quality_drops_under_pressure: {
    observed: 'lost accuracy under time pressure',
    response: 'Review deadlines on quality-critical work.',
  },
  retention_support: {
    observed: 'benefited from reinforcement of multi-step information',
    response: 'Provide written procedures and checklists rather than relying on verbal instructions.',
  },
  sustained_attention: {
    observed: 'lost accuracy later in long sessions',
    response: 'Review whether work involves long uninterrupted administrative blocks.',
  },
};

export interface GroupMemberFindings {
  employeeId: string;
  group: string;
  findings: readonly Finding[];
}

export interface OrganisationInsight {
  group: string;
  patternKey: PatternKey;
  count: number;
  groupSize: number;
  share: number;
  /** e.g. "7 of 10 Sales employees (70%) demonstrated uncertainty around escalation decisions." */
  observation: string;
  /** §226 – process issue, not N individual problems. */
  interpretation: string;
  suggestedResponse: string;
  recommendations: Recommendation[];
  /** Director drill-down only. */
  employeeIds: string[];
}

export function organisationInsights(
  actor: Actor,
  members: readonly GroupMemberFindings[],
  rules: InsightRules = DEFAULT_RULES,
): OrganisationInsight[] {
  assertCanViewDirectorComparisons(actor);
  const groups = new Map<string, GroupMemberFindings[]>();
  for (const m of members) groups.set(m.group, [...(groups.get(m.group) ?? []), m]);

  const out: OrganisationInsight[] = [];
  for (const [group, people] of groups) {
    if (people.length < rules.organisation.minGroupSize) continue;
    const byPattern = new Map<PatternKey, string[]>();
    for (const p of people) {
      for (const f of p.findings.filter(isOpportunity)) {
        byPattern.set(f.key, [...(byPattern.get(f.key) ?? []), p.employeeId]);
      }
    }
    for (const [key, employeeIds] of byPattern) {
      const content = ORGANISATION_CONTENT[key];
      const share = employeeIds.length / people.length;
      if (!content || employeeIds.length < rules.organisation.minCount || share < rules.organisation.minShare) continue;
      out.push({
        group,
        patternKey: key,
        count: employeeIds.length,
        groupSize: people.length,
        share: Math.round(share * 100) / 100,
        observation: `${employeeIds.length} of ${people.length} ${group} employees (${Math.round(share * 100)}%) ${content.observed}.`,
        interpretation: `This may indicate a business process or clarity issue rather than ${employeeIds.length} individual problems.`,
        suggestedResponse: content.response,
        recommendations: PATTERNS[key].recommendations.map((id) => RECOMMENDATIONS[id]).filter((r) => r.target !== 'employee'),
        employeeIds,
      });
    }
  }
  out.sort((a, b) => b.share - a.share);
  assertSafeLanguage(out);
  return out;
}
