/**
 * Language safeguard. Every generated report is scanned before it is
 * returned; wording the spec forbids causes generation to fail rather than
 * reach a Director or employee.
 */
const BANNED: { pattern: RegExp; reason: string }[] = [
  { pattern: /\bdismiss(al)?\b|\bdemot(e|ion)\b|\bpromot(e|ion)\b/i, reason: 'No dismissal, demotion or promotion recommendations (§209).' },
  { pattern: /\bunsuitable\b|\bnot suitable\b|\bsuitable for\b/i, reason: 'No automatic suitability judgements (§209).' },
  { pattern: /\blacks? motivation\b|\bunmotivated\b|\blazy\b/i, reason: 'Describe observed patterns, not motivation deficits (§213).' },
  { pattern: /\bdisorder\b|\badhd\b|\bdyslexi|\bautis|\bdementia\b/i, reason: 'Never imply a medical condition (§219, §222).' },
  { pattern: /\b(visual|verbal|auditory|kinaesthetic) learner\b/i, reason: 'No fixed learning-style claims (§220, §221).' },
  { pattern: /\bproblem employee\b|\bpoor employee\b|\bworst\b|\bbottom performer\b/i, reason: 'No pejorative labels.' },
  { pattern: /\b(he|she|him|her|his|hers)\b/i, reason: 'Pronouns are never inferred – use the name or neutral wording.' },
];

export class InsightLanguageError extends Error {
  constructor(public readonly violations: { text: string; reason: string }[]) {
    super(`Generated insight failed the language safeguard: ${violations.map((v) => v.reason).join(' ')}`);
  }
}

export function languageViolations(text: string): string[] {
  return BANNED.filter((b) => b.pattern.test(text)).map((b) => b.reason);
}

function collectStrings(value: unknown, out: string[]): void {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => collectStrings(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => collectStrings(v, out));
}

/** Throws if any string anywhere in `report` breaches the wording rules. */
export function assertSafeLanguage(report: unknown, ignore: readonly string[] = []): void {
  const strings: string[] = [];
  collectStrings(report, strings);
  const violations = strings
    .filter((s) => !ignore.includes(s))
    .flatMap((text) => languageViolations(text).map((reason) => ({ text, reason })));
  if (violations.length) throw new InsightLanguageError(violations);
}
