#!/usr/bin/env node

/**
 * FALSIFIER 1 — does confinement exceed a degree-matched configuration null?
 *
 * Prereg: docs/superpowers/evidence/2026-08-12-PREREG-quark-chamber.md
 * Statistics fixed in advance: edges, rules, confined, maxWaypoints.
 * Bonferroni m = 4, alpha = 0.05, per-statistic threshold p < 0.0125.
 *
 * The predicted signature is CONCENTRATION, NOT YIELD: the real bank is
 * expected to emit FEWER distinct candidates than chance while emitting more
 * that are independently witnessed. The `rules` statistic running the other way
 * is a prediction of this design, not an embarrassment to it.
 */

import { writeFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { generateQuarkCandidates, licensedPortEdges } from '../codex/core/pixelbrain/quark-chamber/slingshot.js';
import { degreeMatchedShuffle } from '../codex/core/pixelbrain/quark-chamber/configuration-null.js';
import { ATOM_BLUEPRINTS, BRIDGE_RULES } from './semantic-valence-cyclotron.mjs';
import { buildDefaultBank } from '../codex/core/pixelbrain/codebase-nuclei-bank.js';
import { sha256Hex } from '../codex/core/immunity/cleri-probe/canonical-report.js';

const PREREG_PATH = 'docs/superpowers/evidence/2026-08-12-PREREG-quark-chamber.md';
const OUTPUT_PATH = 'docs/superpowers/evidence/2026-08-12-quark-confinement-null.json';
const STATISTICS = Object.freeze(['edges', 'rules', 'confined', 'maxWaypoints']);
const BONFERRONI_THRESHOLD = 0.05 / STATISTICS.length;

function measure(blueprints, bridges, confinementMin) {
  const all = generateQuarkCandidates(blueprints, bridges, { confinementMin: 1 });
  let confined = 0;
  let maxWaypoints = 0;
  for (const candidate of all) {
    if (candidate.witnesses.length >= confinementMin) confined += 1;
    maxWaypoints = Math.max(maxWaypoints, candidate.witnesses.length);
  }
  return {
    edges: licensedPortEdges(blueprints, bridges).length,
    rules: all.length,
    confined,
    maxWaypoints,
  };
}

export function runConfinementNull({ blueprints, bridges, shuffles, seed, confinementMin = 2 }) {
  if (!Number.isInteger(shuffles) || shuffles < 1) throw new RangeError('shuffles must be an integer >= 1');
  if (!Number.isFinite(seed)) throw new TypeError('seed must be finite');

  const real = measure(blueprints, bridges, confinementMin);
  const samples = Object.fromEntries(STATISTICS.map((name) => [name, []]));
  for (let i = 0; i < shuffles; i += 1) {
    const shuffled = degreeMatchedShuffle(blueprints, seed + i);
    const sample = measure(shuffled, bridges, confinementMin);
    for (const name of STATISTICS) samples[name].push(sample[name]);
  }

  const stats = {};
  for (const name of STATISTICS) {
    const values = samples[name];
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
    const sd = Math.sqrt(variance);
    const atLeast = values.filter((value) => value >= real[name]).length;
    stats[name] = {
      nullMean: Number(mean.toFixed(4)),
      nullSd: Number(sd.toFixed(4)),
      real: real[name],
      z: sd === 0 ? 0 : Number(((real[name] - mean) / sd).toFixed(4)),
      // Conservative estimator: p can never be reported as zero.
      p: Number(((1 + atLeast) / (1 + values.length)).toFixed(6)),
    };
  }
  return { real, stats, shuffles, confinementMin };
}

function main() {
  const { blueprints, bridges } = buildDefaultBank(ATOM_BLUEPRINTS, BRIDGE_RULES, {});
  const out = runConfinementNull({ blueprints, bridges, shuffles: 200, seed: 0x51554152, confinementMin: 2 });

  console.log('Falsifier 1 — degree-matched configuration null, 200 shuffles');
  console.log('  statistic        null mean ± sd        real        z         p');
  for (const name of STATISTICS) {
    const s = out.stats[name];
    console.log(
      `  ${name.padEnd(14)} ${String(s.nullMean).padStart(9)} ± ${String(s.nullSd).padEnd(7)} `
      + `${String(s.real).padStart(6)}   ${String(s.z).padStart(8)}   ${s.p}`,
    );
  }
  const verdict = out.stats.confined.p < BONFERRONI_THRESHOLD ? 'SURVIVES' : 'FAILS';
  console.log(`\n  confined vs threshold ${BONFERRONI_THRESHOLD}: ${verdict}`);
  if (verdict === 'FAILS') {
    console.log('  Per the prereg, confinement is not established. The design fails at F1.');
  }

  const body = {
    contract: 'PB-QUARK-CHAMBER-v1',
    falsifier: 'F1-confinement-configuration-null',
    prereg: PREREG_PATH,
    preregSha256: sha256Hex(readFileSync(PREREG_PATH, 'utf8')),
    bonferroniThreshold: BONFERRONI_THRESHOLD,
    statistics: STATISTICS,
    ...out,
    verdict,
  };
  writeFileSync(OUTPUT_PATH, `${JSON.stringify({ ...body, checksum: sha256Hex(body) }, null, 2)}\n`);
  console.log(`  written → ${OUTPUT_PATH}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
