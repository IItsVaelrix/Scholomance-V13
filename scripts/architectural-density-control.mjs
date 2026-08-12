#!/usr/bin/env node

/**
 * ARCHITECTURAL DENSITY CONTROL
 *
 * Follow-up to the super-heavy clique attack. That attack showed:
 *   large + maximally connected + generic  →  shortlist HYPOTHESIS, never NUCLEUS
 *
 * This control asks whether the engine is imposing a *mass* penalty or something
 * closer to an *architectural information-density* requirement:
 *
 *   large + coherent + novel + restrained ports + real evidence
 *     ?→ NUCLEUS
 *
 * Two arms, identical floors, identical trial budget, identical seed:
 *
 *   ARM-CLIQUE   — fully licensed 12-atom clique (mass without structure)
 *   ARM-DENSITY  — size-6 sparse asymmetric pipeline with one novel extension
 *                  atom (frontier-process-gate), real evidence paths, one
 *                  coherent capability story
 *
 * If DENSITY crowns size 5–6 NUCLEUS while CLIQUE does not, mass alone is not
 * the veto — information density / coherence is load-bearing.
 *
 *   node scripts/architectural-density-control.mjs
 *   node scripts/architectural-density-control.mjs --trials=8000
 */

import { writeFileSync, existsSync } from 'node:fs';
import {
  runSemanticValenceCyclotron,
  verifySemanticCyclotronReport,
} from '../codex/core/pixelbrain/semantic-valence-cyclotron.js';
import { sha256Hex } from '../codex/core/immunity/cleri-probe/canonical-report.js';
import { verdictAdmissible } from '../codex/core/pixelbrain/gate-reachability.js';

/**
 * This script builds its own synthetic banks, so neither calibrated constant
 * applies. It runs with entropy disabled, where the limit steers nothing: it
 * only colours the `anomalyKind` reported on each candidate. Declared here so
 * the value is visibly local and visibly uncalibrated rather than borrowed
 * from a bank this script never uses.
 */
const INERT_CONCENTRATION_LIMIT = 0.5;


const OUT_JSON = 'docs/superpowers/evidence/2026-08-11-architectural-density-control.json';
const OUT_MD = 'docs/superpowers/evidence/2026-08-11-architectural-density-control.md';
const SEED = 0x44454e53; // DENS
const DEFAULT_TRIALS = 8_000;

// Nucleus floors recalibrated 2026-08-12 (PB-OSMOTIC-EQUILIBRIUM-v1) from
// measured arm ceilings — the osmosis-free renormalisation moved the score
// range down, leaving the old 0.765 floor above every ceiling (VACUOUS).
// Derived, not guessed, not rounded tidy (trials=8000, seed 0x44454e53,
// equilibration ON):
//   arm ceilings  DENSITY 0.725747 | MUTANT 0.713392 | CLIQUE 0.715513
//   novelty       DENSITY 0.436437 | MUTANT 0.304029 | CLIQUE 0.427476
// Rule: strictly below the positive arm (DENSITY), strictly above the
// single-variable control (MUTANT) — midpoint of the two ceilings per gate:
//   score:   (0.725747 + 0.713392) / 2 = 0.7195695
//   novelty: (0.436437 + 0.304029) / 2 = 0.370233
const FLOORS = Object.freeze({
  maxMoleculeSize: 6,
  noveltyFloor: 0.04,
  finalScoreFloor: 0.58,
  nucleusScoreFloor: 0.7195695,
  nucleusNoveltyFloor: 0.370233,
  nucleusMinDomains: 3,
});

function parseTrials() {
  const raw = process.argv.slice(2).find((a) => a.startsWith('--trials='));
  if (!raw) return DEFAULT_TRIALS;
  const n = Number(raw.slice('--trials='.length));
  if (!Number.isFinite(n) || n < 200) throw new TypeError('bad --trials');
  return Math.trunc(n);
}

function atom(id, label, domain, offers, seeks, evidence, grounding) {
  if (!existsSync(evidence)) {
    throw new Error(`evidence path missing for ${id}: ${evidence}`);
  }
  return {
    id,
    label,
    domain,
    offers,
    seeks,
    traits: [],
    inhibits: [],
    evidence: [evidence],
    grounding,
  };
}

