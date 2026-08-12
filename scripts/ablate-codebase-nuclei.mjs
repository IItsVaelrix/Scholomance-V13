#!/usr/bin/env node

/**
 * CODEBASE NUCLEI — ABLATION MATRIX
 *
 * Stops asking whether nuclei "sound useful." Asks what the ranking actually
 * depends on, condition by condition.
 *
 *   Condition                 Question
 *   baseline                  real extension atoms
 *   shuffled_ports            does topology matter?
 *   random_evidence           does grounding (evidence path) matter?
 *   entropy_off               does search collapse recur?
 *   extension_req_off         does the legacy bank monopolize discovery?
 *   no_process_sensor         what architectures disappear?
 *   no_evidence_atoms         what basin replaces them?
 *
 * Metric that matters long-term is not nucleus count or energy — it is
 * architectural hit rate (implementation survival). This script records the
 * ablation surface and seeds the survival ledger; hit rate accumulates as
 * proposals are built and adversarially proven.
 *
 *   node scripts/ablate-codebase-nuclei.mjs
 *   node scripts/ablate-codebase-nuclei.mjs --trials=8000 --seed=0x5c4010
 */

import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import {
  runSemanticValenceCyclotron,
  verifySemanticCyclotronReport,
} from '../codex/core/pixelbrain/semantic-valence-cyclotron.js';
import {
  attest,
  loadEncyclopediaIndex,
  prepareForSynthesize,
} from '../codex/core/pixelbrain/grounding-index.js';
import { sha256Hex } from '../codex/core/immunity/cleri-probe/canonical-report.js';
import {
  ATOM_BLUEPRINTS,
  BRIDGE_RULES,
} from './semantic-valence-cyclotron.mjs';
import {
  buildDefaultBank,
  FULL_BANK_CONCENTRATION_LIMIT,
  collapseByTopology,
  rankProposals,
  topologyKey,
  jaccard,
  shuffleOffersSeeks,
  shuffleEvidencePaths,
  randomTopologyMatchedControls,
  SEAL_CLIQUE,
  EVIDENCE_SENSOR_IDS,
} from '../codex/core/pixelbrain/codebase-nuclei-bank.js';

const DEFAULT_TRIALS = 8_000;
const DEFAULT_SEED = 0x5c4010;
const OUT_JSON = 'docs/superpowers/evidence/2026-08-11-codebase-nuclei-ablation.json';
const OUT_MD = 'docs/superpowers/evidence/2026-08-11-codebase-nuclei-ablation.md';
const SURVIVAL_PATH = 'docs/superpowers/evidence/ARCHITECTURAL-HIT-RATE.json';

function parseIntegerFlag(name, fallback, min, max) {
  const prefix = `--${name}=`;
  const raw = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  if (!raw) return fallback;
  const slice = raw.slice(prefix.length);
  const value = slice.startsWith('0x') || slice.startsWith('0X')
    ? Number.parseInt(slice, 16)
    : Number(slice);
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new TypeError(`${name} must be in ${min}..${max}`);
  }
  return Math.trunc(value);
}

