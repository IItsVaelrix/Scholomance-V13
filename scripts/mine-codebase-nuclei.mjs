#!/usr/bin/env node

/**
 * CODEBASE NUCLEI MINING EXPERIMENT
 *
 * Problem: the default 44-atom ritual bank collapses nuclei into the
 * seal+serializer family (A2 harness / C-sensor core). Ranking has almost
 * no dynamic range on that substrate — nearly every 5-atom set is "novel."
 *
 * This experiment does three things the ritual run does not:
 *
 *   1. Extends the atom bank with modules that actually exist in *this*
 *      working tree (sensors, grammar, constellation, healers) and fixes
 *      the aspirational event-bus evidence path.
 *   2. Turns occupancy-entropy on so the shortlist is not pure family
 *      dominance of the first high-scoring clique.
 *   3. Post-ranks nuclei by *codebase utility*, not chemistry alone:
 *        - evidence paths that resolve on disk
 *        - compositions not already shipped (A2, C-sensor)
 *        - open ports that map to a next concrete build
 *        - multi-domain span
 *
 * Output is propose-only. Nothing is auto-built. Baselines are not written.
 *
 *   node scripts/mine-codebase-nuclei.mjs
 *   node scripts/mine-codebase-nuclei.mjs --trials=15000 --seed=0x5c4010
 *   node scripts/mine-codebase-nuclei.mjs --trials=5000 --out=/tmp/mine.json
 */

import { writeFileSync, existsSync, readFileSync } from 'node:fs';
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
import { sha256Hex, stableStringify } from '../codex/core/immunity/cleri-probe/canonical-report.js';
import {
  ATOM_BLUEPRINTS as BASE_ATOMS,
  BRIDGE_RULES as BASE_BRIDGES,
} from './semantic-valence-cyclotron.mjs';
import {
  FULL_BANK_CONCENTRATION_LIMIT,
} from '../codex/core/pixelbrain/codebase-nuclei-bank.js';

const DEFAULT_OUT = 'docs/superpowers/evidence/2026-08-11-codebase-nuclei-mine.json';
const DEFAULT_REPORT = 'docs/superpowers/evidence/2026-08-11-codebase-nuclei-mine.md';
const DEFAULT_TRIALS = 12_000;
const DEFAULT_SEED = 0x5c4010;

// Compositions already shipped as real tools. Sorted atom-id sets.
const SHIPPED = Object.freeze([
  // A2 evidence-integrity harness
  'bytecode-seal|canonical-serializer|diagnostic-event-bus|immutable-packet|schema-verifier',
  // C-sensor core (cyclotron-reactor + evidence-ledger + serializer chain)
  'bytecode-seal|canonical-serializer|cyclotron-reactor|evidence-ledger|schema-verifier',
  // seal + memory variant heavily represented in prior runs
  'bytecode-seal|canonical-serializer|immutable-packet|schema-verifier|semantic-memory',
]);

const atom = (id, label, domain, offers, seeks, evidence, traits = [], inhibits = []) => ({
  id,
  label,
  domain,
  offers,
  seeks,
  traits,
  inhibits,
  evidence: [evidence],
});

/**
 * Capability atoms grounded in modules that exist in this repo *today*.
 * Ports are chosen so they can close into new pipelines — not re-emit A2/C.
 */
