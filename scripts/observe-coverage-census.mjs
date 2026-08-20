#!/usr/bin/env node
/**
 * Observe-only lexical + compositional coverage on EWT DEV.
 * Does not score. Does not open TEST. Does not change emission.
 *
 *   node scripts/observe-coverage-census.mjs
 */
import { execSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { composePacked } from '../codex/core/constellation/compose-packed.js';
import { forestFingerprint } from '../codex/core/constellation/semantic-particles/annotate.js';
import { DEFAULT_LEXICAL_LEXICON } from '../codex/core/constellation/semantic-particles/lexical-semantics.js';
import { leafMeaning, meaningOf } from '../codex/core/constellation/semantic-particles/compositional-semantics.js';
import { EXPERIMENTAL_FEATURE_PROVIDER } from '../codex/core/constellation/semantic-particles/experimental-inventory.js';
import {
  diagnoseT1Edge,
  observeAtomCoverage,
  observeDerivationCoverage,
  summarizeObserveCoverage,
} from '../codex/core/constellation/semantic-particles/observe-coverage.js';
import { loadPosMap, loadSplit } from './lib/constellation-corpus.mjs';

const OUT = 'docs/superpowers/evidence/2026-08-16-observe-coverage-census.json';
const OUT_MD = 'docs/superpowers/evidence/2026-08-16-observe-coverage-census.md';
const MAX_TOKENS = 28;
const TEST_PATH = path.resolve('cache/ud/en_ewt-ud-test.conllu');

if (existsSync(TEST_PATH)) {
  // sealed
}

function gitHead() {
  try { return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim(); } catch { return null; }
}

function asLeaf(node) {
  if (!node) return null;
  return {
    type: node.type,
    from: node.from,
    to: node.to,
    token: lemmaOf(node),
    nucleus: node.nucleus || { headLemmas: [lemmaOf(node)] },
    derivations: [],
  };
}

function lemmaOf(atom) {
  const heads = atom?.nucleus?.headLemmas;
  if (Array.isArray(heads) && heads[0]) return String(heads[0]).toLowerCase();
  return String(atom?.token || '').toLowerCase();
}

function pct(x) {
  return `${(Number(x) * 100).toFixed(1)}%`;
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
  ambiguousAtoms: 0,
  senseHits: 0,
  featureHits: 0,
  lexicalAny: 0,
  derivations: 0,
  namedDerivations: 0,
  completeDerivations: 0,
  unknownDerivations: 0,
  lexicalStarvation: 0,
  compositionalStarvation: 0,
  t1Edges: 0,
  t1CouldFire: 0,
  t1OneSideMissing: 0,
  t1BothMissing: 0,
  t1NoRelation: 0,
  t1NoCorrespondence: 0,
  atomsCouldFire: 0,
  atomsOneSideMissing: 0,
  atomsNoT1: 0,
  stableRoots: 0,
  stableUnknown: 0,
  stableComplete: 0,
  uninterpretedBonds: new Map(),
  noRelationPairs: new Map(),
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

  const byFrom = new Map();
  for (const atom of chart.atoms || []) {
    const list = byFrom.get(atom.from) || [];
    list.push(atom);
    byFrom.set(atom.from, list);
  }

  for (const [index, group] of byFrom) {
    if (group.length < 2) continue;
    const neighbors = [];
    for (const [sideIndex, side] of [[index - 1, 'left'], [index + 1, 'right']]) {
      const nb = byFrom.get(sideIndex);
      if (nb?.[0]) {
        neighbors.push({ lemma: lemmaOf(nb[0]), type: nb[0].type, side });
      }
    }
    let atomFired = false;
    let atomMissing = false;
    for (const atom of group) {
      tallies.ambiguousAtoms += 1;
      const cov = observeAtomCoverage(
        { lemma: lemmaOf(atom), type: atom.type },
        lexicon,
        provider,
      );
      if (cov.senseHit) tallies.senseHits += 1;
      if (cov.featureHit) tallies.featureHits += 1;
      if (cov.lexicalAny) tallies.lexicalAny += 1;
      for (const nb of neighbors) {
        tallies.t1Edges += 1;
        const edge = diagnoseT1Edge({ lemma: lemmaOf(atom), type: atom.type }, nb, provider);
        if (edge.status === 'could-fire') {
          tallies.t1CouldFire += 1;
          atomFired = true;
        } else if (edge.status === 'one-side-missing') {
          tallies.t1OneSideMissing += 1;
          atomMissing = true;
        } else if (edge.status === 'both-missing') tallies.t1BothMissing += 1;
        else if (edge.status === 'no-relation') {
          tallies.t1NoRelation += 1;
          const pair = `${atom.type}|${nb.type}|${nb.side}`;
          tallies.noRelationPairs.set(pair, (tallies.noRelationPairs.get(pair) || 0) + 1);
        }
        else if (edge.status === 'no-correspondence') tallies.t1NoCorrespondence += 1;
      }
    }
    if (atomFired) tallies.atomsCouldFire += 1;
    else if (atomMissing) tallies.atomsOneSideMissing += 1;
    else tallies.atomsNoT1 += 1;
  }

  for (const node of chart.molecules || []) {
    for (const derivation of node.derivations || []) {
      if (!derivation.bond) continue;
      tallies.derivations += 1;
      const row = observeDerivationCoverage(
        leafMeaning(asLeaf(derivation.left), lexicon),
        leafMeaning(asLeaf(derivation.right), lexicon),
        derivation.bond,
      );
      if (row.named) tallies.namedDerivations += 1;
      if (row.complete) tallies.completeDerivations += 1;
      if (row.unknown) tallies.unknownDerivations += 1;
      if (row.starvation === 'lexical') tallies.lexicalStarvation += 1;
      if (row.starvation === 'compositional') {
        tallies.compositionalStarvation += 1;
        const sig = `${derivation.bond[0]}+${derivation.bond[1]}->${derivation.bond[2]}`;
        tallies.uninterpretedBonds.set(sig, (tallies.uninterpretedBonds.get(sig) || 0) + 1);
      }
    }
  }

  for (const root of chart.stable || []) {
    tallies.stableRoots += 1;
    let meaning;
    try {
      meaning = meaningOf(root, lexicon);
    } catch {
      tallies.stableUnknown += 1;
      continue;
    }
    const top = meaning.readings[0];
    if (!top || top.unknown) tallies.stableUnknown += 1;
    if (top && rolesCompleteSafe(top)) tallies.stableComplete += 1;
  }
}

function rolesCompleteSafe(top) {
  return Boolean(top.roles && (top.roles.Event || top.roles.Entity) && !top.unknown);
}

function topMap(map, n = 12) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, n)
    .map(([key, count]) => ({ key, count }));
}

