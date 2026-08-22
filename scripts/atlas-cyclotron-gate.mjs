#!/usr/bin/env node
/**
 * PREREG: does the atlas-fed cyclotron survive an overgeneration gate?
 *
 * The 2026-08-16 run named 8 fireable bonds and scored them on
 * containment — a coverage number, which the Purity Law says is not
 * permission. This run replaces that objective: a candidate must
 * explain atlas failures across >=2 construction labels, overgenerate
 * nothing, and regress nothing, judged cumulatively.
 *
 * Falsifiers (declared before the run):
 * The bar is NOT zero overgeneration. Leave-one-out on the shipped bond
 * table shows only 21 of 53 active licensed bonds overgenerate nothing,
 * and the four strongest trades in the grammar (P+NP->PP, V+NP->VP,
 * DET+N->NP, NP+VP->S) all overgenerate. A zero bar is a check that
 * cannot pass. Floors are calibrated to the licensed median instead.
 *
 *   F1  the gate admits S+NP->S
 *       (the promiscuity bond that topped 08-16; if it survives, the
 *        gate does not work)
 *   F2  the gate admits zero candidates
 *       (bar unpassable by construction — proves nothing)
 *   F3  the verdict is unchanged with construction labels stripped
 *       (the gate is not reading the atlas)
 *   F4  the admitted set does not out-explain a size-matched random
 *       bond control
 *
 * Design split only. Does not open the seal. Does not edit the Grimoire.
 *
 *   node scripts/atlas-cyclotron-gate.mjs
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { parseConllu } from '../codex/core/constellation/treebank.js';
import { feedCyclotron } from '../codex/research/parser-failure-atlas/cyclotron-feed.js';
import {
  calibrateAgainstLicensed,
  gateCandidateBonds,
  judgeCandidate,
  plateRows,
} from '../codex/research/parser-failure-atlas/overgeneration-gate.js';
import { BONDS } from '../codex/core/constellation/compose.js';
import { loadPosMap } from './lib/constellation-corpus.mjs';

const EVIDENCE = path.resolve('docs/superpowers/evidence/2026-08-20-atlas-cyclotron-gate.json');
const CALIBRATION = path.resolve('docs/superpowers/evidence/2026-08-20-licensed-bond-calibration.json');
const MAX_TOKENS = 20;
const SEED = 0x5c4010;

const args = new Set(process.argv.slice(2));
const LIMIT = Number(
  [...args].find((a) => a.startsWith('--limit='))?.split('=')[1] ?? 400,
);
const SAMPLE = Number(
  [...args].find((a) => a.startsWith('--sample='))?.split('=')[1] ?? 99,
);

function mulberry32(a) {
  return function next() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const posMap = loadPosMap();
const records = parseConllu(
  readFileSync('tests/qa/fixtures/constellation/treebank-gate.conllu', 'utf8'),
).filter((r) => (r.tokens || []).length <= MAX_TOKENS).slice(0, LIMIT);

process.stderr.write(`atlas feed on n=${records.length} (design split, <=${MAX_TOKENS} tokens)…\n`);
const fed = feedCyclotron(records, posMap, {
  minCount: 2, topPairs: 40, candidateLimit: 64, maxTokens: MAX_TOKENS,
});

const licensed = new Set(BONDS.map((b) => `${b[0]}|${b[1]}|${b[2]}`));
const novel = fed.candidates.filter(
  (c) => c.fireable && !licensed.has(c.signature),
);
process.stderr.write(
  `atlas cases ${fed.atlasCases}/${fed.recordsIn}; cyclotron candidates ${fed.candidates.length}, novel fireable ${novel.length}\n`,
);

/*
 * Leave-one-out over the whole bond table costs ~15 minutes. It is
 * deterministic in (corpus slice, sample, percentile), so it is cached
 * under that key and recomputed only when the key changes.
 */
const calibKey = { corpus: 'treebank-gate', limit: LIMIT, maxTokens: MAX_TOKENS, sample: SAMPLE, percentile: 0.5 };
let calib = null;
if (!args.has('--recalibrate')) {
  try {
    const cached = JSON.parse(readFileSync(CALIBRATION, 'utf8'));
    if (JSON.stringify(cached.key) === JSON.stringify(calibKey)) {
      calib = cached.calibration;
      process.stderr.write('reusing cached licensed-bond calibration\n');
    }
  } catch { /* no cache */ }
}
if (!calib) {
  process.stderr.write(`calibrating floors on ${SAMPLE} licensed bonds (leave-one-out)…\n`);
  calib = calibrateAgainstLicensed(records, posMap, {
    sample: SAMPLE, percentile: 0.5, maxTokens: MAX_TOKENS,
  });
  writeFileSync(CALIBRATION, `${JSON.stringify({ key: calibKey, calibration: calib }, null, 2)}\n`);
}
process.stderr.write(
  `licensed active ${calib.active}/${calib.sampled}; netFloor ${calib.netFloor}, labelSpanFloor ${calib.labelSpanFloor}\n`,
);

const FLOORS = {
  netFloor: calib.netFloor,
  minLabelSpan: calib.labelSpanFloor,
  maxTokens: MAX_TOKENS,
};

process.stderr.write('gating (baseline + solo + cumulative re-scores)…\n');
const gate = gateCandidateBonds(records, posMap, novel, FLOORS);

// ---- F1: did S+NP->S survive?
const sNp = gate.candidates.find((c) => c.signature === 'S|NP|S');
const F1 = sNp ? sNp.verdict === 'ADMITTED' : false;

// ---- F2: did anything survive?
const F2 = gate.admitted.length === 0;