function summarizeArm(report, proposals, bankById, extensionIds) {
  const nuclei = report.candidates.filter((c) => c.verdict === 'NUCLEUS');
  const hypotheses = report.candidates.filter((c) => c.verdict === 'HYPOTHESIS');
  const nucleusTopos = [...new Set(nuclei.map((n) => topologyKey(n.molecule.atomIds)))];
  const proposalTopos = proposals.map((p) => p.topology);
  const withProcessSensor = proposals.filter((p) => p.atomIds.includes('process-sensor')).length;
  const withTestContract = proposals.filter((p) => p.atomIds.includes('test-contract')).length;
  const withFission = proposals.filter((p) => p.atomIds.includes('fission-reactor')).length;
  const sealHeavy = proposals.filter((p) => {
    const sealN = p.atomIds.filter((id) => SEAL_CLIQUE.has(id)).length;
    return sealN / Math.max(1, p.atomIds.length) >= 0.6;
  }).length;
  const extensionBearing = proposals.filter((p) => p.newAtomCount >= 1).length;
  const meanUtility = proposals.length
    ? proposals.reduce((s, p) => s + p.utility, 0) / proposals.length
    : 0;
  const meanChem = proposals.length
    ? proposals.reduce((s, p) => s + p.finalScore, 0) / proposals.length
    : 0;

  // Collapse metric: how many engine nuclei share topologies
  const collapseRatio = nuclei.length
    ? 1 - (nucleusTopos.length / nuclei.length)
    : 0;

  const extensionHitCounts = {};
  for (const id of extensionIds) extensionHitCounts[id] = 0;
  for (const c of report.candidates) {
    for (const id of c.molecule.atomIds) {
      if (id in extensionHitCounts) extensionHitCounts[id] += 1;
    }
  }

  return {
    counts: report.counts,
    checksum: report.checksum,
    atomBankChecksum: report.atomBankChecksum,
    uniqueNucleusTopologies: nucleusTopos.length,
    nucleusTopologies: nucleusTopos.slice(0, 24),
    uniqueHypothesisTopologies: new Set(hypotheses.map((h) => topologyKey(h.molecule.atomIds))).size,
    proposalCount: proposals.length,
    proposalTopologies: proposalTopos,
    proposals: proposals.map((p) => ({
      topology: p.topology,
      atomIds: p.atomIds,
      utility: p.utility,
      finalScore: p.finalScore,
      verdict: p.verdict,
      newAtomCount: p.newAtomCount,
    })),
    withProcessSensor,
    withTestContract,
    withFission,
    sealHeavyProposals: sealHeavy,
    extensionBearingProposals: extensionBearing,
    meanProposalUtility: Number(meanUtility.toFixed(6)),
    meanProposalChemistry: Number(meanChem.toFixed(6)),
    collapseRatio: Number(collapseRatio.toFixed(6)),
    extensionHitCounts,
  };
}

function runCondition(name, question, {
  trials,
  seed,
  groundingIndex,
  blueprints,
  bridges,
  entropyEnabled,
  requireExtension,
  extensionIds,
}) {
  const atoms = blueprints.map((blueprint) => ({
    ...blueprint,
    grounding: attest(groundingIndex, blueprint.label).score,
  }));
  const bankById = new Map(atoms.map((a) => [a.id, a]));

  const started = performance.now();
  const report = runSemanticValenceCyclotron({
    atoms,
    bridgeRules: bridges,
    groundingIndex,
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
    entropy: {
      enabled: entropyEnabled,
      decayLambda: 0.35,
      exactWeight: 4,
      familyWeight: 2,
      neighborhoodWeight: 0.5,
      escapeAttempts: 3,
    },
  });
  const elapsedMs = performance.now() - started;
  if (!verifySemanticCyclotronReport(report)) {
    throw new Error(`${name}: report checksum failed`);
  }

  const nuclei = report.candidates.filter((c) => c.verdict === 'NUCLEUS');
  const hypotheses = report.candidates.filter((c) => c.verdict === 'HYPOTHESIS');
  const pool = [...nuclei, ...hypotheses.filter((h) => (h.finalScore ?? 0) >= 0.62)];
  const collapsed = collapseByTopology(pool, bankById, extensionIds);
  let proposals;
  if (requireExtension) {
    proposals = rankProposals(collapsed, {
      requireExtension: true,
      utilityFloor: 0.40,
      evidenceFloor: 0.8,
      limit: 12,
    });
  } else {
    // Monopoly probe: rank by chemistry alone, no extension filter, no utility
    // hard-cap. If the legacy seal basin owns the top of the engine ranking,
    // it will show up here even when utility scoring would have demoted it.
    const byChem = [...collapsed]
      .filter((r) => !r.shipped)
      .sort((a, b) => (
        (b.candidate.finalScore ?? 0) - (a.candidate.finalScore ?? 0)
        || a.topology.localeCompare(b.topology)
      ))
      .slice(0, 12);
    proposals = byChem.map((row) => ({
      topology: row.topology,
      atomIds: row.candidate.molecule.atomIds,
      verdict: row.candidate.verdict,
      finalScore: row.candidate.finalScore,
      utility: Number(row.utility.toFixed(6)),
      domains: row.domains,
      evidenceRealized: row.evidence.realized,
      openPorts: row.ports.dangling,
      internalPorts: row.ports.internal,
      newAtomCount: row.newAtomCount,
    }));
  }

  const summary = summarizeArm(report, proposals, bankById, extensionIds);
  return {
    condition: name,
    question,
    entropyEnabled,
    requireExtension,
    atomCount: blueprints.length,
    extensionIds,
    elapsedMs: Math.round(elapsedMs),
    ...summary,
  };
}

