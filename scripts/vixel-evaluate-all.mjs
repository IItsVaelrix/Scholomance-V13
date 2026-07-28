/**
 * VIXEL FULL EVALUATION — All 7 Shrine-Demo Assets
 *
 * Runs the complete Vixel pipeline on every asset in the shrine-demo:
 *   1. Compile SCDL → PixelBrain packet
 *   2. Generate Wand vector paths (silhouette contours + structural arcs)
 *   3. Fuse → Vixel field
 *   4. Evaluate Vixel Feel (spatial + texture-form + silhouette)
 *   5. Compare to pixel-only Feel
 *   6. Print ranked comparison table with suggestions
 *
 * Run: node scripts/vixel-evaluate-all.mjs
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

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

// ─── Asset Definitions ────────────────────────────────────────────────────────

const SCDL_DIR = resolve(ROOT, 'PolarisOS/worldpacks/shrine-demo/scdl');

/**
 * Generate Wand vector paths appropriate to each asset's form.
 * These trace the major silhouette contours and structural arcs.
 */
function generateVectorPaths(assetName, canvas) {
  const { width: w, height: h } = canvas;
  const cx = w / 2;
  const paths = [];

  switch (assetName) {
    case 'brazier':
    case 'brazier-lit': {
      // Rim arc (wide half-ellipse at top)
      paths.push(makeArc('rim', cx, h * 0.22, w * 0.42, h * 0.08, 0, Math.PI, 30));
      // Bowl body (narrower arc below)
      paths.push(makeArc('bowl', cx, h * 0.45, w * 0.32, h * 0.1, 0, Math.PI, 24));
      // Stem (vertical line)
      paths.push(makeLine('stem', cx, h * 0.55, cx, h * 0.75, 10));
      // Base arc (wide, flat)
      paths.push(makeArc('base', cx, h * 0.85, w * 0.35, h * 0.06, 0, Math.PI, 20));
      if (assetName === 'brazier-lit') {
        // Flame tongues (three vertical strokes)
        paths.push(makeLine('flame.left', cx - w * 0.1, h * 0.25, cx - w * 0.08, h * 0.05, 8));
        paths.push(makeLine('flame.center', cx, h * 0.22, cx, h * 0.02, 10));
        paths.push(makeLine('flame.right', cx + w * 0.1, h * 0.25, cx + w * 0.08, h * 0.05, 8));
      }
      break;
    }
    case 'lantern': {
      // Body outline (vertical ellipse)
      paths.push(makeArc('body', cx, h * 0.5, w * 0.3, h * 0.3, 0, Math.PI * 2, 40));
      // Handle arc (top)
      paths.push(makeArc('handle', cx, h * 0.12, w * 0.18, h * 0.08, Math.PI, Math.PI * 2, 16));
      // Flame core (small vertical stroke)
      paths.push(makeLine('flame', cx, h * 0.55, cx, h * 0.35, 8));
      // Base ring
      paths.push(makeArc('base', cx, h * 0.85, w * 0.2, h * 0.04, 0, Math.PI, 12));
      break;
    }
    case 'player-marker': {
      // Circular body
      paths.push(makeArc('body', cx, h * 0.45, w * 0.3, h * 0.3, 0, Math.PI * 2, 32));
      // Directional wedge (downward pointer)
      paths.push(makeLine('pointer.left', cx - w * 0.12, h * 0.7, cx, h * 0.95, 6));
      paths.push(makeLine('pointer.right', cx + w * 0.12, h * 0.7, cx, h * 0.95, 6));
      break;
    }
    case 'shrine-background': {
      // Horizon line
      paths.push(makeLine('horizon', 0, h * 0.62, w, h * 0.62, 40));
      // Arch contour (large semicircle)
      paths.push(makeArc('arch', cx, h * 0.62, w * 0.35, h * 0.45, Math.PI, Math.PI * 2, 40));
      // Left column
      paths.push(makeLine('column.left', w * 0.2, h * 0.15, w * 0.2, h * 0.62, 20));
      // Right column
      paths.push(makeLine('column.right', w * 0.8, h * 0.15, w * 0.8, h * 0.62, 20));
      // Moon arc
      paths.push(makeArc('moon', w * 0.7, h * 0.15, w * 0.08, h * 0.08, 0, Math.PI * 2, 16));
      break;
    }
    case 'forest-background': {
      // Horizon
      paths.push(makeLine('horizon', 0, h * 0.65, w, h * 0.65, 40));
      // Tree line (undulating arc)
      paths.push(makeArc('treeline', cx, h * 0.5, w * 0.48, h * 0.2, Math.PI, Math.PI * 2, 50));
      // Canopy arcs (three overlapping)
      paths.push(makeArc('canopy.left', w * 0.2, h * 0.3, w * 0.15, h * 0.15, Math.PI, Math.PI * 2, 20));
      paths.push(makeArc('canopy.center', cx, h * 0.25, w * 0.18, h * 0.18, Math.PI, Math.PI * 2, 20));
      paths.push(makeArc('canopy.right', w * 0.8, h * 0.3, w * 0.15, h * 0.15, Math.PI, Math.PI * 2, 20));
      // Moon
      paths.push(makeArc('moon', w * 0.75, h * 0.12, w * 0.06, h * 0.06, 0, Math.PI * 2, 12));
      break;
    }
    case 'clearing-background': {
      // Horizon
      paths.push(makeLine('horizon', 0, h * 0.6, w, h * 0.6, 40));
      // Clearing edge (wide shallow arc)
      paths.push(makeArc('clearing-edge', cx, h * 0.6, w * 0.45, h * 0.12, Math.PI, Math.PI * 2, 40));
      // Moon (larger, prominent)
      paths.push(makeArc('moon', w * 0.65, h * 0.15, w * 0.1, h * 0.1, 0, Math.PI * 2, 20));
      // Moonlight beam (diagonal)
      paths.push(makeLine('moonbeam', w * 0.65, h * 0.2, w * 0.4, h * 0.6, 16));
      // Grass tufts (short arcs at ground)
      paths.push(makeArc('grass.left', w * 0.25, h * 0.7, w * 0.08, h * 0.04, Math.PI, Math.PI * 2, 10));
      paths.push(makeArc('grass.right', w * 0.7, h * 0.72, w * 0.06, h * 0.03, Math.PI, Math.PI * 2, 10));
      break;
    }
    default:
      // Generic: horizontal + vertical center lines
      paths.push(makeLine('h-center', 0, h / 2, w, h / 2, 20));
      paths.push(makeLine('v-center', w / 2, 0, w / 2, h, 20));
  }

  return paths;
}