const rates = summarizeObserveCoverage(tallies);
const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
const report = {
  contract: 'PB-OBSERVE-COVERAGE-v1',
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
  lexical: {
    ambiguousAtoms: tallies.ambiguousAtoms,
    senseHits: tallies.senseHits,
    featureHits: tallies.featureHits,
    lexicalAny: tallies.lexicalAny,
    senseRate: rates.senseRate,
    featureRate: rates.featureRate,
  },
  compositional: {
    derivations: tallies.derivations,
    namedDerivations: tallies.namedDerivations,
    completeDerivations: tallies.completeDerivations,
    unknownDerivations: tallies.unknownDerivations,
    namedRate: rates.namedRate,
    completeRate: rates.completeRate,
    stableRoots: tallies.stableRoots,
    stableUnknown: tallies.stableUnknown,
    stableComplete: tallies.stableComplete,
  },
  t1: {
    edges: tallies.t1Edges,
    couldFire: tallies.t1CouldFire,
    oneSideMissing: tallies.t1OneSideMissing,
    bothMissing: tallies.t1BothMissing,
    noRelation: tallies.t1NoRelation,
    noCorrespondence: tallies.t1NoCorrespondence,
    fireRate: rates.t1FireRate,
    missingSideRate: rates.t1MissingSideRate,
    ambiguousGroups: tallies.atomsCouldFire + tallies.atomsOneSideMissing + tallies.atomsNoT1,
    groupsCouldFire: tallies.atomsCouldFire,
    groupsOneSideMissing: tallies.atomsOneSideMissing,
    groupsNoT1: tallies.atomsNoT1,
  },
  starvation: {
    lexical: tallies.lexicalStarvation,
    compositional: tallies.compositionalStarvation,
    lexicalShare: (tallies.lexicalStarvation + tallies.compositionalStarvation) > 0
      ? tallies.lexicalStarvation / (tallies.lexicalStarvation + tallies.compositionalStarvation)
      : 0,
    compositionalShare: (tallies.lexicalStarvation + tallies.compositionalStarvation) > 0
      ? tallies.compositionalStarvation / (tallies.lexicalStarvation + tallies.compositionalStarvation)
      : 0,
  },
  topUninterpretedBonds: topMap(tallies.uninterpretedBonds),
  topNoRelationPairs: topMap(tallies.noRelationPairs),
  milestone: {
    senseRate: { value: rates.senseRate, gate: 0.15, pass: rates.senseRate >= 0.15 },
    noRelationRate: {
      value: tallies.t1Edges > 0 ? tallies.t1NoRelation / tallies.t1Edges : 1,
      gate: 0.5,
      pass: tallies.t1Edges > 0 && (tallies.t1NoRelation / tallies.t1Edges) <= 0.5,
    },
    couldFireRate: { value: rates.t1FireRate, gate: 0.15, pass: rates.t1FireRate >= 0.15 },
    filledRootRate: {
      value: tallies.stableRoots > 0 ? tallies.stableComplete / tallies.stableRoots : 0,
      gate: 0.1,
      pass: tallies.stableRoots > 0 && (tallies.stableComplete / tallies.stableRoots) >= 0.1,
    },
  },
};

