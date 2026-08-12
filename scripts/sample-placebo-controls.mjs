#!/usr/bin/env node

/**
 * Sample 3 nuisance-matched placebo controls for the architectural hit-rate trial.
 * Protocol frozen in:
 *   docs/superpowers/evidence/2026-08-11-PREREG-placebo-architectural-hit.md
 *
 *   node scripts/sample-placebo-controls.mjs --trials=8000 --seed=0x5c4010
 */

import { writeFileSync } from 'node:fs';
import {
  runSemanticValenceCyclotron,
  verifySemanticCyclotronReport,
} from '../codex/core/pixelbrain/semantic-valence-cyclotron.js';
import {
  attest,
  loadEncyclopediaIndex,
  prepareForSynthesize,
} from '../codex/core/pixelbrain/grounding-index.js';
import {
  ATOM_BLUEPRINTS,
  BRIDGE_RULES,
} from './semantic-valence-cyclotron.mjs';
import {
  buildDefaultBank,
  FULL_BANK_CONCENTRATION_LIMIT,
  collapseByTopology,
  rankProposals,
  openPorts,
  evidenceScore,
  mulberry32,
  topologyKey,
} from '../codex/core/pixelbrain/codebase-nuclei-bank.js';
import { sha256Hex } from '../codex/core/immunity/cleri-probe/canonical-report.js';

const OUT = 'docs/superpowers/evidence/2026-08-11-placebo-pick.json';
const SAMPLE_SEED = 0x504c4342; // PLCB
const TREATMENT = Object.freeze({
  topology: 'process-sensor|valence-compiler',
  atomIds: ['process-sensor', 'valence-compiler'],
});

function parseIntegerFlag(name, fallback) {
  const prefix = `--${name}=`;
  const raw = process.argv.slice(2).find((a) => a.startsWith(prefix));
  if (!raw) return fallback;
  const slice = raw.slice(prefix.length);
  return slice.startsWith('0x') ? Number.parseInt(slice, 16) : Number(slice);
}

function nuisanceDistance(row, target) {
  return (
    Math.abs(row.size - target.size) * 3.0
    + Math.abs(row.closedPorts - target.closedPorts) * 1.0
    + Math.abs(row.openPorts - target.openPorts) * 0.5
    + Math.abs(row.extensionCount - target.extensionCount) * 2.0
    + Math.abs(row.chemistry - target.chemistry) * 8.0
    + Math.abs(row.evidenceRealized - target.evidenceRealized) * 2.0
  );
}

