/**
 * VIXEL PROOF-OF-CONCEPT — Forge the Brazier as a Vixel
 *
 * Demonstrates the full Vixel pipeline:
 *   1. Compile brazier SCDL → PixelBrain packet (pixel grid with materials)
 *   2. Generate Wand vector paths for the brazier rim (smooth parametric arc)
 *   3. Fuse pixel + vector → Vixel field (dual-medium superposition)
 *   4. Evaluate with Photonic Feel (spatial + texture-form + silhouette)
 *   5. Compare to pixel-only Feel evaluation
 *   6. Print structured results
 *
 * Run: node scripts/vixel-proof-of-concept.mjs
 *
 * DETERMINISM: No randomness, no Date.now(). Identical output every run.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ─── Imports ──────────────────────────────────────────────────────────────────

const { compileSCDL } = await import(
  resolve(ROOT, 'codex/core/pixelbrain/scdl/scdl.compiler.js')
);
const { evaluateParametricCurve } = await import(
  resolve(ROOT, 'codex/core/pixelbrain/formula-to-coordinates.js')
);
const {
  fuseVixelField,
  evaluateVixelFeel,
  vixelToSpatialField,
} = await import(
  resolve(ROOT, 'src/lib/photonic-retina/retina-vixel.js')
);
const { evaluatePerceptualFeel } = await import(
  resolve(ROOT, 'src/lib/photonic-retina/retina-feel.js')
);

// ─── Step 1: Compile the Brazier SCDL ─────────────────────────────────────────

console.log('═══════════════════════════════════════════════════════════');
console.log('  VIXEL PROOF-OF-CONCEPT — Brazier');
console.log('═══════════════════════════════════════════════════════════\n');

const scdlPath = resolve(ROOT, 'PolarisOS/worldpacks/shrine-demo/scdl/brazier.scdl');
const scdlSource = readFileSync(scdlPath, 'utf8');
const compileResult = compileSCDL(scdlSource);

if (!compileResult.ok) {
  console.error('SCDL compilation failed:');
  for (const err of compileResult.errors) {
    console.error(`  [${err.severity}] ${err.message}`);
  }
  process.exit(1);
}

const packet = compileResult.packet;
const pixelCells = packet.geometry?.coordinates || [];
console.log(`Step 1: SCDL compiled → ${pixelCells.length} pixel cells`);
console.log(`  Canvas: ${packet.canvas.width}x${packet.canvas.height}`);
console.log(`  Packet ID: ${packet.id}`);
console.log(`  Material: ${packet.material?.id || 'source'}`);

// ─── Step 2: Generate Wand Vector Paths ───────────────────────────────────────

// The brazier rim is a wide arc at the top. We trace it with a parametric
// curve: a half-ellipse spanning the bowl width, centered on the rim.
const canvasSize = { width: packet.canvas.width, height: packet.canvas.height };

// Rim arc: half-ellipse from left rim to right rim
const rimFormula = {
  type: 'parametric_curve',
  parameters: {
    cx: canvasSize.width / 2,   // center x
    cy: 5,                       // rim y position
    a: 10,                       // horizontal radius (half the bowl width)
    b: 1,                        // frequency
    c: 0,                        // phase
    n: 40,                       // sample count
  },
};

// We only want the top half of the curve (the rim arc), so we filter
// points where y <= cy (the upper semicircle).
const rimCoords = evaluateParametricCurve(rimFormula, canvasSize, 0);
const rimPoints = rimCoords
  .filter(c => c.y <= 6)  // upper portion only
  .map(c => ({ x: c.x, y: c.y, t: c.t }));

// Bowl body: a narrower arc below the rim
const bowlFormula = {
  type: 'parametric_curve',
  parameters: {
    cx: canvasSize.width / 2,
    cy: 9,
    a: 7,
    b: 1,
    c: 0,
    n: 30,
  },
};
const bowlCoords = evaluateParametricCurve(bowlFormula, canvasSize, 0);
const bowlPoints = bowlCoords
  .filter(c => c.y <= 11)
  .map(c => ({ x: c.x, y: c.y, t: c.t }));

const vectorPaths = [
  { pathRef: 'brazier.rim', points: rimPoints },
  { pathRef: 'brazier.bowl', points: bowlPoints },
];

console.log(`\nStep 2: Wand vector paths generated`);
for (const vp of vectorPaths) {
  console.log(`  ${vp.pathRef}: ${vp.points.length} points`);
}

// ─── Step 3: Fuse Pixel + Vector → Vixel Field ───────────────────────────────

const vixelField = fuseVixelField(packet, vectorPaths, {
  indexCellSize: 2,
  searchRadius: 8,
});

if (!vixelField.ok) {
  console.error('Vixel fusion failed:', vixelField.errors);
  process.exit(1);
}

console.log(`\nStep 3: Vixel field fused`);
console.log(`  Total cells: ${vixelField.stats.totalCells}`);
console.log(`  Fused (pixel+vector): ${vixelField.stats.fusedCells}`);
console.log(`  Pure pixel: ${vixelField.stats.purePixelCells}`);
console.log(`  Fusion ratio: ${(vixelField.stats.fusionRatio * 100).toFixed(1)}%`);
console.log(`  Vixel hash: ${vixelField.vixelHash}`);

// Show a sample fused cell
const sampleFused = vixelField.cells.find(c => c.vector !== null);
if (sampleFused) {
  console.log(`\n  Sample fused cell at (${sampleFused.x}, ${sampleFused.y}):`);
  console.log(`    pixel: color=${sampleFused.pixel.color}, material=${sampleFused.pixel.material}`);
  console.log(`    vector: path=${sampleFused.vector.pathRef}, T=${sampleFused.vector.parametricT}`);
  console.log(`    vector: tangent=[${sampleFused.vector.tangent}], normal=[${sampleFused.vector.normal}]`);
  console.log(`    vector: curvature=${sampleFused.vector.curvature}, dist=${sampleFused.vector.distance}`);
}

// ─── Step 4: Evaluate Vixel Feel ─────────────────────────────────────────────

const vixelFeel = evaluateVixelFeel(vixelField, { evaluatePerceptualFeel });

console.log(`\nStep 4: Vixel Feel evaluation`);
console.log(`  Vixel awareness: ${vixelFeel.vixelAwareness}`);
console.log(`  Verdict: ${vixelFeel.verdict}`);
console.log(`  Texture-form coherence: ${vixelFeel.textureForm?.score}`);
console.log(`  Silhouette smoothness: ${vixelFeel.silhouetteSmoothness?.score}`);
console.log(`  Spatial awareness: ${vixelFeel.spatialFeel?.spatialAwareness}`);

if (vixelFeel.suggestions.length > 0) {
  console.log(`\n  Suggestions:`);
  for (const s of vixelFeel.suggestions) {
    console.log(`    • ${s}`);
  }
}

// ─── Step 5: Compare to Pixel-Only Feel ──────────────────────────────────────

const pixelOnlyField = vixelToSpatialField(vixelField);
const pixelOnlyFeel = evaluatePerceptualFeel(pixelOnlyField);

console.log(`\nStep 5: Pixel-only comparison`);
console.log(`  Pixel-only spatial awareness: ${pixelOnlyFeel.spatialAwareness}`);
console.log(`  Pixel-only verdict: ${pixelOnlyFeel.verdict}`);

// ─── Step 6: Summary ─────────────────────────────────────────────────────────

console.log(`\n═══════════════════════════════════════════════════════════`);
console.log(`  SUMMARY`);
console.log(`═══════════════════════════════════════════════════════════`);
console.log(`  Pixel-only feel:  ${pixelOnlyFeel.spatialAwareness} (spatial only)`);
console.log(`  Vixel feel:       ${vixelFeel.vixelAwareness} (spatial + texture-form + silhouette)`);
console.log(`  Texture-form:     ${vixelFeel.textureForm?.score} (grain follows curve?)`);
console.log(`  Silhouette:       ${vixelFeel.silhouetteSmoothness?.score} (pixels hug curve?)`);
console.log(`  Fusion ratio:     ${(vixelField.stats.fusionRatio * 100).toFixed(1)}%`);
console.log(`  Vixel hash:       ${vixelField.vixelHash}`);
console.log(`  Feel hash:        ${vixelFeel.vixelFeelHash}`);
console.log(`═══════════════════════════════════════════════════════════\n`);

// The proof: the Vixel feel gives us signals the pixel-only feel CANNOT.
// Texture-form coherence tells us whether the material grain follows the
// curve. Silhouette smoothness tells us whether the staircase is visible.
// These are the "emotion of a painter's spatial awareness" — the feel
// of whether the medium and the form are in accord.