/** Generate a parametric arc as a Wand vector path. */
function makeArc(pathRef, cx, cy, rx, ry, startAngle, endAngle, n) {
  const points = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const angle = startAngle + t * (endAngle - startAngle);
    points.push({
      x: Math.round((cx + Math.cos(angle) * rx) * 100) / 100,
      y: Math.round((cy - Math.sin(angle) * ry) * 100) / 100,
      t: Math.round(t * 10000) / 10000,
    });
  }
  return { pathRef, points };
}

/** Generate a straight line as a Wand vector path. */
function makeLine(pathRef, x1, y1, x2, y2, n) {
  const points = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    points.push({
      x: Math.round((x1 + t * (x2 - x1)) * 100) / 100,
      y: Math.round((y1 + t * (y2 - y1)) * 100) / 100,
      t: Math.round(t * 10000) / 10000,
    });
  }
  return { pathRef, points };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const ASSETS = [
  'brazier', 'brazier-lit', 'lantern', 'player-marker',
  'shrine-background', 'forest-background', 'clearing-background',
];

console.log('═══════════════════════════════════════════════════════════════════');
console.log('  VIXEL FULL EVALUATION — All Shrine-Demo Assets');
console.log('═══════════════════════════════════════════════════════════════════\n');

const results = [];

for (const assetName of ASSETS) {
  const scdlPath = resolve(SCDL_DIR, `${assetName}.scdl`);
  let scdlSource;
  try {
    scdlSource = readFileSync(scdlPath, 'utf8');
  } catch {
    console.log(`  SKIP ${assetName}: no SCDL file`);
    continue;
  }

  const compileResult = compileSCDL(scdlSource);
  if (!compileResult.ok) {
    console.log(`  SKIP ${assetName}: SCDL compile failed`);
    continue;
  }

  const packet = compileResult.packet;
  const canvas = packet.canvas;
  const vectorPaths = generateVectorPaths(assetName, canvas);

  const vixelField = fuseVixelField(packet, vectorPaths, {
    indexCellSize: Math.max(2, Math.floor(Math.min(canvas.width, canvas.height) / 12)),
    searchRadius: Math.max(6, Math.floor(Math.min(canvas.width, canvas.height) / 4)),
  });

  if (!vixelField.ok) {
    console.log(`  SKIP ${assetName}: Vixel fusion failed`);
    continue;
  }

  const vixelFeel = evaluateVixelFeel(vixelField, { evaluatePerceptualFeel });
  const pixelOnlyField = vixelToSpatialField(vixelField);
  const pixelOnlyFeel = evaluatePerceptualFeel(pixelOnlyField);

  results.push({
    asset: assetName,
    cells: vixelField.stats.totalCells,
    fused: vixelField.stats.fusedCells,
    fusionRatio: vixelField.stats.fusionRatio,
    vixelAwareness: vixelFeel.vixelAwareness,
    spatialOnly: pixelOnlyFeel.spatialAwareness,
    textureForm: vixelFeel.textureForm?.score ?? 0,
    silhouette: vixelFeel.silhouetteSmoothness?.score ?? 0,
    suggestions: vixelFeel.suggestions,
    vixelHash: vixelField.vixelHash,
  });
}

