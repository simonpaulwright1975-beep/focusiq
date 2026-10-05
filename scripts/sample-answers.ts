/**
 * Prints Stan's answer sheet: the fictional sample reference profile in the
 * Director demo (a Director on leader expectations). Every question as staff see it, the answer
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
import { buildDemoData, SAMPLE_EMPLOYEE_ID } from '../app/src/demo/dataset.js';
import { absoluteBandFor, DEFAULT_METRICS } from '../src/benchmarking/index.js';
import type { MediaRef } from '../src/runner/index.js';

const out = process.argv[process.argv.indexOf('--out') + 1];
if (!out || process.argv.indexOf('--out') < 0) throw new Error('Use --out <file.html>');

/** Stan's answers. `answer` is an option id, or ids joined by '>' for a ranking. */
const STAN: Record<string, { answer: string; seconds: number; why: string; shows: string }> = {
  'demo-q01': {
    answer: 'a', seconds: 14,
    why: 'Invoice copies go through the accounts team, who make sure the correct invoice is sent. No manager needs to be involved.',
    shows: 'Knows the process and passes the request to the right team straight away, instead of escalating it.',
  },
  'demo-q02': {
    answer: 'b', seconds: 41,
    why: 'The Harbour Hotel’s trade discount is 12%, not 10%. The line total (50 × £4.20 = £210) is right, and at under £5,000 the quote needs no Director sign-off.',
    shows: 'Checks the detail on higher-risk work and remembers the facts given at the start.',
  },
  'demo-q03': {
    answer: 'a', seconds: 9,
    why: 'New bespoke orders usually take 3–5 working days, so Wednesday is unlikely for a fresh order – but stock may already be ready. Check stock first and ask exactly when they need them by, instead of just quoting the lead time.',
    shows: 'Keeps hold of key details from the start of the section, sets an honest expectation and still looks for a way to help.',
  },
  'demo-q04': {
    answer: 'a', seconds: 22,
    why: 'Stock differences go to the stock controller. A direct email or Teams message with the details is enough – no need to copy everyone in or involve a Director.',
    shows: 'Proportionate: raises it with the right person, directly, without escalating or creating noise.',
  },
  'demo-q05': {
    answer: 'd', seconds: 18,
    why: 'The triangle turns a quarter-turn clockwise each time: up, right, down, so left comes next.',
    shows: 'Spots patterns under time pressure.',
  },
  'demo-q06': {
    answer: 'b', seconds: 20,
    why: '160 ÷ 25 = 6.4. Cases can’t be split, so round up to 7, or the holiday park is 10 soaps short.',
    shows: 'Applies numbers to a real situation, not just the sum.',
  },
  'demo-q07': {
    answer: 'b', seconds: 11,
    why: 'Order 121 was promised for Tuesday, the earliest date, so it ships first.',
    shows: 'Applies a clear rule quickly and accurately.',
  },
  'demo-q08': {
    answer: 'b', seconds: 19,
    why: 'The bath mats earn £20 − £15 = £5 a pack; the refill earns £12 − £6 = £6. The refill earns more even though it sells for less.',
    shows: 'Commercial awareness: looks at profit, not price.',
  },
  'demo-q09': {
    answer: 'quote>call>crm>drive', seconds: 64,
    why: 'Stan sent the £4,200 quote first to keep the sale moving, then passed the damage details to Customer Service. The suggested order is the other way round: an unhappy customer with guests arriving is the bigger risk to the relationship, and handing the details to Customer Service takes a few minutes before the quote goes out.',
    shows: 'Stan’s one slip, and it fits the report: Stan does best when priorities are clearly defined, and less well when several competing tasks have to be ordered without a rule. This is a good coaching point rather than a concern.',
  },
  'demo-q10': {
    answer: 'b', seconds: 16,
    why: 'The calls were only the plan. The goal is the third order, so use the time on the hotels that already asked for samples – and still plan tomorrow, as the daily routine asks.',
    shows: 'Owns the outcome, not just the activity.',
  },
  'demo-q11': {
    answer: 'a', seconds: 15,
    why: 'A new 80-room hotel is a real opportunity. Record it and offer to plan amenities and linen for the opening.',
    shows: 'Spots the next action without being told.',
  },
  'demo-q12': {
    answer: 'a', seconds: 13,
    why: 'Tell the head housekeeper before they find out. Give the new date and their options so rooms are ready for the weekend.',
    shows: 'Puts the customer first and owns the problem instead of passing it on.',
  },
  // Abstract reasoning
  'ar-03': { answer: 'a', seconds: 41, why: 'The third tile’s count is the first two added together (2 + 2 = 4), the shape stays the same across a row, and the shading appears once per row and column: four solid squares.', shows: 'Finds an arithmetic rule hidden in a picture.' },
  'ar-04': { answer: 'd', seconds: 44, why: 'Shape, number and size each appear once per row and column: two medium circles.', shows: 'Handles three independent rules without losing track.' },
  'ar-05': { answer: 'g', seconds: 27, why: 'The arrow turns a quarter clockwise and the dot moves one corner clockwise each step: arrow up, dot top-left.', shows: 'Tracks two movements at the same time.' },
  'ar-06': { answer: 'a', seconds: 52, why: 'Stan combined every line from the first two tiles. The rule is that lines in both tiles cancel out (row 2 shows it): the answer keeps only the lines in one tile – vertical, horizontal and the top-left diagonal.', shows: 'One of Stan’s two slips: the first row fits “add them together”, and only the second row shows the cancelling. Checking every row before answering would have caught it.' },
  'ar-07': { answer: 'e', seconds: 46, why: 'The third count is the first minus the second (4 − 2 = 2), and shape and shading appear once per row and column: two solid squares.', shows: 'Switches from adding to subtracting rules.' },
  'ar-08': { answer: 'c', seconds: 48, why: 'Stan chose the arrow pointing down. In row n the arrow turns n × 45° each step, so in row 3 it turns 135°: up, down-right, then left. Shading appears once per row and column: outline.', shows: 'Stan’s second slip: assumed the same turn as the row above. The fastest solvers check whether the rule itself changes from row to row.' },
  // Crack the code
  'cc-01': { answer: 'e', seconds: 48, why: '4, 6 and 3 are out. From 9 7 3, both 9 and 7 are in the code but not where they were. From 4 2 9, the 9 is right in the last place. From 6 8 1, 8 is right in the middle. That leaves 7 8 9.', shows: 'Eliminates first, then places the digits that are left.' },
  'cc-02': { answer: 'b', seconds: 62, why: '9, 6, 5 and 7 are out. 0 is in the code but not first. From 3 5 0, the 0 is in the last place. From 4 7 2, the 4 is first. The middle digit is the only one left that fits: 4 1 0.', shows: 'Combines “nothing is correct” clues with position clues.' },
  'cc-03': { answer: 'c', seconds: 70, why: '5, 6 and 4 are out. 0 is in the code and, from 2 3 0, in the last place. From 9 6 2, the 9 is first. From 1 7 4, the 1 is in the code but not first: 9 1 0.', shows: 'Holds several partial facts together until they settle.' },
  'cc-04': { answer: 'd', seconds: 95, why: 'Stan chose 2 6 1 4. The code is 6 5 3 1: 5 1 3 7 shows that 5, 1 and 3 are all in the code, and 7 1 3 4 then rules out 4 and 7. 2 6 1 4 fits every clue except 5 1 3 7.', shows: 'Stan’s only miss here, on the hardest code. Under time pressure the final check against every clue was skipped – worth a conversation about how Stan double-checks under pressure.' },
  // Sales figures
  'sm-01': { answer: 'e', seconds: 45, why: '£40,000 − £26,500 = £13,500 still to sell, over the 6 working days left: £2,250 a day.', shows: 'Works out what is needed from here, not the average so far.' },
  'sm-02': { answer: 'd', seconds: 50, why: '£120,000 ÷ £1,500 = 80 orders. With 1 in 4 quotes converting, that is 80 × 4 = 320 quotes.', shows: 'Works backwards from the target to the activity needed.' },
  'sm-03': { answer: 'c', seconds: 30, why: '8 orders from 50 meetings: 8 ÷ 50 = 16%.', shows: 'Picks the right stage of the funnel to measure.' },
  'sm-04': { answer: 'c', seconds: 35, why: 'Profit £4.00 − £2.40 = £1.60, divided by the price £4.00 = 40% margin. (66.7% is the mark-up on cost, a different measure.)', shows: 'Knows margin from mark-up – a common and costly mix-up.' },
  'sm-05': { answer: 'b', seconds: 70, why: 'Stan chose 333. At full price the profit is £3 a unit, £3,000 on 1,000. With 10% off the price is £9, so the profit falls to £2 a unit: 1,500 units are needed, 500 more. 333 more is what a 10% fall in profit would need, but the discount cuts profit by a third.', shows: 'Stan’s miss on the figures, and the best coaching point: a small discount on price is a big cut in profit. A useful one for any Director to share with the sales team.' },
  'sm-06': { answer: 'b', seconds: 55, why: '£8,000 × 50% = £4,000; £20,000 × 10% = £2,000; £5,000 × 80% = £4,000. Total £10,000.', shows: 'Values a pipeline realistically rather than at face value.' },
  'sm-07': { answer: 'b', seconds: 80, why: 'Target: £18,000 + 15% = £20,700. At £13,200 ÷ 9 = £1,466.67 a month, the year ends at £17,600: £3,100 short.', shows: 'Projects forward and sees a shortfall early enough to act.' },
  'sm-08': { answer: 'a', seconds: 60, why: 'A: 0.6 × £2,000 × 35% = £420. B: 0.3 × £5,000 × 20% = £300. Call A, by £120.', shows: 'Chooses on expected profit, not the size of the order.' },
  'sm-09': { answer: 'b', seconds: 50, why: '52 ÷ 6 = about 8.7 orders a year, × £1,800 = £15,600.', shows: 'Thinks about an account’s value over the year, not one order at a time.' },
  'sm-10': { answer: 'c', seconds: 55, why: 'Margin is a share of the selling price, so price = cost ÷ (1 − 30%) = £3.15 ÷ 0.7 = £4.50. (£4.10 is a 30% mark-up on cost, which is only a 23% margin.)', shows: 'Prices to a margin correctly – the mark-up trap again.' },
  'demo-q14': { answer: 'a', seconds: 20, why: 'Bespoke labels are a normal order. Confirm it, set the 3–5 working day expectation and quote it properly.', shows: 'Sells the bespoke service confidently, with the right lead time and a price agreed up front.' },
  'demo-q15': { answer: 'a', seconds: 18, why: 'Running out mid-week is a problem worth solving now: a regular delivery sized to their usage keeps rooms stocked and builds a steady order.', shows: 'Turns a passing comment into a next step that helps the customer and grows the account.' },
  'demo-q16': { answer: 'a', seconds: 22, why: 'Customer Service handles missing items. Passing the full details over straight away, and telling the operations manager it is in hand, protects the wedding weekend.', shows: 'Owns the customer’s outcome while using the right team, instead of passing the problem back.' },
  'demo-q17': { answer: 'a', seconds: 25, why: 'A six-site proposal is a live opportunity worth a call today; the CRM notes still get done before finishing.', shows: 'Puts the opportunity first without dropping the daily routine.' },
  'demo-q18': { answer: 'b', seconds: 48, why: '150 × £4.20 = £630.00, not £603.00 – the digits are swapped, so the subtotal, discount and total are all £27 too low before discount. The 12% discount is right for this account, and the total is well under £5,000.', shows: 'Checks every line, not just the headline figures.' },
  'demo-q19': { answer: 'b', seconds: 30, why: '1,800 × £3.10 = £5,580, which is over £5,000, so it needs Director sign-off before it goes. The 12% discount belongs to The Harbour Hotel’s account, not this one.', shows: 'Remembers the rules from the start of the section, works out that one applies, and doesn’t work round it.' },
  'demo-q20': { answer: 'a', seconds: 35, why: '120 + 40 = 160 packs a month. A third of the 40 new lodges is about 13, so offer dog packs for those.', shows: 'Reads carefully – “a third of the new lodges”, not all of them – and spots the extra sale.' },
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

// Stan's latest results against leader expectations, from the same demo data as the report.
const demo = buildDemoData({ sampleOnly: true });
const stan = demo.employees.find((e) => e.id === SAMPLE_EMPLOYEE_ID)!;
const latest = demo.assessments.filter((a) => a.employeeId === stan.id).at(-1)!;
const dims = DEFAULT_METRICS.filter((m) => m.coreDimension).map((m) => ({
  label: m.label,
  value: latest.scores[m.key]!,
  band: absoluteBandFor(m, latest.scores[m.key]!, stan.expectations).band,
}));
const strong = dims.filter((d) => d.band === 'Strong');
const expected = dims.filter((d) => d.band === 'Expected / Typical');
const range = `${Math.min(...dims.map((d) => d.value))}–${Math.max(...dims.map((d) => d.value))}`;

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
<p>Stan is a <strong>fictional</strong> ${esc(stan.role ?? 'Director')}, a worked example of a strong, realistic leader’s result. The full report is under <em>Employee report → Stan</em>. Stan is measured against <strong>leader expectations</strong>: Strong 80+, Expected 70–79, Development under 70.</p>
<div class="stats">
<div class="stat"><b>${strong.length} / ${dims.length}</b>dimensions Strong</div>
<div class="stat"><b>${expected.length} / ${dims.length}</b>Expected (${esc(expected.map((d) => d.label).join(', '))})</div>
<div class="stat"><b>${range}</b>score range, out of 100</div>
<div class="stat"><b>${best} / ${scored}</b>best answers</div>
</div>
<p class="shows">There is no overall score. Each dimension is scored out of 100, and the scores are not a percentage of correct answers: they also reflect <em>how</em> someone works – speed, first-time accuracy, answers changed and questions revisited. Stan answered quickly, rarely changed an answer and had time to spare in the timed section.</p></div>
${sections.join('\n')}
</main></body></html>`;

writeFileSync(out, html);
console.log(`Wrote ${out}: ${n} questions, ${best} of ${scored} best answers.`);
