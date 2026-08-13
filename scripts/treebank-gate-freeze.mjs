#!/usr/bin/env node
/**
 * FREEZING THE TREEBANK REGRESSION GATE.
 *
 * The full report needs two things this repository does not carry: a 1.9MB UD
 * corpus and a 223MB dictionary, both gitignored. A gate that needs them is a
 * gate that skips on every fresh checkout, and a skipped gate is a check that
 * cannot fail. So this writes three frozen artifacts that make the gate
 * hermetic:
 *
 *   treebank-gate.conllu          a deterministic slice of UD English-EWT dev
 *   treebank-gate-lexicon.json    the lemma_form rows those sentences can reach
 *   treebank-gate-baseline.json   what the composer scores against them today
 *
 * THE LEXICON IS FROZEN ON PURPOSE. Holding it fixed is what makes a coverage
 * change attributable to the grammar. If the gate read the live dictionary, a
 * dictionary import would move coverage and the gate would blame the parser.
 * The full-corpus report still measures against the real table; that is its job
 * and this is not it.
 *
 * Run this only to move the baseline deliberately, and say why in the commit:
 *   node scripts/treebank-gate-freeze.mjs [--limit N] [--stride K]
 *
 * UD English-EWT is distributed under CC BY-SA 4.0
 * (https://github.com/UniversalDependencies/UD_English-EWT). The slice keeps
 * that licence.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

import { parseConllu } from '../codex/core/constellation/treebank.js';
import { runTreebank } from '../codex/core/constellation/treebank-run.js';

const args = process.argv.slice(2);
const argOf = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

/** Sentences kept. Enough grammar to be worth gating, small enough to commit. */
const LIMIT = Number(argOf('--limit', '500'));
/**
 * Every Kth sentence rather than the first N. EWT is ordered by document, so a
 * prefix is one genre and would gate the grammar against email or reviews alone.
 */
const STRIDE = Number(argOf('--stride', '3'));
const MAX_TOKENS = Number(argOf('--max-tokens', '20'));
const PARSER = 'packed';

const CORPUS = path.resolve('cache/ud/en_ewt-ud-dev.conllu');
const DICT = path.resolve('scholomance_dict.sqlite');
const OUT_DIR = path.resolve('tests/qa/fixtures/constellation');

const LEMMA_POS = new Map([
  ['noun', 'n'], ['verb', 'v'], ['adjective', 'a'], ['adverb', 'r'],
]);

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!existsSync(CORPUS)) fail(`missing ${CORPUS} — run: npm run treebank:fetch`);
if (!existsSync(DICT)) fail(`missing ${DICT} — the baseline must be frozen from the real lemma_form table`);

const sha = text => createHash('sha256').update(text).digest('hex');

// ─── The corpus slice, kept verbatim ─────────────────────────────────────────
// Re-serializing would mean trusting a round trip through our own reader to
// preserve a format the reader is the thing under test against.
const raw = readFileSync(CORPUS, 'utf8');
const blocks = raw.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
const selected = blocks.filter((_, index) => index % STRIDE === 0).slice(0, LIMIT);
const fixtureText = `${selected.join('\n\n')}\n\n`;

// ─── The lexicon slice, restricted to forms these sentences can reach ────────
// Every form the composer can ASK ABOUT, not merely every token. `compoundTags`
// queries each hyphen-separated piece, so a slice holding only whole tokens
// would answer `e-mail` while the live table answers `e` and `mail` too — the
// gate would then exercise behaviour production does not have. The equivalence
// check below is what stops this from going stale again.
const forms = new Set();
for (const record of parseConllu(fixtureText)) {
  for (const token of record.tokens) {
    const form = String(token.form).toLowerCase();
    forms.add(form);
    for (const piece of form.split('-')) if (piece) forms.add(piece);
  }
}

const db = new Database(DICT, { readonly: true });
const posMap = new Map();
const livePosMap = new Map();
for (const row of db.prepare('SELECT surface_lower, pos FROM lemma_form').iterate()) {
  const tag = LEMMA_POS.get(row.pos);
  if (!tag) continue;
  const live = livePosMap.get(row.surface_lower);
  if (live) { if (!live.includes(tag)) live.push(tag); } else livePosMap.set(row.surface_lower, [tag]);
  if (!forms.has(row.surface_lower)) continue;
  const have = posMap.get(row.surface_lower);
  if (have) { if (!have.includes(tag)) have.push(tag); } else posMap.set(row.surface_lower, [tag]);
}
db.close();

