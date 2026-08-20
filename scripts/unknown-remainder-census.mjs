#!/usr/bin/env node
/**
 * Remaining-UNKNOWN census. Classifies lemma::TYPE mass into
 * function / legitimate content / spurious emission.
 *
 * TRAIN authors frequency. DEV chamber measures the exposure gap.
 * TEST is not opened. No inventory or emission change.
 *
 *   node scripts/unknown-remainder-census.mjs
 */
import { execSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { atomsFor } from '../codex/core/constellation/compose.js';
import { EXPERIMENTAL_FEATURE_PROVIDER } from '../codex/core/constellation/semantic-particles/experimental-inventory.js';
import { featuresFor } from '../codex/core/constellation/semantic-particles/feature-provider.js';
import { knownFeatureCount } from '../codex/core/constellation/semantic-particles/experimental-inventory.js';
import { pickScoredReading } from '../codex/core/constellation/semantic-particles/feature-score.js';
import { censusUnknownMass } from '../codex/core/constellation/semantic-particles/coverage-census.js';
import {
  UNKNOWN_BUCKETS,
  classifyUnknownKey,
  noveltyKind,
  summarizeUnknownBuckets,
} from '../codex/core/constellation/semantic-particles/unknown-remainder.js';
import { loadPosMap, loadSplit } from './lib/constellation-corpus.mjs';

const OUT = 'docs/superpowers/evidence/2026-08-16-unknown-remainder-census.json';
const OUT_MD = 'docs/superpowers/evidence/2026-08-16-unknown-remainder-census.md';
const MAX_TOKENS = 28;
const TOP_N = 300;
const TEST_PATH = path.resolve('cache/ud/en_ewt-ud-test.conllu');
function typeHitsGold(type, upos) {
  return Boolean(UPOS_TO_ATOM[upos]?.includes(type));
}
const UPOS_TO_ATOM = Object.freeze({
  NOUN: ['N', 'NC', 'NP', 'NPO'],
  PROPN: ['PROPN', 'NP', 'N', 'NC'],
  VERB: ['V', 'VP', 'COP', 'AUX'],
  AUX: ['AUX', 'COP', 'V'],
  ADJ: ['ADJ'],
  ADV: ['ADV'],
  DET: ['DET'],
  ADP: ['P', 'TO'],
  PRON: ['PRON', 'PRONACC', 'NP', 'NPO'],
  CCONJ: ['CONJ', 'CONJS'],
  SCONJ: ['SUB', 'REL'],
  PART: ['PART', 'TO', 'PRT', 'POSS'],
});

if (existsSync(TEST_PATH)) {
  // sealed
}

function gitHead() {
  try { return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim(); } catch { return null; }
}

function pct(x) {
  return `${(Number(x) * 100).toFixed(1)}%`;
}

function keyOf(lemma, type) {
  return `${lemma}::${type}`;
}

function isKnown(lemma, type, provider) {
  return knownFeatureCount(featuresFor(lemma, type, provider)) > 0;
}

function emptyBucketCounts() {
  return {
    A_FUNCTION: 0,
    B_CONTENT: 0,
    C_SPURIOUS: 0,
    UNCERTAIN: 0,
  };
}

const posMap = loadPosMap();
const train = loadSplit('train');
const dev = loadSplit('dev');
const provider = EXPERIMENTAL_FEATURE_PROVIDER;

const trainCensus = censusUnknownMass(train, posMap, provider, atomsFor);
const trainUnknown = trainCensus.keys.filter((row) => row.unknownMass > 0);
const trainBuckets = summarizeUnknownBuckets(trainUnknown);

const trainTop = trainBuckets.rows.slice(0, TOP_N).map((row, i) => ({
  rank: i + 1,
  key: row.key,
  lemma: row.lemma,
  type: row.type,
  unknownMass: row.unknownMass,
  frequency: row.frequency,
  cumulativeUnknown: row.cumulativeUnknown,
  cumulativeShare: row.cumulativeShare,
  bucket: row.bucket,
  reason: row.reason,
  action: row.action,
  novelty: noveltyKind(row.lemma, row.type, provider),
}));

const chamber = {
  ambiguous: 0,
  withEvidence: 0,
  allUnknown: 0,
  pickedUnknown: emptyBucketCounts(),
  anyUnknownAtom: emptyBucketCounts(),
  exclusive: {
    A_FUNCTION: 0,
    B_CONTENT: 0,
    C_SPURIOUS: 0,
    UNCERTAIN: 0,
    mixed: 0,
  },
  liftIfPickedKnown: emptyBucketCounts(),
  liftIfAnyKnown: emptyBucketCounts(),
  removeC: {
    leftChamber: 0,
    remainingAmbiguous: 0,
    withEvidence: 0,
    allUnknown: 0,
    pickedBecomesKnown: 0,
  },
  siblingKnown: 0,
  siblingKnownWouldFlip: 0,
  pickedMissesGold: 0,
  siblingHitsGold: 0,
  novelty: {
    novel: 0,
    'known-elsewhere-content': 0,
    'known-elsewhere-function': 0,
  },
  bNovelty: {
    novel: 0,
    'known-elsewhere-content': 0,
    'known-elsewhere-function': 0,
  },
};
const pickedUnknownKeys = new Map();

for (const rec of dev) {
  const tokens = rec.tokens || [];
  if (tokens.length === 0 || tokens.length > MAX_TOKENS) continue;
  const atomsByIndex = new Map();
  for (let i = 0; i < tokens.length; i += 1) {
    const atoms = atomsFor(tokens[i].form, i, posMap) || [];
    if (atoms.length) atomsByIndex.set(i, atoms);
  }
  for (const [index, group] of atomsByIndex) {
    if (group.length < 2) continue;
    const goldUpos = tokens[index]?.upos;
    if (!goldUpos || !UPOS_TO_ATOM[goldUpos]) continue;
    chamber.ambiguous += 1;

    const neighbors = [];
    for (const [sideIndex, side] of [[index - 1, 'left'], [index + 1, 'right']]) {
      const nb = atomsByIndex.get(sideIndex);
      if (nb?.[0]?.token) {
        neighbors.push({ lemma: String(nb[0].token).toLowerCase(), type: nb[0].type, side });
      }
    }
    const real = pickScoredReading(group, neighbors, provider);
    const realRow = real.rows.find((r) => r.type === real.pick.type);
    const pickedKnown = Boolean(realRow && !realRow.allUnknown);
    if (pickedKnown) chamber.withEvidence += 1;
    else chamber.allUnknown += 1;

    const atomRows = group.map((atom) => {
      const lemma = String(atom.token || tokens[index].form).toLowerCase();
      const known = isKnown(lemma, atom.type, provider);
      const classified = classifyUnknownKey({ lemma, type: atom.type });
      return { lemma, type: atom.type, known, ...classified };
    });
    const unknownAtoms = atomRows.filter((row) => !row.known);
    const unknownBucketSet = new Set(unknownAtoms.map((row) => row.bucket));

    if (!pickedKnown) {
      const pickLemma = String(real.pick.token || tokens[index].form).toLowerCase();
      const picked = classifyUnknownKey({ lemma: pickLemma, type: real.pick.type });
      const novelty = noveltyKind(pickLemma, real.pick.type, provider);
      const groupHasKnown = atomRows.some((row) => row.known);
      const pickHitsGold = typeHitsGold(real.pick.type, goldUpos);
      const knownHitsGold = atomRows.some((row) => row.known && typeHitsGold(row.type, goldUpos));
      chamber.pickedUnknown[picked.bucket] += 1;
      chamber.liftIfPickedKnown[picked.bucket] += 1;
      chamber.novelty[novelty] += 1;
      if (picked.bucket === UNKNOWN_BUCKETS.B_CONTENT) chamber.bNovelty[novelty] += 1;
      if (groupHasKnown) {
        chamber.siblingKnown += 1;
        chamber.siblingKnownWouldFlip += 1;
      }
      if (!pickHitsGold) chamber.pickedMissesGold += 1;
      if (!pickHitsGold && knownHitsGold) chamber.siblingHitsGold += 1;
      const pk = keyOf(pickLemma, real.pick.type);
      const seen = pickedUnknownKeys.get(pk) || {
        key: pk,
        lemma: pickLemma,
        type: real.pick.type,
        items: 0,
        novelty,
        ...picked,
      };
      seen.items += 1;
      pickedUnknownKeys.set(pk, seen);

      for (const bucket of unknownBucketSet) chamber.anyUnknownAtom[bucket] += 1;
      if (unknownBucketSet.size === 1) {
        chamber.exclusive[[...unknownBucketSet][0]] += 1;
      } else if (unknownBucketSet.size > 1) {
        chamber.exclusive.mixed += 1;
      }
      for (const bucket of unknownBucketSet) {
        chamber.liftIfAnyKnown[bucket] += 1;
      }

      const kept = atomRows.filter((row) => row.bucket !== UNKNOWN_BUCKETS.C_SPURIOUS);
      if (kept.length < 2) {
        chamber.removeC.leftChamber += 1;
      } else {
        chamber.removeC.remainingAmbiguous += 1;
        const newPick = kept[0];
        if (newPick.known) {
          chamber.removeC.withEvidence += 1;
          chamber.removeC.pickedBecomesKnown += 1;
        } else {
          chamber.removeC.allUnknown += 1;
        }
      }
    } else {
      const kept = atomRows.filter((row) => row.bucket !== UNKNOWN_BUCKETS.C_SPURIOUS);
      if (kept.length < 2) chamber.removeC.leftChamber += 1;
      else {
        chamber.removeC.remainingAmbiguous += 1;
        chamber.removeC.withEvidence += 1;
      }
    }
  }
}

const needEvidence = Math.ceil(0.6 * chamber.ambiguous) - chamber.withEvidence;
const pickedUnknownTop = [...pickedUnknownKeys.values()]
  .sort((a, b) => b.items - a.items || a.key.localeCompare(b.key))
  .slice(0, TOP_N)
  .map((row, i) => ({ rank: i + 1, ...row }));

const trainB = trainBuckets.rows
  .filter((row) => row.bucket === UNKNOWN_BUCKETS.B_CONTENT)
  .map((row) => ({
    key: row.key,
    unknownMass: row.unknownMass,
    frequency: row.frequency,
    reason: row.reason,
    novelty: noveltyKind(row.lemma, row.type, provider),
  }));
const trainBByNovelty = {
  novel: trainB.filter((row) => row.novelty === 'novel'),
  knownElsewhereContent: trainB.filter((row) => row.novelty === 'known-elsewhere-content'),
  knownElsewhereFunction: trainB.filter((row) => row.novelty === 'known-elsewhere-function'),
};
const trainBMass = {
  novel: trainBByNovelty.novel.reduce((s, r) => s + r.unknownMass, 0),
  knownElsewhereContent: trainBByNovelty.knownElsewhereContent.reduce((s, r) => s + r.unknownMass, 0),
  knownElsewhereFunction: trainBByNovelty.knownElsewhereFunction.reduce((s, r) => s + r.unknownMass, 0),
};

const report = {
  contract: 'PB-UNKNOWN-REMAINDER-CENSUS-v1',
  testFileOpened: false,
  commit: gitHead(),
  inventoryVersion: provider.version,
  maxTokens: MAX_TOKENS,
  train: {
    ambiguousTokens: trainCensus.ambiguousTokens,
    unknownTokens: trainCensus.unknownTokens,
    unknownTokenRate: trainCensus.unknownTokenRate,
    totalUnknownMass: trainCensus.totalUnknown,
    keys: trainCensus.keys.length,
    unknownKeys: trainUnknown.length,
    buckets: trainBuckets.byBucket,
    contentNoveltyMass: trainBMass,
    top: trainTop,
    topNovelContent: trainBByNovelty.novel.slice(0, 80),
    topKnownElsewhereContent: trainBByNovelty.knownElsewhereContent.slice(0, 40),
  },
  chamber: {
    split: 'dev',
    ambiguous: chamber.ambiguous,
    withEvidence: chamber.withEvidence,
    allUnknown: chamber.allUnknown,
    evidenceRate: chamber.ambiguous > 0 ? chamber.withEvidence / chamber.ambiguous : 0,
    allUnknownRate: chamber.ambiguous > 0 ? chamber.allUnknown / chamber.ambiguous : 1,
    gapTo60: {
      itemsNeeded: needEvidence,
      pointsNeeded: 0.6 - (chamber.ambiguous > 0 ? chamber.withEvidence / chamber.ambiguous : 0),
    },
    pickedUnknownByBucket: chamber.pickedUnknown,
    exclusiveUnknownAtoms: chamber.exclusive,
    pickedNovelty: chamber.novelty,
    pickedBNovelty: chamber.bNovelty,
    groupHasKnownSibling: {
      items: chamber.siblingKnown,
      shareOfUnknown: chamber.allUnknown > 0 ? chamber.siblingKnown / chamber.allUnknown : 0,
      evidenceIfSiblingCounted: chamber.ambiguous > 0
        ? (chamber.withEvidence + chamber.siblingKnown) / chamber.ambiguous
        : 0,
    },
    goldDiagnostic: {
      pickedMissesGold: chamber.pickedMissesGold,
      siblingKnownHitsGold: chamber.siblingHitsGold,
      note: 'Diagnostic only. Gold UPOS was not used to construct values.',
    },
    liftIfPickedBecomesKnown: {
      A_FUNCTION: {
        items: chamber.liftIfPickedKnown.A_FUNCTION,
        evidenceRate: chamber.ambiguous > 0
          ? (chamber.withEvidence + chamber.liftIfPickedKnown.A_FUNCTION) / chamber.ambiguous
          : 0,
      },
      B_CONTENT: {
        items: chamber.liftIfPickedKnown.B_CONTENT,
        evidenceRate: chamber.ambiguous > 0
          ? (chamber.withEvidence + chamber.liftIfPickedKnown.B_CONTENT) / chamber.ambiguous
          : 0,
      },
      C_SPURIOUS: {
        items: chamber.liftIfPickedKnown.C_SPURIOUS,
        evidenceRate: chamber.ambiguous > 0
          ? (chamber.withEvidence + chamber.liftIfPickedKnown.C_SPURIOUS) / chamber.ambiguous
          : 0,
      },
      A_and_B: {
        items: chamber.liftIfPickedKnown.A_FUNCTION + chamber.liftIfPickedKnown.B_CONTENT,
        evidenceRate: chamber.ambiguous > 0
          ? (chamber.withEvidence
            + chamber.liftIfPickedKnown.A_FUNCTION
            + chamber.liftIfPickedKnown.B_CONTENT) / chamber.ambiguous
          : 0,
      },
    },
    removeSpuriousEmission: {
      leftChamber: chamber.removeC.leftChamber,
      remainingAmbiguous: chamber.removeC.remainingAmbiguous,
      withEvidence: chamber.removeC.withEvidence,
      allUnknown: chamber.removeC.allUnknown,
      evidenceRate: chamber.removeC.remainingAmbiguous > 0
        ? chamber.removeC.withEvidence / chamber.removeC.remainingAmbiguous
        : 0,
      allUnknownRate: chamber.removeC.remainingAmbiguous > 0
        ? chamber.removeC.allUnknown / chamber.removeC.remainingAmbiguous
        : 1,
    },
    topPickedUnknown: pickedUnknownTop,
  },
};

function bucketLine(name, items, denom) {
  const share = denom > 0 ? items / denom : 0;
  return `${name} ${items} (${pct(share)})`;
}

const md = [];
md.push('# RESULT — Remaining UNKNOWN census');
md.push('');
md.push('TEST was not opened. Inventory and emission were not changed.');
md.push('');
md.push(`- commit \`${report.commit}\``);
md.push(`- inventory ${report.inventoryVersion}`);
md.push(`- TRAIN unknown mass ${trainCensus.totalUnknown} across ${trainUnknown.length} keys`);
md.push(`  A function ${pct(trainBuckets.byBucket.A_FUNCTION.share)} / B content ${pct(trainBuckets.byBucket.B_CONTENT.share)} / C spurious ${pct(trainBuckets.byBucket.C_SPURIOUS.share)} / uncertain ${pct(trainBuckets.byBucket.UNCERTAIN.share)}`);
md.push(`  B mass split: novel ${trainBMass.novel} / known-elsewhere-content ${trainBMass.knownElsewhereContent} / known-elsewhere-function ${trainBMass.knownElsewhereFunction}`);
md.push(`- DEV chamber ambiguous ${chamber.ambiguous}, evidence ${pct(report.chamber.evidenceRate)}, UNKNOWN ${pct(report.chamber.allUnknownRate)}`);
md.push(`  items needed to reach 60% evidence: ${needEvidence}`);
md.push(`- Picked UNKNOWN by bucket: ${bucketLine('A', chamber.pickedUnknown.A_FUNCTION, chamber.allUnknown)}; ${bucketLine('B', chamber.pickedUnknown.B_CONTENT, chamber.allUnknown)}; ${bucketLine('C', chamber.pickedUnknown.C_SPURIOUS, chamber.allUnknown)}; ${bucketLine('uncertain', chamber.pickedUnknown.UNCERTAIN, chamber.allUnknown)}`);
md.push(`- Picked novelty: novel ${chamber.novelty.novel}; known-elsewhere-content ${chamber.novelty['known-elsewhere-content']}; known-elsewhere-function ${chamber.novelty['known-elsewhere-function']}`);
md.push(`- Inside B: novel ${chamber.bNovelty.novel}; known-elsewhere-content ${chamber.bNovelty['known-elsewhere-content']}; known-elsewhere-function ${chamber.bNovelty['known-elsewhere-function']}`);
md.push(`- UNKNOWN groups that already have a known sibling atom: ${chamber.siblingKnown} (${pct(chamber.allUnknown > 0 ? chamber.siblingKnown / chamber.allUnknown : 0)}). If those counted as evidence: ${pct(chamber.ambiguous > 0 ? (chamber.withEvidence + chamber.siblingKnown) / chamber.ambiguous : 0)}`);
md.push(`- Gold diagnostic (not used for values): picked misses gold UPOS ${chamber.pickedMissesGold}; known sibling hits gold ${chamber.siblingHitsGold}`);
md.push(`- If picked key became known: A → ${pct(report.chamber.liftIfPickedBecomesKnown.A_FUNCTION.evidenceRate)}; B → ${pct(report.chamber.liftIfPickedBecomesKnown.B_CONTENT.evidenceRate)}; C → ${pct(report.chamber.liftIfPickedBecomesKnown.C_SPURIOUS.evidenceRate)}; A+B → ${pct(report.chamber.liftIfPickedBecomesKnown.A_and_B.evidenceRate)}`);
md.push(`- If C atoms were dropped (not scored): leave chamber ${chamber.removeC.leftChamber}, remaining ${chamber.removeC.remainingAmbiguous}, evidence ${pct(report.chamber.removeSpuriousEmission.evidenceRate)}, UNKNOWN ${pct(report.chamber.removeSpuriousEmission.allUnknownRate)}`);
md.push('');
md.push('## Top remaining UNKNOWN (TRAIN mass)');
md.push('');
md.push('| rank | key | mass | bucket | novelty | action |');
md.push('|---:|---|---:|---|---|---|');
for (const row of trainTop.slice(0, 40)) {
  md.push(`| ${row.rank} | ${row.key} | ${row.unknownMass} | ${row.bucket} | ${row.novelty} | ${row.action} |`);
}
md.push('');
md.push('## Top picked UNKNOWN (DEV chamber items)');
md.push('');
md.push('| rank | key | items | bucket | novelty | action |');
md.push('|---:|---|---:|---|---|---|');
for (const row of pickedUnknownTop.slice(0, 40)) {
  md.push(`| ${row.rank} | ${row.key} | ${row.items} | ${row.bucket} | ${row.novelty} | ${row.action} |`);
}
md.push('');
md.push('Reproduction: `node scripts/unknown-remainder-census.mjs`');
md.push('');

writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(OUT_MD, `${md.join('\n')}\n`);
console.log(md.join('\n'));
console.log(`wrote ${OUT}`);
