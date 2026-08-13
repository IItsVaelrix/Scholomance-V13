#!/usr/bin/env node
/**
 * Patrol verified cleri-probe findings with the Spatial Immune Orchestrator,
 * carrying the pathology's VACCINE so every absorbed payload arrives with the
 * repair that retires it.
 *
 *   node scripts/antigen-sweep.mjs --output sweep.json
 *   node scripts/macrophage-sweep.mjs sweep.json [--ticks N] [--seal envelope.json]
 *
 * This is a DRIVER, not an engine. The field, the agents and the chemotaxis all
 * live in SpatialImmuneOrchestrator (Scholo-Theory 003); the vaccine, pulse and
 * memory envelope live in the BytecodeXP modules. All this adds is the three
 * things none of them can know on their own:
 *
 *   WHERE each file sits  — registerNode with coupling-derived coordinates.
 *                           Skip it and injectPrionResonance falls back to
 *                           _hashToCoord and the agents patrol noise.
 *   HOW LOUDLY it calls   — resonance weighted by triage, so a file with forty
 *                           correct error handlers does not outrank one with
 *                           three silent fallbacks.
 *   WHAT RETIRES IT       — the vaccine's recoveryKey and safePattern, attached
 *                           to every diagnostic an agent absorbs.
 *
 * The agents report. A human fixes.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SpatialImmuneOrchestrator } from '../codex/core/immunity/spatial-immune-orchestrator.js';
import { mintPathologyVaccine, pulseFromFindings } from '../codex/core/immunity/pathology-vaccine.js';
import { buildBytecodeXPMemoryEnvelope, verifyBytecodeXPMemoryEnvelope } from '../codex/core/diagnostic/QbitMemoryPersistence.js';
import {
  buildImportGraph, anchorByCoupling, couplingLocality,
  resonanceByFile, classifyFinding, readSource, DISTRESS_WEIGHTS,
} from '../codex/core/immunity/macrophage-sweep.js';

const ROOT = resolve(fileURLToPath(import.meta.url), '../..');

/** The pathology this sweep immunises against. */
const SWALLOWED_ERROR = Object.freeze({
  pathologyClass: 'SWALLOWED_ERROR',
  verifierId: 'swallowed-error/v1',
  recoveryKey: 'fallback',
  safePattern: 'catch (error) { return { ok: false, error, fallback: [] }; }',
});

function flag(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? null : process.argv[index + 1];
}

function main() {
  const reportPath = process.argv[2];
  if (!reportPath) {
    console.error('usage: node scripts/macrophage-sweep.mjs <antigen-sweep.json> [--ticks N] [--seal out.json]');
    process.exitCode = 2;
    return;
  }
  const ticks = Number(flag('ticks') ?? 25);

  const sweep = JSON.parse(readFileSync(reportPath, 'utf8'));
  const findings = sweep.results.flatMap((r) => r.findings).filter((f) => f.path);
  const paths = [...new Set(findings.map((f) => f.path))].sort();

  const read = readSource(ROOT);
  const lineCache = new Map();
  const linesOf = (p) => {
    if (!lineCache.has(p)) lineCache.set(p, read(p)?.split('\n') ?? null);
    return lineCache.get(p);
  };
  const classOf = (f) => classifyFinding(linesOf(f.path), f.line);

  const triage = {};
  for (const f of findings) triage[classOf(f)] = (triage[classOf(f)] ?? 0) + 1;
  console.log(`findings ${findings.length} across ${paths.length} files`);
  console.log('triage:', JSON.stringify(triage));

  // ── The vaccine: recognition plus the sanctioned repair ────────────────────
  const vaccine = mintPathologyVaccine(SWALLOWED_ERROR);
  console.log(`vaccine ${vaccine.bytecode}`);
  console.log(`  recovery: ${vaccine.recoveryKey}  →  ${vaccine.stableContext.safePattern}`);

  const graph = buildImportGraph(paths, read);
  const anchors = anchorByCoupling(paths, graph);
  const locality = couplingLocality(anchors, graph);
  console.log(`coupling lift ${locality.lift.toFixed(1)}x `
    + `(${(locality.observed * 100).toFixed(1)}% of adjacent anchors coupled vs ${(locality.chance * 100).toFixed(2)}% by chance)`);
  if (locality.lift < 2) {
    console.log('  WARNING: anchoring barely encodes coupling — agents are patrolling noise.');
  }

  const orchestrator = new SpatialImmuneOrchestrator({ agentCount: 5 });
  for (const [path, coord] of anchors) orchestrator.registerNode(path, coord.x, coord.y, coord.z);

  const resonance = resonanceByFile(findings, classOf);
  for (const [path, energy] of resonance) {
    orchestrator.injectPrionResonance(path, 'silent-failure-swallowed-error', energy, {
      // The description is the only field injectPrionResonance carries into the
      // payload, so the repair travels with the distress signal.
      description: `swallowed error returning a degraded-but-valid value — retire with ${vaccine.stableContext.safePattern}`,
    });
  }
  console.log(`anchored ${anchors.size} nodes, injected ${resonance.size} prion resonances`);

  const absorbed = [];
  for (let tick = 0; tick < ticks; tick += 1) {
    for (const diagnostic of orchestrator.tick() ?? []) {
      absorbed.push({ tick, agent: diagnostic.agentId, file: (diagnostic.payload?.filePaths ?? [])[0] });
    }
  }

  console.log(`\n════ ${absorbed.length} PAYLOADS ABSORBED (agents report; a human fixes) ════`);
  for (const hit of absorbed) {
    console.log(`  tick ${String(hit.tick).padStart(2)}  ${hit.agent}  →  ${hit.file}`);
    console.log(`        resonance ${(resonance.get(hit.file) ?? 0).toFixed(3)}   `
      + `vaccine ${vaccine.vaccineId}   retire with recoveryKey '${vaccine.recoveryKey}'`);
  }
  if (absorbed.length === 0) {
    console.log('  none — agents found no local maximum. That is UNKNOWN, not clean:');
    console.log('  check the coupling lift above and whether any resonance was injected.');
  }

  // ── Seal the patrol so it outlives the process ─────────────────────────────
  const sealPath = flag('seal');
  if (sealPath) {
    const pulse = pulseFromFindings(vaccine, findings, {
      weightOf: (f) => DISTRESS_WEIGHTS[classOf(f)] ?? DISTRESS_WEIGHTS.SKIP_ONLY,
      reason: 'triage-weighted patrol',
    });
    const envelope = buildBytecodeXPMemoryEnvelope({
      vaccine,
      pulse,
      // Provenance rides in LABELS, not in `provenance`. QbitMemoryPersistence's
      // normalizeProvenance keeps only source/pdr/phase/createdBy, and its
      // enrichment allowlist predates buildQbitHotspotsFromCleriReport — so
      // reportId, status, verifiedFindings and coverageComplete are all dropped
      // on the floor. Labels survive verbatim, so identifiers go there until
      // that seam is widened deliberately.
      labels: [
        SWALLOWED_ERROR.pathologyClass,
        `absorbed:${absorbed.length}`,
        `files:${paths.length}`,
        `findings:${findings.length}`,
        `couplingLift:${locality.lift.toFixed(1)}`,
      ],
      provenance: { source: 'macrophage-sweep', createdBy: 'spatial-immune-orchestrator' },
    });
    writeFileSync(sealPath, `${JSON.stringify(envelope, null, 2)}\n`);
    console.log(`\nsealed → ${sealPath}`);
    console.log(`  memoryKey ${envelope.memoryKey}   verifies ${verifyBytecodeXPMemoryEnvelope(envelope)}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