const md = [];
md.push('# RESULT — Observe-only lexical + compositional coverage');
md.push('');
md.push('SCORE was not run. TEST was not opened. The forest was not rewritten.');
md.push('');
md.push(`- commit \`${report.commit}\``);
md.push(`- DEV sentences ≤ ${MAX_TOKENS} tokens: analysed ${tallies.analysed}, parsed ${tallies.parsed} (${pct(report.protection.coverage)}), threw ${tallies.threw}`);
md.push(`- fingerprints identical on ${tallies.fingerprintsIdentical}/${tallies.fingerprintsChecked} replay pairs`);
md.push(`- ambiguous readings ${tallies.ambiguousAtoms}: sense ${pct(rates.senseRate)}, T1-features ${pct(rates.featureRate)}, either ${pct(tallies.ambiguousAtoms > 0 ? tallies.lexicalAny / tallies.ambiguousAtoms : 0)}`);
md.push(`- bond derivations ${tallies.derivations}: named rule ${pct(rates.namedRate)}, roles complete ${pct(rates.completeRate)}, unknown ${pct(tallies.derivations > 0 ? tallies.unknownDerivations / tallies.derivations : 0)}`);
md.push(`- T1 edges ${tallies.t1Edges}: could-fire ${pct(rates.t1FireRate)}, one-side-missing ${pct(rates.t1MissingSideRate)}`);
md.push(`- starvation among incomplete derivations: lexical ${tallies.lexicalStarvation} (${pct(report.starvation.lexicalShare)}), compositional ${tallies.compositionalStarvation} (${pct(report.starvation.compositionalShare)})`);
md.push(`- stable roots ${tallies.stableRoots}: unknown ${tallies.stableUnknown}, filled ${tallies.stableComplete}`);
md.push(`- milestone: sense ${pct(report.milestone.senseRate.value)} ${report.milestone.senseRate.pass ? 'PASS' : 'FAIL'}; no-relation ${pct(report.milestone.noRelationRate.value)} ${report.milestone.noRelationRate.pass ? 'PASS' : 'FAIL'}; could-fire ${pct(report.milestone.couldFireRate.value)} ${report.milestone.couldFireRate.pass ? 'PASS' : 'FAIL'}; filled roots ${pct(report.milestone.filledRootRate.value)} ${report.milestone.filledRootRate.pass ? 'PASS' : 'FAIL'}`);
md.push('');
md.push('Reproduction: `node scripts/observe-coverage-census.mjs`');
md.push('');

writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(OUT_MD, `${md.join('\n')}\n`);
console.log(md.join('\n'));
console.log(`wrote ${OUT}`);
