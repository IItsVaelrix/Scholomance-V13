#!/usr/bin/env node

/**
 * SUPER-HEAVY NUCLEUS ATTACK
 *
 * Question: if you artificially construct a "super heavy" molecule, will the
 * Semantic Valence Cyclotron reject it — or crown it NUCLEUS?
 *
 * Three probes (declared before running):
 *
 *   P1 CONFIG CEILING
 *      Request maxMoleculeSize above the engine hard cap (6). Expect refusal
 *      at normalizeConfig — the cyclotron must not silently accept size 12.
 *
 *   P2 MAX LEGAL HEAVINESS
 *      Build a fully-licensed clique bank (every atom offers what every other
 *      seeks) across 6 domains, run at maxMoleculeSize=6. Count NUCLEUS /
 *      HYPOTHESIS / REFUSED by molecule size. Prediction: size-6 can shortlist
 *      but is hard to promote — nucleusMinDomains, novelty, osmosis, and
 *      chemistry all get stricter as the molecule gets heavier.
 *
 *   P3 ARTIFICIAL SCORECARD
 *      For every shortlisted candidate, recompute the nucleus predicate
 *      components and record which gate killed heavy molecules. This is the
 *      autopsy: not "did it reject" but "which lock refused the heavy door."
 *
 *   node scripts/super-heavy-nucleus-attack.mjs
 *   node scripts/super-heavy-nucleus-attack.mjs --trials=5000
 */

import { writeFileSync } from 'node:fs';
import {
  runSemanticValenceCyclotron,
  verifySemanticCyclotronReport,
} from '../codex/core/pixelbrain/semantic-valence-cyclotron.js';
import { sha256Hex } from '../codex/core/immunity/cleri-probe/canonical-report.js';
import { verdictAdmissible } from '../codex/core/pixelbrain/gate-reachability.js';

const OUT_JSON = 'docs/superpowers/evidence/2026-08-11-super-heavy-nucleus-attack.json';
const OUT_MD = 'docs/superpowers/evidence/2026-08-11-super-heavy-nucleus-attack.md';
const SEED = 0x48454156; // HEAV
const DEFAULT_TRIALS = 5_000;

function parseTrials() {
  const raw = process.argv.slice(2).find((a) => a.startsWith('--trials='));
  if (!raw) return DEFAULT_TRIALS;
  const n = Number(raw.slice('--trials='.length));
  if (!Number.isFinite(n) || n < 100) throw new TypeError('bad --trials');
  return Math.trunc(n);
}

/**
 * Clique bank: 12 atoms, 6 domains × 2. Each atom offers port `p{i}` and seeks
 * every other port — so any size-k subset can form a fully licensed tree/cycle
 * and reach valenceSatisfaction = 1. Labels are encyclopedia-ish so chemistry
 * has something to score; this is artificial topology, not a real module map.
 */
function buildCliqueBank() {
  const domains = [
    'artifact', 'governance', 'immunity',
    'synthesis', 'linguistic', 'memory',
  ];
  const atoms = [];
  for (let i = 0; i < 12; i += 1) {
    const domain = domains[i % domains.length];
    const selfPort = `heavy-port-${i}`;
    const offers = [selfPort, `domain-signal-${domain}`];
    const seeks = [];
    for (let j = 0; j < 12; j += 1) {
      if (j === i) continue;
      seeks.push(`heavy-port-${j}`);
    }
    // Also seek a shared glue so bridges aren't required
    seeks.push('heavy-glue');
    offers.push('heavy-glue');
    atoms.push({
      id: `heavy-atom-${i}`,
      label: [
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
      ][i],
      domain,
      offers,
      seeks,
      traits: ['artificial', 'clique', `mass-${i}`],
      inhibits: [],
      evidence: [`synthetic://heavy-atom-${i}`],
      grounding: 0.55 + (i % 5) * 0.08, // moderately high, not all identical
    });
  }
  return atoms;
}

function probeConfigCeiling() {
  const atoms = buildCliqueBank();
  try {
    runSemanticValenceCyclotron({
      atoms,
      trialCount: 10,
      seed: SEED,
      maxMoleculeSize: 12, // above hard cap of 6
    });
    return {
      probe: 'P1_CONFIG_CEILING',
      rejected: false,
      detail: 'UNEXPECTED: maxMoleculeSize=12 was accepted',
    };
  } catch (error) {
    return {
      probe: 'P1_CONFIG_CEILING',
      rejected: true,
      detail: String(error.message ?? error).slice(0, 240),
      expected: true,
    };
  }
}