const CODEBASE_ATOMS = Object.freeze([
  // ── Sensors (observe first) ──────────────────────────────────────────
  atom(
    'process-sensor',
    'cyclotron process drift sensor',
    'immunity',
    ['process-verdict', 'experiment-receipt'],
    ['candidate-frontier', 'feasibility-score', 'validation-verdict'],
    'codex/core/pixelbrain/cyclotron-sensor.js',
    ['sensor', 'propose-only'],
  ),
  atom(
    'artifact-auditor',
    'evidence integrity harness A2',
    'immunity',
    ['integrity-verdict', 'diagnostic-event'],
    ['artifact', 'checksum', 'structure'],
    'scripts/evidence-integrity-harness.mjs',
    ['sensor', 'propose-only'],
  ),
  atom(
    'subtlety-fingerprint',
    'subtlety APM fingerprint sensor',
    'immunity',
    ['anomaly-fingerprint', 'anomaly-signal'],
    ['diagnostic-event'],
    'codex/core/pixelbrain/subtlety-fingerprint-apm.js',
    ['sensor'],
  ),
  atom(
    'subtlety-closed-loop',
    'subtlety closed loop observe only',
    'immunity',
    ['sensor-observation'],
    ['anomaly-fingerprint', 'process-verdict'],
    'codex/core/pixelbrain/subtlety-closed-loop.js',
    ['sensor', 'propose-only'],
  ),
  atom(
    'raid-healer',
    'iterative healer propose only',
    'immunity',
    ['heal-proposal'],
    ['risk-classification', 'process-verdict', 'integrity-verdict'],
    'codex/core/immunity/iterative-healer.js',
    ['propose-only'],
  ),

  // ── Grammar / constellation (active product surface) ─────────────────
  atom(
    'fission-reactor',
    'semantic fission reactor',
    'linguistic',
    ['fission-daughters', 'construction-tree', 'proposal'],
    ['token-stream', 'semantic-relation', 'corpus-grounding'],
    'codex/core/pixelbrain/semantic-fission-reactor.js',
  ),
  atom(
    'ccg-channel',
    'CCG derivation channel',
    'linguistic',
    ['ccg-derivation', 'construction-tree', 'semantic-relation'],
    ['token-stream', 'semantic-primitives'],
    'codex/core/semantic/ccg-channel.js',
  ),
  atom(
    'treebank-metrics',
    'constellation treebank metrics',
    'linguistic',
    ['grammar-metrics', 'validation-verdict'],
    ['construction-tree'],
    'codex/core/constellation/treebank-metrics.js',
  ),
  atom(
    'precedent-compose',
    'constellation precedent composer',
    'retrieval',
    ['chart-composition', 'candidate-frontier', 'proposal'],
    ['grammar-metrics', 'corpus-grounding', 'construction-tree'],
    'codex/server/services/constellation/precedent.adapter.js',
  ),
  atom(
    'entropy-dampener',
    'occupancy entropy dampener',
    'synthesis',
    ['occupancy-signal', 'candidate-frontier', 'novelty-signal'],
    ['trial-counter', 'atom-inventory'],
    'codex/core/pixelbrain/entropic-decay-dampener.js',
  ),

  // ── Quality / gates ──────────────────────────────────────────────────
  atom(
    'test-contract',
    'vitest contract for sensor and reactor',
    'governance',
    ['test-verdict', 'validation-verdict'],
    ['schema-verdict', 'process-verdict', 'integrity-verdict'],
    'tests/codex/core/pixelbrain/cyclotron-sensor.test.js',
  ),
  atom(
    'canonical-tokenizer-atom',
    'canonical linguistic tokenizer module',
    'linguistic',
    ['token-stream', 'text'],
    [],
    'codex/core/canonical-tokenizer.js',
  ),
]);

/** Bridge laws that license the new ports without inventing free bonds. */
const CODEBASE_BRIDGES = Object.freeze([
  { from: 'process-verdict', to: 'anomaly-signal', relation: 'surfaces', strength: 0.88 },
  { from: 'integrity-verdict', to: 'anomaly-signal', relation: 'surfaces', strength: 0.86 },
  { from: 'anomaly-fingerprint', to: 'anomaly-signal', relation: 'specializes', strength: 0.9 },
  { from: 'sensor-observation', to: 'diagnostic-event', relation: 'emits', strength: 0.84 },
  { from: 'heal-proposal', to: 'promotion-decision', relation: 'requires-human', strength: 0.8 },
  { from: 'fission-daughters', to: 'construction-tree', relation: 'yields', strength: 0.92 },
  { from: 'ccg-derivation', to: 'construction-tree', relation: 'projects', strength: 0.9 },
  { from: 'grammar-metrics', to: 'validation-verdict', relation: 'scores', strength: 0.82 },
  { from: 'chart-composition', to: 'proposal', relation: 'renders', strength: 0.78 },
  { from: 'occupancy-signal', to: 'novelty-signal', relation: 'modulates', strength: 0.85 },
  { from: 'test-verdict', to: 'build-decision', relation: 'gates', strength: 0.9 },
  { from: 'diagnostic-event', to: 'anomaly-signal', relation: 'excites', strength: 0.83 },
]);

