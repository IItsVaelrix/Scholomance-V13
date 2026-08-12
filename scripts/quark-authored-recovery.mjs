#!/usr/bin/env node

/**
 * FALSIFIER 2 — authored-bridge recovery.
 *
 * Hold out all authored bridges, leaving an exact-match-only graph, and ask
 * whether the slingshot rediscovers the port pairs a human wrote. Relation
 * LABELS are authored and are not expected to be recovered; only the pair.
 *
 * Prereg: docs/superpowers/evidence/2026-08-12-PREREG-quark-chamber.md
 * A recall of zero is a clean refutation and is reported as one.
 */

import { writeFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { generateQuarkCandidates } from '../codex/core/pixelbrain/quark-chamber/slingshot.js';
import { degreeMatchedShuffle } from '../codex/core/pixelbrain/quark-chamber/configuration-null.js';
import { ATOM_BLUEPRINTS, BRIDGE_RULES } from './semantic-valence-cyclotron.mjs';
import { buildDefaultBank } from '../codex/core/pixelbrain/codebase-nuclei-bank.js';
import { sha256Hex } from '../codex/core/immunity/cleri-probe/canonical-report.js';

const PREREG_PATH = 'docs/superpowers/evidence/2026-08-12-PREREG-quark-chamber.md';
const OUTPUT_PATH = 'docs/superpowers/evidence/2026-08-12-quark-authored-recovery.json';
const BONFERRONI_THRESHOLD = 0.05 / 4;

export function runAuthoredRecovery({ blueprints, bridges, confinementMin = 2 }) {
  const heldOutPairs = new Set(bridges.map((rule) => `${rule.from}|${rule.to}`));
  // The holdout graph: no authored bridges at all.
  const candidates = generateQuarkCandidates(blueprints, [], { confinementMin });
  const proposedPairs = new Set(candidates.map((c) => `${c.from}|${c.to}`));
  const recoveredPairs = [...heldOutPairs].filter((pair) => proposedPairs.has(pair)).sort();
  return {
    heldOut: heldOutPairs.size,
    recovered: recoveredPairs.length,
    recall: heldOutPairs.size === 0 ? 0 : recoveredPairs.length / heldOutPairs.size,
    recoveredPairs,
    candidateCount: candidates.length,
  };
}

/**
 * The prereg's F2 control: is real recovery better than a degree-matched random
 * graph? Recovery above zero means nothing on its own if chance does as well.
 */
export function runAuthoredRecoveryNull({ blueprints, bridges, shuffles, seed, confinementMin = 2 }) {
  const real = runAuthoredRecovery({ blueprints, bridges, confinementMin });
  const samples = [];
  for (let i = 0; i < shuffles; i += 1) {
    samples.push(runAuthoredRecovery({
      blueprints: degreeMatchedShuffle(blueprints, seed + i), bridges, confinementMin,
    }).recovered);
  }
  const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  const sd = Math.sqrt(samples.reduce((sum, value) => sum + (value - mean) ** 2, 0) / samples.length);
  const atLeast = samples.filter((value) => value >= real.recovered).length;
  return {
    real,
    nullMean: Number(mean.toFixed(4)),
    nullSd: Number(sd.toFixed(4)),
    z: sd === 0 ? 0 : Number(((real.recovered - mean) / sd).toFixed(4)),
    // Conservative estimator: p can never be reported as zero.
    p: Number(((1 + atLeast) / (1 + samples.length)).toFixed(6)),
    shuffles,
  };
}

function main() {
  const { blueprints, bridges } = buildDefaultBank(ATOM_BLUEPRINTS, BRIDGE_RULES, {});
  const out = runAuthoredRecoveryNull({
    blueprints, bridges, shuffles: 200, seed: 0x51554152, confinementMin: 2,
  });
  const { real } = out;

  console.log('Falsifier 2 — authored-bridge recovery');
  console.log(`  atoms            ${blueprints.length}`);
  console.log(`  held out         ${real.heldOut}`);
  console.log(`  candidates       ${real.candidateCount}`);
  console.log(`  recovered        ${real.recovered}`);
  console.log(`  recall           ${real.recall.toFixed(4)}`);
  if (real.recoveredPairs.length) console.log(`  pairs            ${real.recoveredPairs.join(', ')}`);
  console.log(`  null recovered   ${out.nullMean} ± ${out.nullSd}   z=${out.z}   p=${out.p}`);

  const survives = real.recovered > 0 && out.p < BONFERRONI_THRESHOLD;
  console.log(`  threshold        p < ${BONFERRONI_THRESHOLD}  →  ${survives ? 'SURVIVES' : 'FAILS'}`);
  if (real.recovered === 0) {
    console.log('\n  RECALL IS ZERO. Per the prereg this is a clean refutation of the claim');
    console.log('  that authored bridges are derivable by depth-1 gravity assist.');
    console.log('  Report it as such. Do not reframe it.');
  } else if (!survives) {
    console.log('\n  Recovery is above zero but does not beat a degree-matched random graph.');
    console.log('  Per the prereg, F2 is NOT established.');
  }

  const body = {
    contract: 'PB-QUARK-CHAMBER-v1',
    falsifier: 'F2-authored-bridge-recovery',
    prereg: PREREG_PATH,
    preregSha256: sha256Hex(readFileSync(PREREG_PATH, 'utf8')),
    bonferroniThreshold: BONFERRONI_THRESHOLD,
    substrate: { atoms: blueprints.length, authoredBridges: bridges.length },
    ...out,
    verdict: survives ? 'SURVIVES' : 'FAILS',
  };
  writeFileSync(OUTPUT_PATH, `${JSON.stringify({ ...body, checksum: sha256Hex(body) }, null, 2)}\n`);
  console.log(`\n  written → ${OUTPUT_PATH}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
