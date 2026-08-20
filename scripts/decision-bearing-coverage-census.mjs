#!/usr/bin/env node
/**
 * Observe-only decision-bearing coverage on EWT DEV.
 * Does not score. Does not open TEST. Does not author relations.
 *
 *   node scripts/decision-bearing-coverage-census.mjs
 */
import { execSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { composePacked } from '../codex/core/constellation/compose-packed.js';
import { forestFingerprint } from '../codex/core/constellation/semantic-particles/annotate.js';
import { DEFAULT_LEXICAL_LEXICON } from '../codex/core/constellation/semantic-particles/lexical-semantics.js';
import { EXPERIMENTAL_FEATURE_PROVIDER } from '../codex/core/constellation/semantic-particles/experimental-inventory.js';
import {
  observeCompetitiveCell,
  summarizeDecisionBearing,
} from '../codex/core/constellation/semantic-particles/decision-bearing.js';
import { loadPosMap, loadSplit } from './lib/constellation-corpus.mjs';

const OUT = 'docs/superpowers/evidence/2026-08-17-decision-bearing-coverage.json';
const OUT_MD = 'docs/superpowers/evidence/2026-08-17-decision-bearing-coverage.md';
const MAX_TOKENS = 28;
const TEST_PATH = path.resolve('cache/ud/en_ewt-ud-test.conllu');

if (existsSync(TEST_PATH)) {
  // sealed
}

function gitHead() {
  try { return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim(); } catch { return null; }
}

function pct(x) {
  return `${(Number(x) * 100).toFixed(1)}%`;
}

function topMap(map, n = 12) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, n)
    .map(([key, count]) => ({ key, count }));
}

const posMap = loadPosMap();
const dev = loadSplit('dev');
const lexicon = DEFAULT_LEXICAL_LEXICON;
const provider = EXPERIMENTAL_FEATURE_PROVIDER;

const tallies = {
  analysed: 0,
  parsed: 0,
  threw: 0,
  events: [],
  fingerprintsChecked: 0,
  fingerprintsIdentical: 0,
  packedCells: 0,
  competitiveCells: 0,
  decisionCompetitiveCells: 0,
  glueOnlyCompetitive: 0,
  weaklyDistinguishable: 0,
  stronglyDistinguishable: 0,
  decisionBearingEdges: 0,
  decisionBearingCouldFire: 0,
  decisionBearingNamed: 0,
  decisionBearingSilent: 0,
  liftCompetitors: 0,
  missingByFamily: new Map(),
  missingBonds: new Map(),
};

for (const rec of dev) {
  const tokens = (rec.tokens || []).map((t) => t.form);
  if (tokens.length === 0 || tokens.length > MAX_TOKENS) continue;
  tallies.analysed += 1;
  let chart;
  try {
    chart = composePacked(tokens, posMap, { semanticParticles: { mode: 'observe' } });
  } catch {
    tallies.threw += 1;
    continue;
  }
  tallies.events.push(chart.events || 0);
  if (chart.stable?.length) tallies.parsed += 1;
  if (tallies.fingerprintsChecked < 8) {
    const off = composePacked(tokens, posMap, {});
    tallies.fingerprintsChecked += 1;
    if (forestFingerprint(chart) === forestFingerprint(off)) tallies.fingerprintsIdentical += 1;
  }

  for (const node of chart.molecules || []) {
    tallies.packedCells += 1;
    const row = observeCompetitiveCell(node, lexicon, provider);
    if (row.competitive) tallies.competitiveCells += 1;
    if (row.competitive && !row.decisionCompetitive) tallies.glueOnlyCompetitive += 1;
    if (!row.decisionCompetitive) continue;
    tallies.decisionCompetitiveCells += 1;
    if (row.weaklyDistinguishable) tallies.weaklyDistinguishable += 1;
    if (row.stronglyDistinguishable) tallies.stronglyDistinguishable += 1;
    for (const edge of row.rows) {
      if (edge.family === 'glue') continue;
      if (edge.family === 'lift' || edge.rule === 'lift') {
        tallies.liftCompetitors += 1;
        continue;
      }
      tallies.decisionBearingEdges += 1;
      if (edge.t1Status === 'could-fire') tallies.decisionBearingCouldFire += 1;
      if (edge.named && edge.complete) tallies.decisionBearingNamed += 1;
      const silent = !(edge.named && edge.complete) && edge.t1Status !== 'could-fire';
      if (!silent) continue;
      tallies.decisionBearingSilent += 1;
      tallies.missingByFamily.set(edge.family, (tallies.missingByFamily.get(edge.family) || 0) + 1);
      const bondKey = edge.bond
        ? `${edge.bond[0]}+${edge.bond[1]}->${edge.bond[2]}`
        : edge.rule;
      tallies.missingBonds.set(bondKey, (tallies.missingBonds.get(bondKey) || 0) + 1);
    }
  }
}

