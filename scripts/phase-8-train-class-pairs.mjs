#!/usr/bin/env node
/**
 * TRAIN-only complement class-pair demand census. OBSERVE. TEST sealed.
 * Does not author mappings. Writes the row set Task 4 is allowed to implement.
 *
 *   node scripts/phase-8-train-class-pairs.mjs
 */
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { composePacked } from '../codex/core/constellation/compose-packed.js';
import { EXPERIMENTAL_FEATURE_PROVIDER } from '../codex/core/constellation/semantic-particles/experimental-inventory.js';
import { DEFAULT_LEXICAL_LEXICON } from '../codex/core/constellation/semantic-particles/lexical-semantics.js';
import { featuresFor } from '../codex/core/constellation/semantic-particles/feature-provider.js';
import { ends, projectRelation } from '../codex/core/constellation/semantic-particles/feature-score.js';
import { derivationSignature, isGlueBond, lemmaOf } from '../codex/core/constellation/semantic-particles/decision-bearing.js';
import {
  complementClass,
  governorClasses,
  isComplementRelation,
} from '../codex/core/constellation/semantic-particles/complement-compat.js';
import { loadPosMap, loadSplit } from './lib/constellation-corpus.mjs';

const OUT = 'docs/superpowers/evidence/2026-08-17-phase-8-train-class-pairs.json';
const OUT_MD = 'docs/superpowers/evidence/2026-08-17-phase-8-train-class-pairs.md';
const MAX_TOKENS = 28;
const CUTOFF = 30;
const TEST_PATH = path.resolve('cache/ud/en_ewt-ud-test.conllu');
if (existsSync(TEST_PATH)) {
  // sealed — never read
}

const ALLOW = new Set([
  'INFINITIVAL_COMPLEMENT|cognition|infinitival-event',
  'INFINITIVAL_COMPLEMENT|communication|infinitival-event',
  'INFINITIVAL_COMPLEMENT|creation|infinitival-event',
  'INFINITIVAL_COMPLEMENT|perception|infinitival-event',
  'INFINITIVAL_COMPLEMENT|state|infinitival-event',
  'PROPOSITIONAL_COMPLEMENT|cognition|abstract-proposition',
  'PROPOSITIONAL_COMPLEMENT|communication|abstract-proposition',
  'PROPOSITIONAL_COMPLEMENT|perception|abstract-proposition',
]);

const FORBID_GOV = new Set([
  'motion', 'possession', 'change',
]);

const posMap = loadPosMap();
const train = loadSplit('train');
const lexicon = DEFAULT_LEXICAL_LEXICON;
const provider = EXPERIMENTAL_FEATURE_PROVIDER;
const counts = new Map(); // key -> { edges, lemmas: Set }

function add(relation, govClass, compClass, lemma) {
  const key = `${relation}|${govClass}|${compClass}`;
  let row = counts.get(key);
  if (!row) {
    row = { relation, governor: govClass, complement: compClass, edges: 0, lemmas: new Set() };
    counts.set(key, row);
  }
  row.edges += 1;
  if (lemma) row.lemmas.add(lemma);
}

let analysed = 0;
let threw = 0;
for (const rec of train) {
  const tokens = (rec.tokens || []).map((t) => t.form);
  if (tokens.length === 0 || tokens.length > MAX_TOKENS) continue;
  analysed += 1;
  if (analysed % 1500 === 0) process.stderr.write(`[phase8-train] ${analysed}\n`);
  let chart;
  try {
    chart = composePacked(tokens, posMap, { semanticParticles: { mode: 'observe' } });
  } catch {
    threw += 1;
    continue;
  }
  for (const node of chart.molecules || []) {
    const bySignature = new Map();
    for (const derivation of node.derivations || []) {
      const sig = derivationSignature(derivation);
      if (!bySignature.has(sig)) bySignature.set(sig, derivation);
    }
    const decision = [...bySignature.values()].filter((d) => !isGlueBond(d.bond));
    if (decision.length < 2) continue;
    for (const derivation of decision) {
      if (derivation.lift) continue;
      const leftType = derivation.left?.type;
      const rightType = derivation.right?.type;
      const relation = projectRelation(leftType, rightType, 'right');
      if (!isComplementRelation(relation)) continue;
      const leftFeats = featuresFor(lemmaOf(derivation.left), leftType, provider);
      const rightFeats = featuresFor(lemmaOf(derivation.right), rightType, provider);
      const oriented = ends(leftType, rightType, leftFeats, rightFeats);
      const govs = governorClasses(oriented.left);
      const comp = complementClass(oriented.right, relation);
      const govLemma = lemmaOf(derivation.left);
      for (const gov of govs) add(relation, gov, comp, govLemma);
    }
  }
}

const rows = [...counts.values()]
  .map((r) => ({
    ...r,
    lemmas: r.lemmas.size,
    key: `${r.relation}|${r.governor}|${r.complement}`,
    allowed: ALLOW.has(`${r.relation}|${r.governor}|${r.complement}`),
    forbidden: FORBID_GOV.has(r.governor)
      || (r.governor === 'state' && r.complement === 'abstract-proposition')
      || r.governor === 'UNKNOWN',
  }))
  .sort((a, b) => b.edges - a.edges || a.key.localeCompare(b.key));

const authoredRows = rows
  .filter((r) => r.allowed && !r.forbidden && r.edges >= CUTOFF)
  .map((r) => ({
    relation: r.relation,
    governor: r.governor,
    complement: r.complement,
    weight: (r.governor === 'cognition' || r.governor === 'communication') ? 2 : 1.5,
    trainEdges: r.edges,
  }));

const report = {
  contract: 'PB-PHASE8-TRAIN-CLASS-PAIRS-v1',
  mode: 'observe',
  testFileOpened: false,
  scored: false,
  trainAnalysed: analysed,
  threw,
  cutoff: CUTOFF,
  pairs: rows.map(({ lemmas, ...rest }) => rest),
  authoredRows,
};
writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);

const md = [
  '# OBSERVE — Phase 8 TRAIN class-pair demand',
  '',
  'TEST sealed. SCORE off. No mappings authored by this script.',
  '',
  `- TRAIN analysed: ${analysed}, threw: ${threw}, cutoff: ${CUTOFF}`,
  '',
  '## Authored row set (allow-list ∩ mass ≥ 30 ∩ not forbidden)',
  '',
  '| relation | governor | complement | weight | TRAIN edges |',
  '|---|---|---|---|---|',
  ...authoredRows.map((r) => `| ${r.relation} | ${r.governor} | ${r.complement} | ${r.weight} | ${r.trainEdges} |`),
  '',
  '## All observed pairs',
  '',
  '| pair | edges | allowed | forbidden |',
  '|---|---|---|---|',
  ...rows.map((r) => `| ${r.key} | ${r.edges} | ${r.allowed} | ${r.forbidden} |`),
  '',
  'Stay in OBSERVE. Task 4 may author exactly `authoredRows`.',
];
writeFileSync(OUT_MD, `${md.join('\n')}\n`);
console.log(JSON.stringify({ authoredRows, wrote: [OUT, OUT_MD] }, null, 2));
