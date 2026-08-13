/**
 * THE TREEBANK REPORT.
 *
 * Runs `compose` over UD English-EWT twice per sentence — once with the real
 * lemma_form POS table, once with gold UPOS — and prints what coverage alone
 * could not say: whether the parse is right, and when it is wrong, which gold
 * subtree the chart failed to build.
 *
 * Usage:
 *   node scripts/treebank-report.mjs [--split dev|test|train] [--limit N] [--max-tokens N]
 *
 * The default split is `dev`. `test` is the held-out set: reporting on it while
 * iterating on the grammar makes "coverage went up" and "the eval set was
 * fitted" indistinguishable.
 *
 * `compose` materialises every parse into `cell[from][to]`, so the chart grows
 * combinatorially with sentence length and does not terminate on some long
 * sentences. `--max-tokens` (default 28) skips a sentence before it ever
 * reaches `compose` rather than hanging the runner. The skip count is printed,
 * not absorbed silently, because `report.n` is already post-filter and a
 * silent skip would quietly narrow what "coverage" means.
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

import { parseConllu } from '../codex/core/constellation/treebank.js';
import { runTreebank } from '../codex/core/constellation/treebank-run.js';

const args = process.argv.slice(2);
const argOf = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const SPLIT = argOf('--split', 'dev');
const LIMIT = Number(argOf('--limit', '0')) || Infinity;
const MAX_TOKENS = Number(argOf('--max-tokens', '28')) || 28;
const PARSER = argOf('--parser', 'classic');
if (PARSER !== 'classic' && PARSER !== 'packed') {
  console.error(`--parser must be classic or packed, got ${PARSER}`);
  process.exit(1);
}

const CORPUS = path.resolve(`cache/ud/en_ewt-ud-${SPLIT}.conllu`);
const DICT = path.resolve('scholomance_dict.sqlite');

if (!existsSync(CORPUS)) {
  console.error(`missing ${CORPUS} — run: npm run treebank:fetch`);
  process.exit(1);
}

const LEMMA_POS = new Map([
  ['noun', 'n'], ['verb', 'v'], ['adjective', 'a'], ['adverb', 'r'],
]);
function loadLexicon() {
  if (!existsSync(DICT)) return { posMap: new Map(), senseMap: null };
  const db = new Database(DICT, { readonly: true });

  const posTable = new Map();
  for (const r of db.prepare('SELECT surface_lower, pos FROM lemma_form').iterate()) {
    const tag = LEMMA_POS.get(r.pos);
    if (!tag) continue;
    const have = posTable.get(r.surface_lower);
    if (have) { if (!have.includes(tag)) have.push(tag); } else posTable.set(r.surface_lower, [tag]);
  }

  const senses = new Map();
  const senseRows = db.prepare(
    'SELECT lemma_lower, pos, COUNT(*) AS n FROM wordnet_lemma GROUP BY lemma_lower, pos',
  ).all();
  for (const r of senseRows) {
    // Satellite adjectives are adjectives — `atomsFor` types `a` and `s` alike.
    const key = r.pos === 's' ? 'a' : r.pos;
    if (!['n', 'v', 'a', 'r'].includes(key)) continue;
    const entry = senses.get(r.lemma_lower) || {};
    entry[key] = (entry[key] || 0) + r.n;
    senses.set(r.lemma_lower, entry);
  }
  db.close();
  return { posMap: posTable, senseMap: senses.size > 0 ? senses : null };
}

const { posMap, senseMap } = loadLexicon();
const records = parseConllu(readFileSync(CORPUS, 'utf8'));
const sample = records.slice(0, LIMIT === Infinity ? records.length : LIMIT);

const {
  report, sampled, skippedTooLong, droppedThrew,
  oracleLeaks, oracleTokens, tokenizerAgree, tokenizerTotal, signatures,
} = runTreebank({ records: sample, posMap, senseMap, parser: PARSER, maxTokens: MAX_TOKENS });

const pct = (x) => (x === null ? '  null' : `${(x * 100).toFixed(1)}%`);

console.log(`\nUD English-EWT / ${SPLIT} — ${report.n} sentences (parser: ${PARSER}, cap: --max-tokens ${MAX_TOKENS})\n`);
console.log(`  skipped (> ${MAX_TOKENS} tokens)     ${skippedTooLong} of ${sampled}   — compose materialises every parse; these do not terminate`);
console.log(`  dropped (compose threw)    ${droppedThrew}`);
console.log(`coverage      ${pct(report.coverage)}   a spanning S exists`);
console.log(`containment   ${pct(report.containment)}   gold answer is among the projected answers`);
console.log(`decision      ${pct(report.decision)}   top-ranked parse projects to the gold answer`);
if (report.decision === null) {
  console.log(PARSER === 'packed'
    ? '              (packed nodes are not single parses — rankByAttraction does not apply; see the ranking section of the spec)'
    : '              (no sense source — decision is not reported rather than faked)');
}

console.log('\nby gold root UPOS');
for (const b of report.byRootUpos) {
  console.log(`  ${b.upos.padEnd(6)} n=${String(b.n).padStart(5)}  coverage ${pct(b.coverage)}  containment ${pct(b.containment)}`);
}

console.log('\nPOS ablation (real lemma_form table vs gold UPOS)');
console.log(`  parses with both                  ${report.ablation.bothFine}`);
console.log(`  parses only because POS was vague ${report.ablation.overGenerated}   <- coverage counts these as wins`);
console.log(`  tagging failure                   ${report.ablation.tagging}`);
console.log(`  grammar failure                   ${report.ablation.grammar}`);
console.log(`  oracle impurity: ${oracleLeaks}/${oracleTokens} tokens (${(oracleLeaks / Math.max(oracleTokens, 1) * 100).toFixed(1)}%) got a lexical atom gold forbids`);

console.log('\nfailure categories — predicted unblock if this bond alone is added');
for (const c of report.categories.slice(0, 20)) {
  console.log(`  ${c.label.padEnd(34)} ${String(c.failures).padStart(5)} failures   ${String(c.soleCause).padStart(5)} sole cause`);
}

console.log('\ninstrument honesty');
console.log(`  failures                 ${report.classifier.failures}`);
console.log(`  classified               ${report.classifier.withCategory} (${(report.classifier.withCategory / Math.max(report.classifier.failures, 1) * 100).toFixed(1)}%)`);
console.log(`  mean causes per failure  ${report.classifier.meanCauses.toFixed(2)}`);
console.log(`  non-projective subtrees  ${report.nonProjective} (excluded from categorisation)`);
console.log(`  tokenizer agreement      ${tokenizerAgree}/${tokenizerTotal} sentences match UD's token count`);

console.log('\nunnamed frontier signatures (top 10)');
for (const [sig, n] of [...signatures.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
  console.log(`  ${String(n).padStart(5)}  ${sig}`);
}
console.log('');
