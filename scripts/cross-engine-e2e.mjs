#!/usr/bin/env node
/**
 * cross-engine-e2e.mjs — cross-engine comparison: Blender vs Remotion canvas.
 *
 * This script:
 * 1. Loads a .pbrain packet
 * 2. Projects it to the Python wire
 * 3. Renders via the Remotion canvas renderer (pure JS)
 * 4. Invokes Blender headless to render the same wire
 * 5. Mints receipts from both engines
 * 6. Compares cross-engine: expects CAUSES_AGREE on shared slots, PIXELS_DIVERGE
 *
 * The healthy state: both engines consumed the same truth and produced their
 * own honest render. CAUSES_AGREE + PIXELS_DIVERGE.
 *
 * Usage: node scripts/cross-engine-e2e.mjs [packet.pbrain]
 * Requires: Blender at ~/opt/blender/blender (or BLENDER env var)
 */

import { readFileSync, writeFileSync, mkdtempSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { toPythonWire, serializeWirePacket } from '../codex/core/blender-bridge/wire.js';
import { mintReceipt, hashPixelDump } from '../codex/core/blender-bridge/receipt.js';
import { crossEngineRender } from '../codex/core/blender-bridge/remotion-canvas-renderer.js';
import { compareCrossEngine, expectedCrossEngineAgreement } from '../codex/core/blender-bridge/cross-engine.js';
import { loadPbrainFile } from '../codex/core/pixelbrain/pbrain-checksum.js';

const BLENDER = process.env.BLENDER || join(process.env.HOME, 'opt/blender/blender');
const REPO_ROOT = process.cwd();
const ADDON_DIR = join(REPO_ROOT, 'blender/addons');
const packetPath = process.argv[2] || 'output/holy_fire_claymore.pbrain';

if (!existsSync(packetPath)) {
  console.error(`ERROR: packet not found: ${packetPath}`);
  process.exit(1);
}

console.log(`[x-engine] Loading packet: ${packetPath}`);
let packet;
try {
  packet = loadPbrainFile(packetPath);
} catch (error) {
  console.error(`\n${error.message}\n`);
  process.exit(1);
}
const wire = toPythonWire(packet, { colorPolicy: 'EXACT' });
console.log(`[x-engine] Wire: ${wire.coordinateCount} coordinates, checksum=${wire.sourceChecksum}`);

// ── Remotion canvas render (pure JS, no Blender needed) ──
console.log('[x-engine] Rendering via Remotion canvas (pure JS)...');
const canvasResult = crossEngineRender(wire);
const canvasReceipt = mintReceipt(canvasResult.claim, canvasResult.pixelHash);
console.log(`[x-engine] Canvas: ${canvasResult.renderResult.pixelsDrawn} pixels, hash=${canvasResult.pixelHash.slice(0, 16)}...`);
console.log(`[x-engine] Canvas receipt SCD64: ${canvasReceipt.scd64}`);

// ── Blender render (requires Blender binary) ──
if (!existsSync(BLENDER)) {
  console.log('[x-engine] Blender not found — skipping Blender render.');
  console.log('[x-engine] Canvas-only mode: cross-engine comparison requires both engines.');
  console.log('[x-engine] Set BLENDER env var to enable full comparison.');
  process.exit(0);
}

const workDir = mkdtempSync(join(tmpdir(), 'pb-xengine-'));
const wirePath = join(workDir, 'wire.json');
writeFileSync(wirePath, serializeWirePacket(packet, { colorPolicy: 'EXACT' }));

const blenderScript = `
import sys, json, os
sys.path.insert(0, ${JSON.stringify(ADDON_DIR)})
from scholomance_pixelbrain.packet import decode_wire, verify_seal
from scholomance_pixelbrain.ingest import ingest_wire
from scholomance_pixelbrain.render_claim import (
    apply_color_policy, configure_deterministic_render, dump_pixels_f32, emit_claim
)
import bpy

wire_path = ${JSON.stringify(wirePath)}
work_dir = ${JSON.stringify(workDir)}

with open(wire_path) as f:
    wire = decode_wire(f.read())
verify_seal(wire, wire["sourceChecksum"])

obj = ingest_wire(wire)
scene = bpy.context.scene
scene.render.resolution_x = ${wire.canvas.width}
scene.render.resolution_y = ${wire.canvas.height}

apply_color_policy(scene, wire["colorPolicy"])
configure_deterministic_render(scene, seed=7, samples=64, threads=8)

dump = dump_pixels_f32(os.path.join(work_dir, "blender_render"))
claim = emit_claim(scene, wire, dump)
with open(os.path.join(work_dir, "blender_claim.json"), "w") as f:
    json.dump(claim, f)
print(f"[blender] Render complete: {dump}")
`;

const scriptPath = join(workDir, 'render.py');
writeFileSync(scriptPath, blenderScript);

console.log('[x-engine] Invoking Blender headless...');
try {
  const output = execSync(
    `"${BLENDER}" -b --factory-startup --python "${scriptPath}"`,
    { encoding: 'utf8', timeout: 300000, stdio: ['pipe', 'pipe', 'pipe'] }
  );
  console.log(output.split('\n').filter(l => l.startsWith('[blender]')).join('\n'));
} catch (err) {
  console.error('[x-engine] Blender failed:');
  console.error(err.stderr || err.message);
  process.exit(1);
}

// Hash Blender pixel dump JS-side
const blenderDumpPath = join(workDir, 'blender_render.f32');
if (!existsSync(blenderDumpPath)) {
  console.error('[x-engine] ERROR: Blender pixel dump not found');
  process.exit(1);
}

const blenderHash = hashPixelDump(blenderDumpPath);
const blenderClaim = JSON.parse(readFileSync(join(workDir, 'blender_claim.json'), 'utf8'));
const blenderReceipt = mintReceipt(blenderClaim, blenderHash);
console.log(`[x-engine] Blender receipt SCD64: ${blenderReceipt.scd64}`);

// ── Cross-engine comparison ──
console.log('\n[x-engine] ═══════════════════════════════════════');
const comparison = compareCrossEngine(blenderReceipt, canvasReceipt, {
  engineA: 'blender',
  engineB: 'remotion-canvas',
});

console.log(`[x-engine] Verdict: ${comparison.verdict}`);
console.log(`[x-engine] Healthy: ${comparison.healthy}`);
console.log(`[x-engine] Matching causes: ${comparison.matchingCauses}/7`);
console.log(`[x-engine] Pixels agree: ${comparison.pixelsAgree}`);
console.log(`[x-engine] Divergent causes: ${comparison.divergentCauses.join(', ') || '(none)'}`);

// Check against expected agreement table
const expected = expectedCrossEngineAgreement();
console.log('\n[x-engine] Slot-by-slot:');
for (const slot of comparison.causeSlots) {
  const expectation = expected[slot.name];
  const status = slot.match ? 'MATCH' : 'DIFFER';
  const ok = (expectation === 'SHOULD_AGREE' && slot.match) ||
             (expectation === 'EXPECTED_DIVERGE' && !slot.match) ||
             expectation === 'MAY_DIVERGE';
  console.log(`[x-engine]   ${slot.name.padEnd(15)} ${status.padEnd(8)} expected=${expectation.padEnd(18)} ${ok ? '✓' : '✗'}`);
}
console.log(`[x-engine]   PIXEL_RECEIPT   ${comparison.pixelsAgree ? 'MATCH' : 'DIFFER'}   expected=EXPECTED_DIVERGE  ${!comparison.pixelsAgree ? '✓' : '✗'}`);
console.log('[x-engine] ═══════════════════════════════════════');

// The healthy state: shared causes agree, pixels diverge
const sharedSlots = ['SYNTH_CLASS', 'COLOR_LAW', 'SCENE_GRAPH'];
const sharedAgree = sharedSlots.every(name =>
  comparison.causeSlots.find(s => s.name === name)?.match
);
const pixelsDiverge = !comparison.pixelsAgree;

if (sharedAgree && pixelsDiverge) {
  console.log('[x-engine] ✓ HEALTHY: shared causes agree, pixels diverge.');
  console.log('[x-engine]   Both engines consumed the same truth and produced their own honest render.');
  process.exit(0);
} else {
  console.error('[x-engine] ✗ UNHEALTHY: expected shared causes to agree and pixels to diverge.');
  process.exit(1);
}
