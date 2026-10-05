/**
 * Generates the abstract-reasoning section: original 3×3 matrix puzzles drawn
 * as SVG in the house colours. Writes
 *   - app/public/assessment-media/demo/abstract/*.svg   (grids and answer tiles)
 *   - app/src/demo/abstractItems.ts    (display only: stems, options, fingerprints)
 *   - app/src/demo/abstractScoring.ts  (answer keys – Director side only)
 *
 *   npx vite-node scripts/abstract-media.ts
 *
 * Attributes are shape, count, size, fill (solid / outline / striped), arrow
 * direction and line sets – never colour alone, so the puzzles work for people
 * with colour-vision differences. Every wrong option breaks at least one rule.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';

type Shape = 'circle' | 'square' | 'triangle' | 'pentagon' | 'hexagon' | 'arrow' | 'lines';
type Fill = 'solid' | 'outline' | 'striped';
type Size = 'small' | 'medium' | 'large';
type Line = 'V' | 'H' | 'D1' | 'D2';
interface Cell {
  shape: Shape;
  count?: number;
  size?: Size;
  fill?: Fill;
  /** Arrow direction in degrees clockwise from up. */
  rot?: number;
  /** Corner dot. */
  dot?: 'TL' | 'TR' | 'BR' | 'BL';
  lines?: Line[];
}
interface Item {
  id: string;
  /** The rules, in words – shown to Directors in the question book only. */
  rule: string;
  stem: string;
  grid: Cell[]; // 8 cells, row by row; the 9th is missing
  answer: Cell;
  distractors: Cell[]; // 7
}

const INK = '#0d5a3b';
const LINE_INK = '#17120e';
const TILE = 76;
const R: Record<Size, number> = { small: 7, medium: 10.5, large: 16 };

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------
const poly = (n: number, cx: number, cy: number, r: number, start = -90) =>
  Array.from({ length: n }, (_, i) => {
    const a = ((start + (360 / n) * i) * Math.PI) / 180;
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
  }).join(' ');

function paint(fill: Fill) {
  if (fill === 'solid') return `fill="${INK}"`;
  if (fill === 'outline') return `fill="#fff" stroke="${INK}" stroke-width="2.2"`;
  return `fill="url(#hatch)" stroke="${INK}" stroke-width="2.2"`;
}

function shapeAt(shape: Shape, cx: number, cy: number, r: number, fill: Fill): string {
  const p = paint(fill);
  switch (shape) {
    case 'circle': return `<circle cx="${cx}" cy="${cy}" r="${r}" ${p}/>`;
    case 'square': return `<rect x="${cx - r * 0.88}" y="${cy - r * 0.88}" width="${r * 1.76}" height="${r * 1.76}" ${p}/>`;
    case 'triangle': return `<polygon points="${poly(3, cx, cy + r * 0.15, r * 1.12)}" ${p}/>`;
    case 'pentagon': return `<polygon points="${poly(5, cx, cy, r * 1.02)}" ${p}/>`;
    case 'hexagon': return `<polygon points="${poly(6, cx, cy, r * 1.02, 0)}" ${p}/>`;
    default: throw new Error(shape);
  }
}

/** Positions for 1–6 shapes in a tile. */
const LAYOUT: Record<number, [number, number][]> = {
  1: [[38, 38]],
  2: [[25, 25], [51, 51]],
  3: [[38, 21], [21, 53], [55, 53]],
  4: [[24, 24], [52, 24], [24, 52], [52, 52]],
  5: [[22, 22], [54, 22], [38, 38], [22, 54], [54, 54]],
  6: [[20, 26], [38, 26], [56, 26], [20, 50], [38, 50], [56, 50]],
};

const ARROW = 'M38 12 L54 34 L44 34 L44 62 L32 62 L32 34 L22 34 Z';
const LINES: Record<Line, string> = {
  V: 'M38 10 L38 66',
  H: 'M10 38 L66 38',
  D1: 'M14 14 L62 62',
  D2: 'M62 14 L14 62',
};
const DOT: Record<NonNullable<Cell['dot']>, [number, number]> = { TL: [11, 11], TR: [65, 11], BR: [65, 65], BL: [11, 65] };

