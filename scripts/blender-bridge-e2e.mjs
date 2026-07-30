#!/usr/bin/env node
/**
 * blender-bridge-e2e.mjs — end-to-end driver: wire → Blender → receipt → verdict.
 *
 * This script:
 * 1. Loads a .pbrain packet
 * 2. Projects it to the Python wire
 * 3. Writes the wire JSON to a temp file
 * 4. Invokes Blender headless to ingest, render twice, and emit claims
 * 5. Hashes the pixel dumps JS-side
 * 6. Mints receipts and classifies the divergence
 *
 * Usage: node scripts/blender-bridge-e2e.mjs [packet.pbrain]
 *
 * Requires: Blender at ~/opt/blender/blender (or BLENDER env var)
 */

import { readFileSync, writeFileSync, mkdtempSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { toPythonWire, serializeWirePacket } from '../codex/core/blender-bridge/wire.js';
import { mintReceipt, compareReceipts, hashPixelDump } from '../codex/core/blender-bridge/receipt.js';

const BLENDER = process.env.BLENDER || join(process.env.HOME, 'opt/blender/blender');
const REPO_ROOT = process.cwd();
const ADDON_DIR = join(REPO_ROOT, 'blender/addons');

const packetPath = process.argv[2] || 'output/holy_fire_claymore.pbrain';

if (!existsSync(BLENDER)) {
  console.error(`ERROR: Blender not found at ${BLENDER}`);
  console.error('Set BLENDER env var to the correct path.');
  process.exit(1);
}

if (!existsSync(packetPath)) {
  console.error(`ERROR: packet not found: ${packetPath}`);
  process.exit(1);
}

console.log(`[e2e] Loading packet: ${packetPath}`);
const packet = JSON.parse(readFileSync(packetPath, 'utf8'));

console.log(`[e2e] Projecting to Python wire (colorPolicy=EXACT)...`);
const wire = toPythonWire(packet, { colorPolicy: 'EXACT' });
console.log(`[e2e] Wire: ${wire.coordinateCount} coordinates, checksum=${wire.sourceChecksum}`);

const workDir = mkdtempSync(join(tmpdir(), 'pb-e2e-'));
const wirePath = join(workDir, 'wire.json');
writeFileSync(wirePath, serializeWirePacket(packet, { colorPolicy: 'EXACT' }));
console.log(`[e2e] Wire written to: ${wirePath}`);

// Generate the Blender Python script
const blenderScript = `
import sys, json, os
sys.path.insert(0, ${JSON.stringify(ADDON_DIR)})

from scholomance_pixelbrain.packet import decode_wire, verify_seal
from scholomance_pixelbrain.ingest import ingest_wire
from scholomance_pixelbrain.render_claim import (
    apply_color_policy, configure_deterministic_render, dump_pixels_f32, emit_claim
)

wire_path = ${JSON.stringify(wirePath)}
work_dir = ${JSON.stringify(workDir)}

with open(wire_path) as f:
    wire = decode_wire(f.read())

verify_seal(wire, wire["sourceChecksum"])
print(f"[blender] Seal verified: {wire['sourceChecksum']}")

obj = ingest_wire(wire)
print(f"[blender] Ingested {wire['coordinateCount']} coordinates as {obj.name}")

import bpy
scene = bpy.context.scene
scene.render.resolution_x = 160
scene.render.resolution_y = 160

apply_color_policy(scene, wire["colorPolicy"])
configure_deterministic_render(scene, seed=7, samples=64, threads=8)

# Render 1
dump1 = dump_pixels_f32(os.path.join(work_dir, "render1"))
claim1 = emit_claim(scene, wire, dump1)
with open(os.path.join(work_dir, "claim1.json"), "w") as f:
    json.dump(claim1, f)
print(f"[blender] Render 1 complete: {dump1}")

# Render 2
dump2 = dump_pixels_f32(os.path.join(work_dir, "render2"))
claim2 = emit_claim(scene, wire, dump2)
with open(os.path.join(work_dir, "claim2.json"), "w") as f:
    json.dump(claim2, f)
print(f"[blender] Render 2 complete: {dump2}")

print("[blender] Done.")
`;

const scriptPath = join(workDir, 'render.py');
writeFileSync(scriptPath, blenderScript);

console.log(`[e2e] Invoking Blender headless...`);
try {
  const output = execSync(
    `"${BLENDER}" -b --factory-startup --python "${scriptPath}"`,
    { encoding: 'utf8', timeout: 300000, stdio: ['pipe', 'pipe', 'pipe'] }
  );
  console.log(output.split('\n').filter(l => l.startsWith('[blender]')).join('\n'));
} catch (err) {
  console.error('[e2e] Blender failed:');
  console.error(err.stderr || err.message);
  process.exit(1);
}

// Hash pixel dumps JS-side
console.log('[e2e] Hashing pixel dumps...');
const dump1Path = join(workDir, 'render1.f32');
const dump2Path = join(workDir, 'render2.f32');

if (!existsSync(dump1Path) || !existsSync(dump2Path)) {
  console.error('[e2e] ERROR: pixel dump files not found');
  process.exit(1);
}

const hash1 = hashPixelDump(dump1Path);
const hash2 = hashPixelDump(dump2Path);
console.log(`[e2e] Render 1 hash: ${hash1}`);
console.log(`[e2e] Render 2 hash: ${hash2}`);

// Load claims and mint receipts
const claim1 = JSON.parse(readFileSync(join(workDir, 'claim1.json'), 'utf8'));
const claim2 = JSON.parse(readFileSync(join(workDir, 'claim2.json'), 'utf8'));

const receipt1 = mintReceipt(claim1, hash1);
const receipt2 = mintReceipt(claim2, hash2);

console.log(`[e2e] Receipt 1 SCD64: ${receipt1.scd64}`);
console.log(`[e2e] Receipt 2 SCD64: ${receipt2.scd64}`);

// Compare
const result = compareReceipts(receipt1, receipt2);
console.log(`\n[e2e] ═══════════════════════════════════════`);
console.log(`[e2e] VERDICT: ${result.verdict}`);
console.log(`[e2e] Matching blocks: ${result.matchingBlocks}/8`);
console.log(`[e2e] Pixel match: ${result.pixelMatch}`);
console.log(`[e2e] Different blocks: ${result.differentBlocks.join(', ') || '(none)'}`);
console.log(`[e2e] ═══════════════════════════════════════`);

if (result.verdict === 'REPRODUCED') {
  console.log('[e2e] ✓ Determinism holds. Two renders, identical pixels.');
  process.exit(0);
} else {
  console.error(`[e2e] ✗ Expected REPRODUCED, got ${result.verdict}`);
  process.exit(1);
}