// Already-shipped compositions used the aspirational event-bus path.
// Retarget that atom's evidence to the harness that actually implements the bus.
function retargetBaseAtoms(blueprints) {
  return blueprints.map((blueprint) => {
    if (blueprint.id !== 'diagnostic-event-bus') return blueprint;
    return {
      ...blueprint,
      evidence: ['scripts/evidence-integrity-harness.mjs'],
      label: 'diagnostic event bus (inline in A2 harness)',
    };
  });
}

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

function parseStringFlag(name, fallback = null) {
  const prefix = `--${name}=`;
  const raw = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return raw ? raw.slice(prefix.length) : fallback;
}

function pathExists(rel) {
  return existsSync(rel);
}

function topologyKey(atomIds) {
  return [...atomIds].sort().join('|');
}

function openPorts(moleculeAtoms, bankById) {
  const offered = new Set();
  const sought = new Set();
  for (const id of moleculeAtoms) {
    const a = bankById.get(id);
    if (!a) continue;
    for (const o of a.offers) offered.add(o);
    for (const s of a.seeks) sought.add(s);
  }
  const internal = [...sought].filter((s) => offered.has(s)).sort();
  const dangling = [...sought].filter((s) => !offered.has(s)).sort();
  return { internal, dangling, offered: [...offered].sort() };
}

function evidenceScore(moleculeAtoms, bankById) {
  let ok = 0;
  const missing = [];
  for (const id of moleculeAtoms) {
    const a = bankById.get(id);
    const path = a?.evidence?.[0];
    if (path && pathExists(path)) ok += 1;
    else missing.push({ id, path: path ?? null });
  }
  return {
    realized: moleculeAtoms.length ? ok / moleculeAtoms.length : 0,
    missing,
  };
}

function domainsOf(moleculeAtoms, bankById) {
  return [...new Set(moleculeAtoms.map((id) => bankById.get(id)?.domain).filter(Boolean))].sort();
}

/** Ritual seal/serializer clique — chemistry-strong, already mined to death. */
const SEAL_CLIQUE = new Set([
  'bytecode-seal', 'canonical-serializer', 'immutable-packet',
  'schema-verifier', 'semantic-memory', 'diagnostic-event-bus',
]);

/**
 * Utility score in [0,1]. Chemistry finalScore is one input — not the only one.
 * A nucleus that re-ships A2 scores near zero regardless of chemistry.
 * Molecules with zero extension atoms are hard-capped: this experiment
 * is not for re-ranking the seal family.
 */
function utilityScore(candidate, bankById) {
  const ids = candidate.molecule?.atomIds ?? [];
  const topo = topologyKey(ids);
  const shipped = SHIPPED.includes(topo);
  const evidence = evidenceScore(ids, bankById);
  const ports = openPorts(ids, bankById);
  const domains = domainsOf(ids, bankById);
  const closure = ports.internal.length + ports.dangling.length === 0
    ? 1
    : ports.internal.length / Math.max(1, ports.internal.length + ports.dangling.length);

  // Prefer molecules that include at least one *new* codebase atom.
  const newAtomCount = ids.filter((id) => CODEBASE_ATOMS.some((a) => a.id === id)).length;
  const newAtomFrac = ids.length ? newAtomCount / ids.length : 0;
  const sealOnly = ids.length > 0 && ids.every((id) => SEAL_CLIQUE.has(id) || id === 'evidence-ledger' || id === 'server-authority');

  // Prefer multi-domain (cross-cutting systems).
  const domainFrac = Math.min(1, domains.length / 3);

  // Prefer fewer dangling ports (more buildable as a closed unit).
  // But leave a little room — one open port often IS the next build surface.
  const danglingPenalty = Math.min(1, ports.dangling.length / 4);

  const chemistry = Number(candidate.finalScore) || 0;

  let score = 0;
  score += 0.22 * chemistry;
  score += 0.20 * evidence.realized;
  score += 0.12 * closure;
  score += 0.28 * newAtomFrac; // the point of this experiment
  score += 0.12 * domainFrac;
  score -= 0.08 * danglingPenalty;
  if (newAtomCount === 0) score = Math.min(score, 0.35); // no extension → not a build proposal
  if (sealOnly && newAtomCount === 0) score = Math.min(score, 0.20);
  if (shipped) score = Math.min(score, 0.12); // hard-cap rediscoveries
  if (evidence.realized < 1) score *= 0.55; // aspirational paths are second-class

  return {
    utility: Math.max(0, Math.min(1, score)),
    shipped,
    evidence,
    ports,
    domains,
    newAtomCount,
    topology: topo,
  };
}

