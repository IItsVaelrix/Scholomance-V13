#!/usr/bin/env node
/**
 * blender-carrier-e2e.mjs — the carrier's shipping path, end to end.
 *
 * PB-CARRIER-v1 existed as a tested library with no caller: every falsifier was
 * green and nothing in the repo actually sealed a carrier and sent it. A format
 * with no shipping path is one step from a format with no reader, which is the
 * pathology this bridge spent six phases removing. This driver is the caller.
 *
 * What it does:
 *   1. Projects a .pbrain packet onto the render wire.
 *   2. Compiles a temporal gene and projects one frame onto the temporal wire.
 *   3. Seals BOTH into one carrier, and verifies it JS-side (integrity).
 *   4. Sends the whole carrier to Blender with the expected root baked into the
 *      generated script — an INDEPENDENT path, never read off the carrier.
 *   5. Blender verifies the root by string equality (identity), selects each
 *      frame, and ingests it with that kind's own reader.
 *   6. Renders the render frame, dumps float32 pixels, emits a claim.
 *   7. Mints a receipt JS-side and writes a PNG preview from the SAME dump.
 *
 * The preview is the point of step 7. Every other check in this bridge compares
 * numbers to numbers, which cannot catch an asset rendered mirrored or framed
 * off-centre — those hash consistently and reproduce perfectly. A person looking
 * at the image is the only check that covers them.
 *
 * Usage: node scripts/blender-carrier-e2e.mjs [packet.pbrain] [--out DIR] [--scale N]
 * Requires: Blender at ~/opt/blender/blender (or BLENDER env var)
 */

import { readFileSync, writeFileSync, mkdtempSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { toPythonWire } from '../codex/core/blender-bridge/wire.js';
import { renderWireToPixels } from '../codex/core/blender-bridge/remotion-canvas-renderer.js';
import { sealCarrier, verifyCarrier } from '../codex/core/blender-bridge/carrier.js';
import { mintReceipt, hashPixelDump } from '../codex/core/blender-bridge/receipt.js';
import { runBlenderScript, BlenderRunError } from '../codex/core/blender-bridge/blender-run.js';
import { loadPbrainFile } from '../codex/core/pixelbrain/pbrain-checksum.js';
import {
  linearF32ToRgba8, nearestNeighbourUpscale, encodePng,
} from '../codex/core/blender-bridge/png-preview.js';
import {
  TEMPORAL_CONTRACT, createTemporalGene,
} from '../codex/core/pixelbrain/temporal/temporal-schema.js';
import {
  compileTemporal, formatForWire,
} from '../codex/core/pixelbrain/temporal/temporal-compiler.js';

const BLENDER = process.env.BLENDER || join(process.env.HOME, 'opt/blender/blender');
const ADDON_DIR = join(process.cwd(), 'blender/addons');

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i === -1 ? fallback : args[i + 1];
};
const packetPath = args.find((a) => a.endsWith('.pbrain')) || 'output/holy_fire_claymore.pbrain';
const outDir = flag('--out', 'output/carrier-e2e');
const scale = parseInt(flag('--scale', '6'), 10);

if (!existsSync(BLENDER)) {
  console.error(`ERROR: Blender not found at ${BLENDER}`);
  process.exit(1);
}

if (args.includes('--self-test')) {
  const selfDir = mkdtempSync(join(tmpdir(), 'pb-carrier-selftest-'));
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
  console.log(`[carrier-e2e] self-test: Blender failure detected = ${detected}`);
  process.exit(detected ? 0 : 1);
}

if (!existsSync(packetPath)) {
  console.error(`ERROR: packet not found: ${packetPath}`);
  process.exit(1);
}

// ── 1. render frame ──────────────────────────────────────────────────────────
let packet;
try {
  packet = loadPbrainFile(packetPath);
} catch (error) {
  console.error(`\n${error.message}\n`);
  process.exit(1);
}
const renderWire = toPythonWire(packet, { colorPolicy: 'EXACT' });
const { width: CW, height: CH } = renderWire.canvas;
console.log(`[carrier-e2e] Packet: ${packetPath}`);
console.log(`[carrier-e2e] Render frame: ${renderWire.coordinateCount} coordinates, canvas ${CW}x${CH}`);

