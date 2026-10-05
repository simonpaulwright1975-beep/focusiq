/**
 * Builds the SQL that loads the "Live the Walter Geering Way" answer key into
 * focusiq.wg_way_questions (Directors only; staff browsers never get it).
 * The output contains the answers: keep it out of git (supabase/content/ is
 * ignored) and share it with Directors only.
 *
 *   npx vite-node scripts/wg-way-sql.ts -- --out supabase/content/wg-way-answers.sql
 *
 * Re-running is safe: rows are updated in place. Questions no longer in the
 * bank are switched off (active = false) rather than removed, so past sittings
 * still score.
 */
import { writeFileSync } from 'node:fs';
import { WG_WAY_TEST } from '../app/src/demo/wgWayBank.js';
import { WG_WAY_ANSWERS } from '../app/src/demo/wgWayScoring.js';

const args = process.argv.slice(2);
const out = args[args.indexOf('--out') + 1];
const q = (s: string) => `'${s.replaceAll("'", "''")}'`;

const questions = WG_WAY_TEST.sections[0]!.questions;
const rows = questions.map((x) => {
  const answer = WG_WAY_ANSWERS[x.questionVersionId];
  if (!answer) throw new Error(`No answer for ${x.questionVersionId}`);
  if (!x.topic) throw new Error(`No topic for ${x.questionVersionId}`);
  if (!x.options.some((o) => o.id === answer)) throw new Error(`Answer ${answer} is not an option of ${x.questionVersionId}`);
  return `  (${q(x.questionVersionId)}, ${q(x.topic)}, ${q(answer)}, true)`;
});

const sql = `-- Live the Walter Geering Way answer key (${rows.length} questions). DIRECTORS ONLY – contains the answers.
insert into focusiq.wg_way_questions (id, topic, answer, active) values
${rows.join(',\n')}
on conflict (id) do update set topic = excluded.topic, answer = excluded.answer, active = true;

update focusiq.wg_way_questions set active = false
 where id not in (${questions.map((x) => q(x.questionVersionId)).join(', ')});
`;

if (out) {
  writeFileSync(out, sql);
  console.log(`Wrote ${rows.length} answers to ${out}`);
} else {
  process.stdout.write(sql);
}
