/**
 * THE TREEBANK REPORT.
 *
 * Runs `compose` over UD English-EWT twice per sentence — once with the real
 * lemma_form POS table, once with gold UPOS — and prints what coverage alone
 * could not say: whether the parse is right, and when it is wrong, which gold
 * subtree the chart failed to build.
 *
 * Usage:
 *   node scripts/treebank-report.mjs [--split dev|test|train] [--limit N]
 *
 * The default split is `dev`. `test` is the held-out set: reporting on it while
 * iterating on the grammar makes "coverage went up" and "the eval set was
 * fitted" indistinguishable.
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

import { parseConllu, goldAnswer, goldPosMap } from '../codex/core/constellation/treebank.js';
import { diagnose, frontierSignature, OUTCOME } from '../codex/core/constellation/failure-diagnosis.js';
import { summarize } from '../codex/core/constellation/treebank-metrics.js';
import {
  compose, projectAnswer, rankByAttraction, guessPos,
} from '../codex/core/constellation/compose.js';
import { irregularPos } from '../codex/core/lexical-analysis/irregular-forms.js';
import { tokenize } from '../codex/core/tokenizer.js';

const args = process.argv.slice(2);
const argOf = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const SPLIT = argOf('--split', 'dev');
const LIMIT = Number(argOf('--limit', '0')) || Infinity;

const CORPUS = path.resolve(`cache/ud/en_ewt-ud-${SPLIT}.conllu`);
const DICT = path.resolve('scholomance_dict.sqlite');

if (!existsSync(CORPUS)) {
  console.error(`missing ${CORPUS} — run: npm run treebank:fetch`);
  process.exit(1);
}

const LEMMA_POS = new Map([
  ['noun', 'n'], ['verb', 'v'], ['adjective', 'a'], ['adverb', 'r'],
]);
/** UPOS values that name a lexical category; anything else is not one. */
const LEXICAL_UPOS = new Set(['NOUN', 'PROPN', 'VERB', 'ADJ', 'ADV']);

function loadLexicon() {
  if (!existsSync(DICT)) return { posMap: new Map(), senseMap: null };
  const db = new Database(DICT, { readonly: true });

  const posMap = new Map();
  for (const r of db.prepare('SELECT surface_lower, pos FROM lemma_form').iterate()) {
    const tag = LEMMA_POS.get(r.pos);
    if (!tag) continue;
    const have = posMap.get(r.surface_lower);
    if (have) { if (!have.includes(tag)) have.push(tag); } else posMap.set(r.surface_lower, [tag]);
  }

  const senseMap = new Map();
  const rows = db.prepare(
    'SELECT lemma_lower, pos, COUNT(*) AS n FROM wordnet_lemma GROUP BY lemma_lower, pos',
  ).all();
  for (const r of rows) {
    // Satellite adjectives are adjectives — `atomsFor` types `a` and `s` alike.
    const key = r.pos === 's' ? 'a' : r.pos;
    if (!['n', 'v', 'a', 'r'].includes(key)) continue;
    const entry = senseMap.get(r.lemma_lower) || {};
    entry[key] = (entry[key] || 0) + r.n;
    senseMap.set(r.lemma_lower, entry);
  }
  db.close();
  return { posMap, senseMap: senseMap.size > 0 ? senseMap : null };
}

const { posMap, senseMap } = loadLexicon();
const records = parseConllu(readFileSync(CORPUS, 'utf8'));
const sample = records.slice(0, LIMIT === Infinity ? records.length : LIMIT);

const same = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();

let tokenizerAgree = 0;
let tokenizerTotal = 0;
let oracleLeaks = 0;
let oracleTokens = 0;
const signatures = new Map();

const rows = sample.map((record) => {
  const tokens = record.tokens.map((t) => t.form);
  const gold = goldAnswer(record);
  const goldMap = goldPosMap(record);

  /**
   * ORACLE IMPURITY. An empty POS entry does not stop `atomsFor` falling
   * through to `irregularPos` and `guessPos`, so gold UPOS cannot fully
   * suppress a lexical reading. `during` ends in `-ing` and `several` in `-al`;
   * both pick up a lexical atom gold forbids. Claiming a clean oracle would be
   * a check that cannot fail, so the leak is counted and printed instead.
   */
  for (const t of record.tokens) {
    oracleTokens += 1;
    if (LEXICAL_UPOS.has(t.upos)) continue;
    const lower = String(t.form).toLowerCase();
    if (irregularPos(lower).length > 0 || guessPos(lower).length > 0) oracleLeaks += 1;
  }

  let result;
  let goldResult;
  try {
    result = compose(tokens, posMap);
    goldResult = compose(tokens, goldMap);
  } catch {
    return null;
  }

  const answers = result.stable.map(projectAnswer);
  const contained = answers.some((a) => same(a.subject, gold.subject) && same(a.verb, gold.verb));

  let decided = null;
  if (senseMap) {
    const ranked = rankByAttraction(result.stable, senseMap);
    const top = ranked.length > 0 ? projectAnswer(ranked[0].molecule) : null;
    decided = Boolean(top && same(top.subject, gold.subject) && same(top.verb, gold.verb));
  }

  const d = diagnose(record, result, goldResult);

  if (d.outcome !== OUTCOME.PARSED) {
    // Same signature the off-gold Gutenberg path would produce, recorded here
    // so the two can be matched later. Unnamed on purpose.
    const sig = frontierSignature(result, tokens.length);
    signatures.set(sig, (signatures.get(sig) || 0) + 1);
  }

  const rootToken = record.tokens.find((t) => t.head === 0);
  tokenizerTotal += 1;
  if (record.text && tokenize(record.text).length === tokens.length) tokenizerAgree += 1;

  return {
    outcome: d.outcome,
    overGenerated: d.overGenerated,
    categories: d.categories,
    nonProjective: d.nonProjective,
    rootUpos: rootToken ? rootToken.upos : 'NONE',
    contained,
    decided,
  };
}).filter(Boolean);

const report = summarize(rows);
const pct = (x) => (x === null ? '  null' : `${(x * 100).toFixed(1)}%`);

console.log(`\nUD English-EWT / ${SPLIT} — ${report.n} sentences\n`);
console.log(`coverage      ${pct(report.coverage)}   a spanning S exists`);
console.log(`containment   ${pct(report.containment)}   gold answer is among the projected answers`);
console.log(`decision      ${pct(report.decision)}   top-ranked parse projects to the gold answer`);
if (report.decision === null) {
  console.log('              (no sense source — decision is not reported rather than faked)');
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