// ── 2. temporal frame ────────────────────────────────────────────────────────
const gene = createTemporalGene({
  contract: TEMPORAL_CONTRACT,
  id: 'carrier-e2e-gene',
  assetId: packet.bytecode ?? 'carrier-e2e',
  algorithm: 'linear-v1',
  aspect: 'one-shot',
  projectionMode: 'derived',
  canvas: { width: CW, height: CH },
  keyframes: [
    { time: 0, label: 'a', state: { body: { spine: [[2, 10], [12, 10]] } }, energy: { PHOTONIC: 0 } },
    { time: 1, label: 'b', state: { body: { spine: [[8, 16], [18, 16]] } }, energy: { PHOTONIC: 1 } },
  ],
});
const temporalWire = formatForWire(compileTemporal(gene, { frameCount: 4 }).frames[2]);
console.log(`[carrier-e2e] Temporal frame: ${temporalWire.vertexCount} vertices, frame ${temporalWire.frame}`);

// ── 3. seal ──────────────────────────────────────────────────────────────────
const carrier = sealCarrier([
  { kind: 'render', frameId: 'render-0', packet: renderWire },
  { kind: 'temporal', frameId: 'temporal-0', packet: temporalWire },
]);

const integrity = verifyCarrier(carrier);
if (!integrity.valid) {
  console.error(`[carrier-e2e] ERROR: sealed an invalid carrier: ${integrity.reason}`);
  process.exit(1);
}
console.log(`[carrier-e2e] Sealed ${carrier.manifest.length} frames, root=${carrier.root.slice(0, 16)}...`);
console.log(`[carrier-e2e] Integrity (JS-side, recomputed): valid=${integrity.valid}`);

const workDir = mkdtempSync(join(tmpdir(), 'pb-carrier-e2e-'));
const carrierPath = join(workDir, 'carrier.json');
writeFileSync(carrierPath, JSON.stringify(carrier));

// ── 4/5/6. cross, verify by identity, ingest both kinds, render ──────────────
// The expected root is baked into the script HERE, producer-side. Reading it
// off the carrier being verified would compare it to itself and pass for any
// input, including a carrier swapped in transit.
const blenderScript = `
import json, os
sys.path.insert(0, ${JSON.stringify(ADDON_DIR)})

import bpy
from scholomance_pixelbrain.carrier_ingest import (
    verify_carrier_root, select_frame, manifest_kinds
)
from scholomance_pixelbrain.ingest import ingest_wire
from scholomance_pixelbrain.temporal_ingest import ingest_temporal_frame
from scholomance_pixelbrain.render_claim import (
    apply_color_policy, configure_deterministic_render, dump_pixels_f32, emit_claim
)
from scholomance_pixelbrain.scene import prepare_render_scene

work_dir = ${JSON.stringify(workDir)}
EXPECTED_ROOT = ${JSON.stringify(carrier.root)}

with open(${JSON.stringify(carrierPath)}) as f:
    carrier = json.load(f)

verify_carrier_root(carrier, EXPECTED_ROOT)
print("[blender] Carrier root verified by string equality")
print(f"[blender] Kinds aboard: {manifest_kinds(carrier)}")

temporal_obj = ingest_temporal_frame(select_frame(carrier, "temporal-0"))
print(f"[blender] Temporal frame ingested: {len(temporal_obj.data.attributes['position'].data)} vertices")

render_wire = select_frame(carrier, "render-0")
obj = ingest_wire(render_wire)
print(f"[blender] Render frame ingested: {render_wire['coordinateCount']} coordinates")

# The temporal frame is animation state, not something to rasterise. It is
# removed before framing so it cannot contribute pixels to a receipt that
# claims to be about the render frame.
bpy.data.objects.remove(temporal_obj, do_unlink=True)

scene = bpy.context.scene
prepare_render_scene(obj, scene=scene, canvas=render_wire["canvas"])
scene.render.resolution_x = ${CW}
scene.render.resolution_y = ${CH}
scene.render.film_transparent = True

apply_color_policy(scene, render_wire["colorPolicy"])
configure_deterministic_render(scene, seed=7, samples=64, threads=8, policy="EXACT")

dump = dump_pixels_f32(os.path.join(work_dir, "carrier_render"))
claim = emit_claim(scene, render_wire, dump)
with open(os.path.join(work_dir, "claim.json"), "w") as f:
    json.dump(claim, f)
print(f"[blender] Rendered: {dump}")
print("[blender] Done.")
`;

