#!/usr/bin/env node
/**
 * SILICONE → CARBON TRANSMUTATION
 *
 * Question (declared in
 * docs/superpowers/evidence/2026-08-14-PREREG-silicone-carbon.md):
 *   Do silicone-phase grammatical atoms produce carbon-phase axioms in the
 *   Cyclotron, or is that quixotic?
 *
 *   node scripts/silicone-carbon-transmutation.mjs
 */
import { writeFileSync } from 'node:fs';
import { CONSTRUCTIONS } from '../codex/core/constellation/grimoire/index.js';
import { BOND_REACTION, classifyBond } from '../codex/core/constellation/bond-kind.js';
import {
  ELEMENT_PHASE,
  PHRASE_TYPES,
  classifyConstruction,
  transmutationVerdict,
  constructionToAtom,
} from '../codex/core/constellation/element-phase.js';
import { runSemanticValenceCyclotron } from '../codex/core/pixelbrain/semantic-valence-cyclotron.js';
import { createSemanticAtom } from '../codex/core/pixelbrain/semantic-valence-cyclotron.js';

const OUT_JSON = 'docs/superpowers/evidence/2026-08-14-silicone-carbon-transmutation.json';
const PLACEBO_SEED = 0x53494c49; // SILI — declared in the prereg
const CYCLOTRON_TRIALS = 2_000;
const CYCLOTRON_SEED = 0x43415242; // CARB
const INERT_CONCENTRATION_LIMIT = 0.5;

function hashUint(n) {
  let x = n >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  return (x ^ (x >>> 16)) >>> 0;
}

function derange(count, seed) {
  const order = Array.from({ length: count }, (_, i) => i)
    .sort((a, b) => hashUint(Math.imul(seed, 0x9e3779b9) + a) - hashUint(Math.imul(seed, 0x9e3779b9) + b) || a - b);
  const mapping = new Array(count);
  for (let i = 0; i < count; i += 1) mapping[order[i]] = order[(i + 1) % count];
  for (let i = 0; i < count; i += 1) {
    if (mapping[i] === i) throw new Error('derangement produced a fixed point');
  }
  return mapping;
}

function inventory() {
  const buckets = { silicone: [], carbon: [], inert: [] };
  const surprise = [];
  for (const c of CONSTRUCTIONS) {
    const phase = classifyConstruction(c);
    buckets[phase].push(c);
    const kind = classifyBond([c.left, c.right, c.result, c.head]);
    if (
      phase === ELEMENT_PHASE.SILICONE
      && kind === BOND_REACTION.CONSTRUCTIVE
      && PHRASE_TYPES.has(c.result)
    ) {
      surprise.push({
        id: c.id,
        status: c.status,
        signature: `${c.left}+${c.right}->${c.result}`,
      });
    }
  }
  return { buckets, surprise };
}

function canBind(a, b) {
  const offer = new Set(a.offers);
  return b.seeks.some((port) => offer.has(port));
}

function licensedPairs(atoms) {
  const pairs = [];
  for (let i = 0; i < atoms.length; i += 1) {
    for (let j = 0; j < atoms.length; j += 1) {
      if (i === j) continue;
      if (canBind(atoms[i], atoms[j]) || canBind(atoms[j], atoms[i])) {
        const key = [atoms[i].id, atoms[j].id].sort().join('|');
        if (!pairs.some((p) => p.key === key)) {
          pairs.push({ key, atoms: [atoms[i], atoms[j]] });
        }
      }
    }
  }
  return pairs;
}

function assayArm(name, constructions) {
  const atoms = constructions.map(constructionToAtom);
  const pairs = licensedPairs(atoms);
  let transmuted = 0;
  let contaminated = 0;
  let assayFailed = 0;
  const products = [];
  for (const pair of pairs) {
    const members = pair.atoms.map((a) => a.construction);
    const verdict = transmutationVerdict(members);
    if (verdict.reason === 'carbon-contaminated') contaminated += 1;
    if (verdict.transmuted) {
      transmuted += 1;
      products.push({
        ids: members.map((c) => c.id),
        phraseResults: verdict.assay.phraseResults,
      });
    } else if (verdict.reason !== 'carbon-contaminated' && verdict.reason !== 'inert-contaminated') {
      assayFailed += 1;
    }
  }
  return {
    arm: name,
    atoms: atoms.length,
    pairs: pairs.length,
    transmuted,
    contaminated,
    assayFailed,
    rate: pairs.length === 0 ? 0 : transmuted / pairs.length,
    products,
  };
}

function placeboConstructions(silicone) {
  const map = derange(silicone.length, PLACEBO_SEED);
  return silicone.map((c, i) => {
    const donor = silicone[map[i]];
    return {
      ...c,
      id: `${c.id}-placebo`,
      result: donor.result,
      status: donor.status,
    };
  });
}

function toCyclotronAtoms(constructions) {
  return constructions.map((c) => {
    const raw = constructionToAtom(c);
    return createSemanticAtom({
      id: raw.id,
      label: raw.label,
      domain: raw.domain === 'relative-clause' ? 'relative' : raw.domain,
      offers: raw.offers,
      seeks: raw.seeks,
      traits: raw.traits,
      inhibits: raw.inhibits,
      evidence: raw.evidence,
      grounding: raw.grounding,
    });
  });
}

