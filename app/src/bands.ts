/**
 * FocusiQ expectation bands for the Director app's charts: names, colours and
 * plain-English headlines. No JSX, so the tests can import it directly.
 */
/** FocusiQ expectations for a higher-is-better 0–100 score (see absoluteBandFor). */
export interface ExpectationBands {
  /** Below this: Development Opportunity. */
  development: number;
  /** At or above this: Strong. */
  strong: number;
  /** Shown in the legend, e.g. "provisional". */
  note?: string;
}

export type BandKey = 'strong' | 'expected' | 'develop';
export const BAND_ORDER: BandKey[] = ['strong', 'expected', 'develop'];
export const BAND_LABEL: Record<BandKey, string> = { strong: 'Strong', expected: 'Expected', develop: 'Development' };
/** Plain-English meaning of each band, shown beside the band name. */
export const BAND_MEANING: Record<BandKey, string> = { strong: 'above expectations', expected: 'meets expectations', develop: 'below expectations' };
export const BAND_FILL: Record<BandKey, string> = { strong: 'var(--band-strong)', expected: 'var(--band-expected)', develop: 'var(--band-develop)' };
export const BAND_INK: Record<BandKey, string> = { strong: 'var(--band-strong-ink)', expected: 'var(--band-expected-ink)', develop: 'var(--band-develop-ink)' };

export const bandKey = (b: ExpectationBands, v: number): BandKey => (v >= b.strong ? 'strong' : v < b.development ? 'develop' : 'expected');

export type BandCounts = Record<BandKey, number>;
export const emptyCounts = (): BandCounts => ({ strong: 0, expected: 0, develop: 0 });
export const pct = (n: number, total: number) => (total ? Math.round((n / total) * 100) : 0);

const list = (items: string[]) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);

/** "Alex Morgan is Strong in 4 of 10 areas and Expected in 5, with 1 to develop: Act." No pronouns. */
export function personHeadline(name: string, items: { label: string; band: BandKey }[]): string {
  const n = items.length;
  const of = (k: BandKey) => items.filter((i) => i.band === k);
  const strong = of('strong');
  const expected = of('expected');
  const develop = of('develop');
  const parts: string[] = [];
  const areas = `${n} area${n === 1 ? '' : 's'}`;
  if (strong.length) parts.push(`Strong in ${strong.length} of ${areas}`);
  if (expected.length) parts.push(strong.length ? `Expected in ${expected.length}` : `Expected in ${expected.length} of ${areas}`);
  const head = `${name} is ${parts.join(' and ') || `measured in ${areas}`}`;
  if (!develop.length) return `${head}, with nothing below expectations.`;
  return `${head}, with ${develop.length} to develop: ${list(develop.map((d) => d.label))}.`;
}