const rates = summarizeDecisionBearing(tallies);
const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
const report = {
  contract: 'PB-DECISION-BEARING-COVERAGE-v1',
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
    coverage: tallies.analysed > 0 ? tallies.parsed / tallies.analysed : 0,
    eventsMean: mean(tallies.events),
    fingerprintsChecked: tallies.fingerprintsChecked,
    fingerprintsIdentical: tallies.fingerprintsIdentical === tallies.fingerprintsChecked,
  },
  cells: {
    packedCells: tallies.packedCells,
    competitiveCells: tallies.competitiveCells,
    decisionCompetitiveCells: tallies.decisionCompetitiveCells,
    glueOnlyCompetitive: tallies.glueOnlyCompetitive,
    weaklyDistinguishable: tallies.weaklyDistinguishable,
    stronglyDistinguishable: tallies.stronglyDistinguishable,
    liftCompetitors: tallies.liftCompetitors,
  },
  rates: {
    decisionBearingGroupRate: rates.decisionBearingGroupRate,
    weakDistinguishRate: rates.weakDistinguishRate,
    decisionBearingEdgeCouldFireRate: rates.decisionBearingEdgeCouldFireRate,
    namedCompleteRate: tallies.decisionBearingEdges > 0
      ? tallies.decisionBearingNamed / tallies.decisionBearingEdges
      : 0,
  },
  edges: {
    decisionBearingEdges: tallies.decisionBearingEdges,
    couldFire: tallies.decisionBearingCouldFire,
    namedComplete: tallies.decisionBearingNamed,
    silent: tallies.decisionBearingSilent,
  },
  missingByFamily: topMap(tallies.missingByFamily, 16),
  topMissingDecisionBonds: topMap(tallies.missingBonds, 16),
};

const md = [];
md.push('# RESULT — Decision-bearing could-fire coverage');
md.push('');
md.push('SCORE was not run. TEST was not opened. Punctuation semantics were not authored.');
md.push('');
md.push(`- commit \`${report.commit}\``);
md.push(`- DEV sentences ≤ ${MAX_TOKENS} tokens: analysed ${tallies.analysed}, parsed ${tallies.parsed} (${pct(report.protection.coverage)}), threw ${tallies.threw}`);
md.push(`- fingerprints identical on ${tallies.fingerprintsIdentical}/${tallies.fingerprintsChecked} replay pairs`);
md.push(`- packed cells ${tallies.packedCells}: competitive ${tallies.competitiveCells}, decision-competitive ${tallies.decisionCompetitiveCells}, glue-only competitive ${tallies.glueOnlyCompetitive}`);
md.push(`- lift competitors inside those cells ${tallies.liftCompetitors} (unary promotions; not missing relations)`);
md.push(`- **decisionBearingGroupRate** ${pct(rates.decisionBearingGroupRate)} (${tallies.stronglyDistinguishable}/${tallies.decisionCompetitiveCells})`);
md.push(`- weakDistinguishRate ${pct(rates.weakDistinguishRate)} (${tallies.weaklyDistinguishable}/${tallies.decisionCompetitiveCells}) — named-versus-silent; not the milestone`);
md.push(`- decisionBearingEdgeCouldFireRate ${pct(rates.decisionBearingEdgeCouldFireRate)} (${tallies.decisionBearingCouldFire}/${tallies.decisionBearingEdges})`);
md.push(`- named-complete on those same interfaces ${pct(report.rates.namedCompleteRate)}`);
md.push('- raw T1 could-fire remains 4.2% on the frozen 2026-08-16 observe census; that is a different denominator');
md.push('');
md.push('## What the milestone is');
md.push('');
md.push('`decisionBearingGroupRate` is the share of packed cells that already have two');
md.push('non-glue structural alternatives **and** have two non-silent, different');
md.push('semantic factor keys. It is not T1 could-fire. It is not named-versus-silent.');
md.push('');
md.push('Punctuation absorb is glue. `S+PUNCT` and leftover `SCOMMA+S` are out of the');
md.push('denominator. Apposition and `FRONTED+S` stay in. Lifts can make a cell');
md.push('competitive; they are not counted as missing relations.');
md.push('');
md.push('## Missing decision-bearing interfaces (TRAIN targets, not authored here)');
md.push('');
for (const row of report.missingByFamily) {
  md.push(`- ${row.key}: ${row.count}`);
}
md.push('');
md.push('Top silent bonds inside those cells:');
md.push('');
for (const row of report.topMissingDecisionBonds) {
  md.push(`- \`${row.key}\` ${row.count}`);
}
md.push('');
md.push('Stay in OBSERVE. This number does not promote SCORE.');
md.push('');
md.push('Reproduction: `node scripts/decision-bearing-coverage-census.mjs`');
md.push('');

writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(OUT_MD, `${md.join('\n')}\n`);
console.log(md.join('\n'));
console.log('missing families:');
for (const row of report.missingByFamily) console.log(`  ${row.key}\t${row.count}`);
console.log('top missing decision bonds:');
for (const row of report.topMissingDecisionBonds) console.log(`  ${row.key}\t${row.count}`);
console.log(`wrote ${OUT}`);