function renderMarkdown(payload) {
  const lines = [];
  lines.push('# Codebase Nuclei — Ablation Matrix');
  lines.push('');
  lines.push(`**Contract:** \`${payload.contract}\``);
  lines.push(`**Trials per arm:** ${payload.trials.toLocaleString()} · **Seed:** ${payload.seed}`);
  lines.push(`**Checksum:** \`${payload.checksum}\``);
  lines.push('');
  lines.push('## Question');
  lines.push('');
  lines.push('Not average energy. Not nucleus count. What does discovery *depend on*,');
  lines.push('and which proposal architectures survive when the bank is damaged?');
  lines.push('');
  lines.push('The long-horizon metric is **architectural hit rate** — implementation');
  lines.push('survival vs topology-matched random controls. Ablation is the prerequisite:');
  lines.push('if topology and grounding do not move the proposal set, the molecular');
  lines.push('representation is not carrying architectural information.');
  lines.push('');
  lines.push('## Matrix');
  lines.push('');
  lines.push('| condition | question | unique nucleus topos | proposals | process-sensor | seal-heavy | collapse | jaccard vs baseline |');
  lines.push('|---|---|---|---|---|---|---|---|');
  for (const arm of payload.arms) {
    lines.push(
      `| \`${arm.condition}\` | ${arm.question} | ${arm.uniqueNucleusTopologies} | ${arm.proposalCount} `
      + `| ${arm.withProcessSensor} | ${arm.sealHeavyProposals} | ${arm.collapseRatio.toFixed(2)} `
      + `| ${arm.jaccardVsBaseline.toFixed(3)} |`,
    );
  }
  lines.push('');
  for (const arm of payload.arms) {
    lines.push(`## \`${arm.condition}\` — ${arm.question}`);
    lines.push('');
    lines.push(`- atoms ${arm.atomCount} · entropy ${arm.entropyEnabled} · requireExtension ${arm.requireExtension}`);
    lines.push(`- engine nuclei ${arm.counts.nuclei} → ${arm.uniqueNucleusTopologies} topologies (collapse ${arm.collapseRatio})`);
    lines.push(`- proposals ${arm.proposalCount} · extension-bearing ${arm.extensionBearingProposals} · mean utility ${arm.meanProposalUtility}`);
    lines.push(`- process-sensor in proposals: ${arm.withProcessSensor} · test-contract: ${arm.withTestContract} · fission: ${arm.withFission}`);
    lines.push(`- jaccard(proposal topologies, baseline): **${arm.jaccardVsBaseline.toFixed(3)}**`);
    lines.push(`- report checksum \`${arm.checksum}\``);
    lines.push('');
    lines.push('Top proposals:');
    lines.push('');
    if (!arm.proposals.length) lines.push('_None._');
    for (const [i, p] of arm.proposals.entries()) {
      lines.push(`${i + 1}. \`u=${p.utility.toFixed(3)}\` \`${p.atomIds.join(' + ')}\` (${p.verdict})`);
    }
    lines.push('');
    const absent = Object.entries(arm.extensionHitCounts)
      .filter(([, n]) => n === 0)
      .map(([id]) => id);
    if (absent.length) {
      lines.push(`Extension atoms absent from shortlist: ${absent.map((id) => `\`${id}\``).join(', ')}`);
      lines.push('');
    }
  }
  lines.push('## Architectural hit rate (ledger)');
  lines.push('');
  lines.push('```');
  lines.push('implementation_survival_rate =');
  lines.push('  proposals_surviving(design + tests + adversarial proof)');
  lines.push('  / proposals_selected_for_implementation');
  lines.push('```');
  lines.push('');
  lines.push(`Current ledger: \`${SURVIVAL_PATH}\``);
  lines.push('');
  lines.push(`- selected: **${payload.hitRate.selected}**`);
  lines.push(`- survived: **${payload.hitRate.survived}**`);
  lines.push(`- rate: **${payload.hitRate.rate === null ? 'n/a (n=0)' : payload.hitRate.rate.toFixed(4)}**`);
  lines.push(`- control survival (topology-matched random): **${payload.hitRate.controlSurvived}/${payload.hitRate.controlSelected}** `
    + `(${payload.hitRate.controlRate === null ? 'n/a' : payload.hitRate.controlRate.toFixed(4)})`);
  lines.push('');
  lines.push('First selected proposal: `process-sensor + valence-compiler` — wired because');
  lines.push('it makes every subsequent experiment harder to fool, not because it is flashy.');
  lines.push('');
  lines.push('## Interpretation rules (pre-registered)');
  lines.push('');
  lines.push('| if… | then… |');
  lines.push('|---|---|');
  lines.push('| shuffled_ports jaccard ≈ 1.0 with baseline | topology is not load-bearing; ports are decoration |');
  lines.push('| shuffled_ports jaccard ≪ 1.0 | port topology shapes discovery |');
  lines.push('| random_evidence jaccard ≈ 1.0 | evidence paths do not move engine ranking (expected if grounding is label-based) |');
  lines.push('| entropy_off collapse ≫ baseline collapse | search collapse recurs without occupancy entropy |');
  lines.push('| extension_req_off seal-heavy ≈ proposalCount | legacy bank monopolizes unfiltered discovery |');
  lines.push('| no_process_sensor drops process-sensor architectures | those proposals were not redundant synonyms |');
  lines.push('| no_evidence_atoms basin shifts to seal/linguistic only | evidence atoms were carrying a real basin |');
  lines.push('');
  lines.push('## Repro');
  lines.push('');
  lines.push('```bash');
  lines.push(`node scripts/ablate-codebase-nuclei.mjs --trials=${payload.trials} --seed=${payload.seed}`);
  lines.push('```');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function main() {
  const trials = parseIntegerFlag('trials', DEFAULT_TRIALS, 200, 1_000_000);
  const seed = parseIntegerFlag('seed', DEFAULT_SEED, 0, 0xffffffff);

  console.log('Codebase Nuclei Ablation Matrix');
  console.log(`Trials/arm: ${trials.toLocaleString()}  seed: ${seed}`);

  const groundingIndex = prepareForSynthesize(loadEncyclopediaIndex(process.cwd()));
  const bankOf = (opts = {}) => buildDefaultBank(ATOM_BLUEPRINTS, BRIDGE_RULES, opts);
  const defaultBank = bankOf();
  const extensionIds = defaultBank.extensionIds;

  const conditions = [
    {
      name: 'baseline',
      question: 'Real extension atoms — control arm',
      build: () => defaultBank,
      entropyEnabled: true,
      requireExtension: true,
    },
    {
      name: 'shuffled_ports',
      question: 'Does topology matter?',
      build: () => {
        const bank = bankOf();
        return {
          ...bank,
          blueprints: shuffleOffersSeeks(bank.blueprints, seed ^ 0x706f7274),
        };
      },
      entropyEnabled: true,
      requireExtension: true,
    },
    {
      name: 'random_evidence',
      question: 'Does grounding (evidence path) matter?',
      build: () => {
        const bank = bankOf();
        return {
          ...bank,
          blueprints: shuffleEvidencePaths(bank.blueprints, seed ^ 0x65766964),
        };
      },
      entropyEnabled: true,
      requireExtension: true,
    },
    {
      name: 'entropy_off',
      question: 'Does search collapse recur?',
      build: () => defaultBank,
      entropyEnabled: false,
      requireExtension: true,
    },
    {
      name: 'extension_req_off',
      question: 'Does the legacy bank monopolize discovery?',
      build: () => defaultBank,
      entropyEnabled: true,
      requireExtension: false,
    },
    {
      name: 'no_process_sensor',
      question: 'What architectures disappear?',
      build: () => bankOf({ excludeIds: ['process-sensor'] }),
      entropyEnabled: true,
      requireExtension: true,
    },
    {
      name: 'no_evidence_atoms',
      question: 'What basin replaces them?',
      build: () => bankOf({ excludeIds: [...EVIDENCE_SENSOR_IDS] }),
      entropyEnabled: true,
      requireExtension: true,
    },
  ];

  const arms = [];
  for (const cond of conditions) {
    process.stdout.write(`  arm ${cond.name}... `);
    const bank = cond.build();
    const arm = runCondition(cond.name, cond.question, {
      trials,
      seed,
      groundingIndex,
      blueprints: bank.blueprints,
      bridges: bank.bridges,
      entropyEnabled: cond.entropyEnabled,
      requireExtension: cond.requireExtension,
      extensionIds: bank.extensionIds.length ? bank.extensionIds : extensionIds,
    });
    arms.push(arm);
    console.log(
      `nucleiTopo=${arm.uniqueNucleusTopologies} proposals=${arm.proposalCount} `
      + `process=${arm.withProcessSensor} collapse=${arm.collapseRatio.toFixed(2)}`,
    );
  }

  const baseline = arms.find((a) => a.condition === 'baseline');
  for (const arm of arms) {
    arm.jaccardVsBaseline = Number(
      jaccard(arm.proposalTopologies, baseline.proposalTopologies).toFixed(6),
    );
  }

  // Topology-matched random controls for the baseline proposals (for hit-rate contrast later).
  const controls = randomTopologyMatchedControls(
    baseline.proposals,
    defaultBank.blueprints.map((a) => a.id),
    seed ^ 0x6374726c,
    3,
  );

  // Seed / update architectural hit-rate ledger.
  // process-sensor + valence-compiler is the first selected implementation.
  const selectedProposal = {
    id: 'process-sensor+valence-compiler',
    topology: 'process-sensor|valence-compiler',
    atomIds: ['process-sensor', 'valence-compiler'],
    source: 'codebase-nuclei-mine',
    selectedAt: '2026-08-11',
    reason: 'Makes every later cyclotron experiment harder to fool; open ports name the wire.',
    stages: {
      design: 'pass',
      tests: 'pending',
      adversarialProof: 'pending',
    },
    survived: false,
  };

  const hitRateBody = {
    contract: 'PB-ARCHITECTURAL-HIT-RATE-v1',
    schemaVersion: '1.0.0',
    metric: 'implementation_survival_rate',
    definition: 'survived(design+tests+adversarial) / selected_for_implementation',
    controlMetric: 'topology_matched_random_control_survival',
    selected: [selectedProposal],
    controls: controls.map((c) => ({
      ...c,
      stages: { design: 'not-attempted', tests: 'not-attempted', adversarialProof: 'not-attempted' },
      survived: false,
    })),
    notes: [
      'Controls are topology-matched random atom sets of the same size as baseline proposals.',
      'They are NOT implemented by default — control survival is recorded only when a control is deliberately built as a placebo architecture.',
      'Until n is large, treat rates as descriptive, not confirmatory.',
    ],
  };
  // Recompute rate after wire tests update stages — initial: selected 1, survived 0
  const survivedCount = hitRateBody.selected.filter((s) => s.survived).length;
  hitRateBody.summary = {
    selected: hitRateBody.selected.length,
    survived: survivedCount,
    rate: hitRateBody.selected.length
      ? survivedCount / hitRateBody.selected.length
      : null,
    controlSelected: 0,
    controlSurvived: 0,
    controlRate: null,
  };

  const body = {
    contract: 'PB-CODEBASE-NUCLEI-ABLATION-v1',
    schemaVersion: '1.0.0',
    seed,
    trials,
    arms,
    baselineProposalTopologies: baseline.proposalTopologies,
    topologyMatchedControls: controls,
    hitRate: hitRateBody.summary,
    preregInterpretation: {
      shuffled_ports: 'jaccard≪1 => topology load-bearing',
      random_evidence: 'jaccard≈1 expected if grounding is label-based; utility may still move',
      entropy_off: 'higher collapseRatio => search collapse recurs',
      extension_req_off: 'sealHeavy≈proposalCount => legacy monopoly',
      no_process_sensor: 'withProcessSensor=0 and dropped topos => non-redundant',
      no_evidence_atoms: 'basin shift in proposal topologies',
    },
  };
  const { checksum: _c, ...sealBody } = body;
  body.checksum = `ablation1:${sha256Hex(sealBody)}`;

  const { checksum: _h, ...hitSeal } = hitRateBody;
  hitRateBody.checksum = `hitrate1:${sha256Hex(hitSeal)}`;

  writeFileSync(OUT_JSON, `${JSON.stringify(body, null, 2)}\n`, 'utf8');
  writeFileSync(OUT_MD, renderMarkdown({
    ...body,
    hitRate: {
      selected: hitRateBody.summary.selected,
      survived: hitRateBody.summary.survived,
      rate: hitRateBody.summary.rate,
      controlSelected: hitRateBody.summary.controlSelected,
      controlSurvived: hitRateBody.summary.controlSurvived,
      controlRate: hitRateBody.summary.controlRate,
    },
  }), 'utf8');
  writeFileSync(SURVIVAL_PATH, `${JSON.stringify(hitRateBody, null, 2)}\n`, 'utf8');

  console.log('');
  console.log('Jaccard vs baseline (proposal topologies):');
  for (const arm of arms) {
    console.log(`  ${arm.condition.padEnd(20)} ${arm.jaccardVsBaseline.toFixed(3)}`);
  }
  console.log(`Evidence: ${OUT_JSON}`);
  console.log(`Report:   ${OUT_MD}`);
  console.log(`Hit rate: ${SURVIVAL_PATH}`);
  console.log(`Checksum: ${body.checksum}`);
}

main();
