/** Deterministic randomness so a resumed assessment shows exactly the same order. */

function fnv1a(input: string, salt: number): number {
  let h = 0x811c9dc5 ^ salt;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 PRNG seeded from a string. */
export function seededRandom(seed: string): () => number {
  let a = fnv1a(seed, 0);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates with a seeded generator; never mutates the input. */
export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  const out = [...items];
  const rand = seededRandom(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** A stable, valid UUID derived from a string (same input → same id), for idempotent saves. */
export function deterministicUuid(input: string): string {
  const hex = [0x1, 0x2, 0x3, 0x4].map((salt) => fnv1a(input, salt * 0x9e3779b1).toString(16).padStart(8, '0')).join('');
  const chars = hex.split('');
  chars[12] = '5'; // version nibble
  chars[16] = ((parseInt(chars[16]!, 16) & 0x3) | 0x8).toString(16); // RFC 4122 variant
  const h = chars.join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}