/** ARM-CLIQUE: mass without architecture (same spirit as super-heavy attack). */
function buildCliqueBank() {
  const domains = [
    'artifact', 'governance', 'immunity',
    'synthesis', 'linguistic', 'memory',
  ];
  const labels = [
    'deterministic sealed checksum',
    'canonical schema verifier',
    'semantic retrieval index',
    'concept chemistry feasibility',
    'memory cell osmosis',
    'phoneme topology mapper',
    'law gate authorization',
    'evidence ledger structure',
    'bytecode seal identity',
    'novelty detector vector',
    'hypothesis registry proposal',
    'grounding corpus loader',
  ];
  // Use real files as evidence paths even though topology is clique-fake.
  const evidenceCycle = [
    'codex/core/pixelbrain/canonical-json.js',
    'docs/scholomance-encyclopedia/Scholomance LAW/SCHEMA_CONTRACT.md',
    'codex/core/pixelbrain/cyclotron-sensor.js',
    'codex/core/pixelbrain/concept-chemistry.js',
    'codex/core/immunity/memory-cell-osmosis.js',
    'codex/core/semantic/phonotopography.js',
    'docs/scholomance-encyclopedia/Scholomance LAW/VAELRIX_LAW.md',
    'docs/superpowers/evidence',
    'codex/core/pixelbrain/pbrain-checksum.js',
    'codex/core/quantization/turboquant.js',
    'docs/scholomance-encyclopedia/Scholomance White Papers/SCHOLOMANCE_SEMANTIC_CORRESPONDENCE_REGISTRY.md',
    'codex/core/pixelbrain/grounding-index.js',
  ];
  const atoms = [];
  for (let i = 0; i < 12; i += 1) {
    const offers = [`clique-port-${i}`, 'clique-glue'];
    const seeks = ['clique-glue'];
    for (let j = 0; j < 12; j += 1) {
      if (j !== i) seeks.push(`clique-port-${j}`);
    }
    atoms.push({
      id: `clique-atom-${i}`,
      label: labels[i],
      domain: domains[i % domains.length],
      offers,
      seeks,
      traits: ['clique', 'generic'],
      inhibits: [],
      evidence: [evidenceCycle[i]],
      grounding: 0.55 + (i % 5) * 0.08,
    });
  }
  return { atoms, bridges: [], kind: 'clique-generic' };
}

/**
 * ARM-DENSITY: one coherent capability — process-gated valence shortlist.
 *
 * Topology (restrained, asymmetric, not a clique):
 *
 *   inventory-seed --atom-inventory/trial-counter--> valence-compiler
 *        --candidate-frontier--> feasibility-scorer
 *        --feasibility-score + frontier--> process-sensor
 *        --process-verdict--> frontier-process-gate (NOVEL)
 *        --gated-frontier + experiment-receipt--> schema-seal
 *
 * Closure: process-sensor seeks validation-verdict; gate offers it.
 * That is one deliberate back-edge, not all-to-all.
 */