console.log('[carrier-e2e] Invoking Blender headless...');
try {
  const { blenderLines } = runBlenderScript({
    blender: BLENDER,
    body: blenderScript,
    scriptPath: join(workDir, 'carrier_render.py'),
    timeout: 600000,
  });
  console.log(blenderLines.join('\n'));
} catch (err) {
  console.error('[carrier-e2e] Blender failed:');
  console.error(err.stderr || err.message);
  process.exit(1);
}

// ── 7. receipt + preview, from the same bytes ────────────────────────────────
const dumpPath = join(workDir, 'carrier_render.f32');
if (!existsSync(dumpPath)) {
  console.error('[carrier-e2e] ERROR: Blender produced no pixel dump');
  process.exit(1);
}

const claim = JSON.parse(readFileSync(join(workDir, 'claim.json'), 'utf8'));
const pixelHash = hashPixelDump(dumpPath);
const receipt = mintReceipt(claim, pixelHash);

mkdirSync(outDir, { recursive: true });
const raw = readFileSync(dumpPath);
const f32 = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
const rgba = linearF32ToRgba8(f32, CW, CH);

const png1x = join(outDir, 'carrier-render-1x.png');
const pngNx = join(outDir, `carrier-render-${scale}x.png`);
writeFileSync(png1x, encodePng(rgba, CW, CH));
writeFileSync(pngNx, encodePng(nearestNeighbourUpscale(rgba, CW, CH, scale), CW * scale, CH * scale));

let opaque = 0;
const colours = new Set();
for (let i = 0; i < rgba.length; i += 4) {
  if (rgba[i + 3] > 127) {
    opaque += 1;
    colours.add(`${rgba[i]},${rgba[i + 1]},${rgba[i + 2]}`);
  }
}

console.log('');
console.log('[carrier-e2e] ═══════════════════════════════════════');
console.log(`[carrier-e2e] Carrier root : ${carrier.root}`);
console.log(`[carrier-e2e] Receipt SCD64: ${receipt.scd64}`);
console.log(`[carrier-e2e] Pixel hash   : ${pixelHash.slice(0, 32)}...`);
console.log(`[carrier-e2e] Opaque pixels: ${opaque} / ${renderWire.coordinateCount} coordinates`);
console.log(`[carrier-e2e] Distinct colours rendered: ${colours.size}`);
console.log(`[carrier-e2e] Preview 1x : ${png1x}`);
console.log(`[carrier-e2e] Preview ${scale}x : ${pngNx}`);
console.log('[carrier-e2e] ═══════════════════════════════════════');

// One pixel per coordinate is what canvas-space framing means. Anything else is
// a framing or coverage bug that every hash-based check would happily reproduce.
if (opaque !== renderWire.coordinateCount) {
  console.error(
    `[carrier-e2e] ✗ ${opaque} opaque pixels for ${renderWire.coordinateCount} `
    + 'coordinates — the render is not 1:1 with the packet.',
  );
  process.exit(1);
}

// ── orientation: the two engines must agree on WHICH PIXELS are occupied ─────
//
// Cross-engine comparison declares PIXEL_RECEIPT divergence "expected", because
// different renderers produce different colour values. A vertical mirror hides
// perfectly inside that allowance: it hashes consistently, reproduces
// byte-for-byte, round-trips colour exactly, and passes asset-dependence. This
// bridge shipped a mirrored render for six phases because no check compared
// SHAPE across engines — only values, and only within one engine.
//
// Occupancy is the part that must agree. Remotion writes screen space directly;
// Blender goes through world space, where +Y is up. If the coverage masks
// differ, someone flipped an axis.
const canvasPixels = renderWireToPixels(renderWire);
const remotion = new Uint8Array(canvasPixels.buffer);
let mismatched = 0;
for (let i = 3; i < rgba.length; i += 4) {
  if ((rgba[i] > 127) !== (remotion[i] > 127)) mismatched += 1;
}
console.log(`[carrier-e2e] Occupancy vs Remotion: ${mismatched} pixels differ`);
if (mismatched !== 0) {
  console.error(
    `[carrier-e2e] ✗ the two engines disagree about WHICH pixels are covered `
    + `(${mismatched} of ${CW * CH}). Same packet, same coordinates — a `
    + 'disagreement here is a flipped or offset axis, not a shading difference.',
  );
  process.exit(1);
}

console.log('[carrier-e2e] ✓ Carrier crossed whole. Both kinds read. Render is 1:1.');
console.log(`[carrier-e2e]   Now LOOK at ${pngNx} — the checks above cannot see`);
console.log('[carrier-e2e]   a mirrored or mis-framed asset, and never will.');
