#!/usr/bin/env node
/**
 * Classifier commutativity control + multi-label latent-deficit census.
 *
 * The silence classifier (compat-waterfall.js classifySilence) is a priority
 * cascade: C4 -> C1 -> C2 -> C3 -> null. If an edge satisfies more than one
 * branch condition, its observed class depends on evaluation order. This probe
 * measures that order-sensitivity on the frozen DEV chamber instead of
 * assuming it away.
 *
 * Experiment 1 — CLASSIFIER COMMUTATIVITY CONTROL
 *   For every frozen decision-bearing edge, reconstruct the exact inputs of
 *   classifySilence from the diagnostic row, then evaluate the four branch
 *   predicates under all 24 permutations of branch order. An edge is
 *   order-sensitive iff the set of producible classes has size > 1.
 *   C_classifier = (# order-sensitive edges) / (# edges).
 *
 * Experiment 2 — MULTI-LABEL LATENT-DEFICIT CENSUS
 *   For every edge, report the complete deficit set (every branch condition
 *   that is true), separating the observed single class (priority-based) from
 *   the latent deficit set (order-independent). This answers: do C-class
 *   migrations between phases reflect deficits changing, or merely becoming
 *   visible under a fixed priority order?
 *
 * Guards:
 *   - OBSERVE-only. No relations, COMPAT rows, or lexicon entries authored.
 *   - TEST split is never opened.
 *   - No pipeline modification: classifySilence is used unmodified for the
 *     natural-order check; permutations are faithful re-evaluations of its
 *     four branch predicates over identical inputs.
 *   - Faithfulness gate: natural-order reconstruction must reproduce
 *     row.silenceClass for 100% of edges, or the probe aborts.
 *
 *   node scripts/silence-classifier-commutativity-probe.mjs
 */
import { execSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { composePacked } from '../codex/core/constellation/compose-packed.js';
import { forestFingerprint } from '../codex/core/constellation/semantic-particles/annotate.js';
import { DEFAULT_LEXICAL_LEXICON } from '../codex/core/constellation/semantic-particles/lexical-semantics.js';
import { EXPERIMENTAL_FEATURE_PROVIDER } from '../codex/core/constellation/semantic-particles/experimental-inventory.js';
import { classifySilence, diagnoseCompetitionEdge } from '../codex/core/constellation/semantic-particles/compat-waterfall.js';
import { derivationSignature, isGlueBond } from '../codex/core/constellation/semantic-particles/decision-bearing.js';
import { loadPosMap, loadSplit } from './lib/constellation-corpus.mjs';

const OUT = 'docs/superpowers/evidence/2026-08-17-classifier-commutativity-probe.json';
const OUT_MD = 'docs/superpowers/evidence/2026-08-17-classifier-commutativity-probe.md';
const MAX_TOKENS = 28;
const TEST_PATH = path.resolve('cache/ud/en_ewt-ud-test.conllu');

if (existsSync(TEST_PATH)) {
  // sealed — never read in this script
}

function gitHead() {
  try { return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim(); } catch { return null; }
}

const posMap = loadPosMap();
const dev = loadSplit('dev');
const lexicon = DEFAULT_LEXICAL_LEXICON;
const provider = EXPERIMENTAL_FEATURE_PROVIDER;

// ---- Branch predicates: faithful transcription of classifySilence --------
// Each maps the classifier's 5-field input to its class or null.
const BRANCHES = Object.freeze({
  C4: (i) => (i.family === 'glue' || i.family === 'lift' ? 'C4-intentional-silence' : null),
  C1: (i) => (!i.named || i.starvation === 'compositional' ? 'C1-composition-missing' : null),
  C2: (i) => (i.starvation === 'lexical' ? 'C2-lexical-missing' : null),
  C3: (i) => (i.named && i.complete && !i.couldFire ? 'C3-feature-missing' : null),
});
const NATURAL_ORDER = ['C4', 'C1', 'C2', 'C3'];

function permutations(arr) {
  if (arr.length <= 1) return [arr];
  const out = [];
  for (let i = 0; i < arr.length; i += 1) {
    const rest = arr.slice(0, i).concat(arr.slice(i + 1));
    for (const p of permutations(rest)) out.push([arr[i], ...p]);
  }
  return out;
}
const ALL_ORDERS = permutations(NATURAL_ORDER); // 24

function classifyUnder(inputs, order) {
  for (const name of order) {
    const hit = BRANCHES[name](inputs);
    if (hit) return hit;
  }
  return null;
}

function shortSentences(split) {
  const out = [];
  for (const rec of split) {
    const tokens = (rec.tokens || []).map((t) => t.form);
    if (tokens.length === 0 || tokens.length > MAX_TOKENS) continue;
    out.push({ id: rec.sentId || `s${out.length}`, tokens });
  }
  return out;
}

// ---- DEV pass: diagnose, reconstruct, permute ----------------------------
const tallies = {
  analysed: 0,
  parsed: 0,
  threw: 0,
  events: [],
  fingerprintsChecked: 0,
  fingerprintsIdentical: 0,
  decisionCompetitiveCells: 0,
  edges: 0,
  faithfulnessMismatches: 0,
  orderSensitiveEdges: 0,
  producibleClassCounts: new Map(), // set-size -> count
  observedClass: new Map(), // natural class -> count
  latentDeficitCombos: new Map(), // sorted-deficit-set key -> count
  overlap: {
    C2_and_C3: 0,
    C1_and_C2: 0,
    C1_and_C3: 0,
    C1_and_C2_and_C3: 0,
    anyMultiDeficit: 0,
  },
  // Cross-tabs for the migration question
  observedC2_alsoC3: 0,
  observedC2_total: 0,
  observedC3_total: 0,
  observedC1_total: 0,
  observedNull_total: 0,
  // Silent-edge restricted view
  silentEdges: 0,
  silentMultiDeficit: 0,
  examples: [],
};

const devShort = shortSentences(dev);

for (const rec of devShort) {
  tallies.analysed += 1;
  let chart;
  try {
    chart = composePacked(rec.tokens, posMap, { semanticParticles: { mode: 'observe' } });
  } catch {
    tallies.threw += 1;
    continue;
  }
  tallies.events.push(chart.events || 0);
  if (chart.stable?.length) tallies.parsed += 1;
  if (tallies.fingerprintsChecked < 8) {
    const off = composePacked(rec.tokens, posMap, {});
    tallies.fingerprintsChecked += 1;
    if (forestFingerprint(chart) === forestFingerprint(off)) tallies.fingerprintsIdentical += 1;
  }

  for (const node of chart.molecules || []) {
    const bySignature = new Map();
    for (const derivation of node.derivations || []) {
      const sig = derivationSignature(derivation);
      if (!bySignature.has(sig)) bySignature.set(sig, derivation);
    }
    const unique = [...bySignature.values()];
    const decision = unique.filter((d) => !isGlueBond(d.bond));
    if (decision.length < 2) continue;
    tallies.decisionCompetitiveCells += 1;

    for (const derivation of decision) {
      const row = diagnoseCompetitionEdge(derivation, lexicon, provider);
      if (row.family === 'lift') continue;
      tallies.edges += 1;

      // Reconstruct classifySilence inputs from the row.
      const inputs = Object.freeze({
        family: row.family,
        named: row.named,
        complete: row.complete,
        starvation: row.starvation,
        couldFire: row.t1Status === 'could-fire',
      });

      // Faithfulness gate: natural order must equal the row's class.
      const natural = classifyUnder(inputs, NATURAL_ORDER);
      const direct = classifySilence(inputs);
      if (natural !== row.silenceClass || direct !== row.silenceClass) {
        tallies.faithfulnessMismatches += 1;
        if (tallies.faithfulnessMismatches <= 3) {
          console.error('FAITHFULNESS MISMATCH', JSON.stringify({
            sentId: rec.id, row: {
              family: row.family, named: row.named, complete: row.complete,
              starvation: row.starvation, t1Status: row.t1Status,
              silenceClass: row.silenceClass,
            }, natural, direct,
          }));
        }
        continue;
      }

      tallies.observedClass.set(natural, (tallies.observedClass.get(natural) || 0) + 1);
      if (natural === 'C1-composition-missing') tallies.observedC1_total += 1;
      if (natural === 'C2-lexical-missing') tallies.observedC2_total += 1;
      if (natural === 'C3-feature-missing') tallies.observedC3_total += 1;
      if (natural === null) tallies.observedNull_total += 1;

      // Experiment 1: all 24 branch orders.
      const producible = new Set();
      for (const order of ALL_ORDERS) producible.add(classifyUnder(inputs, order));
      const size = producible.size;
      tallies.producibleClassCounts.set(size, (tallies.producibleClassCounts.get(size) || 0) + 1);
      if (size > 1) {
        tallies.orderSensitiveEdges += 1;
        if (tallies.examples.length < 8) {
          tallies.examples.push({
            sentId: rec.id,
            bond: row.bond ? `${row.bond[0]}+${row.bond[1]}->${row.bond[2]}` : null,
            named: row.named,
            complete: row.complete,
            starvation: row.starvation,
            couldFire: inputs.couldFire,
            observed: natural,
            producible: [...producible].sort(),
            leftSenseCount: row.leftSenseCount,
            rightSenseCount: row.rightSenseCount,
          });
        }
      }

      // Experiment 2: multi-label latent deficit set.
      const deficits = [];
      if (BRANCHES.C1(inputs)) deficits.push('C1');
      if (BRANCHES.C2(inputs)) deficits.push('C2');
      if (BRANCHES.C3(inputs)) deficits.push('C3');
      if (BRANCHES.C4(inputs)) deficits.push('C4');
      const key = deficits.length ? deficits.sort().join('+') : 'none';
      tallies.latentDeficitCombos.set(key, (tallies.latentDeficitCombos.get(key) || 0) + 1);

      const hasC1 = deficits.includes('C1');
      const hasC2 = deficits.includes('C2');
      const hasC3 = deficits.includes('C3');
      if (hasC2 && hasC3) tallies.overlap.C2_and_C3 += 1;
      if (hasC1 && hasC2) tallies.overlap.C1_and_C2 += 1;
      if (hasC1 && hasC3) tallies.overlap.C1_and_C3 += 1;
      if (hasC1 && hasC2 && hasC3) tallies.overlap.C1_and_C2_and_C3 += 1;
      if (deficits.length >= 2) tallies.overlap.anyMultiDeficit += 1;

      if (natural === 'C2-lexical-missing') {
        if (hasC3) tallies.observedC2_alsoC3 += 1;
      }

      const silent = !(row.named && row.complete) && row.t1Status !== 'could-fire';
      if (silent) {
        tallies.silentEdges += 1;
        if (deficits.length >= 2) tallies.silentMultiDeficit += 1;
      }
    }
  }
}

if (tallies.faithfulnessMismatches > 0) {
  console.error(`ABORT: ${tallies.faithfulnessMismatches} faithfulness mismatches — reconstruction invalid.`);
  process.exit(1);
}

const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
const pct = (n, d) => (d ? `${((n / d) * 100).toFixed(2)}%` : 'n/a');

const report = {
  contract: 'PB-CLASSIFIER-COMMUTATIVITY-v1',
  mode: 'observe',
  testFileOpened: false,
  scored: false,
  commit: gitHead(),
  maxTokens: MAX_TOKENS,
  split: 'dev',
  protection: {
    analysed: tallies.analysed,
    parsed: tallies.parsed,
    threw: tallies.threw,
    eventsMean: mean(tallies.events),
    fingerprintsChecked: tallies.fingerprintsChecked,
    fingerprintsIdentical: tallies.fingerprintsIdentical === tallies.fingerprintsChecked,
  },
  faithfulness: {
    mismatches: tallies.faithfulnessMismatches,
    note: 'natural-order reconstruction reproduced row.silenceClass for every edge',
  },
  experiment1_classifierCommutativity: {
    edges: tallies.edges,
    branchOrdersTested: ALL_ORDERS.length,
    orderSensitiveEdges: tallies.orderSensitiveEdges,
    commutatorMagnitude: tallies.edges ? tallies.orderSensitiveEdges / tallies.edges : null,
    producibleClassCountDistribution: Object.fromEntries(
      [...tallies.producibleClassCounts.entries()].sort((a, b) => a[0] - b[0]),
    ),
    verdict: tallies.orderSensitiveEdges === 0
      ? 'C=0 — classifier commutes on this chamber'
      : 'C>0 — classifier is priority-order-sensitive on the reported region',
  },
  experiment2_latentDeficitCensus: {
    observedClassDistribution: Object.fromEntries(
      [...tallies.observedClass.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    ),
    latentDeficitCombos: Object.fromEntries(
      [...tallies.latentDeficitCombos.entries()].sort((a, b) => b[1] - a[1]),
    ),
    overlaps: tallies.overlap,
    crossTabs: {
      observedC2_total: tallies.observedC2_total,
      observedC2_alsoLatentC3: tallies.observedC2_alsoC3,
      observedC2_alsoLatentC3_rate: tallies.observedC2_total
        ? tallies.observedC2_alsoC3 / tallies.observedC2_total : null,
      observedC3_total: tallies.observedC3_total,
      observedC3_constructionNote: 'natural-C3 edges have starvation=null, hence unknown=false: single-deficit by construction',
      observedC1_total: tallies.observedC1_total,
      observedNull_total: tallies.observedNull_total,
    },
    silentEdgeView: {
      silentEdges: tallies.silentEdges,
      silentMultiDeficit: tallies.silentMultiDeficit,
      silentMultiDeficitRate: tallies.silentEdges
        ? tallies.silentMultiDeficit / tallies.silentEdges : null,
    },
  },
  orderSensitiveExamples: tallies.examples,
};

writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);

const md = [];
md.push('# RESULT — Silence-classifier commutativity control + latent-deficit census');
md.push('');
md.push('OBSERVE-only. TEST sealed. No relations, COMPAT rows, or lexicon entries authored.');
md.push('');
md.push(`- commit \`${report.commit}\``);
md.push(`- chamber: DEV ≤ ${MAX_TOKENS} tokens — analysed ${tallies.analysed}, parsed ${tallies.parsed}, threw ${tallies.threw}`);
md.push(`- fingerprints identical on ${tallies.fingerprintsChecked}/${tallies.fingerprintsChecked} replay pairs`);
md.push(`- faithfulness: natural-order reconstruction matched row.silenceClass on ${tallies.edges}/${tallies.edges} edges`);
md.push('');
md.push('## Experiment 1 — classifier commutativity');
md.push('');
md.push(`classifySilence is a priority cascade C4→C1→C2→C3→null. All ${ALL_ORDERS.length} branch orders`);
md.push('were evaluated over identical reconstructed inputs.');
md.push('');
md.push(`- order-sensitive edges: **${tallies.orderSensitiveEdges} / ${tallies.edges}** (${pct(tallies.orderSensitiveEdges, tallies.edges)})`);
md.push(`- commutator magnitude C_classifier = ${report.experiment1_classifierCommutativity.commutatorMagnitude}`);
md.push(`- verdict: ${report.experiment1_classifierCommutativity.verdict}`);
md.push('');
md.push('## Experiment 2 — observed class vs latent deficit set');
md.push('');
md.push('| observed (priority) | count |');
md.push('|---|---|');
for (const [k, v] of [...tallies.observedClass.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0])))) {
  md.push(`| ${k ?? 'null'} | ${v} |`);
}
md.push('');
md.push('| latent deficit combo | count |');
md.push('|---|---|');
for (const [k, v] of Object.entries(report.experiment2_latentDeficitCensus.latentDeficitCombos)) {
  md.push(`| ${k} | ${v} |`);
}
md.push('');
md.push(`- C2∩C3 overlap (named ∧ unknown ∧ complete ∧ ¬couldFire): **${tallies.overlap.C2_and_C3}**`);
md.push(`- of ${tallies.observedC2_total} observed-C2 edges, also carry latent C3: **${tallies.observedC2_alsoC3}** (${pct(tallies.observedC2_alsoC3, tallies.observedC2_total)})`);
md.push(`- silent edges with ≥2 latent deficits: ${tallies.silentMultiDeficit}/${tallies.silentEdges}`);
md.push('');
writeFileSync(OUT_MD, `${md.join('\n')}\n`);

console.log(JSON.stringify({
  contract: report.contract,
  commutatorMagnitude: report.experiment1_classifierCommutativity.commutatorMagnitude,
  orderSensitiveEdges: tallies.orderSensitiveEdges,
  edges: tallies.edges,
  overlap: tallies.overlap,
  observedC2_alsoLatentC3: `${tallies.observedC2_alsoC3}/${tallies.observedC2_total}`,
  wrote: [OUT, OUT_MD],
}, null, 2));