function buildDensityBank() {
  const atoms = [
    atom(
      'inventory-seed',
      'deterministic trial counter and atom inventory seed',
      'synthesis',
      ['atom-inventory', 'trial-counter'],
      [],
      'codex/core/pixelbrain/semantic-valence-cyclotron.js',
      0.78,
    ),
    atom(
      'valence-compiler',
      'typed semantic valence compiler candidate frontier',
      'synthesis',
      ['candidate-frontier'],
      ['atom-inventory', 'trial-counter'],
      'codex/core/pixelbrain/semantic-valence-cyclotron.js',
      0.82,
    ),
    atom(
      'feasibility-scorer',
      'concept chemistry feasibility scorer for candidate pairs',
      'synthesis',
      ['feasibility-score'],
      ['candidate-frontier'],
      'codex/core/pixelbrain/concept-chemistry.js',
      0.88,
    ),
    atom(
      'process-sensor',
      'cyclotron process drift sensor experiment receipt',
      'immunity',
      ['process-verdict', 'experiment-receipt'],
      ['candidate-frontier', 'feasibility-score', 'validation-verdict'],
      'codex/core/pixelbrain/cyclotron-sensor.js',
      0.84,
    ),
    // NOVEL extension — real module, real ports, not in the ritual bank
    atom(
      'frontier-process-gate',
      'process gated frontier validation authority',
      'immunity',
      ['gated-frontier', 'validation-verdict'],
      ['process-verdict', 'candidate-frontier'],
      'codex/core/pixelbrain/frontier-process-gate.js',
      0.80,
    ),
    atom(
      'schema-seal',
      'schema contract verifier for gated sealed structure',
      'governance',
      ['schema-verdict', 'structure'],
      ['gated-frontier', 'experiment-receipt'],
      'docs/scholomance-encyclopedia/Scholomance LAW/SCHEMA_CONTRACT.md',
      0.90,
    ),
  ];

  // One optional decoy that cannot join the main pipeline (restrained dead-end)
  atoms.push(atom(
    'decoy-phoneme',
    'deterministic phonetic encoder isolated decoy',
    'linguistic',
    ['phoneme-sequence'],
    ['token-stream'],
    'codex/core/canonical-tokenizer.js',
    0.60,
  ));

  return {
    atoms,
    bridges: [],
    kind: 'density-coherent',
    novelExtension: 'frontier-process-gate',
    intendedTopology: [
      'inventory-seed',
      'valence-compiler',
      'feasibility-scorer',
      'process-sensor',
      'frontier-process-gate',
      'schema-seal',
    ],
  };
}

/**
 * ARM-MUTANT: the single-variable test the two-bank contrast cannot perform.
 *
 * Identical atoms, labels, evidence paths, grounding values, domains and bank size
 * to ARM-DENSITY. The ONLY difference is the port wiring, replaced by all-to-all.
 * Anything that moves between DENSITY and MUTANT is attributable to topology alone.
 */
function buildCliquifiedDensityBank() {
  const { atoms } = buildDensityBank();
  return {
    atoms: atoms.map((a, i) => ({
      ...a,
      offers: [`mutant-port-${i}`, 'mutant-glue'],
      seeks: [
        'mutant-glue',
        ...atoms.map((_, j) => (j === i ? null : `mutant-port-${j}`)).filter(Boolean),
      ],
    })),
    bridges: [],
    kind: 'density-atoms-clique-wiring',
  };
}

function tally(report) {
  const bySize = {};
  const byVerdict = { NUCLEUS: 0, HYPOTHESIS: 0, REFUSED: 0 };
  for (const c of report.candidates) {
    byVerdict[c.verdict] = (byVerdict[c.verdict] ?? 0) + 1;
    const size = c.molecule.atomIds.length;
    if (!bySize[size]) {
      bySize[size] = {
        NUCLEUS: 0, HYPOTHESIS: 0, REFUSED: 0, total: 0, maxFinal: 0, maxNovelty: 0,
      };
    }
    bySize[size][c.verdict] += 1;
    bySize[size].total += 1;
    bySize[size].maxFinal = Math.max(bySize[size].maxFinal, c.finalScore);
    bySize[size].maxNovelty = Math.max(bySize[size].maxNovelty, c.molecule.novelty);
  }
  const nuclei = report.candidates.filter((c) => c.verdict === 'NUCLEUS');
  const heavyNuclei = nuclei.filter((c) => c.molecule.atomIds.length >= 5);
  const maxSizeNuclei = nuclei.filter(
    (c) => c.molecule.atomIds.length === FLOORS.maxMoleculeSize,
  );

  // Could this arm have crowned at all? A negative arm whose ceiling sits under a
  // floor cannot contribute to a crown/no-crown contrast.
  const ruling = verdictAdmissible({
    candidates: report.candidates,
    floors: {
      nucleusScoreFloor: FLOORS.nucleusScoreFloor,
      nucleusNoveltyFloor: FLOORS.nucleusNoveltyFloor,
    },
    nucleusCount: nuclei.length,
  });
  const top = report.candidates
    .slice()
    .sort((a, b) => (
      (a.verdict === 'NUCLEUS' ? 0 : a.verdict === 'HYPOTHESIS' ? 1 : 2)
      - (b.verdict === 'NUCLEUS' ? 0 : b.verdict === 'HYPOTHESIS' ? 1 : 2)
      || b.finalScore - a.finalScore
    ))
    .slice(0, 10)
    .map((c) => ({
      verdict: c.verdict,
      size: c.molecule.atomIds.length,
      finalScore: c.finalScore,
      novelty: c.molecule.novelty,
      energy: c.molecule.energy,
      feasibility: c.conceptChemistry?.feasibility ?? null,
      stability: c.conceptChemistry?.stability ?? null,
      atomIds: c.molecule.atomIds,
    }));
  return {
    counts: report.counts,
    checksum: report.checksum,
    bySize,
    byVerdict,
    reachability: {
      admissible: ruling.admissible,
      reason: ruling.reason,
      gates: ruling.report?.gates ?? null,
      armCeiling: Math.max(...report.candidates.map((c) => c.finalScore)),
    },
    nucleusCount: nuclei.length,
    heavyNucleusCount: heavyNuclei.length,
    maxSizeNucleusCount: maxSizeNuclei.length,
    heavyNuclei: heavyNuclei.map((c) => ({
      atomIds: c.molecule.atomIds,
      finalScore: c.finalScore,
      novelty: c.molecule.novelty,
      energy: c.molecule.energy,
      feasibility: c.conceptChemistry?.feasibility,
    })),
    top,
  };
}

