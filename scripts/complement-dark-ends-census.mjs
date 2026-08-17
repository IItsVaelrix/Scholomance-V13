#!/usr/bin/env node
/**
 * Observe-only dark-ends census for Phase 3A complement relations.
 *
 * ADDITIVE diagnostic. Does not alter the frozen waterfall census or its
 * artifacts. Answers the Phase 3B demand question:
 *
 *   For edges that already project INFINITIVAL_COMPLEMENT or
 *   PROPOSITIONAL_COMPLEMENT, WHICH oriented end is feature-dark, what
 *   is its type/lemma, and how much TRAIN lemma::TYPE mass exists?
 *
 * Orientation is frozen by feature-score.js ends(): left = governor,
 * right = complement. So stage 2 darkness = dark governor, stage 3
 * darkness = dark complement constituent.
 *
 * Two-phase by cost:
 *   1. DEV pass first (full semanticParticles fidelity, same as the
 *      frozen census) -> dark-end key set.
 *   2. TRAIN pass second, particles OFF (forest identity proven by the
 *      frozen census fingerprint check), counting only needed keys.
 *      TRAIN mass = terminal leaf mass: the chart types terminal
 *      children from the Scholomance posMap, so counting
 *      form::leafType over composed TRAIN charts is gold-independent.
 *      Constituent nodes (VP/NP/SBAR/S/INF) have zero terminal mass by
 *      construction; their head lemmas carry mass under the leaf type.
 *
 * TEST is never opened.
 *
 *   node scripts/complement-dark-ends-census.mjs
 */
import { writeFileSync } from 'node:fs';

import { composePacked } from '../codex/core/constellation/compose-packed.js';
import { DEFAULT_LEXICAL_LEXICON } from '../codex/core/constellation/semantic-particles/lexical-semantics.js';
import { EXPERIMENTAL_FEATURE_PROVIDER } from '../codex/core/constellation/semantic-particles/experimental-inventory.js';
import { featuresFor, UNKNOWN } from '../codex/core/constellation/semantic-particles/feature-provider.js';
import { knownFeatureCount } from '../codex/core/constellation/semantic-particles/experimental-inventory.js';
import { diagnoseCompetitionEdge } from '../codex/core/constellation/semantic-particles/compat-waterfall.js';
import { derivationSignature, isGlueBond, lemmaOf } from '../codex/core/constellation/semantic-particles/decision-bearing.js';
import { loadPosMap, loadSplit } from './lib/constellation-corpus.mjs';

const OUT = 'docs/superpowers/evidence/2026-08-17-complement-dark-ends.json';
const OUT_MD = 'docs/superpowers/evidence/2026-08-17-complement-dark-ends.md';
const MAX_TOKENS = 28; // same chamber as the frozen census

const TARGET_RELATIONS = Object.freeze([
  'INFINITIVAL_COMPLEMENT',
  'PROPOSITIONAL_COMPLEMENT',
]);

const posMap = loadPosMap();
const dev = loadSplit('dev');
const train = loadSplit('train');
const lexicon = DEFAULT_LEXICAL_LEXICON;
const provider = EXPERIMENTAL_FEATURE_PROVIDER;

function shortSentences(split) {
  const out = [];
  for (const rec of split) {
    const tokens = (rec.tokens || []).map((t) => t.form);
    if (tokens.length === 0 || tokens.length > MAX_TOKENS) continue;
    out.push({ id: rec.sentId || `s${out.length}`, tokens });
  }
  return out;
}

// ---- Phase 1: DEV pass — dark ends on complement-relation edges ---------
const stats = {
  analysed: 0,
  threw: 0,
  complementEdges: 0,
  byRelation: {},
  darkLeft: 0,
  darkRight: 0,
  darkBoth: 0,
  litBoth: 0,
  ends: new Map(),
  types: new Map(),
  bonds: new Map(),
};

