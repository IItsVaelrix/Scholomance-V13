#!/usr/bin/env node
/**
 * blender-palette-e2e.mjs — school palette E2E.
 *
 * This script:
 * 1. Loads a .pbrain packet and projects to wire
 * 2. Serializes the school palette to wire format
 * 3. Invokes Blender headless to ingest the asset, create the palette
 *    node group, apply it to a material, render, and dump pixels
 * 4. Hashes the pixel dump JS-side
 * 5. Mints a receipt
 * 6. Renders twice to verify determinism (REPRODUCED)
 *
 * Under EXACT policy the authored hex must survive byte-exact.
 * The transfer function (sRGB → linear) is recorded in COLOR_LAW.
 *
 * Usage: node scripts/blender-palette-e2e.mjs [packet.pbrain] [school]
 * Requires: Blender at ~/opt/blender/blender (or BLENDER env var)
 */

import { readFileSync, writeFileSync, mkdtempSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { toPythonWire, serializeWirePacket } from '../codex/core/blender-bridge/wire.js';
import { paletteToWire } from '../codex/core/blender-bridge/palette-wire.js';
import { runPaletteE2E } from '../codex/core/blender-bridge/palette-e2e.js';
import { compareReceipts } from '../codex/core/blender-bridge/receipt.js';

const BLENDER = process.env.BLENDER || join(process.env.HOME, 'opt/blender/blender');
const REPO_ROOT = process.cwd();
const ADDON_DIR = join(REPO_ROOT, 'blender/addons');
const packetPath = process.argv[2] || 'output/holy_fire_claymore.pbrain';
const school = process.argv[3] || 'ALCHEMY';

if (!existsSync(BLENDER)) {
  console.error(`ERROR: Blender not found at ${BLENDER}`);
  process.exit(1);
}

if (!existsSync(packetPath)) {
  console.error(`ERROR: packet not found: ${packetPath}`);
  process.exit(1);
}

console.log(`[palette-e2e] Loading packet: ${packetPath}`);
console.log(`[palette-e2e] School: ${school}`);

const packet = JSON.parse(readFileSync(packetPath, 'utf8'));
const wire = toPythonWire(packet, { colorPolicy: 'EXACT' });
const paletteWire = paletteToWire(school, { colorPolicy: 'EXACT' });

console.log(`[palette-e2e] Wire: ${wire.coordinateCount} coordinates`);
console.log(`[palette-e2e] Palette: ${paletteWire.school}, transfer=${paletteWire.transferFunction}`);

const workDir = mkdtempSync(join(tmpdir(), 'pb-palette-e2e-'));
const wirePath = join(workDir, 'wire.json');
const palettePath = join(workDir, 'palette.json');
writeFileSync(wirePath, serializeWirePacket(packet, { colorPolicy: 'EXACT' }));
writeFileSync(palettePath, JSON.stringify(paletteWire));

const blenderScript = `
import sys, json, os
sys.path.insert(0, ${JSON.stringify(ADDON_DIR)})

import bpy
from scholomance_pixelbrain.packet import decode_wire, verify_seal
from scholomance_pixelbrain.ingest import ingest_wire
from scholomance_pixelbrain.palette import create_palette_node_group, apply_palette_to_material
from scholomance_pixelbrain.render_claim import (
    apply_color_policy, configure_deterministic_render, dump_pixels_f32, emit_claim
)

wire_path = ${JSON.stringify(wirePath)}
palette_path = ${JSON.stringify(palettePath)}
work_dir = ${JSON.stringify(workDir)}
school = ${JSON.stringify(school)}

with open(wire_path) as f:
    wire = decode_wire(f.read())
with open(palette_path) as f:
    palette_wire = json.load(f)

verify_seal(wire, wire["sourceChecksum"])
obj = ingest_wire(wire)

# Create palette node group and apply to a material
mat = bpy.data.materials.new("PB_PaletteMaterial")
apply_palette_to_material(mat, school, palette_wire)
obj.data.materials.append(mat)

scene = bpy.context.scene
scene.render.resolution_x = 160
scene.render.resolution_y = 160

apply_color_policy(scene, wire["colorPolicy"])
configure_deterministic_render(scene, seed=7, samples=64, threads=8)

# Render 1
dump1 = dump_pixels_f32(os.path.join(work_dir, "palette_render1"))
claim1 = emit_claim(scene, wire, dump1)
with open(os.path.join(work_dir, "claim1.json"), "w") as f:
    json.dump(claim1, f)

# Render 2
dump2 = dump_pixels_f32(os.path.join(work_dir, "palette_render2"))
claim2 = emit_claim(scene, wire, dump2)
with open(os.path.join(work_dir, "claim2.json"), "w") as f:
    json.dump(claim2, f)

print(f"[blender] Palette render complete: school={school}")
print("[blender] Done.")
`;

const scriptPath = join(workDir, 'palette_render.py');
writeFileSync(scriptPath, blenderScript);

console.log('[palette-e2e] Invoking Blender headless...');
try {
  const output = execSync(
    `"${BLENDER}" -b --factory-startup --python "${scriptPath}"`,
    { encoding: 'utf8', timeout: 300000, stdio: ['pipe', 'pipe', 'pipe'] }
  );
  console.log(output.split('\n').filter(l => l.startsWith('[blender]')).join('\n'));
} catch (err) {
  console.error('[palette-e2e] Blender failed:');
  console.error(err.stderr || err.message);
  process.exit(1);
}

// Load claims and run palette E2E
const claim1 = JSON.parse(readFileSync(join(workDir, 'claim1.json'), 'utf8'));
const claim2 = JSON.parse(readFileSync(join(workDir, 'claim2.json'), 'utf8'));
const dump1Path = join(workDir, 'palette_render1.f32');
const dump2Path = join(workDir, 'palette_render2.f32');

const result1 = runPaletteE2E(claim1, { dumpPath: dump1Path, school, colorPolicy: 'EXACT' });
const result2 = runPaletteE2E(claim2, { dumpPath: dump2Path, school, colorPolicy: 'EXACT' });

console.log(`\n[palette-e2e] ═══════════════════════════════════════`);
console.log(`[palette-e2e] School: ${result1.school}`);
console.log(`[palette-e2e] Palette valid: ${result1.validation.valid}`);
console.log(`[palette-e2e] Render 1 hash: ${result1.pixelHash.slice(0, 16)}...`);
console.log(`[palette-e2e] Render 2 hash: ${result2.pixelHash.slice(0, 16)}...`);
console.log(`[palette-e2e] Receipt 1 SCD64: ${result1.receipt.scd64}`);
console.log(`[palette-e2e] Receipt 2 SCD64: ${result2.receipt.scd64}`);

const comparison = compareReceipts(result1.receipt, result2.receipt);
console.log(`[palette-e2e] VERDICT: ${comparison.verdict}`);
console.log(`[palette-e2e] Pixel match: ${comparison.pixelMatch}`);
console.log(`[palette-e2e] ═══════════════════════════════════════`);

if (comparison.verdict === 'REPRODUCED') {
  console.log('[palette-e2e] ✓ Determinism holds. Two palette renders, identical pixels.');
  process.exit(0);
} else {
  console.error(`[palette-e2e] ✗ Expected REPRODUCED, got ${comparison.verdict}`);
  process.exit(1);
}