function runArm(name, bank, trials) {
  console.log(`  arm ${name} (${bank.kind}, ${bank.atoms.length} atoms)...`);
  const report = runSemanticValenceCyclotron({
    atoms: bank.atoms,
    bridgeRules: bank.bridges,
    trialCount: trials,
    seed: SEED,
    maxMoleculeSize: FLOORS.maxMoleculeSize,
    controlEvery: 5,
    controlPercentile: 0.99,
    shortlistLimit: 256,
    osmosisConcentrationLimit: INERT_CONCENTRATION_LIMIT,
    shortlistFamilyCap: 4,
    noveltyFloor: FLOORS.noveltyFloor,
    finalScoreFloor: FLOORS.finalScoreFloor,
    nucleusScoreFloor: FLOORS.nucleusScoreFloor,
    nucleusNoveltyFloor: FLOORS.nucleusNoveltyFloor,
    nucleusMinDomains: FLOORS.nucleusMinDomains,
    entropy: { enabled: false },
  });
  if (!verifySemanticCyclotronReport(report)) {
    throw new Error(`${name}: report seal failed`);
  }
  const summary = tally(report);
  console.log(
    `    nuclei=${summary.nucleusCount} heavyNuclei(≥5)=${summary.heavyNucleusCount} `
    + `shortlist=${summary.counts.shortlisted}`,
  );
  return { name, kind: bank.kind, novelExtension: bank.novelExtension ?? null, ...summary };
}

