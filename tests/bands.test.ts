import { describe, expect, it } from 'vitest';
import { bandKey, personHeadline } from '../app/src/bands.js';

const bands = { development: 60, strong: 75 };

describe('band charts', () => {
  it('bands scores at the FocusiQ thresholds', () => {
    expect([59, 60, 74, 75].map((v) => bandKey(bands, v))).toEqual(['develop', 'expected', 'expected', 'strong']);
  });

  it('writes a plain-English headline without pronouns', () => {
    const h = personHeadline('Alex Morgan', [
      { label: 'Think', band: 'strong' },
      { label: 'Act', band: 'develop' },
      { label: 'Own', band: 'expected' },
      { label: 'Decide', band: 'develop' },
    ]);
    expect(h).toBe('Alex Morgan is Strong in 1 of 4 areas and Expected in 1, with 2 to develop: Act and Decide.');
    expect(h).not.toMatch(/\b(he|she|his|her|they|their)\b/i);
    expect(personHeadline('Sam', [{ label: 'Think', band: 'expected' }])).toBe('Sam is Expected in 1 of 1 area, with nothing below expectations.');
  });
});