const lexicon = {};
for (const key of [...posMap.keys()].sort()) lexicon[key] = [...posMap.get(key)].sort();
const lexiconText = `${JSON.stringify(lexicon, null, 0)}\n`;

// ─── The baseline ────────────────────────────────────────────────────────────
// senseMap is null: the packed parser cannot take a decision, so a sense source
// would change nothing and pretending otherwise would freeze an unused input.
const records = parseConllu(fixtureText);
const run = runTreebank({
  records,
  posMap: new Map(Object.entries(lexicon)),
  senseMap: null,
  parser: PARSER,
  maxTokens: MAX_TOKENS,
});

/**
 * THE SLICE MUST SCORE WHAT THE WHOLE DICTIONARY SCORES.
 *
 * A frozen lexicon is only a fair stand-in while it answers every question the
 * composer asks. It stopped doing that silently once `compoundTags` began
 * querying hyphen pieces, and nothing noticed because the equivalence had been
 * checked by hand, once, before that feature existed. So the freezer checks it
 * every time and refuses to write a slice that scores differently.
 */
const liveRun = runTreebank({
  records,
  posMap: livePosMap,
  senseMap: null,
  parser: PARSER,
  maxTokens: MAX_TOKENS,
});
const drift = ['coverage', 'containment'].filter(
  key => run.report[key] !== liveRun.report[key],
).concat(
  run.report.n !== liveRun.report.n ? ['n'] : [],
  run.rows.map(r => r.outcome).join('') !== liveRun.rows.map(r => r.outcome).join('') ? ['outcomes'] : [],
);
if (drift.length > 0) {
  console.error('REFUSING TO FREEZE: the lexicon slice does not reproduce the live dictionary.');
  console.error(`  differs on: ${drift.join(', ')}`);
  console.error(`  slice  coverage ${run.report.coverage} containment ${run.report.containment} n ${run.report.n}`);
  console.error(`  live   coverage ${liveRun.report.coverage} containment ${liveRun.report.containment} n ${liveRun.report.n}`);
  console.error('\nThe slice is built from the forms the composer can ask about. If a new');
  console.error('identity source asks a question the slice cannot answer, widen `forms`.');
  process.exit(1);
}

/**
 * ─── RETIREMENT ────────────────────────────────────────────────────────────
 *
 * A failure signature that disappears from the corpus is a shape somebody fixed.
 * Recorded here, it becomes an antigen: the gate hunts it forever, so the fix
 * cannot quietly rot back in. The list only grows, and every entry is the
 * receipt for a repair.
 *
 * This is also what stops `--freeze` from being an undo button. Re-freezing
 * accepts new numbers, but it REFUSES to accept a baseline in which a retired
 * shape has come back, unless a human says so in writing.
 */
const ANTIGENS_PATH = path.join(OUT_DIR, 'treebank-gate-antigens.json');
const previous = existsSync(path.join(OUT_DIR, 'treebank-gate-baseline.json'))
  ? JSON.parse(readFileSync(path.join(OUT_DIR, 'treebank-gate-baseline.json'), 'utf8'))
  : null;
const antigens = existsSync(ANTIGENS_PATH)
  ? JSON.parse(readFileSync(ANTIGENS_PATH, 'utf8'))
  : { contract: 'SCHOL-TREEBANK-ANTIGEN-v1', retired: [] };

const nowFailing = new Set(run.signatures.keys());
const relapsed = antigens.retired.filter(entry => nowFailing.has(entry.signature));
const allowRelapse = args.includes('--allow-relapse');
if (relapsed.length > 0 && !allowRelapse) {
  console.error(`REFUSING TO FREEZE: ${relapsed.length} retired failure shape(s) are back:`);
  for (const entry of relapsed) {
    console.error(`  ${entry.signature}   retired ${entry.retiredOn}, was failing ${entry.wasFailing} sentence(s)`);
  }
  console.error('\nA relapse is a regression with a name. Fix it, or re-run with');
  console.error('--allow-relapse and say in the commit why the shape is allowed back.');
  process.exit(1);
}

// A signature the previous baseline saw fail and this run does not is retired.
const previousFailing = previous?.signatures?.census ?? {};
const newlyRetired = Object.entries(previousFailing)
  .filter(([signature]) => !nowFailing.has(signature))
  .map(([signature, wasFailing]) => ({
    signature,
    wasFailing,
    retiredOn: new Date().toISOString().slice(0, 10),
  }));