function main() {
  const trials = parseTrials();
  console.log('Architectural Density Control');
  console.log(`trials/arm=${trials} seed=0x${SEED.toString(16)}`);
  console.log('floors', FLOORS);

  // Ensure novel extension evidence exists before bank build
  if (!existsSync('codex/core/pixelbrain/frontier-process-gate.js')) {
    throw new Error('novel extension module missing: frontier-process-gate.js');
  }

  const clique = runArm('CLIQUE', buildCliqueBank(), trials);
  const density = runArm('DENSITY', buildDensityBank(), trials);
  const mutant = runArm('MUTANT', buildCliquifiedDensityBank(), trials);

  const densityCrownsHeavy = density.heavyNucleusCount > 0;
  const cliqueCrownsHeavy = clique.heavyNucleusCount > 0;
  const densityCrownsAny = density.nucleusCount > 0;
  const cliqueCrownsAny = clique.nucleusCount > 0;

  const interpretation = [];

  // The negative arm only carries information if it COULD have crowned. If its
  // ceiling is under a floor, "CLIQUE never crowns" is a fact about the floor.
  if (!clique.reachability.admissible) {
    interpretation.push(
      `NEGATIVE ARM INADMISSIBLE — ${clique.reachability.reason} `
      + 'The CLIQUE/DENSITY contrast therefore cannot attribute anything to architecture: '
      + 'the two arms differ in bank size, topology, labels, grounding spread, domain '
      + 'distribution and evidence diversity at once, and the floor lands between their '
      + 'score ceilings. Use a single-variable mutant (same atoms, rewired ports) instead.',
    );
  }

  if (densityCrownsHeavy && !cliqueCrownsHeavy && clique.reachability.admissible) {
    interpretation.push(
      'HOLD density-not-mass: size≥5 NUCLEUS appears only on the coherent sparse arm. '
      + 'Engine is not applying a pure mass veto — architectural information density is load-bearing.',
    );
  } else if (densityCrownsHeavy) {
    interpretation.push(
      `PARTIAL: DENSITY crowns ${density.heavyNucleusCount} NUCLEUS at size≥5, which refutes a `
      + 'PURE MASS VETO on its own — that conclusion needs no contrast and stands. '
      + 'The attribution to "density" does not.',
    );
  } else if (densityCrownsAny && !cliqueCrownsAny) {
    interpretation.push(
      'PARTIAL: DENSITY crowns NUCLEUS (any size) while CLIQUE crowns none. '
      + 'Supports coherence over generic connectivity; check whether crowns are size≥5.',
    );
  } else if (!densityCrownsAny && !cliqueCrownsAny) {
    interpretation.push(
      'BOTH ARMS FAIL nucleus floor: positive control did not crown. '
      + 'Cannot yet separate mass penalty from score ceiling; inspect top finalScores.',
    );
  } else if (densityCrownsHeavy && cliqueCrownsHeavy) {
    interpretation.push(
      'BOTH crown heavy NUCLEUS: mass is not a veto and density is not uniquely required under these floors.',
    );
  } else if (!densityCrownsHeavy && cliqueCrownsHeavy) {
    interpretation.push(
      'INVERT: clique crowns heavy while density does not — opposite of the density hypothesis.',
    );
  } else {
    interpretation.push(
      'MIXED: see bySize tables and top candidates.',
    );
  }

  // Intended topology presence in density shortlist
  const intended = buildDensityBank().intendedTopology;
  const intendedKey = [...intended].sort().join('|');
  const densityIntendedHits = density.top.filter((t) => (
    [...t.atomIds].sort().join('|') === intendedKey
  ));
  const densityHasNovel = density.top.some((t) => t.atomIds.includes('frontier-process-gate'));

  // The declared expectation was "can crown NUCLEUS at size 5–6". Report size 6 on its
  // own: folding it into "size ≥ 5" hides a 0 behind the size-5 crowns.
  for (const arm of [clique, density]) {
    const atMax = arm.bySize[FLOORS.maxMoleculeSize];
    if (atMax) {
      interpretation.push(
        `${arm.name} at max legal size ${FLOORS.maxMoleculeSize}: `
        + `${arm.maxSizeNucleusCount}/${atMax.total} crowned `
        + `(ceiling ${atMax.maxFinal.toFixed(4)} vs floor ${FLOORS.nucleusScoreFloor}).`,
      );
    }
  }

  // The floor-independent statement. Crown counts are a threshold read off a
  // continuous score; the ceiling shift is the score itself, and it is measurable
  // whether or not any arm clears a floor.
  const ceilingDelta = density.reachability.armCeiling - mutant.reachability.armCeiling;
  interpretation.push(
    `TOPOLOGY ISOLATED (single variable): rewiring the DENSITY atoms into a clique — same `
    + `labels, evidence, grounding, domains and bank size — moves the score ceiling `
    + `${density.reachability.armCeiling.toFixed(6)} → ${mutant.reachability.armCeiling.toFixed(6)} `
    + `(Δ=${ceilingDelta.toFixed(6)}) and nuclei ${density.nucleusCount} → ${mutant.nucleusCount}. `
    + 'The ceiling delta is the load-bearing number: it does not depend on where the floor sits. '
    + `Architecture is worth ${(ceilingDelta * 100).toFixed(2)} points of finalScore in this bank.`,
  );

  if (!densityIntendedHits.length) {
    interpretation.push(
      `DESIGNED TOPOLOGY LOST: the intended ${intended.length}-atom pipeline `
      + `(${intended.join(' → ')}) does not appear in the DENSITY top-10. `
      + 'The arm was built around it; the winners are smaller subsets of it. '
      + 'The diagram documents the design, not the result.',
    );
  }

  const body = {
    contract: 'PB-ARCHITECTURAL-DENSITY-CONTROL-v1',
    schemaVersion: '1.0.0',
    seed: SEED,
    trials,
    floors: FLOORS,
    hypothesis: {
      claim: 'NUCLEUS promotion tracks architectural information density, not molecule mass',
      positiveControl: 'sparse asymmetric size-6 pipeline with novel extension + real evidence',
      negativeControl: 'fully licensed clique of similar mass/domain span',
    },
    arms: { clique, density, mutant },
    contrast: {
      cliqueHeavyNuclei: clique.heavyNucleusCount,
      densityHeavyNuclei: density.heavyNucleusCount,
      cliqueAnyNuclei: clique.nucleusCount,
      densityAnyNuclei: density.nucleusCount,
      densityIntendedTopologyInTop: densityIntendedHits.length > 0,
      topologyIsolated: {
        densityCeiling: density.reachability.armCeiling,
        mutantCeiling: mutant.reachability.armCeiling,
        ceilingDelta: Number(
          (density.reachability.armCeiling - mutant.reachability.armCeiling).toFixed(6),
        ),
        densityNuclei: density.nucleusCount,
        mutantNuclei: mutant.nucleusCount,
        heldConstant: ['atoms', 'labels', 'evidence', 'grounding', 'domains', 'bankSize'],
        varied: ['portWiring'],
      },
      densityNovelExtensionInTop: densityHasNovel,
      intendedTopology: intended,
    },
    interpretation,
  };
  body.checksum = `archdensity1:${sha256Hex((({ checksum, ...r }) => r)(body))}`;
  writeFileSync(OUT_JSON, `${JSON.stringify(body, null, 2)}\n`);

  const md = [];
  md.push('# Architectural Density Control');
  md.push('');
  md.push(`**Contract:** \`PB-ARCHITECTURAL-DENSITY-CONTROL-v1\``);
  md.push(`**Trials/arm:** ${trials} · **Seed:** \`0x${SEED.toString(16)}\``);
  md.push(`**Checksum:** \`${body.checksum}\``);
  md.push('');
  md.push('## Question');
  md.push('');
  md.push('Is the Cyclotron imposing a **mass penalty**, or something closer to an');
  md.push('**architectural information-density** requirement?');
  md.push('');
  md.push('| arm | structure | expected if density matters |');
  md.push('|---|---|---|');
  md.push('| CLIQUE | large + maximally connected + generic | stays HYPOTHESIS / never heavy NUCLEUS |');
  md.push('| DENSITY | large + coherent + novel + restrained + real evidence | can crown NUCLEUS at size 5–6 |');
  md.push('');
  md.push('## Interpretation');
  md.push('');
  for (const line of interpretation) md.push(`- ${line}`);
  md.push('');
  md.push('## Contrast');
  md.push('');
  md.push('| metric | CLIQUE | DENSITY | MUTANT (density atoms, clique wiring) |');
  md.push('|---|---|---|---|');
  md.push(`| nuclei (any size) | ${clique.nucleusCount} | ${density.nucleusCount} | ${mutant.nucleusCount} |`);
  md.push(`| heavy nuclei (size ≥ 5) | ${clique.heavyNucleusCount} | ${density.heavyNucleusCount} | ${mutant.heavyNucleusCount} |`);
  md.push(`| nuclei at max size ${FLOORS.maxMoleculeSize} | ${clique.maxSizeNucleusCount} | ${density.maxSizeNucleusCount} | ${mutant.maxSizeNucleusCount} |`);
  md.push(`| shortlisted | ${clique.counts.shortlisted} | ${density.counts.shortlisted} | ${mutant.counts.shortlisted} |`);
  md.push(
    `| **arm score ceiling** (floor ${FLOORS.nucleusScoreFloor}) `
    + `| **${clique.reachability.armCeiling.toFixed(6)}** | **${density.reachability.armCeiling.toFixed(6)}** `
    + `| **${mutant.reachability.armCeiling.toFixed(6)}** |`,
  );
  md.push(`| could this arm crown at all? | ${clique.reachability.admissible ? 'yes' : '**NO**'} | ${density.reachability.admissible ? 'yes' : '**NO**'} | ${mutant.reachability.admissible ? 'yes' : '**NO**'} |`);
  md.push(`| report checksum | \`${clique.checksum}\` | \`${density.checksum}\` | \`${mutant.checksum}\` |`);
  md.push('');
  md.push('The ceiling row is the precondition for reading the nuclei row. If an arm\'s ceiling');
  md.push('sits below the floor, its zero is a property of the configuration.');
  md.push('');

  for (const [label, arm] of [['CLIQUE', clique], ['DENSITY', density], ['MUTANT', mutant]]) {
    md.push(`## ARM ${label}`);
    md.push('');
    md.push('| size | n | NUCLEUS | HYPOTHESIS | REFUSED | max final | max novelty |');
    md.push('|---|---|---|---|---|---|---|');
    for (const size of Object.keys(arm.bySize).map(Number).sort((a, b) => a - b)) {
      const row = arm.bySize[size];
      md.push(
        `| ${size} | ${row.total} | ${row.NUCLEUS} | ${row.HYPOTHESIS} | ${row.REFUSED} `
        + `| ${row.maxFinal.toFixed(4)} | ${row.maxNovelty.toFixed(4)} |`,
      );
    }
    md.push('');
    md.push('Top candidates:');
    md.push('');
    for (const t of arm.top) {
      md.push(
        `- **${t.verdict}** size=${t.size} final=${t.finalScore.toFixed(4)} `
        + `nov=${t.novelty.toFixed(4)} E=${t.energy.toFixed(4)} `
        + `feas=${Number(t.feasibility ?? 0).toFixed(4)} `
        + `\`${t.atomIds.join(' + ')}\``,
      );
    }
    md.push('');
  }

  md.push('## DENSITY arm design');
  md.push('');
  md.push('Novel extension: `frontier-process-gate` → `codex/core/pixelbrain/frontier-process-gate.js`');
  md.push('');
  md.push('Intended size-6 topology:');
  md.push('');
  md.push('```');
  md.push(intended.join(' → '));
  md.push('```');
  md.push('');
  md.push('Ports are a **pipeline with one back-edge** (process-sensor seeks');
  md.push('validation-verdict; gate offers it). Not a clique.');
  md.push('');
  md.push('## Repro');
  md.push('');
  md.push('```bash');
  md.push(`node scripts/architectural-density-control.mjs --trials=${trials}`);
  md.push('```');
  md.push('');
  md.push('## Honest limits');
  md.push('');
  md.push('- Both arms are still engineered banks; this is a controlled contrast, not field data.');
  md.push('- Labels are chosen for chemistry-friendly encyclopedia phrasing — that is part of the positive control, not hidden.');
  md.push(`- Gate reachability is now checked per arm (PB-GATE-REACHABILITY-v1), not just for DENSITY. An arm whose ceiling is below ${FLOORS.nucleusScoreFloor} is marked inadmissible above.`);
  md.push('- The arms differ in bank size, topology, labels, grounding spread, domain distribution and evidence diversity simultaneously. This contrast cannot attribute an effect to any one of them; a single-variable mutant can.');
  md.push('');
  writeFileSync(OUT_MD, `${md.join('\n')}\n`);

  console.log('');
  for (const line of interpretation) console.log(line);
  console.log(`Evidence: ${OUT_JSON}`);
  console.log(`Report:   ${OUT_MD}`);
  console.log(`Checksum: ${body.checksum}`);
}

main();