function runCyclotronArm(name, constructions, byId) {
  const atoms = toCyclotronAtoms(constructions);
  if (atoms.length < 2) {
    return { arm: name, skipped: true, reason: 'too-few-atoms' };
  }
  const report = runSemanticValenceCyclotron({
    atoms,
    trialCount: CYCLOTRON_TRIALS,
    seed: CYCLOTRON_SEED,
    maxMoleculeSize: 4,
    shortlistLimit: 64,
    nucleusMinDomains: 2,
    osmosisConcentrationLimit: INERT_CONCENTRATION_LIMIT,
    entropy: { enabled: false },
  });
  let transmuted = 0;
  for (const candidate of report.candidates) {
    const members = candidate.molecule.atomIds.map((id) => byId.get(id)).filter(Boolean);
    if (transmutationVerdict(members).transmuted) transmuted += 1;
  }
  return {
    arm: name,
    requestedTrials: report.requestedTrials,
    uniqueMolecules: report.counts.uniqueMolecules,
    shortlisted: report.counts.shortlisted,
    transmuted,
    nuclei: report.counts.nuclei,
    hypotheses: report.counts.hypotheses,
  };
}

function decide(pairwise) {
  const treatment = pairwise.find((a) => a.arm === 'TREATMENT');
  const placebo = pairwise.find((a) => a.arm === 'PLACEBO');
  const carbonFeed = pairwise.find((a) => a.arm === 'CARBON-FEED');
  const mixed = pairwise.find((a) => a.arm === 'MIXED');
  const fired = [];
  if (treatment.rate <= placebo.rate) fired.push('F1');
  if (carbonFeed.transmuted > 0) fired.push('F2');
  if (treatment.products.some((p) => p.phraseResults.length === 0)) fired.push('F3');
  if (treatment.transmuted === 0) fired.push('F4');
  if (treatment.transmuted > 0 && mixed && mixed.transmuted === treatment.transmuted) {
    // MIXED adding a carbon atom did not change silicone-pair yield — not F5.
  }
  if (treatment.products.length > 0 && treatment.contaminated === treatment.pairs) {
    fired.push('F5');
  }
  let verdict = 'QUIXOTIC';
  if (!fired.includes('F4') && !fired.includes('F1') && !fired.includes('F2') && !fired.includes('F3')) {
    verdict = 'LEGITIMATE';
  }
  if (fired.includes('F4') && !fired.includes('F2')) {
    verdict = 'QUIXOTIC';
  }
  return { fired, verdict };
}

const { buckets, surprise } = inventory();
const silicone = buckets.silicone;
const carbon = buckets.carbon;
const mixed = [...silicone, carbon[0]].filter(Boolean);

const pairwise = [
  assayArm('TREATMENT', silicone),
  assayArm('PLACEBO', placeboConstructions(silicone)),
  assayArm('CARBON-FEED', carbon),
  assayArm('MIXED', mixed),
];

const byId = new Map();
for (const c of CONSTRUCTIONS) byId.set(constructionToAtom(c).id, c);

const cyclotron = [
  runCyclotronArm('TREATMENT', silicone, byId),
  runCyclotronArm('CARBON-FEED', carbon, byId),
];

const decision = decide(pairwise);

const report = {
  contract: 'PB-SILICONE-CARBON-TRANSMUTATION-v1',
  prereg: 'docs/superpowers/evidence/2026-08-14-PREREG-silicone-carbon.md',
  placeboSeed: PLACEBO_SEED,
  inventory: {
    silicone: silicone.length,
    carbon: carbon.length,
    inert: buckets.inert.length,
    surpriseSiliconeConstructivePhrase: surprise,
  },
  pairwise,
  cyclotron,
  decision,
};

writeFileSync(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`);

console.log('════════════════════════════════════════════════════════════');
console.log('SILICONE → CARBON  (pairwise chamber is the decision)');
console.log('════════════════════════════════════════════════════════════');
console.log(`inventory  silicone=${silicone.length}  carbon=${carbon.length}  inert=${buckets.inert.length}`);
console.log(`surprise silicone∧constructive∧phrase: ${surprise.length === 0 ? 'NONE' : surprise.map((s) => s.signature).join(', ')}`);
console.log('');
for (const arm of pairwise) {
  console.log(
    `${arm.arm.padEnd(12)} atoms=${String(arm.atoms).padStart(3)}  pairs=${String(arm.pairs).padStart(4)}  `
    + `transmuted=${arm.transmuted}  rate=${arm.rate.toFixed(4)}  contaminated=${arm.contaminated}`,
  );
}
console.log('');
console.log('cyclotron chamber (sampled, not the decision):');
for (const arm of cyclotron) {
  if (arm.skipped) {
    console.log(`  ${arm.arm}: skipped (${arm.reason})`);
    continue;
  }
  console.log(
    `  ${arm.arm}: unique=${arm.uniqueMolecules} shortlisted=${arm.shortlisted} `
    + `transmuted=${arm.transmuted} nuclei=${arm.nuclei}`,
  );
}
console.log('');
console.log(`failures fired: ${decision.fired.join(', ') || 'none'}`);
console.log(`VERDICT: ${decision.verdict}`);
console.log(`wrote ${OUT_JSON}`);