function collapseByTopology(candidates, bankById) {
  const best = new Map();
  for (const candidate of candidates) {
    const scored = { candidate, ...utilityScore(candidate, bankById) };
    const key = scored.topology;
    const prev = best.get(key);
    if (!prev
      || scored.utility > prev.utility
      || (scored.utility === prev.utility
        && (scored.candidate.finalScore ?? 0) > (prev.candidate.finalScore ?? 0))) {
      best.set(key, scored);
    }
  }
  return [...best.values()].sort((a, b) => (
    b.utility - a.utility
    || (b.candidate.finalScore ?? 0) - (a.candidate.finalScore ?? 0)
    || a.topology.localeCompare(b.topology)
  ));
}

function buildWhy(row) {
  const reasons = [];
  if (row.shipped) {
    reasons.push('Already shipped — rediscovery, not a build target.');
    return reasons;
  }
  if (row.evidence.realized === 1) {
    reasons.push('Every atom resolves to a real file in this tree.');
  } else {
    reasons.push(`Evidence gaps: ${row.evidence.missing.map((m) => m.id).join(', ')}.`);
  }
  if (row.newAtomCount > 0) {
    reasons.push(`Includes ${row.newAtomCount} codebase-extension atom(s) absent from the ritual bank.`);
  }
  if (row.domains.length >= 3) {
    reasons.push(`Crosses ${row.domains.length} domains: ${row.domains.join(', ')}.`);
  }
  if (row.ports.dangling.length === 0) {
    reasons.push('Port-closed inside the molecule — can be built as a self-contained unit.');
  } else if (row.ports.dangling.length <= 2) {
    reasons.push(
      `Open ports name the next build surface: ${row.ports.dangling.join(', ')}.`,
    );
  } else {
    reasons.push(`Many open ports (${row.ports.dangling.length}) — likely under-specified.`);
  }
  if ((row.candidate.finalScore ?? 0) >= 0.765) {
    reasons.push(`Cyclotron nucleus score ${row.candidate.finalScore.toFixed(4)}.`);
  }
  return reasons;
}

