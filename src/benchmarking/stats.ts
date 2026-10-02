/**
 * Small, dependency-free statistics helpers used by the benchmarking engine.
 */
import type { DescriptiveStats } from './types.js';

export function mean(values: readonly number[]): number {
  if (values.length === 0) return NaN;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Linear-interpolated quantile (same method as Excel PERCENTILE.INC). q in [0, 1]. */
export function quantile(values: readonly number[], q: number): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const loV = sorted[lo]!;
  const hiV = sorted[hi]!;
  return loV + (hiV - loV) * (pos - lo);
}

export function median(values: readonly number[]): number {
  return quantile(values, 0.5);
}

/** Sample standard deviation (n − 1). Returns 0 for a single value. */
export function standardDeviation(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const ss = values.reduce((acc, v) => acc + (v - m) ** 2, 0);
  return Math.sqrt(ss / (values.length - 1));
}

export function describe(values: readonly number[]): DescriptiveStats | null {
  if (values.length === 0) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  return {
    n: values.length,
    mean: mean(values),
    median: median(values),
    min,
    max,
    range: max - min,
    standardDeviation: standardDeviation(values),
    p25: quantile(values, 0.25),
    p75: quantile(values, 0.75),
  };
}

/**
 * Percentile rank of `value` within `population` (§157): the share of the
 * population scoring below it, counting ties as half. 0–100.
 */
export function percentileRank(value: number, population: readonly number[]): number {
  if (population.length === 0) return NaN;
  let below = 0;
  let equal = 0;
  for (const v of population) {
    if (v < value) below++;
    else if (v === value) equal++;
  }
  return ((below + equal / 2) / population.length) * 100;
}

export function zScore(value: number, m: number, sd: number): number {
  if (sd === 0) return 0;
  return (value - m) / sd;
}

export function pearson(xs: readonly number[], ys: readonly number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return NaN;
  const mx = mean(xs.slice(0, n));
  const my = mean(ys.slice(0, n));
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - mx;
    const dy = ys[i]! - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return NaN;
  return sxy / Math.sqrt(sxx * syy);
}

/** Average ranks (1-based), ties share the mean rank. */
export function ranks(values: readonly number[]): number[] {
  const idx = values.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
  const out = new Array<number>(values.length);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1]![0] === idx[i]![0]) j++;
    const r = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) out[idx[k]![1]] = r;
    i = j + 1;
  }
  return out;
}

export function spearman(xs: readonly number[], ys: readonly number[]): number {
  return pearson(ranks(xs), ranks(ys));
}

// ---------------------------------------------------------------------------
// Significance testing (Student's t) via the regularised incomplete beta.
// ---------------------------------------------------------------------------

function logGamma(x: number): number {
  const c = [
    76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155,
    0.1208650973866179e-2, -0.5395239384953e-5,
  ];
  let y = x;
  const tmp = x + 5.5 - (x + 0.5) * Math.log(x + 5.5);
  let ser = 1.000000000190015;
  for (const ci of c) ser += ci / ++y;
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

function betaContinuedFraction(a: number, b: number, x: number): number {
  const MAX_ITER = 200;
  const EPS = 3e-14;
  const FPMIN = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAX_ITER; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

export function regularisedIncompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(
    logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x),
  );
  if (x < (a + 1) / (a + b + 2)) return (bt * betaContinuedFraction(a, b, x)) / a;
  return 1 - (bt * betaContinuedFraction(b, a, 1 - x)) / b;
}

/** Two-sided p-value for a t statistic with `df` degrees of freedom. */
export function twoSidedTPValue(t: number, df: number): number {
  if (!Number.isFinite(t)) return 0;
  if (df <= 0) return NaN;
  return regularisedIncompleteBeta(df / (df + t * t), df / 2, 0.5);
}

/** p-value for H0: correlation = 0, given r and n. */
export function correlationPValue(r: number, n: number): number {
  if (n < 3 || !Number.isFinite(r)) return NaN;
  if (Math.abs(r) >= 1) return 0;
  const t = (r * Math.sqrt(n - 2)) / Math.sqrt(1 - r * r);
  return twoSidedTPValue(t, n - 2);
}

/** Welch's unequal-variance t-test. Returns t, df and two-sided p. */
export function welchTTest(
  a: readonly number[],
  b: readonly number[],
): { t: number; df: number; p: number } {
  const na = a.length;
  const nb = b.length;
  if (na < 2 || nb < 2) return { t: NaN, df: NaN, p: NaN };
  const va = standardDeviation(a) ** 2;
  const vb = standardDeviation(b) ** 2;
  const se2 = va / na + vb / nb;
  if (se2 === 0) {
    const same = mean(a) === mean(b);
    return { t: same ? 0 : Infinity, df: na + nb - 2, p: same ? 1 : 0 };
  }
  const t = (mean(b) - mean(a)) / Math.sqrt(se2);
  const df = se2 ** 2 / ((va / na) ** 2 / (na - 1) + (vb / nb) ** 2 / (nb - 1));
  return { t, df, p: twoSidedTPValue(t, df) };
}

/** Pooled-SD standardised mean difference (Cohen's d), b relative to a. */
export function cohensD(a: readonly number[], b: readonly number[]): number {
  const na = a.length;
  const nb = b.length;
  if (na < 2 || nb < 2) return NaN;
  const pooled = Math.sqrt(
    ((na - 1) * standardDeviation(a) ** 2 + (nb - 1) * standardDeviation(b) ** 2) / (na + nb - 2),
  );
  if (pooled === 0) return 0;
  return (mean(b) - mean(a)) / pooled;
}

export function round(value: number, dp = 1): number {
  const f = 10 ** dp;
  return Math.round(value * f) / f;
}