function cellBody(c: Cell): string {
  let out = '';
  if (c.shape === 'arrow') {
    out += `<path d="${ARROW}" ${paint(c.fill ?? 'solid')} transform="rotate(${c.rot ?? 0} 38 38)"/>`;
  } else if (c.shape === 'lines') {
    out += (c.lines ?? []).map((l) => `<path d="${LINES[l]}" stroke="${LINE_INK}" stroke-width="3.5" stroke-linecap="round"/>`).join('');
  } else {
    const n = c.count ?? 1;
    const r = R[c.size ?? 'medium'] * (n >= 5 ? 0.8 : 1);
    out += LAYOUT[n]!.map(([x, y]) => shapeAt(c.shape, x, y, r, c.fill ?? 'solid')).join('');
  }
  if (c.dot) {
    const [x, y] = DOT[c.dot];
    out += `<circle cx="${x}" cy="${y}" r="4.5" fill="${LINE_INK}"/>`;
  }
  return out;
}

const DEFS = `<defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#fff"/><rect width="2.6" height="6" fill="${INK}"/></pattern></defs>`;
const frame = (x: number, y: number) => `<rect x="${x + 1}" y="${y + 1}" width="${TILE - 2}" height="${TILE - 2}" rx="10" fill="#fff" stroke="#ede0d5" stroke-width="2"/>`;

function tileSvg(c: Cell, label: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${TILE} ${TILE}" width="${TILE}" height="${TILE}" role="img"><title>${label}</title>${DEFS}${frame(0, 0)}${cellBody(c)}</svg>`;
}

