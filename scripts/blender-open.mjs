#!/usr/bin/env node
/**
 * blender-open.mjs — put the asset in a .blend you can actually open.
 *
 * Every other driver in this bridge runs headless and throws the scene away:
 * the point cloud exists for the length of one `blender -b` process and then it
 * is gone. That is fine for receipts and useless for looking. This one ingests
 * a packet through the same path the receipts use — same wire, same flip, same
 * material, same canvas-space camera — and SAVES it.
 *
 * Deliberately does not launch the GUI itself. Opening a window on someone's
 * desktop mid-session is not this script's call; it prints the command instead.
 *
 * Usage:
 *   node scripts/blender-open.mjs [packet.pbrain] [--out PATH.blend]
 *
 * Then:
 *   ~/opt/blender/blender <PATH.blend>
 */

import { readFileSync, writeFileSync, mkdtempSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';

import { toPythonWire } from '../codex/core/blender-bridge/wire.js';
import { runBlenderScript } from '../codex/core/blender-bridge/blender-run.js';

const BLENDER = process.env.BLENDER || join(process.env.HOME, 'opt/blender/blender');
const ADDON_DIR = join(process.cwd(), 'blender/addons');

const args = process.argv.slice(2);
const flagValue = (name, fallback) => {
  const i = args.indexOf(name);
  return i === -1 ? fallback : args[i + 1];
};
const packetPath = args.find((a) => a.endsWith('.pbrain')) || 'output/holy_fire_claymore.pbrain';
const blendPath = resolve(flagValue('--out', 'output/carrier-e2e/asset.blend'));

if (!existsSync(BLENDER)) {
  console.error(`ERROR: Blender not found at ${BLENDER}`);
  process.exit(1);
}
if (!existsSync(packetPath)) {
  console.error(`ERROR: packet not found: ${packetPath}`);
  process.exit(1);
}

const packet = JSON.parse(readFileSync(packetPath, 'utf8'));
const wire = toPythonWire(packet, { colorPolicy: 'EXACT' });
const { width: CW, height: CH } = wire.canvas;

console.log(`[open] Packet: ${packetPath}`);
console.log(`[open] ${wire.coordinateCount} coordinates, canvas ${CW}x${CH}`);

const workDir = mkdtempSync(join(tmpdir(), 'pb-open-'));
const wirePath = join(workDir, 'wire.json');
writeFileSync(wirePath, JSON.stringify(wire));
mkdirSync(dirname(blendPath), { recursive: true });

const blenderScript = `
import json, os
sys.path.insert(0, ${JSON.stringify(ADDON_DIR)})

import bpy
from scholomance_pixelbrain.ingest import ingest_wire
from scholomance_pixelbrain.render_claim import apply_color_policy, configure_deterministic_render
from scholomance_pixelbrain.scene import prepare_render_scene

with open(${JSON.stringify(wirePath)}) as f:
    wire = json.load(f)

obj = ingest_wire(wire)
scene = bpy.context.scene
prepare_render_scene(obj, scene=scene, canvas=wire["canvas"])
scene.render.resolution_x = ${CW}
scene.render.resolution_y = ${CH}
scene.render.film_transparent = True
apply_color_policy(scene, wire["colorPolicy"])
configure_deterministic_render(scene, seed=7, samples=64, threads=8, policy="EXACT")

# The point cloud is emission-shaded, so SOLID viewport shading shows flat grey
# and the asset looks blank. Open every 3D viewport in MATERIAL preview so the
# authored colour is what greets you — otherwise the first impression of a
# working bridge is an empty scene.
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type == 'VIEW_3D':
            for space in area.spaces:
                if space.type == 'VIEW_3D':
                    space.shading.type = 'MATERIAL'
                    space.region_3d.view_perspective = 'CAMERA'

bpy.ops.wm.save_as_mainfile(filepath=${JSON.stringify(blendPath)})
print(f"[blender] Saved: ${blendPath}")
print(f"[blender] Object: {obj.name}  attributes: {sorted(a.name for a in obj.data.attributes)}")
print("[blender] Done.")
`;

console.log('[open] Ingesting and saving...');
try {
  const { blenderLines } = runBlenderScript({
    blender: BLENDER,
    body: blenderScript,
    scriptPath: join(workDir, 'open.py'),
    timeout: 300000,
  });
  console.log(blenderLines.join('\n'));
} catch (err) {
  console.error('[open] Blender failed:');
  console.error(err.stderr || err.message);
  process.exit(1);
}

if (!existsSync(blendPath)) {
  console.error('[open] ERROR: Blender reported success but wrote no .blend');
  process.exit(1);
}

console.log('');
console.log('[open] ═══════════════════════════════════════');
console.log(`[open] ${blendPath}`);
console.log('[open]');
console.log('[open] Open it with:');
console.log(`[open]   ${BLENDER} "${blendPath}"`);
console.log('[open]');
console.log('[open] The viewport opens in MATERIAL shading through the camera.');
console.log('[open] Numpad-0 toggles the camera view; Z picks shading mode.');
console.log('[open] Attributes are on the point cloud: Object Data Properties');
console.log('[open] > Attributes, or read them in Geometry Nodes.');
console.log('[open] ═══════════════════════════════════════');
