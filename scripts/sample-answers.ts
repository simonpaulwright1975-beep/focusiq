/**
 * Prints Stan's answer sheet: the fictional sample reference profile in the
 * Director demo (core average 85). Every question as staff see it, the answer
 * Stan gave, whether it is the best answer, and the reasoning – a worked
 * example for managers of what a strong result looks like.
 *
 *   npx vite-node scripts/sample-answers.ts -- --out <file.html>
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

/** Stan's answers. `answer` is an option id, or ids joined by '>' for a ranking. */
const STAN: Record<string, { answer: string; seconds: number; why: string; shows: string }> = {
  'demo-q01': {
    answer: 'a', seconds: 14,
    why: 'Sending a copy of an invoice to the customer it belongs to is routine. Nothing needs checking or approving.',
    shows: 'Handles routine requests straight away instead of escalating them.',
  },
  'demo-q02': {
    answer: 'b', seconds: 41,
    why: 'Harbour Joinery’s trade discount is 12%, not 10%. The line total (50 × £4.20 = £210) is right, and at under £5,000 the quote needs no Director sign-off.',
    shows: 'Checks the detail on higher-risk work and remembers the facts given at the start.',
  },
  'demo-q03': {
    answer: 'a', seconds: 9,
    why: 'Harbour Joinery’s deliveries go out on Tuesdays and Fridays, so offer those two days.',
    shows: 'Keeps hold of key details and answers quickly and confidently.',
  },
  'demo-q04': {
    answer: 'a', seconds: 22,
    why: 'A difference of 2 on a low-value item that sells about 200 a month is small. Correct the record and leave a note so the change can be traced.',
    shows: 'Makes proportionate decisions within their own authority.',
  },
  'demo-q05': {
    answer: 'd', seconds: 18,
    why: 'The triangle turns a quarter-turn clockwise each time: up, right, down, so left comes next.',
    shows: 'Spots patterns under time pressure.',
  },
  'demo-q06': {
    answer: 'b', seconds: 20,
    why: '160 ÷ 25 = 6.4. Boxes can’t be split, so round up to 7.',
    shows: 'Applies numbers to a real situation, not just the sum.',
  },
  'demo-q07': {
    answer: 'b', seconds: 11,
    why: 'Order 121 was promised for Tuesday, the earliest date, so it ships first.',
    shows: 'Applies a clear rule quickly and accurately.',
  },
  'demo-q08': {
    answer: 'b', seconds: 19,
    why: 'Product A earns £20 − £15 = £5 each, Product B earns £12 − £6 = £6 each. B earns more even though it sells for less.',
    shows: 'Commercial awareness: looks at profit, not price.',
  },
  'demo-q09': {
    answer: 'quote>call>crm>drive', seconds: 64,
    why: 'Stan sent the £4,200 quote first to keep the sale moving, then called the customer with the damaged delivery. The suggested order is the other way round: an unhappy customer waiting for a call back is the bigger risk to the relationship, and the call takes a few minutes before the quote goes out.',
    shows: 'Stan’s one slip, and it fits the report: Stan does best when priorities are clearly defined, and less well when several competing tasks have to be ordered without a rule. This is a good coaching point rather than a concern.',
  },
  'demo-q10': {
    answer: 'b', seconds: 16,
    why: 'The calls were only the plan. The goal is the third order, so use the last hour on the warmest leads.',
    shows: 'Owns the outcome, not just the activity.',
  },
  'demo-q11': {
    answer: 'a', seconds: 15,
    why: 'A move to a bigger site is a sales opportunity. Record it and offer to plan their stock for the move.',
    shows: 'Spots the next action without being told.',
  },
  'demo-q12': {
    answer: 'a', seconds: 13,
    why: 'Tell the customer before they find out. Give them the new date and their options so they can plan.',
    shows: 'Puts the customer first and owns the problem instead of passing it on.',
  },
  'demo-q13': {
    answer: 'team>customer_impact>progression>autonomy>recognition>mastery>financial_reward>security', seconds: 38,
    why: 'Not scored, and there is no right order. Stan ranked being part of a strong team and making a difference for customers highest.',
    shows: 'Recognise Stan through team goals and customer outcomes, not just individual rewards.',
  },
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const img = (m: MediaRef, cls: string) => {
  const svg = readFileSync(join('app/public', m.src.replace(/^\.\//, '')), 'utf8');
  return `<img class="${cls}" alt="${esc(m.alt)}" src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}">`;
};
const fmtTime = (s?: number) => (s ? `Timed: ${s / 60} minutes` : 'No time limit');

let n = 0;
let scored = 0;
let best = 0;
const sections = DEMO_ASSESSMENT.sections.map((s, si) => {
  const sectionSeconds = s.questions.reduce((t, q) => t + (STAN[q.questionVersionId]?.seconds ?? 0), 0);
  const qs = s.questions.map((q) => {
    n += 1;
    const stan = STAN[q.questionVersionId];
    if (!stan) throw new Error(`No answer for ${q.questionVersionId}`);
    const key = DEMO_SCORING[q.questionVersionId]?.correctAnswer;
    const right = key != null && stan.answer === key;
    if (key != null) {
      scored += 1;
      if (right) best += 1;
    }
    const text = (id: string) => {
      const o = q.options.find((x) => x.id === id);
      return o ? `${o.image ? img(o.image, 'opt-img') : ''}${esc(o.text ?? o.image?.alt ?? id)}` : esc(id);
    };
    const answer =
      q.kind === 'ranking'
        ? `<ol class="rank">${stan.answer.split('>').map((id) => `<li>${text(id)}</li>`).join('')}</ol>`
        : `<p class="pick"><span class="letter">${stan.answer.toUpperCase()}</span> ${text(stan.answer)}</p>`;
    const verdict =
      key == null
        ? '<span class="tag">Not scored</span>'
        : right
          ? '<span class="tag tag-right">✓ Best answer</span>'
          : `<span class="tag tag-other">Different from the suggested answer</span>`;
    const suggested =
      key != null && !right
        ? `<p class="suggested"><strong>Suggested ${q.kind === 'ranking' ? 'order' : 'answer'}:</strong> ${key.split('>').map((id) => esc(q.options.find((o) => o.id === id)?.text ?? id)).join(' → ')}</p>`
        : '';
    return `<article class="q"><div class="qnum">${n}</div><div>
      <h3>${esc(q.stem)}</h3>
      ${q.detail ? `<div class="detail">${q.detail.map((d) => `<div>${esc(d)}</div>`).join('')}</div>` : ''}
      ${q.image ? img(q.image, 'stem-img') : ''}
      <div class="answer"><div class="row"><span class="lbl">Stan’s answer · ${stan.seconds} seconds</span>${verdict}</div>${answer}${suggested}</div>
      <p><strong>Why:</strong> ${esc(stan.why)}</p>
      <p class="shows"><strong>What it shows:</strong> ${esc(stan.shows)}</p></div></article>`;
  });
  const timing = s.timeLimitSeconds ? ` · Stan used ${Math.floor(sectionSeconds / 60)} min ${sectionSeconds % 60} s of ${s.timeLimitSeconds / 60} minutes` : '';
  return `<section class="sec sec-${si}"><div class="sec-head"><span class="sec-num">${si + 1}</span><div><div class="lbl">Section ${si + 1} · ${fmtTime(s.timeLimitSeconds)}${timing}</div><h2>${esc(s.title)}</h2></div></div>
    ${s.rememberThis ? `<div class="remember"><div class="lbl">Shown at the start – needed later</div><ul>${s.rememberThis.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>` : ''}
    ${qs.join('')}</section>`;
});

const html = `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Stan’s answers</title>
<style>
:root{--ink:#17120e;--ink-soft:#4a4038;--muted:#8a7a6d;--accent:#0d5a3b;--line:#ede0d5;--track:#f3e7dd;--green:#1e7a46;--green-bg:#ddf2e4;--amber-bg:#f9ecd2;--amber-ink:#7d5009;--red:#b13a2a;--red-bg:#f9dfd9}
body{margin:0;font-family:"Segoe UI",system-ui,sans-serif;color:var(--ink);background:linear-gradient(#f7efe9,#fbf4ef);line-height:1.5}
main{max-width:860px;margin:0 auto;padding:24px 16px 64px}
h1,h2,h3{font-family:Georgia,serif;font-weight:800;letter-spacing:-.4px;margin:0}
h1{font-size:30px}h2{font-size:22px}h3{font-size:17px;margin-bottom:6px}
p{margin:6px 0}
.lbl{font-size:.74rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
.warn{background:var(--red-bg);color:var(--red);border-radius:12px;padding:12px 16px;font-weight:600;margin:14px 0}
.card{background:#fff;border:1px solid var(--line);border-radius:16px;padding:20px 22px;margin:16px 0;box-shadow:0 6px 18px -12px rgba(23,18,14,.25)}
.stats{display:flex;flex-wrap:wrap;gap:12px;margin:10px 0}
.stat{background:var(--green-bg);border-radius:12px;padding:10px 16px}.stat b{display:block;font-size:26px;color:var(--accent)}
.sec{background:#fff;border:1px solid var(--line);border-top:6px solid var(--c);border-radius:16px;padding:20px 22px;margin:22px 0}
.sec-0{--c:#1e7a46;--t:#ddf2e4}.sec-1{--c:#2470cc;--t:#e3eefb}.sec-2{--c:#4a3aa7;--t:#ebe8f7}.sec-3{--c:#e87ba4;--t:#fbe7ef}
.sec-head{display:flex;gap:14px;align-items:center;background:var(--t);border-radius:12px;padding:12px 14px}
.sec-num{width:44px;height:44px;border-radius:50%;background:var(--c);color:#fff;display:grid;place-items:center;font-weight:800;font-size:20px;flex:none}
.sec-3 .sec-num,.sec-3 .qnum{color:var(--ink)}
.remember{background:var(--amber-bg);border-radius:12px;padding:10px 14px;margin:12px 0}.remember .lbl{color:var(--amber-ink)}
.q{display:grid;grid-template-columns:36px 1fr;gap:12px;border-top:1px solid var(--track);padding:16px 0;break-inside:avoid}
.qnum{width:32px;height:32px;border-radius:50%;background:var(--c);color:#fff;display:grid;place-items:center;font-weight:800}
.detail{background:#fffdfb;border:1px solid var(--line);border-left:4px solid var(--c);border-radius:10px;padding:8px 12px;margin:6px 0 10px}
.answer{background:var(--t);border-radius:10px;padding:10px 14px;margin:8px 0}
.row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between}
.pick{font-weight:600;display:flex;gap:8px;align-items:center}.letter{font-weight:800;color:var(--muted)}
.rank{margin:6px 0;font-weight:600}
.suggested{background:#fff;border-radius:8px;padding:6px 10px}
.shows{color:var(--ink-soft)}
.tag{font-size:12px;font-weight:700;border-radius:999px;padding:2px 10px;background:var(--track);color:var(--ink-soft)}
.tag-right{background:var(--green);color:#fff}.tag-other{background:var(--amber-bg);color:var(--amber-ink)}
.stem-img{height:60px;margin:6px 0}.opt-img{height:28px;vertical-align:middle;margin-right:6px}
@media print{body{background:#fff}.card,.sec{box-shadow:none}}
</style></head><body><main>
<div class="lbl">Walter Geering · FocusiQ · sample reference profile</div>
<h1>Stan’s answers</h1>
<p>${esc(DEMO_ASSESSMENT.title)} · version <code>${esc(DEMO_ASSESSMENT.version)}</code> · ${n} questions in ${DEMO_ASSESSMENT.sections.length} sections</p>
<div class="warn">Contains the answers. Directors only – do not share with staff, or the assessment stops meaning anything.</div>
<div class="card"><div class="lbl">About Stan</div>
<p>Stan is a <strong>fictional</strong> Sales Manager in the Director demo, a worked example of a strong result. The full report is under <em>Employee report → Stan</em>. Stan is a test user, so the results never count towards anyone else’s benchmarks.</p>
<div class="stats">
<div class="stat"><b>85</b>average across the 10 dimensions</div>
<div class="stat"><b>10 / 10</b>dimensions Strong</div>
<div class="stat"><b>${best} / ${scored}</b>best answers</div>
</div>
<p class="shows">The 85 is not a percentage of correct answers. FocusiQ’s scores also reflect <em>how</em> someone works: speed, first-time accuracy, answers changed and questions revisited. Stan answered quickly, rarely changed an answer and had time to spare in the timed section.</p></div>
${sections.join('\n')}
</main></body></html>`;

writeFileSync(out, html);
console.log(`Wrote ${out}: ${n} questions, ${best} of ${scored} best answers.`);