function nucleusGateAutopsy(candidate, config) {
  const atoms = candidate.molecule.atomIds;
  const domainCount = new Set(
    // domain not on molecule — approximate from id suffix when synthetic
    atoms.map((id) => {
      const m = /^heavy-atom-(\d+)$/.exec(id);
      if (!m) return 'unknown';
      const domains = [
        'artifact', 'governance', 'immunity',
        'synthesis', 'linguistic', 'memory',
      ];
      return domains[Number(m[1]) % 6];
    }),
  ).size;

  const checks = {
    // osmosis.baseline_drift was removed from the nucleus predicate on
    // 2026-08-12 (PB-OSMOTIC-EQUILIBRIUM-v1); it admitted 256/256 and is no
    // longer a gate, so it must not be scored as a kill here. The raw
    // anomalyKind is still reported below as `osmosisKind` for diagnostics.
    chemistryNotUnstable: candidate.conceptChemistry?.stability !== 'UNSTABLE',
    notRepelled: candidate.conceptChemistry?.corpusPMI?.signal !== 'REPULSION',
    sizeGteMinDomains: atoms.length >= config.nucleusMinDomains,
    domainCountGteMin: domainCount >= config.nucleusMinDomains,
    noveltyGteFloor: candidate.molecule.novelty >= config.nucleusNoveltyFloor,
    finalScoreGteFloor: candidate.finalScore >= config.nucleusScoreFloor,
  };
  const failed = Object.entries(checks)
    .filter(([, ok]) => !ok)
    .map(([name]) => name);
  const wouldBeNucleus = failed.length === 0;
  return {
    size: atoms.length,
    domainCount,
    finalScore: candidate.finalScore,
    novelty: candidate.molecule.novelty,
    energy: candidate.molecule.energy,
    feasibility: candidate.conceptChemistry?.feasibility ?? null,
    stability: candidate.conceptChemistry?.stability ?? null,
    osmosisKind: candidate.osmosis?.anomalyKind ?? null,
    valenceSatisfaction: candidate.molecule.valenceSatisfaction,
    checks,
    failedGates: failed,
    wouldBeNucleus,
    actualVerdict: candidate.verdict,
  };
}