const devShort = shortSentences(dev);
for (const rec of devShort) {
  stats.analysed += 1;
  if (stats.analysed % 300 === 0) {
    process.stderr.write(`[dark-ends] dev ${stats.analysed}/${devShort.length} complementEdges=${stats.complementEdges}\n`);
  }
  let chart;
  try {
    chart = composePacked(rec.tokens, posMap, { semanticParticles: { mode: 'observe' } });
  } catch {
    stats.threw += 1;
    continue;
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

    const cellKey = `${node.type}:${node.from}-${node.to}`;
    for (const derivation of decision) {
      const row = diagnoseCompetitionEdge(derivation, lexicon, provider);
      if (!TARGET_RELATIONS.includes(row.relation)) continue;
      stats.complementEdges += 1;
      const rel = (stats.byRelation[row.relation] ||= { edges: 0, darkLeft: 0, darkRight: 0 });
      rel.edges += 1;

      const bondKey = `${row.leftType}+${row.rightType}->${row.resultType}`;
      stats.bonds.set(bondKey, (stats.bonds.get(bondKey) || 0) + 1);

      const leftDark = row.leftKnownFeatures === 0;
      const rightDark = row.rightKnownFeatures === 0;
      if (leftDark) { stats.darkLeft += 1; rel.darkLeft += 1; }
      if (rightDark) { stats.darkRight += 1; rel.darkRight += 1; }
      if (leftDark && rightDark) stats.darkBoth += 1;
      if (!leftDark && !rightDark) stats.litBoth += 1;

      for (const side of ['left', 'right']) {
        const dark = side === 'left' ? leftDark : rightDark;
        const type = side === 'left' ? row.leftType : row.rightType;
        const lemma = side === 'left' ? lemmaOf(derivation.left) : lemmaOf(derivation.right);
        const typeKey = `${row.relation}|${side}|${type}`;
        let tAgg = stats.types.get(typeKey);
        if (!tAgg) {
          tAgg = { relation: row.relation, side, type, edges: 0, dark: 0, lemmas: new Map() };
          stats.types.set(typeKey, tAgg);
        }
        tAgg.edges += 1;
        if (dark) tAgg.dark += 1;
        tAgg.lemmas.set(lemma, (tAgg.lemmas.get(lemma) || 0) + 1);

        if (!dark) continue;
        const key = `${row.relation}|${side}|${type}|${lemma}`;
        let agg = stats.ends.get(key);
        if (!agg) {
          agg = { relation: row.relation, side, type, lemma, edges: 0, cells: new Set() };
          stats.ends.set(key, agg);
        }
        agg.edges += 1;
        agg.cells.add(cellKey);
      }
    }
  }
}

process.stderr.write(`[dark-ends] DEV done: complementEdges=${stats.complementEdges} darkL=${stats.darkLeft} darkR=${stats.darkRight}\n`);

// ---- Phase 2: TRAIN pass — terminal mass for needed keys ----------------
const neededLemmas = new Set();
for (const agg of stats.ends.values()) {
  if (agg.lemma) neededLemmas.add(String(agg.lemma).toLowerCase());
}
process.stderr.write(`[dark-ends] TRAIN pass: ${neededLemmas.size} needed lemmas\n`);

const trainMass = new Map(); // `${lemma}::${type}` -> sentences containing it
let trainAnalysed = 0;
const trainShort = shortSentences(train);
for (const rec of trainShort) {
  trainAnalysed += 1;
  if (trainAnalysed % 1500 === 0) {
    process.stderr.write(`[dark-ends] train ${trainAnalysed}/${trainShort.length}\n`);
  }
  let chart;
  try {
    // Particles OFF: the frozen census fingerprint check proves particle
    // annotation never moves the forest; terminal structure is identical.
    chart = composePacked(rec.tokens, posMap, {});
  } catch {
    continue;
  }
  const seen = new Set();
  for (const node of chart.molecules || []) {
    for (const derivation of node.derivations || []) {
      for (const child of [derivation.left, derivation.right]) {
        if (!child || child.token == null || !child.type) continue;
        const lemma = String(child.token).toLowerCase();
        if (!neededLemmas.has(lemma)) continue;
        const key = `${lemma}::${child.type}`;
        if (seen.has(key)) continue;
        seen.add(key);
        trainMass.set(key, (trainMass.get(key) || 0) + 1);
      }
    }
  }
}

// ---- Provider seed audit --------------------------------------------------
const typeAudit = [];
const seenTypes = new Set();
for (const t of stats.types.values()) seenTypes.add(t.type);
for (const type of [...seenTypes].sort()) {
  const probe = featuresFor('zzzzprobe', type, provider);
  const lit = knownFeatureCount(probe) > 0;
  const nonUnknown = probe.filter((f) => f.value !== UNKNOWN).map((f) => f.kind);
  typeAudit.push(Object.freeze({ type, anyTypeLevelLight: lit, litKinds: nonUnknown }));
}

// ---- Emit -----------------------------------------------------------------
const endRows = [...stats.ends.values()]
  .map((agg) => Object.freeze({
    relation: agg.relation,
    side: agg.side,
    type: agg.type,
    lemma: agg.lemma,
    darkEdges: agg.edges,
    cellsAffected: agg.cells.size,
    trainTerminalMass: trainMass.get(`${String(agg.lemma).toLowerCase()}::${agg.type}`) || 0,
  }))
  .sort((a, b) => (b.cellsAffected - a.cellsAffected) || (b.darkEdges - a.darkEdges));