function renderMarkdown(payload) {
  const lines = [];
  lines.push('# Codebase Nuclei Mining — Results');
  lines.push('');
  lines.push(`**Contract:** \`${payload.contract}\``);
  lines.push(`**Date:** 2026-08-11`);
  lines.push(`**Trials:** ${payload.trials.toLocaleString()} · **Seed:** ${payload.seed}`);
  lines.push(`**Atom bank:** ${payload.atomCount} atoms `
    + `(${payload.baseAtomCount} ritual + ${payload.extensionAtomCount} codebase extensions)`);
  lines.push(`**Report checksum:** \`${payload.cyclotron.checksum}\``);
  lines.push(`**Mine checksum:** \`${payload.checksum}\``);
  lines.push('');
  lines.push('## What this experiment asks');
  lines.push('');
  lines.push('Not "what scores highest chemically." The prior 100k ritual already answered');
  lines.push('that, and the answer collapsed to seal+serializer variants. This run asks:');
  lines.push('');
  lines.push('> Which *unbuilt*, *evidence-real*, *port-coherent* nuclei would help *this* codebase?');
  lines.push('');
  lines.push('## Counts');
  lines.push('');
  lines.push('| metric | value |');
  lines.push('|---|---|');
  lines.push(`| unique molecules | ${payload.cyclotron.counts.uniqueMolecules} |`);
  lines.push(`| shortlisted | ${payload.cyclotron.counts.shortlisted} |`);
  lines.push(`| nuclei (engine) | ${payload.cyclotron.counts.nuclei} |`);
  lines.push(`| hypotheses | ${payload.cyclotron.counts.hypotheses} |`);
  lines.push(`| unique nucleus topologies | ${payload.uniqueNucleusTopologies} |`);
  lines.push(`| unique hypothesis topologies | ${payload.uniqueHypothesisTopologies} |`);
  lines.push(`| already-shipped rediscoveries | ${payload.shippedRediscoveries} |`);
  lines.push(`| build proposals (utility ≥ 0.45) | ${payload.proposals.length} |`);
  lines.push('');
  lines.push('## Top build proposals');
  lines.push('');
  if (!payload.proposals.length) {
    lines.push('_None cleared the utility floor. Inspect hypotheses and widen the bank._');
  }
  let rank = 1;
  for (const row of payload.proposals) {
    const ids = row.atomIds;
    lines.push(`### ${rank}. \`${ids.join(' + ')}\``);
    lines.push('');
    lines.push(`- **utility** ${row.utility.toFixed(4)} · **chemistry** ${row.finalScore.toFixed(4)} · **verdict** ${row.verdict}`);
    lines.push(`- **domains** ${row.domains.join(', ') || '—'}`);
    lines.push(`- **evidence realized** ${(row.evidenceRealized * 100).toFixed(0)}%`);
    lines.push(`- **internal ports** ${row.internalPorts.join(', ') || '—'}`);
    lines.push(`- **open ports** ${row.openPorts.join(', ') || '*(closed)*'}`);
    lines.push('- **why**');
    for (const reason of row.why) lines.push(`  - ${reason}`);
    lines.push('');
    rank += 1;
  }
  lines.push('## Best hit per extension atom');
  lines.push('');
  lines.push('Even when a grammar or sensor atom loses the global ranking, this table');
  lines.push('shows the strongest shortlisted molecule that contains it — or notes absence.');
  lines.push('');
  lines.push('| extension | best molecule | utility | chemistry | verdict |');
  lines.push('|---|---|---|---|---|');
  for (const id of payload.extensionAtomIds) {
    const hit = payload.bestPerExtension?.[id];
    if (!hit) {
      lines.push(`| \`${id}\` | _(not in shortlist)_ | — | — | — |`);
    } else {
      lines.push(`| \`${id}\` | \`${hit.atomIds.join(' + ')}\` | ${hit.utility.toFixed(3)} | ${hit.finalScore.toFixed(4)} | ${hit.verdict} |`);
    }
  }
  lines.push('');
  lines.push('## Shipped rediscoveries (suppressed as build targets)');
  lines.push('');
  if (!payload.rediscoveries.length) {
    lines.push('_None in this shortlist._');
  } else {
    for (const row of payload.rediscoveries) {
      lines.push(`- \`${row.topology}\` · chemistry ${row.finalScore.toFixed(4)} · utility capped ${row.utility.toFixed(4)}`);
    }
  }
  lines.push('');
  lines.push('## Method');
  lines.push('');
  lines.push('1. Start from the ritual atom bank; retarget `diagnostic-event-bus` evidence to the A2 harness.');
  lines.push('2. Append 12 codebase-grounded atoms (sensors, fission/CCG, constellation, healer, tests).');
  lines.push('3. Run the Semantic Valence Cyclotron with occupancy-entropy **on**.');
  lines.push('4. Collapse bond-order isomers to unique sorted atom-id topologies.');
  lines.push('5. Score utility = chemistry + evidence-on-disk + port closure + new-atom fraction + multi-domain − dangling penalty; hard-cap shipped sets.');
  lines.push('');
  lines.push('## Repro');
  lines.push('');
  lines.push('```bash');
  lines.push(`node scripts/mine-codebase-nuclei.mjs --trials=${payload.trials} --seed=${payload.seed} --out=${payload.outPath}`);
  lines.push('```');
  lines.push('');
  lines.push('## Honest limits');
  lines.push('');
  lines.push('- Utility is a **ranking heuristic**, not a measured effect size on the codebase.');
  lines.push('- Building a proposal is a separate decision. This script never writes production code.');
  lines.push('- Nuclei can still be port-coherent and useless; human review before build is mandatory.');
  lines.push('- Entropy and the extended bank change the input class — do not compare chemistry scores 1:1 with the 100k ritual.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function main() {
  const trials = parseIntegerFlag('trials', DEFAULT_TRIALS, 100, 1_000_000);
  const seed = parseIntegerFlag('seed', DEFAULT_SEED, 0, 0xffffffff);
  const outPath = parseStringFlag('out', DEFAULT_OUT);
  const reportPath = parseStringFlag('report', DEFAULT_REPORT);

  const base = retargetBaseAtoms(BASE_ATOMS);
  // De-dupe by id if an extension ever collides.
  const seen = new Set(base.map((a) => a.id));
  const extensions = CODEBASE_ATOMS.filter((a) => {
    if (seen.has(a.id)) {
      console.warn(`skipping extension atom with colliding id: ${a.id}`);
      return false;
    }
    seen.add(a.id);
    return true;
  });
  const blueprints = [...base, ...extensions];
  const bridges = [...BASE_BRIDGES, ...CODEBASE_BRIDGES];

  console.log('Codebase Nuclei Mining');
  console.log(`Bank: ${blueprints.length} atoms (${base.length} base + ${extensions.length} extensions)`);
  console.log(`Bridges: ${bridges.length}`);
  console.log(`Trials: ${trials.toLocaleString()}  seed: ${seed}`);

  // Refuse to mine with broken evidence paths in the *extension* bank —
  // those are supposed to be real. Base bank may still carry aspirational paths.
  const brokenExtensions = extensions.filter((a) => !pathExists(a.evidence[0]));
  if (brokenExtensions.length) {
    throw new Error(
      `extension atoms with missing evidence: ${brokenExtensions.map((a) => `${a.id}->${a.evidence[0]}`).join(', ')}`,
    );
  }

  const groundingIndex = prepareForSynthesize(loadEncyclopediaIndex(process.cwd()));
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
      enabled: true,
      decayLambda: 0.35,
      exactWeight: 4,
      familyWeight: 2,
      neighborhoodWeight: 0.5,
      escapeAttempts: 3,
    },
  });
  const elapsedMs = performance.now() - started;

  if (!verifySemanticCyclotronReport(report)) {
    throw new Error('cyclotron report checksum verification failed');
  }

  const nuclei = report.candidates.filter((c) => c.verdict === 'NUCLEUS');
  const hypotheses = report.candidates.filter((c) => c.verdict === 'HYPOTHESIS');
  // Rank both nuclei and strong hypotheses — utility can promote a high-utility
  // hypothesis above a low-utility rediscovery nucleus.
  const pool = [...nuclei, ...hypotheses.filter((h) => (h.finalScore ?? 0) >= 0.62)];
  const collapsed = collapseByTopology(pool, bankById).map((row) => ({
    ...row,
    why: buildWhy(row),
  }));

  const rediscoveries = collapsed.filter((r) => r.shipped);
  // Build proposals MUST include at least one extension atom. Seal-family
  // rediscovery is reported separately; it is not a "help the codebase" hit.
  const proposals = collapsed
    .filter((r) => !r.shipped
      && r.newAtomCount >= 1
      && r.utility >= 0.40
      && r.evidence.realized >= 0.8)
    .slice(0, 12)
    .map((row) => ({
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
      why: row.why,
      moleculeChecksum: row.candidate.molecule.checksum,
    }));

  // Best shortlisted molecule per extension atom — surfaces grammar/sensor hits
  // even when they lose the global ranking to seal+test hybrids.
  const bestPerExtension = {};
  for (const row of collapsed) {
    for (const id of row.candidate.molecule.atomIds) {
      if (!CODEBASE_ATOMS.some((a) => a.id === id)) continue;
      const prev = bestPerExtension[id];
      if (!prev
        || row.utility > prev.utility
        || (row.utility === prev.utility && row.candidate.finalScore > prev.finalScore)) {
        bestPerExtension[id] = {
          extensionAtom: id,
          topology: row.topology,
          atomIds: row.candidate.molecule.atomIds,
          verdict: row.candidate.verdict,
          finalScore: row.candidate.finalScore,
          utility: Number(row.utility.toFixed(6)),
          openPorts: row.ports.dangling,
          domains: row.domains,
        };
      }
    }
  }

  const uniqueNucleusTopologies = new Set(nuclei.map((n) => topologyKey(n.molecule.atomIds))).size;
  const uniqueHypothesisTopologies = new Set(hypotheses.map((n) => topologyKey(n.molecule.atomIds))).size;

  const body = {
    contract: 'PB-CODEBASE-NUCLEI-MINE-v1',
    schemaVersion: '1.0.0',
    seed,
    trials,
    elapsedMs: Math.round(elapsedMs),
    outPath,
    reportPath,
    atomCount: blueprints.length,
    baseAtomCount: base.length,
    extensionAtomCount: extensions.length,
    extensionAtomIds: extensions.map((a) => a.id),
    shippedTopologies: [...SHIPPED],
    cyclotron: {
      checksum: report.checksum,
      atomBankChecksum: report.atomBankChecksum,
      groundingIndexChecksum: report.groundingIndexChecksum,
      chemistryProvenance: report.chemistryProvenance,
      counts: report.counts,
      control: report.control,
      configuration: report.configuration,
    },
    uniqueNucleusTopologies,
    uniqueHypothesisTopologies,
    shippedRediscoveries: rediscoveries.length,
    proposals,
    bestPerExtension,
    rediscoveries: rediscoveries.map((r) => ({
      topology: r.topology,
      finalScore: r.candidate.finalScore,
      utility: Number(r.utility.toFixed(6)),
    })),
    // Top raw nuclei for audit (before utility filter)
    topEngineNuclei: nuclei.slice(0, 16).map((n) => ({
      atomIds: n.molecule.atomIds,
      finalScore: n.finalScore,
      topology: topologyKey(n.molecule.atomIds),
      shipped: SHIPPED.includes(topologyKey(n.molecule.atomIds)),
    })),
  };

  const { checksum: _drop, ...sealBody } = body;
  body.checksum = `codemine1:${sha256Hex(sealBody)}`;

  writeFileSync(outPath, `${JSON.stringify(body, null, 2)}\n`, 'utf8');
  writeFileSync(reportPath, renderMarkdown(body), 'utf8');

  console.log(`Completed in ${elapsedMs.toFixed(0)} ms`);
  console.log(`Engine nuclei: ${report.counts.nuclei}  unique topologies: ${uniqueNucleusTopologies}`);
  console.log(`Hypotheses: ${report.counts.hypotheses}  unique topologies: ${uniqueHypothesisTopologies}`);
  console.log(`Shipped rediscoveries: ${rediscoveries.length}`);
  console.log(`Build proposals: ${proposals.length}`);
  console.log(`Evidence: ${outPath}`);
  console.log(`Report:   ${reportPath}`);
  console.log(`Mine checksum: ${body.checksum}`);
  console.log('');
  for (const [i, p] of proposals.entries()) {
    console.log(
      `${String(i + 1).padStart(2)}. u=${p.utility.toFixed(3)} chem=${p.finalScore.toFixed(4)}  ${p.atomIds.join(' + ')}`,
    );
    console.log(`    open: ${p.openPorts.join(', ') || '(closed)'}  domains: ${p.domains.join(',')}`);
  }
  console.log('\nBest per extension atom:');
  for (const id of extensions.map((a) => a.id)) {
    const hit = bestPerExtension[id];
    if (!hit) console.log(`  ${id}: (not in shortlist)`);
    else console.log(`  ${id}: u=${hit.utility.toFixed(3)} ${hit.verdict} ${hit.atomIds.join(' + ')}`);
  }
}

main();