// ─── Ranked Table ─────────────────────────────────────────────────────────────

results.sort((a, b) => b.vixelAwareness - a.vixelAwareness);

console.log('  RANKED RESULTS (by vixelAwareness)\n');
console.log('  ┌─────┬──────────────────────┬───────┬───────┬────────┬─────────┬────────────┬────────────┐');
console.log('  │ Rank│ Asset                │ Cells │ Fused │ Fusion │ Vixel   │ Texture-   │ Silhouette │');
console.log('  │     │                      │       │       │ Ratio  │ Aware   │ Form       │ Smooth     │');
console.log('  ├─────┼──────────────────────┼───────┼───────┼────────┼─────────┼────────────┼────────────┤');

results.forEach((r, i) => {
  const rank = String(i + 1).padStart(4);
  const asset = r.asset.padEnd(20);
  const cells = String(r.cells).padStart(5);
  const fused = String(r.fused).padStart(5);
  const ratio = `${(r.fusionRatio * 100).toFixed(0)}%`.padStart(6);
  const vixel = r.vixelAwareness.toFixed(4).padStart(7);
  const texture = r.textureForm.toFixed(3).padStart(10);
  const silhouette = r.silhouette.toFixed(4).padStart(10);
  console.log(`  │${rank} │ ${asset} │${cells} │${fused} │${ratio} │${vixel} │${texture} │${silhouette} │`);
});

console.log('  └─────┴──────────────────────┴───────┴───────┴────────┴─────────┴────────────┴────────────┘');

// ─── Suggestions for Bottom 3 ─────────────────────────────────────────────────

console.log('\n  SUGGESTIONS FOR LOWEST-SCORING ASSETS\n');
const bottom = results.slice(-3);
for (const r of bottom) {
  console.log(`  ── ${r.asset} (vixelAwareness: ${r.vixelAwareness.toFixed(4)}) ──`);
  if (r.suggestions.length === 0) {
    console.log('     No suggestions — composition is strong.');
  } else {
    for (const s of r.suggestions.slice(0, 4)) {
      console.log(`     • ${s}`);
    }
  }
  console.log('');
}

// ─── Summary ──────────────────────────────────────────────────────────────────

const avgVixel = results.reduce((s, r) => s + r.vixelAwareness, 0) / results.length;
const avgTexture = results.reduce((s, r) => s + r.textureForm, 0) / results.length;
const avgSilhouette = results.reduce((s, r) => s + r.silhouette, 0) / results.length;
const avgFusion = results.reduce((s, r) => s + r.fusionRatio, 0) / results.length;

console.log('═══════════════════════════════════════════════════════════════════');
console.log('  AGGREGATE');
console.log('═══════════════════════════════════════════════════════════════════');
console.log(`  Assets evaluated:        ${results.length}`);
console.log(`  Avg vixel awareness:     ${avgVixel.toFixed(4)}`);
console.log(`  Avg texture-form:        ${avgTexture.toFixed(3)}`);
console.log(`  Avg silhouette smooth:   ${avgSilhouette.toFixed(4)}`);
console.log(`  Avg fusion ratio:        ${(avgFusion * 100).toFixed(1)}%`);
console.log('═══════════════════════════════════════════════════════════════════\n');