function gridSvg(cells: Cell[], label: string): string {
  const gap = 8;
  const size = TILE * 3 + gap * 2;
  let body = '';
  for (let i = 0; i < 9; i++) {
    const x = (i % 3) * (TILE + gap);
    const y = Math.floor(i / 3) * (TILE + gap);
    if (i < 8) body += frame(x, y) + `<g transform="translate(${x} ${y})">${cellBody(cells[i]!)}</g>`;
    else
      body += `<rect x="${x + 1}" y="${y + 1}" width="${TILE - 2}" height="${TILE - 2}" rx="10" fill="#fbf4ef" stroke="#8a7a6d" stroke-width="2" stroke-dasharray="6 5"/><text x="${x + TILE / 2}" y="${y + 50}" font-family="Segoe UI, system-ui, sans-serif" font-size="32" font-weight="700" text-anchor="middle" fill="#8a7a6d">?</text>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img"><title>${label}</title>${DEFS}${body}</svg>`;
}

// ---------------------------------------------------------------------------
// Words (alt text for screen readers – describes, never hints)
// ---------------------------------------------------------------------------
const DIR: Record<number, string> = { 0: 'up', 45: 'up-right', 90: 'right', 135: 'down-right', 180: 'down', 225: 'down-left', 270: 'left', 315: 'up-left' };
const CORNER = { TL: 'top-left', TR: 'top-right', BR: 'bottom-right', BL: 'bottom-left' };
const LINE_WORD: Record<Line, string> = { V: 'vertical', H: 'horizontal', D1: 'diagonal from top-left', D2: 'diagonal from top-right' };

function describe(c: Cell): string {
  let s: string;
  if (c.shape === 'arrow') s = `${c.fill ?? 'solid'} arrow pointing ${DIR[((c.rot ?? 0) + 360) % 360]}`;
  else if (c.shape === 'lines') s = c.lines?.length ? `lines: ${c.lines.map((l) => LINE_WORD[l]).join(', ')}` : 'no lines';
  else {
    const n = c.count ?? 1;
    s = `${n} ${c.size ?? 'medium'} ${c.fill ?? 'solid'} ${c.shape}${n > 1 ? 's' : ''}`;
  }
  return c.dot ? `${s}, dot in the ${CORNER[c.dot]} corner` : s;
}
const gridWords = (cells: Cell[]) =>
  [0, 1, 2].map((r) => `Row ${r + 1}: ${cells.slice(r * 3, r * 3 + 3).map(describe).concat(r === 2 ? ['missing'] : []).join('; ')}.`).join(' ');

// ---------------------------------------------------------------------------
// The puzzles
// ---------------------------------------------------------------------------
const S = (shape: Shape, count: number, fill: Fill = 'solid', size: Size = 'medium'): Cell => ({ shape, count, fill, size });
const A = (rot: number, fill: Fill = 'solid', dot?: Cell['dot']): Cell => ({ shape: 'arrow', rot, fill, ...(dot ? { dot } : {}) });
const L = (...lines: Line[]): Cell => ({ shape: 'lines', lines });
const STEM = 'Which tile completes the grid?';

const ITEMS: Item[] = [
  {
    id: 'ar-01', stem: STEM,
    rule: 'Shape: each once per row and column. Count: 1, 2, 3 across each row.',
    grid: [S('circle', 1), S('square', 2), S('triangle', 3), S('square', 1), S('triangle', 2), S('circle', 3), S('triangle', 1), S('circle', 2)],
    answer: S('square', 3),
    distractors: [S('square', 2), S('triangle', 3), S('circle', 3), S('square', 3, 'outline'), S('square', 3, 'solid', 'small'), S('square', 1), S('pentagon', 3)],
  },
  {
    id: 'ar-02', stem: STEM,
    rule: 'Shape and fill: each once per row and column. Count: same across a row, 1 / 2 / 3 by row.',
    grid: [S('circle', 1, 'solid'), S('square', 1, 'outline'), S('triangle', 1, 'striped'), S('triangle', 2, 'outline'), S('circle', 2, 'striped'), S('square', 2, 'solid'), S('square', 3, 'striped'), S('triangle', 3, 'solid')],
    answer: S('circle', 3, 'outline'),
    distractors: [S('circle', 3, 'solid'), S('circle', 3, 'striped'), S('circle', 2, 'outline'), S('square', 3, 'outline'), S('triangle', 3, 'outline'), S('circle', 1, 'outline'), S('pentagon', 3, 'outline')],
  },
  {
    id: 'ar-03', stem: STEM,
    rule: 'Count: third = first + second. Shape: same across a row. Fill: each once per row and column.',
    grid: [S('triangle', 1, 'solid'), S('triangle', 1, 'outline'), S('triangle', 2, 'striped'), S('hexagon', 1, 'striped'), S('hexagon', 2, 'solid'), S('hexagon', 3, 'outline'), S('square', 2, 'outline'), S('square', 2, 'striped')],
    answer: S('square', 4, 'solid'),
    distractors: [S('square', 3, 'solid'), S('square', 4, 'outline'), S('square', 4, 'striped'), S('square', 2, 'solid'), S('hexagon', 4, 'solid'), S('triangle', 4, 'solid'), S('square', 5, 'solid')],
  },
  {
    id: 'ar-04', stem: STEM,
    rule: 'Shape, count and size: each value once per row and column (three independent rules).',
    grid: [S('triangle', 2, 'solid', 'large'), S('circle', 3, 'solid', 'medium'), S('hexagon', 1, 'solid', 'small'), S('circle', 1, 'solid', 'medium'), S('hexagon', 2, 'solid', 'small'), S('triangle', 3, 'solid', 'large'), S('hexagon', 3, 'solid', 'small'), S('triangle', 1, 'solid', 'large')],
    answer: S('circle', 2, 'solid', 'medium'),
    distractors: [S('circle', 2, 'solid', 'large'), S('circle', 2, 'solid', 'small'), S('circle', 3, 'solid', 'medium'), S('circle', 1, 'solid', 'medium'), S('triangle', 2, 'solid', 'medium'), S('hexagon', 2, 'solid', 'medium'), S('circle', 2, 'outline', 'medium')],
  },
  {
    id: 'ar-05', stem: STEM,
    rule: 'Arrow: turns a quarter clockwise each step. Dot: moves one corner clockwise each step.',
    grid: [A(0, 'solid', 'TL'), A(90, 'solid', 'TR'), A(180, 'solid', 'BR'), A(90, 'solid', 'TR'), A(180, 'solid', 'BR'), A(270, 'solid', 'BL'), A(180, 'solid', 'BR'), A(270, 'solid', 'BL')],
    answer: A(0, 'solid', 'TL'),
    distractors: [A(0, 'solid', 'BL'), A(0, 'solid', 'TR'), A(0, 'solid', 'BR'), A(180, 'solid', 'TL'), A(270, 'solid', 'TL'), A(90, 'solid', 'TL'), A(0, 'outline', 'TL')],
  },
  {
    id: 'ar-06', stem: STEM,
    rule: 'Lines: the third tile keeps the lines that appear in only one of the first two; shared lines disappear.',
    grid: [L('V'), L('H'), L('V', 'H'), L('V', 'D1'), L('D1', 'H'), L('V', 'H'), L('D1', 'D2'), L('D2', 'H', 'V')],
    answer: L('D1', 'H', 'V'),
    distractors: [L('V', 'H', 'D1', 'D2'), L('D2'), L('V', 'H'), L('D1', 'D2', 'H'), L('D1'), L('V', 'H', 'D2'), L('H', 'D1')],
  },
  {
    id: 'ar-07', stem: STEM,
    rule: 'Count: third = first − second. Shape and fill: each once per row and column.',
    grid: [S('circle', 4, 'solid'), S('square', 1, 'outline'), S('triangle', 3, 'striped'), S('square', 3, 'striped'), S('triangle', 2, 'solid'), S('circle', 1, 'outline'), S('triangle', 4, 'outline'), S('circle', 2, 'striped')],
    answer: S('square', 2, 'solid'),
    distractors: [S('square', 2, 'outline'), S('square', 2, 'striped'), S('square', 6, 'solid'), S('square', 3, 'solid'), S('square', 1, 'solid'), S('circle', 2, 'solid'), S('triangle', 2, 'solid')],
  },
  {
    id: 'ar-08', stem: STEM,
    rule: 'Arrow: in row n it turns n × 45° clockwise each step. Fill: each once per row and column.',
    grid: [A(0, 'solid'), A(45, 'outline'), A(90, 'striped'), A(0, 'outline'), A(90, 'striped'), A(180, 'solid'), A(0, 'striped'), A(135, 'solid')],
    answer: A(270, 'outline'),
    distractors: [A(270, 'solid'), A(270, 'striped'), A(180, 'outline'), A(225, 'outline'), A(90, 'outline'), A(0, 'outline'), A(315, 'outline')],
  },
];

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------
const DIRNAME = 'app/public/assessment-media/demo/abstract';
mkdirSync(DIRNAME, { recursive: true });
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const LETTERS = 'abcdefgh';

const display: string[] = [];
const keys: string[] = [];
const rules: string[] = [];
ITEMS.forEach((item, n) => {
  const seen = new Set<string>();
  for (const c of [item.answer, ...item.distractors]) {
    const k = describe(c);
    if (seen.has(k)) throw new Error(`${item.id}: duplicate option ${k}`);
    seen.add(k);
  }
  if (item.distractors.length !== 7 || item.grid.length !== 8) throw new Error(`${item.id}: needs 8 cells and 7 distractors`);
  // The answer's letter moves round, so position gives nothing away (options are also shuffled per person).
  const pos = (n * 3 + 2) % 8;
  const options = [...item.distractors];
  options.splice(pos, 0, item.answer);

  const gridLabel = `3 by 3 grid with the last tile missing. ${gridWords(item.grid)}`;
  const gridFile = `${item.id}-grid.svg`;
  const gridText = gridSvg(item.grid, gridLabel);
  writeFileSync(`${DIRNAME}/${gridFile}`, gridText);
  const opts = options.map((c, i) => {
    const file = `${item.id}-${LETTERS[i]}.svg`;
    const text = tileSvg(c, describe(c));
    writeFileSync(`${DIRNAME}/${file}`, text);
    return `            { id: '${LETTERS[i]}', image: m('${file}', '${sha(text)}', ${JSON.stringify(describe(c))}) },`;
  });
  display.push(`        {
          questionVersionId: '${item.id}',
          kind: 'single_choice',
          stem: ${JSON.stringify(item.stem)},
          image: m('${gridFile}', '${sha(gridText)}', ${JSON.stringify(gridLabel)}),
          options: [
${opts.join('\n')}
          ],
        },`);
  rules.push(`  '${item.id}': ${JSON.stringify(item.rule)},`);
  keys.push(`  '${item.id}': { family: 'abstract-matrix', dimension: 'think', modality: 'visual', risk: 'low', correctAnswer: '${LETTERS[pos]}' },`);
});

writeFileSync(
  'app/src/demo/abstractItems.ts',
  `/**
 * GENERATED by scripts/abstract-media.ts – do not edit by hand.
 * Abstract-reasoning questions: display only (no answer keys).
 */
import type { QuestionDef, MediaRef } from '../../../src/runner/index.js';

const m = (file: string, sha256: string, alt: string): MediaRef => ({ src: \`./assessment-media/demo/abstract/\${file}\`, sha256, alt });

export const ABSTRACT_QUESTIONS: QuestionDef[] = [
${display.join('\n')}
];
`,
);
writeFileSync(
  'app/src/demo/abstractScoring.ts',
  `/**
 * GENERATED by scripts/abstract-media.ts – do not edit by hand.
 * Answer keys for the abstract-reasoning questions: Director side only, like ./scoring.ts.
 */
import type { ExerciseMeta } from '../../../src/insight/index.js';

export const ABSTRACT_SCORING: Record<string, ExerciseMeta> = {
${keys.join('\n')}
};

/** The rules behind each puzzle, for the Directors' question book. */
export const ABSTRACT_RULES: Record<string, string> = {
${rules.join('\n')}
};
`,
);
console.log(`Wrote ${ITEMS.length} puzzles to ${DIRNAME}.`);