antigens.retired = [
  ...antigens.retired.filter(entry => !relapsed.includes(entry)),
  ...newlyRetired,
].sort((a, b) => a.signature.localeCompare(b.signature));

const census = {};
for (const key of [...run.signatures.keys()].sort()) census[key] = run.signatures.get(key);

const baseline = {
  contract: 'SCHOL-TREEBANK-GATE-v1',
  frozenAt: new Date().toISOString().slice(0, 10),
  corpus: 'UD English-EWT dev (CC BY-SA 4.0)',
  selection: { stride: STRIDE, limit: LIMIT, ofBlocks: blocks.length },
  run: { parser: PARSER, maxTokens: MAX_TOKENS },
  inputs: {
    conlluSha256: sha(fixtureText),
    lexiconSha256: sha(lexiconText),
    lexiconEntries: Object.keys(lexicon).length,
  },
  sample: {
    sampled: run.sampled,
    analyzed: run.report.n,
    skippedTooLong: run.skippedTooLong,
    droppedThrew: run.droppedThrew,
  },
  metrics: {
    coverage: run.report.coverage,
    containment: run.report.containment,
    parsedBoth: run.report.ablation.bothFine,
    parsedOnlyBecausePosWasVague: run.report.ablation.overGenerated,
    taggingFailure: run.report.ablation.tagging,
    grammarFailure: run.report.ablation.grammar,
  },
  instrument: {
    failures: run.report.classifier.failures,
    withCategory: run.report.classifier.withCategory,
    oracleLeaks: run.oracleLeaks,
    oracleTokens: run.oracleTokens,
  },
  // PER-SENTENCE OUTCOMES, in analysis order. Aggregates can hold level while
  // two sentences trade places, and that trade is exactly what a reviewer needs
  // to see. `outcomes` is one letter each: Parsed, Lexical, Grammar, Root.
  outcomes: run.rows.map(row => row.outcome[0]).join(''),
  contained: run.rows.map(row => (row.contained ? '1' : '0')).join(''),
  // The failure shapes, and how many sentences wear each one. The census is what
  // makes retirement computable: a shape here today and absent tomorrow is a fix.
  signatures: {
    distinct: run.signatures.size,
    failing: [...run.signatures.values()].reduce((sum, n) => sum + n, 0),
    census,
  },
  // The ranked intervention list, frozen so a bond that was predicted to unblock
  // N sentences can be checked against what it actually unblocked.
  categories: run.report.categories.map(c => ({
    label: c.label, failures: c.failures, soleCause: c.soleCause,
  })),
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(path.join(OUT_DIR, 'treebank-gate.conllu'), fixtureText);
writeFileSync(path.join(OUT_DIR, 'treebank-gate-lexicon.json'), lexiconText);
writeFileSync(path.join(OUT_DIR, 'treebank-gate-baseline.json'), `${JSON.stringify(baseline, null, 2)}\n`);
writeFileSync(ANTIGENS_PATH, `${JSON.stringify(antigens, null, 2)}\n`);

console.log(`frozen ${selected.length} sentences (every ${STRIDE}rd of ${blocks.length}), ${run.report.n} analyzed`);
console.log(`  coverage    ${(baseline.metrics.coverage * 100).toFixed(2)}%`);
console.log(`  containment ${(baseline.metrics.containment * 100).toFixed(2)}%`);
console.log(`  vague-only wins ${baseline.metrics.parsedOnlyBecausePosWasVague}   grammar failures ${baseline.metrics.grammarFailure}`);
console.log(`  lexicon ${baseline.inputs.lexiconEntries} entries`);
console.log(`  failure shapes ${baseline.signatures.distinct} distinct over ${baseline.signatures.failing} sentences`);
if (newlyRetired.length > 0) {
  console.log(`  RETIRED ${newlyRetired.length} failure shape(s) — now hunted forever:`);
  for (const entry of newlyRetired.slice(0, 10)) {
    console.log(`    ${entry.signature}   (was failing ${entry.wasFailing})`);
  }
  if (newlyRetired.length > 10) console.log(`    … ${newlyRetired.length - 10} more`);
}
if (relapsed.length > 0) {
  console.log(`  RELAPSE ACCEPTED under --allow-relapse: ${relapsed.length} shape(s) returned and were un-retired.`);
}
console.log(`  antigens ${antigens.retired.length} retired shape(s)`);
console.log(`→ ${OUT_DIR}`);
