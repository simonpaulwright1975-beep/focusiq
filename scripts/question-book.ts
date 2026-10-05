/**
 * Prints the FocusiQ question book: every section and question as staff see
 * it, with the answer key and what each question measures. Built from the
 * same files the app uses, so it always matches.
 *
 *   npx vite-node scripts/question-book.ts -- --out <file.html>
 *
 * CONTAINS ANSWER KEYS: Directors only. Never share it with staff and never
 * commit the output.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEMO_ASSESSMENT } from '../app/src/demo/assessment.js';
import { DEMO_SCORING } from '../app/src/demo/scoring.js';
import type { MediaRef } from '../src/runner/index.js';

const out = process.argv[process.argv.indexOf('--out') + 1];
if (!out || process.argv.indexOf('--out') < 0) throw new Error('Use --out <file.html>');

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const img = (m: MediaRef, cls: string) => {
  const svg = readFileSync(join('app/public', m.src.replace(/^\.\//, '')), 'utf8');
  return `<img class="${cls}" alt="${esc(m.alt)}" src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}">`;
};
const DIMENSIONS: Record<string, string> = {
  think: 'Think – reasoning through problems', absorb: 'Absorb – taking in information accurately', remember: 'Remember – keeping hold of key details',
  prioritise: 'Prioritise – deciding what matters most', decide: 'Decide – reaching decisions with confidence', act: 'Act – turning decisions into action',
  own: 'Own – taking ownership of outcomes', drive: 'Drive – keeping momentum', complete: 'Complete – finishing to the right standard', focus: 'Focus – staying on task',
};
const fmtTime = (s?: number) => (s ? `Timed: ${s / 60} minutes` : 'No time limit');

let n = 0;
const sections = DEMO_ASSESSMENT.sections.map((s, si) => {
  const qs = s.questions.map((q) => {
    n += 1;
    const meta = DEMO_SCORING[q.questionVersionId];
    const correct = meta?.correctAnswer;
    const options =
      q.kind === 'ranking'
        ? `<ol class="opts">${q.options.map((o) => `<li>${esc(o.text ?? '')}</li>`).join('')}</ol>`
        : `<ul class="opts">${q.options
            .map((o) => {
              const right = correct === o.id;
              const flags = [
                meta?.unnecessaryEscalationOptions?.includes(o.id) ? 'escalates when not needed' : '',
                meta?.outcomeActionOptions?.includes(o.id) ? 'acts on the outcome' : '',
                meta?.nextActionOptions?.includes(o.id) ? 'spots the next action' : '',
              ].filter(Boolean);
              return `<li class="${right ? 'right' : ''}"><span class="letter">${o.id.toUpperCase()}</span>${o.image ? img(o.image, 'opt-img') : ''}<span>${esc(o.text ?? o.image?.alt ?? '')}</span>${right ? '<span class="tag tag-right">✓ Best answer</span>' : ''}${flags.map((f) => `<span class="tag">${f}</span>`).join('')}</li>`;
            })
            .join('')}</ul>`;
    const key =
      q.kind === 'ranking' && correct
        ? `<p class="key"><strong>Expected order:</strong> ${correct.split('>').map((id) => esc(q.options.find((o) => o.id === id)?.text ?? id)).join(' → ')}</p>`
        : '';
    const about = meta
      ? `<p class="meta">${esc(DIMENSIONS[meta.dimension] ?? meta.dimension)} · ${meta.modality} · ${meta.risk === 'high' ? 'higher-risk task' : 'lower-risk task'}${meta.commercial ? ' · commercial' : ''}${meta.priorityContext ? ` · priorities ${meta.priorityContext === 'defined' ? 'clearly defined' : 'competing'}` : ''}${meta.customerImpactScenario ? ' · customer impact' : ''}</p>`
      : `<p class="meta">Not scored – ${s.purpose === 'motivation' ? 'the person ranks what motivates them; no answer is better than another' : 'unscored'}</p>`;
    return `<article class="q"><div class="qnum">${n}</div><div>
      <h3>${esc(q.stem)}</h3>
      ${q.detail ? `<div class="detail">${q.detail.map((d) => `<div>${esc(d)}</div>`).join('')}</div>` : ''}
      ${q.image ? img(q.image, 'stem-img') : ''}
      ${about}${options}${key}</div></article>`;
  });
  return `<section class="sec sec-${si}"><div class="sec-head"><span class="sec-num">${si + 1}</span><div><div class="lbl">Section ${si + 1} · ${fmtTime(s.timeLimitSeconds)}${s.shuffleQuestions ? ' · questions shuffled per person' : ''}</div><h2>${esc(s.title)}</h2></div></div>
    <ul class="instr">${s.instructions.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
    ${s.rememberThis ? `<div class="remember"><div class="lbl">Shown at the start – needed later</div><ul>${s.rememberThis.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>` : ''}
    ${qs.join('')}</section>`;
});

const html = `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>FocusiQ question book</title>
<style>
:root{--ink:#17120e;--ink-soft:#4a4038;--muted:#8a7a6d;--accent:#0d5a3b;--line:#ede0d5;--track:#f3e7dd;--green:#1e7a46;--green-bg:#ddf2e4;--amber-bg:#f9ecd2;--amber-ink:#7d5009;--red:#b13a2a;--red-bg:#f9dfd9}
body{margin:0;font-family:"Segoe UI",system-ui,sans-serif;color:var(--ink);background:linear-gradient(#f7efe9,#fbf4ef);line-height:1.5}
main{max-width:860px;margin:0 auto;padding:24px 16px 64px}
h1,h2,h3{font-family:Georgia,serif;font-weight:800;letter-spacing:-.4px;margin:0}
h1{font-size:30px}h2{font-size:22px}h3{font-size:17px;margin-bottom:6px}
.lbl{font-size:.74rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
.warn{background:var(--red-bg);color:var(--red);border-radius:12px;padding:12px 16px;font-weight:600;margin:14px 0}
.card{background:#fff;border:1px solid var(--line);border-radius:16px;padding:20px 22px;margin:16px 0;box-shadow:0 6px 18px -12px rgba(23,18,14,.25)}
.sec{background:#fff;border:1px solid var(--line);border-top:6px solid var(--c);border-radius:16px;padding:20px 22px;margin:22px 0}
.sec-0{--c:#1e7a46;--t:#ddf2e4}.sec-1{--c:#2470cc;--t:#e3eefb}.sec-2{--c:#4a3aa7;--t:#ebe8f7}.sec-3{--c:#e87ba4;--t:#fbe7ef}
.sec-head{display:flex;gap:14px;align-items:center;background:var(--t);border-radius:12px;padding:12px 14px}
.sec-num{width:44px;height:44px;border-radius:50%;background:var(--c);color:#fff;display:grid;place-items:center;font-weight:800;font-size:20px;flex:none}
.sec-3 .sec-num{color:var(--ink)}
.instr{color:var(--ink-soft)}
.remember{background:var(--amber-bg);border-radius:12px;padding:10px 14px;margin:8px 0 14px}.remember .lbl{color:var(--amber-ink)}
.q{display:grid;grid-template-columns:36px 1fr;gap:12px;border-top:1px solid var(--track);padding:16px 0}
.qnum{width:32px;height:32px;border-radius:50%;background:var(--c);color:#fff;display:grid;place-items:center;font-weight:800}.sec-3 .qnum{color:var(--ink)}
.meta{font-size:13px;color:var(--muted);margin:2px 0 8px}
.detail{background:#fffdfb;border:1px solid var(--line);border-left:4px solid var(--c);border-radius:10px;padding:8px 12px;margin:6px 0 10px}
.opts{list-style:none;padding:0;margin:0;display:grid;gap:6px}
.opts li{display:flex;flex-wrap:wrap;gap:8px;align-items:center;border:1px solid var(--line);border-radius:10px;padding:8px 12px;background:#fffdfb}
ol.opts{list-style:decimal;padding-left:22px}ol.opts li{display:list-item}
.opts li.right{border-color:var(--green);background:var(--green-bg)}
.letter{font-weight:800;color:var(--muted);width:16px}
.tag{font-size:12px;font-weight:700;border-radius:999px;padding:2px 10px;background:var(--track);color:var(--ink-soft)}
.tag-right{background:var(--green);color:#fff}
.key{background:var(--green-bg);border-radius:10px;padding:8px 12px;margin-top:8px}
.stem-img{height:60px;margin:6px 0}.opt-img{height:34px}
table{border-collapse:collapse;width:100%;font-size:14px}td,th{border-bottom:1px solid var(--track);padding:6px 8px;text-align:left}
</style></head><body><main>
<div class="lbl">Walter Geering · FocusiQ</div>
<h1>FocusiQ question book</h1>
<p>${esc(DEMO_ASSESSMENT.title)} · version <code>${esc(DEMO_ASSESSMENT.version)}</code> · about ${DEMO_ASSESSMENT.estimatedMinutes} minutes · ${n} questions in ${DEMO_ASSESSMENT.sections.length} sections</p>
<div class="warn">Contains the answers. Directors only – do not share with staff, or the assessment stops meaning anything.</div>
<div class="card"><div class="lbl">How it works for staff</div>
<ul><li>Sections are taken in order. Within a section people can move back and forth until they submit it; they cannot return to a submitted section.</li>
<li>Question order (where marked) and answer order are shuffled per person, so neighbours see different orders.</li>
<li>Only section 2 is timed. Agreed adjustments add extra time to timed sections.</li>
<li>Staff never see right or wrong, scores or answers – only their own summary, once a Director releases it.</li>
<li>Besides the answers, FocusiQ records how people work: time taken, changed answers and questions revisited. That is what drives the working-style insights (for example over-checking or escalating when not needed).</li></ul></div>
${sections.join('\n')}
</main></body></html>`;

writeFileSync(out, html);
console.log(`Wrote ${out}: ${n} questions.`);
