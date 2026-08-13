#!/usr/bin/env node
/**
 * Patrol verified cleri-probe findings with the Spatial Immune Orchestrator.
 *
 *   node scripts/antigen-sweep.mjs --output sweep.json
 *   node scripts/macrophage-sweep.mjs sweep.json
 *
 * This is a DRIVER, not an engine. The field, the chemotaxis and the agents all
 * live in SpatialImmuneOrchestrator (Scholo-Theory 003). All this adds is the
 * two things the orchestrator cannot know on its own:
 *
 *   WHERE each file sits   — registerNode with coupling-derived coordinates.
 *                            Skip it and injectPrionResonance falls back to
 *                            _hashToCoord, scattering files at random, and the
 *                            agents patrol noise.
 *   HOW LOUDLY it calls    — resonance weighted by triage class, so the file
 *                            with 40 correct error handlers does not outrank
 *                            the one with three silent fallbacks.
 *
 * The agents report. A human fixes.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SpatialImmuneOrchestrator } from '../codex/core/immunity/spatial-immune-orchestrator.js';
import {
  buildImportGraph, anchorByCoupling, couplingLocality,
  resonanceByFile, classifyFinding, readSource,
} from '../codex/core/immunity/macrophage-sweep.js';

const ROOT = resolve(fileURLToPath(import.meta.url), '../..');

function main() {
  const reportPath = process.argv[2];
  if (!reportPath) {
    console.error('usage: node scripts/macrophage-sweep.mjs <antigen-sweep.json> [--ticks N]');
    process.exitCode = 2;
    return;
  }
  const tickIndex = process.argv.indexOf('--ticks');
  const ticks = tickIndex !== -1 ? Number(process.argv[tickIndex + 1]) : 25;

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
      description: 'swallowed error returning a degraded-but-valid value',
    });
  }
  console.log(`anchored ${anchors.size} nodes, injected ${resonance.size} prion resonances`);

  const absorbed = [];
  for (let tick = 0; tick < ticks; tick += 1) {
    for (const diagnostic of orchestrator.tick() ?? []) {
      absorbed.push({ tick, agent: diagnostic.agentId, file: (diagnostic.payload?.filePaths ?? [])[0] });
    }
  }

  console.log(`\n════ ${absorbed.length} PAYLOADS ABSORBED AT LOCAL MAXIMA (agents report; a human fixes) ════`);
  for (const hit of absorbed) {
    console.log(`  tick ${String(hit.tick).padStart(2)}  ${hit.agent}  →  ${hit.file}`
      + `   resonance ${(resonance.get(hit.file) ?? 0).toFixed(3)}`);
  }
  if (absorbed.length === 0) {
    console.log('  none — agents found no local maximum. That is UNKNOWN, not clean:');
    console.log('  check the coupling lift above and whether any resonance was injected.');
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