const typeRows = [...stats.types.values()].map((t) => Object.freeze({
  relation: t.relation,
  side: t.side,
  type: t.type,
  edges: t.edges,
  darkEdges: t.dark,
  darkRate: t.edges ? t.dark / t.edges : 0,
  distinctLemmas: t.lemmas.size,
  topLemmas: [...t.lemmas.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
    .map(([lemma, n]) => `${lemma || '∅'}:${n}`),
})).sort((a, b) => b.darkEdges - a.darkEdges);

const report = Object.freeze({
  generatedBy: 'scripts/complement-dark-ends-census.mjs',
  purpose: 'Phase 3B demand census (OBSERVE-only, additive)',
  chamber: { maxTokens: MAX_TOKENS, devSentences: devShort.length, trainSentences: trainShort.length },
  targetRelations: [...TARGET_RELATIONS],
  totals: Object.freeze({
    complementEdges: stats.complementEdges,
    darkLeftGovernor: stats.darkLeft,
    darkRightComplement: stats.darkRight,
    darkBoth: stats.darkBoth,
    litBoth: stats.litBoth,
    byRelation: stats.byRelation,
    bondShapes: Object.fromEntries([...stats.bonds.entries()].sort((a, b) => b[1] - a[1])),
  }),
  typeAudit,
  byType: typeRows,
  darkEndsTop: endRows.slice(0, 80),
  darkEndsCount: endRows.length,
  trainMassMethod: 'terminal leaf mass; particles off in TRAIN pass (forest identity proven by frozen census fingerprint check); gold-independent',
});

writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);

const md = [];
md.push('# OBSERVE — Phase 3B dark-ends census (complement relations)\n');
md.push('ADDITIVE diagnostic. Frozen waterfall census untouched. TEST sealed.\n');
md.push(`- DEV ≤ ${MAX_TOKENS} tokens: ${devShort.length} sentences, threw ${stats.threw}`);
md.push(`- TRAIN terminal-mass pass: ${trainShort.length} sentences, ${neededLemmas.size} needed lemmas\n`);
md.push(`## Complement-relation decision edges: **${stats.complementEdges}**\n`);
md.push('| relation | edges | dark governor (left) | dark complement (right) |');
md.push('|---|---|---|---|');
for (const [relation, r] of Object.entries(stats.byRelation)) {
  md.push(`| ${relation} | ${r.edges} | ${r.darkLeft} | ${r.darkRight} |`);
}
md.push(`\n- dark both ends: ${stats.darkBoth} · lit both ends: ${stats.litBoth}\n`);
md.push('## Bond shapes projecting complement relations\n');
md.push('| bond | edges |');
md.push('|---|---|');
for (const [bond, n] of [...stats.bonds.entries()].sort((a, b) => b[1] - a[1])) {
  md.push(`| \`${bond}\` | ${n} |`);
}
md.push('\n## Provider seed audit — can this type EVER light?\n');
md.push('| type | any type-level light | lit kinds |');
md.push('|---|---|---|');
for (const row of typeAudit) {
  md.push(`| ${row.type} | ${row.anyTypeLevelLight ? 'yes' : '**NO**'} | ${row.litKinds.join(', ') || '—'} |`);
}
md.push('\n## Darkness by (relation, side, type)\n');
md.push('| relation | side | type | edges | dark | dark% | distinct lemmas | top lemmas |');
md.push('|---|---|---|---|---|---|---|---|');
for (const row of typeRows) {
  md.push(`| ${row.relation} | ${row.side} | ${row.type} | ${row.edges} | ${row.darkEdges} | ${(row.darkRate * 100).toFixed(1)}% | ${row.distinctLemmas} | ${row.topLemmas.join(' ')} |`);
}
md.push('\n## Top dark ends, ranked by decision cells affected\n');
md.push('| relation | side | type | lemma | dark edges | cells | TRAIN terminal mass |');
md.push('|---|---|---|---|---|---|---|');
for (const row of endRows.slice(0, 50)) {
  md.push(`| ${row.relation} | ${row.side} | ${row.type} | ${row.lemma || '∅'} | ${row.darkEdges} | ${row.cellsAffected} | ${row.trainTerminalMass} |`);
}
writeFileSync(OUT_MD, `${md.join('\n')}\n`);

process.stderr.write(`[dark-ends] wrote ${OUT} and ${OUT_MD}\n`);
