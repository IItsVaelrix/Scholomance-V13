#!/usr/bin/env node
/**
 * blender-palette-e2e.mjs — school palette CROSSING check.
 *
 * What this used to be: an asset was ingested, a palette node group was built
 * and "applied" to a material, the scene was rendered twice, the pixels hashed,
 * and a REPRODUCED verdict printed. It reported success for every school.
 *
 * Measured 2026-07-30 — the same claymore under ALCHEMY, VOID and WILL all
 * produced pixel hash A4B6E16C and the identical SCD64 receipt. The palette
 * never reached a pixel: apply_palette_to_material added a node group and
 * linked it to nothing, and prepare_render_scene overwrote materials[0] with
 * the emission shader regardless. Rendering was theatre.
 *
 * What it is now: the claim the palette can actually support. The values that
 * crossed are the values the consumer applied, and two different schools
 * produce two different node groups. No render, no pixel hash, no receipt —
 * because there is no declared binding from a per-asset school accent to
 * shading, and pretending otherwise is what this file did for three slices.
 *
 * Colour reaching pixels is a separate, per-coordinate mechanism (pb_albedo)
 * and is verified by blender/tests/test_color_roundtrip.py.
 *
 * Usage: node scripts/blender-palette-e2e.mjs [schoolA] [schoolB]
 * Requires: Blender at ~/opt/blender/blender (or BLENDER env var)
 */

import { readFileSync, writeFileSync, mkdtempSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { paletteToWire, validatePaletteWire } from '../codex/core/blender-bridge/palette-wire.js';
import { runBlenderScript } from '../codex/core/blender-bridge/blender-run.js';

const BLENDER = process.env.BLENDER || join(process.env.HOME, 'opt/blender/blender');
const REPO_ROOT = process.cwd();
const ADDON_DIR = join(REPO_ROOT, 'blender/addons');
const schoolA = process.argv[2] || 'ALCHEMY';
const schoolB = process.argv[3] || 'VOID';

if (!existsSync(BLENDER)) {
  console.error(`ERROR: Blender not found at ${BLENDER}`);
  process.exit(1);
}

if (schoolA === schoolB) {
  console.error(
    `ERROR: schoolA and schoolB must differ (both ${schoolA}).\n` +
      '       Comparing a school against itself cannot detect a palette that\n' +
      '       ignores its input — the check would pass for any implementation.',
  );
  process.exit(1);
}

console.log(`[palette-e2e] Schools: ${schoolA} vs ${schoolB}`);

const wireA = paletteToWire(schoolA, { colorPolicy: 'EXACT' });
const wireB = paletteToWire(schoolB, { colorPolicy: 'EXACT' });

for (const [name, w] of [[schoolA, wireA], [schoolB, wireB]]) {
  const v = validatePaletteWire(w);
  if (!v.valid) {
    console.error(`ERROR: ${name} palette wire invalid: ${v.reason}`);
    process.exit(1);
  }
}
console.log(`[palette-e2e] Transfer: ${wireA.transferFunction}, scale: ${wireA.scale}`);

const workDir = mkdtempSync(join(tmpdir(), 'pb-palette-e2e-'));
const pathA = join(workDir, 'palette_a.json');
const pathB = join(workDir, 'palette_b.json');
const outPath = join(workDir, 'applied.json');
writeFileSync(pathA, JSON.stringify(wireA));
writeFileSync(pathB, JSON.stringify(wireB));

const blenderScript = `
import json, os
sys.path.insert(0, ${JSON.stringify(ADDON_DIR)})

from scholomance_pixelbrain.palette import create_palette_node_group

with open(${JSON.stringify(pathA)}) as f:
    palette_a = json.load(f)
with open(${JSON.stringify(pathB)}) as f:
    palette_b = json.load(f)

def applied_values(node_group):
    """Read back what the consumer actually set, keyed by role."""
    return {
        n.label: [float(v) for v in n.outputs[0].default_value[:3]]
        for n in node_group.nodes
        if n.bl_idname == "ShaderNodeRGB"
    }

ng_a = create_palette_node_group(${JSON.stringify(schoolA)}, palette_a)
ng_b = create_palette_node_group(${JSON.stringify(schoolB)}, palette_b)

result = {
    ${JSON.stringify(schoolA)}: applied_values(ng_a),
    ${JSON.stringify(schoolB)}: applied_values(ng_b),
}

with open(${JSON.stringify(outPath)}, "w") as f:
    json.dump(result, f)

print("[blender] Palette node groups built for both schools")
print("[blender] Done.")
`;

console.log('[palette-e2e] Invoking Blender headless...');
try {
  const { blenderLines } = runBlenderScript({
    blender: BLENDER,
    body: blenderScript,
    scriptPath: join(workDir, 'palette_build.py'),
    timeout: 300000,
  });
  console.log(blenderLines.join('\n'));
} catch (err) {
  console.error('[palette-e2e] Blender failed:');
  console.error(err.stderr || err.message);
  process.exit(1);
}

if (!existsSync(outPath)) {
  console.error('[palette-e2e] ERROR: Blender wrote no applied-values file');
  process.exit(1);
}

const applied = JSON.parse(readFileSync(outPath, 'utf8'));
const ROLES = ['primary', 'accent', 'glow'];
// The wire quantizes at 1e6, so a dequantized channel is exact to ~1e-6. The
// tolerance covers float32 storage in the RGB socket, nothing more.
const TOLERANCE = 1e-5;

const failures = [];

// Claim 1: the values applied are the values that crossed.
for (const [school, wire] of [[schoolA, wireA], [schoolB, wireB]]) {
  for (const role of ROLES) {
    const expected = wire.channels[role].linear.map((q) => q / wire.scale);
    const got = applied[school]?.[role];
    if (!got) {
      failures.push(`${school}/${role}: consumer applied nothing`);
      continue;
    }
    for (let i = 0; i < 3; i += 1) {
      if (Math.abs(got[i] - expected[i]) > TOLERANCE) {
        failures.push(
          `${school}/${role}[${i}]: applied ${got[i]}, wire declared ${expected[i]}`,
        );
      }
    }
  }
}

// Claim 2: two schools are distinguishable. Without this, a consumer that
// ignored its input entirely would satisfy nothing above being violated.
const distinct = ROLES.filter(
  (role) => JSON.stringify(applied[schoolA]?.[role]) !== JSON.stringify(applied[schoolB]?.[role]),
);
if (distinct.length === 0) {
  failures.push(
    `${schoolA} and ${schoolB} produced identical node groups in every role — ` +
      'the palette is not reading its input',
  );
}

console.log('');
console.log('[palette-e2e] ═══════════════════════════════════════');
console.log(`[palette-e2e] ${schoolA} primary: ${JSON.stringify(applied[schoolA]?.primary)}`);
console.log(`[palette-e2e] ${schoolB} primary: ${JSON.stringify(applied[schoolB]?.primary)}`);
console.log(`[palette-e2e] Roles differing between schools: ${distinct.length}/${ROLES.length}`);
console.log('[palette-e2e] ═══════════════════════════════════════');

if (failures.length > 0) {
  console.error('[palette-e2e] ✗ CROSSING FAILED');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log('[palette-e2e] ✓ The values that crossed are the values applied.');
console.log('[palette-e2e]   NOTE: the palette does not reach pixels. There is no');
console.log('[palette-e2e]   declared binding from a school accent to shading, so');
console.log('[palette-e2e]   this asserts crossing only — see the spec, §4.1.');