function main() {
  const trials = parseTrials();
  console.log('Super-Heavy Nucleus Attack');
  console.log(`trials=${trials} seed=0x${SEED.toString(16)}`);

  // ── P1 ──────────────────────────────────────────────────────────────
  const p1 = probeConfigCeiling();
  console.log(`P1 config ceiling: rejected=${p1.rejected} — ${p1.detail}`);

  // ── P2 + P3 ─────────────────────────────────────────────────────────
  const atoms = buildCliqueBank();
  // Floors recalibrated 2026-08-12 (PB-OSMOTIC-EQUILIBRIUM-v1) from this
  // bank's own measured shortlist — never reused, never rounded tidy:
  //   nucleusScoreFloor    = p90 finalScore = 0.688738
  //   nucleusNoveltyFloor  = p50 novelty    = 0.189864
  // Measured: seed 0x48454156, trials=5000, n=256, equilibration ON
  // (finalScore max 0.698936, novelty max 0.217335). Score floor carries
  // the size discrimination; novelty floor keeps an above-median novelty
  // requirement without stacking two top-decile filters.
  const config = {
    nucleusMinDomains: 3,
    nucleusNoveltyFloor: 0.189864,
    nucleusScoreFloor: 0.688738,
    finalScoreFloor: 0.58,
    noveltyFloor: 0.04,
  };

  const report = runSemanticValenceCyclotron({
    atoms,
    trialCount: trials,
    seed: SEED,
    maxMoleculeSize: 6,
    controlEvery: 5,
    controlPercentile: 0.99,
    shortlistLimit: 256,
    shortlistFamilyCap: 4,
    noveltyFloor: config.noveltyFloor,
    finalScoreFloor: config.finalScoreFloor,
    nucleusScoreFloor: config.nucleusScoreFloor,
    nucleusNoveltyFloor: config.nucleusNoveltyFloor,
    nucleusMinDomains: config.nucleusMinDomains,
    entropyEnabled: false,
  });
  if (!verifySemanticCyclotronReport(report)) {
    throw new Error('report checksum failed');
  }

  const bySize = {};
  for (const c of report.candidates) {
    const size = c.molecule.atomIds.length;
    if (!bySize[size]) {
      bySize[size] = { NUCLEUS: 0, HYPOTHESIS: 0, REFUSED: 0, total: 0, maxFinal: 0, maxEnergy: 0 };
    }
    bySize[size][c.verdict] += 1;
    bySize[size].total += 1;
    bySize[size].maxFinal = Math.max(bySize[size].maxFinal, c.finalScore);
    bySize[size].maxEnergy = Math.max(bySize[size].maxEnergy, c.molecule.energy);
  }

  const heavies = report.candidates
    .filter((c) => c.molecule.atomIds.length >= 5)
    .map((c) => ({
      atomIds: c.molecule.atomIds,
      verdict: c.verdict,
      autopsy: nucleusGateAutopsy(c, config),
    }))
    .sort((a, b) => b.autopsy.size - a.autopsy.size
      || b.autopsy.finalScore - a.autopsy.finalScore);

  const size6 = heavies.filter((h) => h.autopsy.size === 6);
  const size6Nuclei = size6.filter((h) => h.verdict === 'NUCLEUS');
  const size6Hyp = size6.filter((h) => h.verdict === 'HYPOTHESIS');
  const size6Refused = size6.filter((h) => h.verdict === 'REFUSED');

  // Was 0 NUCLEUS measured, or guaranteed by floors set above what this bank can reach?
  const ruling = verdictAdmissible({
    candidates: report.candidates,
    floors: {
      nucleusScoreFloor: config.nucleusScoreFloor,
      nucleusNoveltyFloor: config.nucleusNoveltyFloor,
    },
    nucleusCount: report.counts.nuclei,
  });

  // Gate failure histogram for every size-6 that was NOT crowned NUCLEUS
  // (includes HYPOTHESIS — the interesting case: shortlisted but not promoted)
  const killCounts = {};
  for (const h of size6.filter((row) => row.verdict !== 'NUCLEUS')) {
    for (const g of h.autopsy.failedGates) {
      killCounts[g] = (killCounts[g] ?? 0) + 1;
    }
  }

  // Same histogram over the WHOLE shortlist. A gate that kills every row at every
  // size is not telling you anything about heaviness.
  const killCountsAll = {};
  for (const c of report.candidates) {
    for (const g of nucleusGateAutopsy(c, config).failedGates) {
      killCountsAll[g] = (killCountsAll[g] ?? 0) + 1;
    }
  }
  const shortlistTotal = report.candidates.length;

  // Score vs size: does heaviness tax finalScore?
  const scoreBySize = {};
  for (const c of report.candidates) {
    const size = c.molecule.atomIds.length;
    if (!scoreBySize[size]) scoreBySize[size] = [];
    scoreBySize[size].push(c.finalScore);
  }
  const meanBySize = {};
  for (const [size, scores] of Object.entries(scoreBySize)) {
    meanBySize[size] = Number(
      (scores.reduce((s, x) => s + x, 0) / scores.length).toFixed(6),
    );
  }

  // Unique size distribution in shortlist
  const shortlistSizes = {};
  for (const c of report.candidates) {
    const s = c.molecule.atomIds.length;
    shortlistSizes[s] = (shortlistSizes[s] ?? 0) + 1;
  }

  const body = {
    contract: 'PB-SUPER-HEAVY-ATTACK-v1',
    schemaVersion: '1.0.0',
    seed: SEED,
    trials,
    reportChecksum: report.checksum,
    atomBank: {
      kind: 'artificial-clique',
      atoms: atoms.length,
      domains: 6,
      note: 'Fully licensed clique so heaviness is not blocked by missing edges',
    },
    probes: {
      P1_CONFIG_CEILING: p1,
      P2_MAX_LEGAL_HEAVINESS: {
        maxMoleculeSize: 6,
        counts: report.counts,
        bySize,
        shortlistSizes,
        size6: {
          shortlisted: size6.length,
          NUCLEUS: size6Nuclei.length,
          HYPOTHESIS: size6Hyp.length,
          REFUSED: size6Refused.length,
        },
        rejectedSuperHeavyAsNucleus: size6Nuclei.length === 0,
      },
      P0_GATE_REACHABILITY: {
        admissible: ruling.admissible,
        reason: ruling.reason,
        gates: ruling.report?.gates ?? null,
      },
      P3_GATE_AUTOPSY: {
        config,
        size6KillHistogram: killCounts,
        allSizesKillHistogram: killCountsAll,
        shortlistTotal,
        meanFinalScoreBySize: meanBySize,
        heavinessTax:
          meanBySize['2'] != null && meanBySize['6'] != null
            ? Number((meanBySize['2'] - meanBySize['6']).toFixed(6))
            : null,
        heaviestExamples: heavies.slice(0, 12),
      },
    },
    verdict: {
      configRejectsOversize: p1.rejected === true,
      size6PromotedToNucleus: size6Nuclei.length > 0,
      size6PresentInShortlist: size6.length > 0,
      summary: null,
    },
  };

  // Natural-language summary
  const lines = [];
  if (!p1.rejected) {
    lines.push('P1 FAIL: engine accepted maxMoleculeSize>6 — ceiling broken.');
  } else {
    lines.push('P1 HOLD: super-heavy above size 6 is rejected at config (hard cap 6).');
  }
  if (!ruling.admissible) {
    lines.push(`P2 ${ruling.reason}`);
    lines.push(
      `P2 detail: 0 NUCLEUS at EVERY size (2..6), not only at size 6 — `
      + `the light controls were refused for the same reason as the heavies, `
      + `so this run cannot separate a mass penalty from an unreachable floor.`,
    );
  } else if (size6.length === 0) {
    lines.push('P2: no size-6 molecules reached the shortlist (valence/energy/control bar filtered them).');
  } else if (size6Nuclei.length === 0) {
    lines.push(
      `P2 HOLD: ${size6.length} size-6 molecules shortlisted; 0 promoted to NUCLEUS `
      + `(${size6Hyp.length} HYPOTHESIS, ${size6Refused.length} REFUSED). Super-heavy is not crowned.`,
    );
  } else {
    lines.push(
      `P2 FAIL/OPEN: ${size6Nuclei.length} size-6 NUCLEUS promotions — the cyclotron will accept max-legal heaviness.`,
    );
  }
  if (Object.keys(killCounts).length) {
    lines.push(`P3 top kill gates on size-6 non-NUCLEUS: ${
      Object.entries(killCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([k, n]) => `${k}=${n} (fires on ${killCountsAll[k] ?? 0}/${shortlistTotal} of ALL sizes)`)
        .join(', ')
    }`);
    const nonDiscriminating = Object.keys(killCounts)
      .filter((g) => (killCountsAll[g] ?? 0) === shortlistTotal);
    if (nonDiscriminating.length) {
      lines.push(
        `P3 VACUOUS: ${nonDiscriminating.join(', ')} fired on 100% of the shortlist at every size. `
        + 'A gate shared by the heavies, the lights and everything else carries no information about mass.',
      );
    }
  }
  if (meanBySize['2'] != null && meanBySize['6'] != null) {
    // Report the MEAN. Comparing maxima across sizes compares an order statistic
    // over 133 draws against one over 3 — fewer draws give a lower max even from
    // an identical distribution, which manufactures a "tax" out of sample size.
    const delta = meanBySize['2'] - meanBySize['6'];
    lines.push(
      `P3 heaviness tax (MEAN finalScore): size2=${meanBySize['2'].toFixed(4)} → size6=${meanBySize['6'].toFixed(4)} `
      + `(Δ=${delta.toFixed(4)} — ${delta > 0 ? 'heavier scores lower' : 'heavier scores HIGHER; no mass penalty in the mean'}). `
      + `Max-based Δ=${(bySize[2].maxFinal - bySize[6].maxFinal).toFixed(4)} is an order statistic over `
      + `n=${bySize[2].total} vs n=${bySize[6].total} and is NOT evidence of a tax.`,
    );
  }
  body.verdict.summary = lines.join(' ');

  body.checksum = `superheavy1:${sha256Hex((({ checksum, ...rest }) => rest)(body))}`;
  writeFileSync(OUT_JSON, `${JSON.stringify(body, null, 2)}\n`);

  const md = [];
  md.push('# Super-Heavy Nucleus Attack');
  md.push('');
  md.push(`**Contract:** \`PB-SUPER-HEAVY-ATTACK-v1\``);
  md.push(`**Trials:** ${trials} · **Seed:** \`0x${SEED.toString(16)}\``);
  md.push(`**Report checksum:** \`${report.checksum}\``);
  md.push(`**Attack checksum:** \`${body.checksum}\``);
  md.push('');
  md.push('## Question');
  md.push('');
  md.push('If you artificially create a super-heavy nucleus, will the Cyclotron reject it?');
  md.push('');
  md.push('## Verdict');
  md.push('');
  for (const line of lines) md.push(`- ${line}`);
  md.push('');
  md.push('## P0 — Gate reachability (can this bank clear the nucleus floors at all?)');
  md.push('');
  md.push('| gate | floor | arm ceiling | cleared by | reachable |');
  md.push('|---|---|---|---|---|');
  for (const g of ruling.report?.gates ?? []) {
    md.push(
      `| \`${g.name}\` | ${g.floor} | ${g.observedMax.toFixed(6)} | ${g.clearedBy}/${shortlistTotal} `
      + `| ${g.reachable ? 'yes' : '**NO**'} |`,
    );
  }
  md.push('');
  md.push(`**Verdict admissible:** ${ruling.admissible ? 'yes' : '**NO**'}`);
  if (!ruling.admissible) {
    md.push('');
    md.push(`> ${ruling.reason}`);
    md.push('>');
    md.push('> P2 and P3 below are reported for the record only. Their no-crown result was');
    md.push('> fixed by the configuration before any molecule was built.');
  }
  md.push('');
  md.push('## P1 — Config ceiling (size > 6)');
  md.push('');
  md.push(`- rejected: **${p1.rejected}**`);
  md.push(`- detail: \`${p1.detail}\``);
  md.push('');
  md.push('## P2 — Max legal heaviness (size = 6, clique bank)');
  md.push('');
  md.push('| size | shortlisted | NUCLEUS | HYPOTHESIS | REFUSED | max finalScore | max energy |');
  md.push('|---|---|---|---|---|---|---|');
  for (const size of Object.keys(bySize).map(Number).sort((a, b) => a - b)) {
    const row = bySize[size];
    md.push(
      `| ${size} | ${row.total} | ${row.NUCLEUS} | ${row.HYPOTHESIS} | ${row.REFUSED} `
      + `| ${row.maxFinal.toFixed(4)} | ${row.maxEnergy.toFixed(4)} |`,
    );
  }
  md.push('');
  md.push(
    `Size-6: shortlisted **${size6.length}**, NUCLEUS **${size6Nuclei.length}**, `
    + `HYPOTHESIS **${size6Hyp.length}**, REFUSED **${size6Refused.length}**.`,
  );
  md.push('');
  md.push('## P3 — Which gates kill heavies?');
  md.push('');
  if (!Object.keys(killCounts).length) {
    md.push('_No size-6 REFUSED candidates to autopsy (or none shortlisted)._');
  } else {
    md.push('| failed gate | count among size-6 non-NUCLEUS | count among ALL shortlisted |');
    md.push('|---|---|---|');
    for (const [gate, n] of Object.entries(killCounts).sort((a, b) => b[1] - a[1])) {
      md.push(`| \`${gate}\` | ${n}/${size6.length} | ${killCountsAll[gate] ?? 0}/${shortlistTotal} |`);
    }
    md.push('');
    md.push('The right-hand column is the discrimination check: a gate that fires on the whole');
    md.push('shortlist is not selecting against heaviness.');
  }
  md.push('');
  md.push('### Example heavies');
  md.push('');
  for (const h of heavies.slice(0, 8)) {
    md.push(
      `- size ${h.autopsy.size} **${h.verdict}** final=${h.autopsy.finalScore.toFixed(4)} `
      + `nov=${h.autopsy.novelty.toFixed(4)} feas=${Number(h.autopsy.feasibility ?? 0).toFixed(4)} `
      + `failed=[${h.autopsy.failedGates.join(', ') || '—'}] `
      + `\`${h.atomIds.join(' + ')}\``,
    );
  }
  md.push('');
  md.push('## Method');
  md.push('');
  md.push('1. Artificial **clique atom bank** (12 atoms, 6 domains) so missing edges cannot explain rejection.');
  md.push('2. Engine hard cap probe: `maxMoleculeSize=12` must throw.');
  md.push('3. Run at `maxMoleculeSize=6` (legal maximum) and tally verdicts by size.');
  md.push('4. Autopsy nucleus predicate components on every size ≥ 5 shortlist row.');
  md.push('');
  md.push('## Repro');
  md.push('');
  md.push('```bash');
  md.push(`node scripts/super-heavy-nucleus-attack.mjs --trials=${trials}`);
  md.push('```');
  md.push('');
  md.push('## Honest limits');
  md.push('');
  md.push('- Clique bank is synthetic; chemistry labels are borrowed encyclopedia phrases, not real module evidence paths.');
  md.push('- "Super heavy" cannot exceed size 6 inside this engine — that is itself a rejection mechanism.');
  md.push('- Shortlist already requires valenceSatisfaction=1 and energy > control bar; failures before shortlist are not in P3.');
  md.push('');
  writeFileSync(OUT_MD, `${md.join('\n')}\n`);

  console.log('');
  console.log('By size:', JSON.stringify(bySize, null, 2));
  console.log('Size-6 NUCLEUS:', size6Nuclei.length);
  console.log('Kill histogram:', killCounts);
  console.log('');
  for (const line of lines) console.log(line);
  console.log(`Evidence: ${OUT_JSON}`);
  console.log(`Report:   ${OUT_MD}`);
  console.log(`Checksum: ${body.checksum}`);
}

main();
