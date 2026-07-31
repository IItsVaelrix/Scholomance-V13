#!/usr/bin/env node
/**
 * blender-sim-e2e.mjs — simulation chained receipt E2E.
 *
 * This script:
 * 1. Creates a rigid body scene in Blender (cube falling onto plane)
 * 2. Steps frames 1..N in order (warm path)
 * 3. Renders each frame, dumps float32 pixels, emits per-frame claims
 * 4. Builds the digest chain JS-side
 * 5. Mints chained receipts
 * 6. Verifies the chain
 * 7. Checks for cold-start refusal
 *
 * SYNTH_CLASS is SIMULATED: endpoint verification is invalid here.
 * Frame N cannot be sealed without N−1.
 *
 * Usage: node scripts/blender-sim-e2e.mjs [frameCount]
 * Requires: Blender at ~/opt/blender/blender (or BLENDER env var)
 */

import { readFileSync, writeFileSync, mkdtempSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { runSimE2E, compareSimRuns } from '../codex/core/blender-bridge/sim-e2e.js';
import { runBlenderScript, BlenderRunError } from '../codex/core/blender-bridge/blender-run.js';

const BLENDER = process.env.BLENDER || join(process.env.HOME, 'opt/blender/blender');
const REPO_ROOT = process.cwd();
const ADDON_DIR = join(REPO_ROOT, 'blender/addons');
const FRAME_COUNT = parseInt(process.argv[2] || '5', 10);

if (!existsSync(BLENDER)) {
  console.error(`ERROR: Blender not found at ${BLENDER}`);
  process.exit(1);
}

// Falsifier 1, same as the bridge E2E. This driver reported
// "sim_manifest.json not found" for an AttributeError, because Blender exits 0
// on an uncaught traceback and execSync only throws on a non-zero exit — the
// missing manifest was a downstream symptom of an error it could not see.
if (process.argv.includes('--self-test')) {
  const selfDir = mkdtempSync(join(tmpdir(), 'pb-sim-selftest-'));
  let detected = false;
  try {
    runBlenderScript({
      blender: BLENDER,
      body: 'raise RuntimeError("deliberate self-test failure")',
      scriptPath: join(selfDir, 'selftest.py'),
    });
  } catch (err) {
    detected = err instanceof BlenderRunError;
  }
  console.log(`[sim-e2e] self-test: Blender failure detected = ${detected}`);
  process.exit(detected ? 0 : 1);
}

const workDir = mkdtempSync(join(tmpdir(), 'pb-sim-e2e-'));
console.log(`[sim-e2e] Work dir: ${workDir}`);
console.log(`[sim-e2e] Frame count: ${FRAME_COUNT}`);

const blenderScript = `
import json, os
sys.path.insert(0, ${JSON.stringify(ADDON_DIR)})

import bpy
from scholomance_pixelbrain.sim_scene import (
    create_rigid_body_scene, setup_rigid_body_world
)
from scholomance_pixelbrain.sim_claim import render_frame_range
from scholomance_pixelbrain.render_claim import apply_color_policy

work_dir = ${JSON.stringify(workDir)}
frame_count = ${FRAME_COUNT}

# Create rigid body scene
plane, cube = create_rigid_body_scene()
scene = bpy.context.scene
setup_rigid_body_world(scene, substeps_per_frame=10, solver_iterations=10)

# Configure render
scene.render.resolution_x = 160
scene.render.resolution_y = 160

# Wire packet (minimal — sim scene is Blender-native, not PixelBrain-ingested)
wire = {
    "packetId": "sim-rigid-body-test",
    "sourceChecksum": "SIM_SEAL_001",
    "colorPolicy": "SYNTHESIZED",
    "coordinateCount": 0,
}

# Render frame range in order (warm path)
results = render_frame_range(
    scene, wire, work_dir,
    frame_start=1, frame_end=frame_count,
    seed=7, samples=64, threads=8,
)

print(f"[blender] Rendered {len(results)} frames")
for i, (dump_path, claim) in enumerate(results):
    print(f"[blender] Frame {i}: {dump_path}")

print("[blender] Done.")
`;

console.log('[sim-e2e] Invoking Blender headless...');
try {
  const { blenderLines } = runBlenderScript({
    blender: BLENDER,
    body: blenderScript,
    scriptPath: join(workDir, 'sim_render.py'),
    timeout: 600000,
  });
  console.log(blenderLines.join('\n'));
} catch (err) {
  console.error('[sim-e2e] Blender failed:');
  console.error(err.stderr || err.message);
  process.exit(1);
}

// Load manifest
const manifestPath = join(workDir, 'sim_manifest.json');
if (!existsSync(manifestPath)) {
  console.error('[sim-e2e] ERROR: sim_manifest.json not found');
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
console.log(`[sim-e2e] Manifest: ${manifest.frameCount} frames, seal=${manifest.sourceChecksum}`);

// Collect dump paths
const dumpPaths = manifest.claims.map((c) => c.pixelDumpPath);
for (const p of dumpPaths) {
  if (!existsSync(p)) {
    console.error(`[sim-e2e] ERROR: dump not found: ${p}`);
    process.exit(1);
  }
}

// Run simulation E2E
console.log('[sim-e2e] Building digest chain...');
const result = runSimE2E(manifest, { dumpPaths });

console.log(`\n[sim-e2e] ═══════════════════════════════════════`);
console.log(`[sim-e2e] Seal: ${result.seal}`);
console.log(`[sim-e2e] Frames: ${result.frameCount}`);
console.log(`[sim-e2e] Chain valid: ${result.verification.valid}`);
console.log(`[sim-e2e] First bad frame: ${result.verification.firstBadFrame}`);
console.log(`[sim-e2e] Cold start detected: ${result.anyColdStart}`);
console.log(`[sim-e2e] Self-comparison: ${result.selfComparison.verdict}`);
console.log(`[sim-e2e] Chain digests:`);
for (const entry of result.chain) {
  console.log(`[sim-e2e]   Frame ${entry.frame}: ${entry.digest.slice(0, 16)}...`);
}
console.log(`[sim-e2e] ═══════════════════════════════════════`);

if (result.verification.valid && !result.anyColdStart && result.selfComparison.verdict === 'REPRODUCED') {
  console.log('[sim-e2e] ✓ Chain intact. No cold starts. Self-comparison REPRODUCED.');
  process.exit(0);
} else {
  console.error('[sim-e2e] ✗ Chain verification failed.');
  process.exit(1);
}
