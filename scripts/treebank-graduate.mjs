#!/usr/bin/env node
/**
 * GRADUATING A GRAMMAR CHANGE.
 *
 * A bond added to the Grimoire, a lexicon rule, a tokenizer change — all of them
 * arrive as "this should unblock about twenty-five sentences". The report ranks
 * those predictions (`failure categories — predicted unblock if this bond alone
 * is added`, with a sole-cause count that is a falsifiable claim). Nothing
 * checked the claim afterwards.
 *
 * This runs the frozen gate corpus against the WORKING TREE, diffs it against
 * the frozen baseline sentence by sentence, and writes a proposal a human can
 * read and approve. It never edits the baseline and it never approves itself:
 * `approved: false` is written into the artifact, exactly as cleri-probe's
 * graduation does.
 *
 *   node scripts/treebank-graduate.mjs [--out proposal.json] [--label "PUNCT + NOUN -> NOUN"]
 *
 * Exit 0 when the tree matches the baseline, 3 when it differs — a difference is
 * a result to review, not an error.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { parseConllu } from '../codex/core/constellation/treebank.js';
import { runTreebank } from '../codex/core/constellation/treebank-run.js';

const args = process.argv.slice(2);
const argOf = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const OUT = argOf('--out', null);
const LABEL = argOf('--label', '(unlabelled change)');

const DIR = path.resolve('tests/qa/fixtures/constellation');
for (const name of ['treebank-gate.conllu', 'treebank-gate-lexicon.json', 'treebank-gate-baseline.json']) {
  if (!existsSync(path.join(DIR, name))) {
    console.error(`missing ${name} — run: npm run treebank:gate:freeze`);
    process.exit(2);
  }
}

const conllu = readFileSync(path.join(DIR, 'treebank-gate.conllu'), 'utf8');
const lexicon = JSON.parse(readFileSync(path.join(DIR, 'treebank-gate-lexicon.json'), 'utf8'));
const baseline = JSON.parse(readFileSync(path.join(DIR, 'treebank-gate-baseline.json'), 'utf8'));

const records = parseConllu(conllu);
const run = runTreebank({
  records,
  posMap: new Map(Object.entries(lexicon)),
  senseMap: null,
  parser: baseline.run.parser,
  maxTokens: baseline.run.maxTokens,
});

// The analysed rows are the records that survived the length cap, in order.
const analysed = records.filter(record => record.tokens.length <= baseline.run.maxTokens);
const textOf = index => {
  const record = analysed[index];
  if (!record) return '(unknown sentence)';
  return record.text || record.tokens.map(t => t.form).join(' ');
};

const OUTCOME_NAME = { P: 'PARSED', L: 'LEXICAL', G: 'GRAMMAR', R: 'ROOT_TYPE_MISMATCH' };
const now = run.rows.map(row => row.outcome[0]).join('');
const before = baseline.outcomes ?? '';

const gained = [];
const lost = [];
const shifted = [];
for (let i = 0; i < Math.max(now.length, before.length); i += 1) {
  const was = before[i];
  const is = now[i];
  if (was === is) continue;
  const entry = { index: i, from: OUTCOME_NAME[was] ?? was, to: OUTCOME_NAME[is] ?? is, text: textOf(i) };
  if (is === 'P') gained.push(entry);
  else if (was === 'P') lost.push(entry);
  else shifted.push(entry);
}

// ─── Did the predicted unblock happen? ───────────────────────────────────────
// The baseline froze `soleCause` per bond: the sentences whose entire failure
// frontier was that one category. That is the number a proposal is promising.
const predicted = (baseline.categories ?? []).slice(0, 8).map(c => ({
  label: c.label, promisedSoleCause: c.soleCause, promisedFailures: c.failures,
}));

const nowSignatures = new Set(run.signatures.keys());
const beforeSignatures = new Set(Object.keys(baseline.signatures?.census ?? {}));
const retiredShapes = [...beforeSignatures].filter(s => !nowSignatures.has(s)).sort();
const introducedShapes = [...nowSignatures].filter(s => !beforeSignatures.has(s)).sort();

const proposal = {
  contract: 'SCHOL-TREEBANK-GRADUATION-v1',
  approved: false,
  label: LABEL,
  measuredAt: new Date().toISOString().slice(0, 10),
  corpus: { conlluSha256: baseline.inputs.conlluSha256, analyzed: run.report.n },
  before: baseline.metrics,
  after: {
    coverage: run.report.coverage,
    containment: run.report.containment,
    parsedBoth: run.report.ablation.bothFine,
    parsedOnlyBecausePosWasVague: run.report.ablation.overGenerated,
    taggingFailure: run.report.ablation.tagging,
    grammarFailure: run.report.ablation.grammar,
  },
  delivered: { gained: gained.length, lost: lost.length, shifted: shifted.length },
  gained,
  // The list a reviewer reads first. A change that gains forty and loses three
  // may still be wrong if the three are the ones that matter.
  lost,
  shifted,
  shapes: { retired: retiredShapes, introduced: introducedShapes },
  predictionsOnRecord: predicted,
};

const pct = x => `${(x * 100).toFixed(2)}%`;
console.log(`\n${LABEL}`);
console.log(`  coverage      ${pct(baseline.metrics.coverage)} → ${pct(proposal.after.coverage)}`);
console.log(`  containment   ${pct(baseline.metrics.containment)} → ${pct(proposal.after.containment)}`);
console.log(`  vague-only    ${baseline.metrics.parsedOnlyBecausePosWasVague} → ${proposal.after.parsedOnlyBecausePosWasVague}`);
console.log(`\n  gained ${gained.length}   lost ${lost.length}   reclassified ${shifted.length}`);
for (const entry of gained.slice(0, 10)) console.log(`    + ${entry.from} → PARSED   ${entry.text.slice(0, 90)}`);
for (const entry of lost.slice(0, 20)) console.log(`    - PARSED → ${entry.to}   ${entry.text.slice(0, 90)}`);
for (const entry of shifted.slice(0, 10)) console.log(`    ~ ${entry.from} → ${entry.to}   ${entry.text.slice(0, 90)}`);
if (retiredShapes.length > 0) console.log(`\n  failure shapes retired: ${retiredShapes.length}`);
if (introducedShapes.length > 0) console.log(`  failure shapes introduced: ${introducedShapes.length}`);

if (gained.length + lost.length + shifted.length === 0) {
  console.log('\n  the working tree scores exactly what the baseline froze — nothing to graduate.');
}
console.log('\n  approved: false — a measurement is not a decision.');

if (OUT) {
  writeFileSync(path.resolve(OUT), `${JSON.stringify(proposal, null, 2)}\n`);
  console.log(`  written → ${OUT}`);
}

process.exitCode = gained.length + lost.length + shifted.length === 0 ? 0 : 3;