// ---- F3: strip construction labels, re-judge the admitted set
const baseline = plateRows(records, posMap, null, { maxTokens: MAX_TOKENS });
const admittedBonds = novel
  .filter((c) => gate.admitted.includes(c.signature))
  .flatMap((c) => c.bonds);
const treatedAdmitted = admittedBonds.length
  ? plateRows(records, posMap, Object.freeze([...BONDS, ...admittedBonds]), { maxTokens: MAX_TOKENS })
  : baseline;
const withLabels = judgeCandidate(baseline, treatedAdmitted, FLOORS);
const stripped = judgeCandidate(
  baseline.map((r) => ({ ...r, labels: [] })),
  treatedAdmitted,
  FLOORS,
);
const F3 = withLabels.verdict === stripped.verdict;

// ---- F4: size-matched random bond control
const types = [...new Set(BONDS.flatMap((b) => [b[0], b[1], b[2]]))].sort();
const rng = mulberry32(SEED);
const pick = () => types[Math.floor(rng() * types.length)];
const controlRuns = [];
for (let run = 0; run < 5; run += 1) {
  const randomBonds = [];
  while (randomBonds.length < Math.max(1, admittedBonds.length)) {
    const bond = [pick(), pick(), pick(), rng() < 0.5 ? 0 : 1];
    const sig = `${bond[0]}|${bond[1]}|${bond[2]}`;
    if (licensed.has(sig)) continue;
    randomBonds.push(Object.freeze(bond));
  }
  const rows = plateRows(records, posMap, Object.freeze([...BONDS, ...randomBonds]), { maxTokens: MAX_TOKENS });
  const verdict = judgeCandidate(baseline, rows, FLOORS);
  controlRuns.push({
    bonds: randomBonds.map((b) => `${b[0]}|${b[1]}|${b[2]}`),
    explained: verdict.explained,
    overgenerated: verdict.overgenerated,
    regressed: verdict.regressed,
    verdict: verdict.verdict,
  });
}
const controlBest = Math.max(...controlRuns.map((c) => c.explained));
const F4 = withLabels.explained <= controlBest;

const report = {
  contract: 'PB-ATLAS-CYCLOTRON-GATE-v1',
  date: '2026-08-20',
  corpus: 'treebank-gate.conllu (design split)',
  maxTokens: MAX_TOKENS,
  seed: SEED,
  feed: {
    recordsIn: fed.recordsIn,
    atlasCases: fed.atlasCases,
    recordsFed: fed.recordsFed,
    plates: fed.atlas.plates,
    topConstructions: fed.atlas.constructions.slice(0, 8),
    cyclotronCandidates: fed.candidates.length,
    novelFireable: novel.length,
  },
  calibration: {
    source: 'leave-one-out on the shipped BONDS table',
    percentile: calib.percentile,
    sampled: calib.sampled,
    active: calib.active,
    inert: calib.inert,
    netFloor: calib.netFloor,
    labelSpanFloor: calib.labelSpanFloor,
    licensedWithZeroOvergeneration: calib.scored.filter(
      (r) => (r.explained > 0 || r.overgenerated > 0) && r.overgenerated === 0,
    ).length,
    topTrades: [...calib.scored].sort((a, b) => b.net - a.net).slice(0, 6),
  },
  gate: {
    checksum: gate.checksum,
    netFloor: gate.netFloor,
    minLabelSpan: gate.minLabelSpan,
    baselinePlates: gate.baselinePlates,
    admitted: gate.admitted,
    byVerdict: gate.candidates.reduce((acc, c) => {
      acc[c.verdict] = (acc[c.verdict] || 0) + 1;
      return acc;
    }, Object.create(null)),
    candidates: gate.candidates.map((c) => ({
      signature: c.signature,
      verdict: c.verdict,
      stage: c.stage,
      explained: c.solo?.explained ?? 0,
      overgenerated: c.solo?.overgenerated ?? 0,
      net: c.solo?.net ?? 0,
      regressed: c.solo?.regressed ?? 0,
      labelsSpanned: c.solo?.labelsSpanned ?? 0,
      plates: c.solo?.plates ?? [],
    })),
  },
  admittedSet: {
    bonds: admittedBonds.map((b) => `${b[0]}|${b[1]}|${b[2]}`),
    explained: withLabels.explained,
    overgenerated: withLabels.overgenerated,
    regressed: withLabels.regressed,
    labelsSpanned: withLabels.labelsSpanned,
    plates: withLabels.plates,
  },
  control: { runs: controlRuns, bestExplained: controlBest },
  falsifiers: {
    F1_gateAdmittedSNpS: F1,
    F2_gateAdmittedNothing: F2,
    F3_verdictIgnoresLabels: F3,
    F4_admittedNotAboveRandomControl: F4,
  },
};
report.checksum = `atlas-gate1:${createHash('sha256')
  .update(JSON.stringify(report)).digest('hex').slice(0, 16)}`;

writeFileSync(EVIDENCE, `${JSON.stringify(report, null, 2)}\n`);

const fired = Object.entries(report.falsifiers).filter(([, v]) => v).map(([k]) => k);
process.stdout.write(`${JSON.stringify(report.falsifiers, null, 2)}\n`);
process.stdout.write(
  `admitted ${gate.admitted.length}/${novel.length}: ${gate.admitted.join(', ') || '(none)'}\n`
  + `explained ${withLabels.explained} vs best random control ${controlBest}\n`
  + `falsifiers fired: ${fired.join(', ') || 'none'}\n`
  + `evidence: ${EVIDENCE}\n`,
);