function main() {
  const trials = parseIntegerFlag('trials', 8000);
  const seed = parseIntegerFlag('seed', 0x5c4010);

  const bank = buildDefaultBank(ATOM_BLUEPRINTS, BRIDGE_RULES);
  const gi = prepareForSynthesize(loadEncyclopediaIndex(process.cwd()));
  const atoms = bank.blueprints.map((b) => ({
    ...b,
    grounding: attest(gi, b.label).score,
  }));
  const bankById = new Map(atoms.map((a) => [a.id, a]));
  const extIds = bank.extensionIds;

  const report = runSemanticValenceCyclotron({
    atoms,
    bridgeRules: bank.bridges,
    groundingIndex: gi,
    trialCount: trials,
    seed,
    maxMoleculeSize: 5,
    controlEvery: 5,
    controlPercentile: 0.99,
    shortlistLimit: 256,
    osmosisConcentrationLimit: FULL_BANK_CONCENTRATION_LIMIT,
    shortlistFamilyCap: 2,
    noveltyFloor: 0.04,
    finalScoreFloor: 0.52,
    nucleusScoreFloor: 0.70,
    nucleusNoveltyFloor: 0.28,
    nucleusMinDomains: 2,
    entropy: { enabled: true },
  });
  if (!verifySemanticCyclotronReport(report)) throw new Error('report seal failed');

  const pool = [
    ...report.candidates.filter((c) => c.verdict === 'NUCLEUS'),
    ...report.candidates.filter((c) => c.verdict === 'HYPOTHESIS' && (c.finalScore ?? 0) >= 0.55),
  ];
  const collapsed = collapseByTopology(pool, bankById, extIds);
  const utilityTop = rankProposals(collapsed, {
    requireExtension: true,
    utilityFloor: 0.40,
    evidenceFloor: 0.8,
    limit: 12,
  });
  const excluded = new Set(utilityTop.map((p) => p.topology));
  excluded.add(TREATMENT.topology);

  const tPorts = openPorts(TREATMENT.atomIds, bankById);
  const tEv = evidenceScore(TREATMENT.atomIds, bankById);
  const treatmentHit = collapsed.find((r) => r.topology === TREATMENT.topology);
  const target = {
    ...TREATMENT,
    size: TREATMENT.atomIds.length,
    closedPorts: tPorts.internal.length,
    openPorts: tPorts.dangling.length,
    openPortList: tPorts.dangling,
    internalPorts: tPorts.internal,
    extensionCount: TREATMENT.atomIds.filter((id) => extIds.includes(id)).length,
    chemistry: treatmentHit?.candidate?.finalScore ?? 0.7192,
    evidenceRealized: tEv.realized,
    utility: treatmentHit?.utility ?? null,
    verdict: treatmentHit?.candidate?.verdict ?? null,
  };

  const rows = collapsed.map((r) => {
    const ids = r.candidate.molecule.atomIds;
    const ports = openPorts(ids, bankById);
    const ev = evidenceScore(ids, bankById);
    return {
      topology: r.topology,
      atomIds: ids,
      size: ids.length,
      closedPorts: ports.internal.length,
      openPorts: ports.dangling.length,
      openPortList: ports.dangling,
      internalPorts: ports.internal,
      extensionCount: r.newAtomCount,
      chemistry: r.candidate.finalScore,
      utility: r.utility,
      evidenceRealized: ev.realized,
      verdict: r.candidate.verdict,
      domains: r.domains,
    };
  });

  const sizeMatched = rows.filter((r) => r.size === target.size && !excluded.has(r.topology));
  const extensionMatchedInSize = sizeMatched.filter((r) => r.extensionCount === target.extensionCount);

  const eligible = sizeMatched
    .filter((r) => Math.abs(r.chemistry - target.chemistry) <= 0.12)
    .filter((r) => Math.abs(r.closedPorts - target.closedPorts) <= 1)
    .filter((r) => r.evidenceRealized >= 0.8)
    .map((r) => ({ ...r, distance: nuisanceDistance(r, target) }))
    .sort((a, b) => a.distance - b.distance || a.topology.localeCompare(b.topology));

  if (eligible.length < 3) {
    throw new Error(`need ≥3 eligible placebos, found ${eligible.length}`);
  }

  const rnd = mulberry32(SAMPLE_SEED);
  const bag = [...eligible];
  for (let i = bag.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  // Prefer lower distance: re-sort shuffled bag stably by distance buckets
  bag.sort((a, b) => a.distance - b.distance || a.topology.localeCompare(b.topology));
  // Take top 6 by distance, reshuffle, draw 3 — avoids always picking the absolute nearest
  const near = bag.slice(0, Math.min(6, bag.length));
  for (let i = near.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [near[i], near[j]] = [near[j], near[i]];
  }
  const placebos = near.slice(0, 3).sort((a, b) => a.topology.localeCompare(b.topology));

  const labels = ['PLACEBO-A', 'PLACEBO-B', 'PLACEBO-C'];
  const body = {
    contract: 'PB-PLACEBO-PICK-v1',
    schemaVersion: '1.0.0',
    prereg: 'docs/superpowers/evidence/2026-08-11-PREREG-placebo-architectural-hit.md',
    sampleSeed: SAMPLE_SEED,
    cyclotronSeed: seed,
    trials,
    reportChecksum: report.checksum,
    treatment: target,
    matching: {
      hard: ['size'],
      bands: {
        chemistryAbs: 0.12,
        closedPortsAbs: 1,
        evidenceRealizedMin: 0.8,
      },
      extensionMatchPossible: extensionMatchedInSize.length > 0,
      extensionMatchNote: extensionMatchedInSize.length === 0
        ? 'No size-matched non-selected candidate has extensionCount=1; extension nuisance is unmatched by necessity.'
        : 'extensionCount matched where possible',
      sizeMatchedNonSelected: sizeMatched.length,
      eligibleAfterBands: eligible.length,
    },
    excludedUtilityTopologies: [...excluded].sort(),
    placebos: placebos.map((p, i) => ({
      label: labels[i],
      topology: p.topology,
      atomIds: p.atomIds,
      size: p.size,
      closedPorts: p.closedPorts,
      openPorts: p.openPorts,
      openPortList: p.openPortList,
      internalPorts: p.internalPorts,
      extensionCount: p.extensionCount,
      chemistry: p.chemistry,
      utility: p.utility,
      evidenceRealized: p.evidenceRealized,
      distance: Number(p.distance.toFixed(6)),
      verdict: p.verdict,
      domains: p.domains,
    })),
    effortCeiling: {
      coreLines: 120,
      testLines: 120,
      shellLines: 40,
      newDependencies: 'forbidden except shared seal utilities',
    },
  };
  body.checksum = `placebopick1:${sha256Hex((({ checksum, ...rest }) => rest)(body))}`;
  writeFileSync(OUT, `${JSON.stringify(body, null, 2)}\n`, 'utf8');

  console.log('Placebo pick sealed →', OUT);
  console.log('Treatment:', target.topology, 'chem', target.chemistry.toFixed(4));
  console.log('Extension match possible:', body.matching.extensionMatchPossible);
  for (const p of body.placebos) {
    console.log(
      `${p.label}  d=${p.distance.toFixed(3)} chem=${p.chemistry.toFixed(4)} `
      + `ext=${p.extensionCount} cl=${p.closedPorts} op=${p.openPorts}  ${p.topology}`,
    );
  }
  console.log('checksum', body.checksum);
}

main();
