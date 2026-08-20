/**
 * NON-LOCAL SPECTRAL RESONANCE EXPERIMENT
 *
 * Probes the dark matter corpus for distant atoms (|i - j| >= 2) that resonate
 * with identical spectral response vectors, or whose joint perturbation unlocks
 * super-additive root illumination.
 *
 * SEMANTIC CHEMISTRY EXPERIMENT SPEC:
 * - Physics: Coupled non-local chromophores / Distant resonance.
 * - Semantic: Discontinuous constituents, displaced particles, split modifiers.
 * - Operator: Pairwise Spectral Cosine Similarity & Joint Dual-Deletion.
 * - Control: Shuffled distance control & local (d=1) baseline.
 * - Falsifier: Non-local correlation is indistinguishable from shuffled noise.
 *
 * Run with:
 *   node scripts/distant-resonance-beam.mjs
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { parseConllu, goldAnswer } from '../codex/core/constellation/treebank.js';
import { composePacked, headsOf, projectAnswers } from '../codex/core/constellation/compose-packed.js';
import {
  computeResponseVector,
  fireBeam,
  pickProbeWords,
} from '../codex/core/constellation/perturbation-beam.js';

const FIX = path.resolve('tests/qa/fixtures/constellation');
const records = parseConllu(readFileSync(path.join(FIX, 'treebank-gate.conllu'), 'utf8'));
const posMap = new Map(Object.entries(JSON.parse(readFileSync(path.join(FIX, 'treebank-gate-lexicon.json'), 'utf8'))));
const MAX_TOKENS = 20;
const probes = pickProbeWords(posMap);

// Re-derive dark sentences
const dark = [];
for (const rec of records) {
  const tokens = rec.tokens.map((t) => t.form);
  if (tokens.length === 0 || tokens.length > MAX_TOKENS) continue;
  const chart = composePacked(tokens, posMap, {});
  if (chart.stable.length > 0 || chart.spanning.length === 0) continue;
  dark.push({ rec, tokens, chart });
}

console.log('══════════════════════════════════════════════════════════════════════');
console.log('  NON-LOCAL SPECTRAL RESONANCE BEAM — DISTANT ATOM COUPLING ASSAY');
console.log('══════════════════════════════════════════════════════════════════════\n');
console.log(`Analyzing ${dark.length} dark sentences for distant resonant atom pairs...\n`);

function vectorToNumericArray(v) {
  return [
    v.rootReachability ?? 0,
    v.headDivergence ?? 0.5,
    (v.derivationDelta ?? 0) / 10.0,
    v.topologyDisplacement ?? 0,
    v.resonanceDelta ?? 0,
    v.spanAperture ?? 0,
  ];
}

function cosineSimilarity(v1, v2) {
  const a1 = vectorToNumericArray(v1);
  const a2 = vectorToNumericArray(v2);
  let dot = 0;
  let norm1 = 0;
  let norm2 = 0;
  for (let i = 0; i < a1.length; i += 1) {
    dot += a1[i] * a2[i];
    norm1 += a1[i] * a1[i];
    norm2 += a2[i] * a2[i];
  }
  if (norm1 === 0 || norm2 === 0) return 0;
  return Number((dot / (Math.sqrt(norm1) * Math.sqrt(norm2))).toFixed(4));
}

const resonantPairs = [];
const jointIlluminations = [];

for (const { rec, tokens, chart } of dark) {
  const n = tokens.length;
  if (n < 3) continue;
  const gold = goldAnswer(rec);
  const beam = fireBeam(tokens, posMap, chart, gold.verb, { probes });
  const singleDeletions = beam.deletions || [];

  // Compute single deletion response vectors by index
  const singleVectors = new Map();
  for (const del of singleDeletions) {
    if (del.detail && del.detail.index != null) {
      singleVectors.set(del.detail.index, del);
    }
  }

  // Probe all distant pairs (distance >= 2, e.g. at least 1 token between them)
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 2; j < n; j += 1) {
      const dist = j - i;
      const delI = singleVectors.get(i);
      const delJ = singleVectors.get(j);

      let sim = 0;
      if (delI && delJ && delI.vector && delJ.vector) {
        sim = cosineSimilarity(delI.vector, delJ.vector);
      }

      // Check joint dual deletion: delete both i and j
      const dualTokens = tokens.filter((_, idx) => idx !== i && idx !== j);
      const dualChart = composePacked(dualTokens, posMap, {});
      const isDualLit = (dualChart.stable || []).length > 0;
      const isSingleLitI = delI ? delI.effect === 'ILLUMINATED' : false;
      const isSingleLitJ = delJ ? delJ.effect === 'ILLUMINATED' : false;

      // Super-additive if dual lights a root that neither single deletion could light
      const isSuperAdditive = isDualLit && !isSingleLitI && !isSingleLitJ;

      if (sim > 0.85 || isSuperAdditive || (isDualLit && (isSingleLitI || isSingleLitJ))) {
        let goldContainmentMatch = null;
        let answers = [];
        if (isDualLit) {
          const rootNode = dualChart.stable[0];
          try { answers = projectAnswers(rootNode); } catch { answers = []; }
          goldContainmentMatch = answers.some((a) => a.verb === gold.verb);
        }

        const pairRecord = {
          sentText: tokens.join(' '),
          goldVerb: gold.verb,
          i,
          j,
          dist,
          tokenI: tokens[i],
          tokenJ: tokens[j],
          sim,
          effectI: delI ? delI.effect : 'UNKNOWN',
          effectJ: delJ ? delJ.effect : 'UNKNOWN',
          dualEffect: isDualLit ? 'ILLUMINATED' : (dualChart.spanning.length > 0 ? 'REFRACTED' : 'COLLAPSED'),
          isSuperAdditive,
          goldContainmentMatch,
          answers,
        };

        if (isSuperAdditive) {
          jointIlluminations.push(pairRecord);
        } else if (sim > 0.85) {
          resonantPairs.push(pairRecord);
        }
      }
    }
  }
}

console.log('1. SUPER-ADDITIVE DISTANT PAIRS (Joint deletion lights S where neither alone could):');
if (jointIlluminations.length === 0) {
  console.log('  (none — all dual deletions behaved additively)');
} else {
  for (const p of jointIlluminations.slice(0, 15)) {
    const ansStr = p.answers.map((a) => `${a.subject ? a.subject + '+' : ''}${a.verb}`).join(',');
    console.log(`  dist=${p.dist} [${p.i}:"${p.tokenI}"] ... [${p.j}:"${p.tokenJ}"] -> LIT ans=[${ansStr}] gold=${p.goldVerb} goldContained=${p.goldContainmentMatch}`);
    console.log(`    "${p.sentText}"\n`);
  }
}

console.log('\n2. HIGH-RESONANCE SPECTRAL PAIRS (Cosine Similarity > 0.85 across 6D vector at dist >= 2):');
if (resonantPairs.length === 0) {
  console.log('  (none)');
} else {
  resonantPairs.sort((a, b) => (b.dist * b.sim) - (a.dist * a.sim));
  for (const p of resonantPairs.slice(0, 15)) {
    console.log(`  dist=${String(p.dist).padEnd(2)} sim=${p.sim.toFixed(3)} [${p.i}:"${p.tokenI}"] ~ [${p.j}:"${p.tokenJ}"] singleEffects=[${p.effectI}, ${p.effectJ}] dual=${p.dualEffect}`);
    console.log(`    "${p.sentText}"\n`);
  }
}

console.log('\n3. THREE-ARM COUNTERFACTUAL RESOLUTION TAXONOMY (Least Disturbance Arbitration):');
import { threeArmCounterfactualAssay } from '../codex/core/constellation/perturbation-beam.js';

const assessed = [];
const allCandidates = [...jointIlluminations, ...resonantPairs];
const seenKeys = new Set();

for (const p of allCandidates) {
  const key = `${p.sentText}|${p.i}|${p.j}`;
  if (seenKeys.has(key)) continue;
  seenKeys.add(key);

  const rec = records.find((r) => r.tokens.map((t) => t.form).join(' ') === p.sentText);
  if (!rec) continue;
  const tokens = rec.tokens.map((t) => t.form);
  const chart = composePacked(tokens, posMap, {});
  const assay = threeArmCounterfactualAssay(tokens, posMap, chart, p, p.goldVerb);
  assessed.push({ p, assay });
}

for (const { p, assay } of assessed.slice(0, 15)) {
  console.log(`  ${assay.classification.padEnd(28)} winningArm=${assay.winningArm.padEnd(10)} dist=${p.dist} [${p.i}:"${p.tokenI}"] ~ [${p.j}:"${p.tokenJ}"]`);
  console.log(`    Arm A (Relocate): lit=${assay.telemetry.armA.lit} score=${assay.telemetry.armA.score}`);
  console.log(`    Arm B (Bond):     lit=${assay.telemetry.armB.lit} score=${assay.telemetry.armB.score}`);
  console.log(`    Arm C (Doorway):  lit=${assay.telemetry.armC.lit} score=${assay.telemetry.armC.score}`);
  console.log(`    "${p.sentText}"\n`);
}
