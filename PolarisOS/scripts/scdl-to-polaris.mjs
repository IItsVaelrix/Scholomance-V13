#!/usr/bin/env node
/**
 * SCDL → PolarisOS + Photonic Feel pipeline
 * 
 * 1. Reads compiled SCDL JSON packets
 * 2. Converts to PolarisOS .pixelbrain.json envelope format
 * 3. Runs Photonic Feel evaluation (Geometry + Construction + Silhouette AMPs)
 * 4. Reports spatial awareness scores and suggestions
 * 
 * Usage: node scripts/scdl-to-polaris.mjs
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const scdlDir = resolve(root, 'worldpacks/shrine-demo/scdl');
const assetsDir = resolve(root, 'worldpacks/shrine-demo/assets-src');

// Asset key mapping: SCDL filename → PolarisOS assetKey + packet ID
const ASSET_MAP = {
  'lantern':              { assetKey: 'entities/lantern',              id: 'shrine-lantern',        cellSize: 1 },
  'brazier':              { assetKey: 'entities/brazier',              id: 'shrine-brazier-unlit',  cellSize: 1 },
  'brazier-lit':          { assetKey: 'entities/brazier_lit',          id: 'shrine-brazier-lit',    cellSize: 1 },
  'player-marker':        { assetKey: 'players/marker_default',        id: 'shrine-player-marker',  cellSize: 1 },
  'forest-background':    { assetKey: 'rooms/forest_path/background',  id: 'shrine-forest-bg',      cellSize: 1 },
  'shrine-background':    { assetKey: 'rooms/ruined_shrine/background', id: 'shrine-shrine-bg',     cellSize: 1 },
  'clearing-background':  { assetKey: 'rooms/moonlit_clearing/background', id: 'shrine-clearing-bg', cellSize: 1 },
};

// ─── Photonic Feel (inline, deterministic) ───────────────────────────────────

function stableHash(obj) {
  const str = JSON.stringify(obj, Object.keys(obj).sort());
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function evaluateFeel(cells, width, height) {
  if (!cells.length) return { spatialAwareness: 0, verdict: 'Empty field', suggestions: [] };

  // Normalize coordinates to 0..1
  const pts = cells.map(c => ({
    nx: c.x / (width - 1 || 1),
    ny: c.y / (height - 1 || 1),
    emphasis: c.emphasis || 1,
  }));

  const n = pts.length;

  // ── Geometry AMP ──
  const comX = pts.reduce((s, p) => s + p.nx * p.emphasis, 0) / pts.reduce((s, p) => s + p.emphasis, 0);
  const comY = pts.reduce((s, p) => s + p.ny * p.emphasis, 0) / pts.reduce((s, p) => s + p.emphasis, 0);
  const balance = 1 - Math.abs(comX - 0.5) * 2; // 1 = centered, 0 = edge

  // Focal point: find the most isolated high-emphasis cell
  let focalScore = 0.5;
  const emphatic = pts.filter(p => p.emphasis >= 1);
  if (emphatic.length > 0) {
    // Check if there's a clear focal region (rule of thirds)
    const thirdX = [0.33, 0.67];
    const thirdY = [0.33, 0.67];
    let bestFocal = 0;
    for (const tx of thirdX) {
      for (const ty of thirdY) {
        const near = emphatic.filter(p => Math.abs(p.nx - tx) < 0.2 && Math.abs(p.ny - ty) < 0.2);
        bestFocal = Math.max(bestFocal, near.length / emphatic.length);
      }
    }
    focalScore = Math.min(1, 0.3 + bestFocal * 2);
  }

  // Proportion
  const xs = pts.map(p => p.nx);
  const ys = pts.map(p => p.ny);
  const bboxW = Math.max(...xs) - Math.min(...xs);
  const bboxH = Math.max(...ys) - Math.min(...ys);
  const aspect = bboxW / (bboxH || 0.01);
  const proportion = aspect > 0.4 && aspect < 2.5 ? 0.8 : 0.4;

  // Tension (slight asymmetry is good)
  const tension = 1 - Math.abs(balance - 0.85) * 2;

  const geometryAgg = (balance * 0.3 + focalScore * 0.3 + proportion * 0.2 + Math.max(0, tension) * 0.2);

  // ── Construction AMP ──
  // Horizon: find the densest horizontal band
  const bands = new Array(10).fill(0);
  for (const p of pts) bands[Math.min(9, Math.floor(p.ny * 10))]++;
  const maxBand = bands.indexOf(Math.max(...bands));
  const horizonY = maxBand / 10;
  const horizonScore = horizonY > 0.4 && horizonY < 0.8 ? 0.8 : 0.4;

  // Axes: check for dominant vertical or horizontal alignment
  const colCounts = {};
  const rowCounts = {};
  for (const p of pts) {
    const col = Math.round(p.nx * 10);
    const row = Math.round(p.ny * 10);
    colCounts[col] = (colCounts[col] || 0) + 1;
    rowCounts[row] = (rowCounts[row] || 0) + 1;
  }
  const maxCol = Math.max(...Object.values(colCounts));
  const maxRow = Math.max(...Object.values(rowCounts));
  const axesScore = Math.min(1, Math.max(maxCol, maxRow) / n * 3);

  // Alignment: how many cells snap to 1/3 or 2/3 lines
  const snapLines = [0.33, 0.67];
  let snapped = 0;
  for (const p of pts) {
    if (snapLines.some(l => Math.abs(p.nx - l) < 0.05 || Math.abs(p.ny - l) < 0.05)) snapped++;
  }
  const alignmentScore = Math.min(1, snapped / n * 5);

  // Diagonals: check for diagonal energy
  let diagScore = 0.4;
  const topLeft = pts.filter(p => p.nx < 0.4 && p.ny < 0.4).length;
  const botRight = pts.filter(p => p.nx > 0.6 && p.ny > 0.6).length;
  if (topLeft > 0 && botRight > 0) diagScore = 0.7;

  const constructionAgg = (horizonScore * 0.3 + axesScore * 0.25 + alignmentScore * 0.25 + diagScore * 0.2);

  // ── Silhouette AMP ──
  // Contour: boundary vs interior ratio
  const occupied = new Set(cells.map(c => `${c.x},${c.y}`));
  let boundary = 0;
  for (const c of cells) {
    const neighbors = [[c.x-1,c.y],[c.x+1,c.y],[c.x,c.y-1],[c.x,c.y+1]];
    if (neighbors.some(([nx,ny]) => !occupied.has(`${nx},${ny}`))) boundary++;
  }
  const boundaryRatio = boundary / n;
  const contourScore = boundaryRatio > 0.3 && boundaryRatio < 0.8 ? 0.7 : 0.4;

  // Figure-ground: fill ratio
  const fillRatio = n / (width * height);
  const figureGroundScore = fillRatio > 0.1 && fillRatio < 0.75 ? 0.7 : 0.4;

  // Negative space: are empty regions shaped or random?
  const negScore = fillRatio < 0.6 ? 0.7 : 0.4;

  // Gesture: do emphatic cells form a flowing line?
  const gestureScore = 0.5; // simplified

  const silhouetteAgg = (contourScore * 0.3 + figureGroundScore * 0.3 + negScore * 0.2 + gestureScore * 0.2);

  // ── Aggregate ──
  const base = geometryAgg * 0.35 + constructionAgg * 0.30 + silhouetteAgg * 0.35;
  const minScore = Math.min(geometryAgg, constructionAgg, silhouetteAgg);
  const coherenceBonus = minScore > 0.6 ? (minScore - 0.6) * 0.25 : 0;
  const dissonancePenalty = minScore < 0.3 ? (0.3 - minScore) * 0.3 : 0;
  const spatialAwareness = Math.max(0, Math.min(1, base + coherenceBonus - dissonancePenalty));

  // Verdict
  let verdict;
  if (spatialAwareness > 0.8) verdict = 'The composition breathes. Weight, structure, and shape are in accord.';
  else if (spatialAwareness > 0.6) verdict = 'The composition holds. Minor tensions remain but the whole reads true.';
  else if (spatialAwareness > 0.4) verdict = 'The composition wavers. Some signals sing, others falter.';
  else verdict = 'The composition struggles. Rebuild from construction lines.';

  // Suggestions
  const suggestions = [];
  if (balance < 0.6) suggestions.push(comX < 0.4 ? 'SHIFT weight rightward' : 'SHIFT weight leftward');
  if (focalScore < 0.5) suggestions.push('CREATE a focal point at rule-of-thirds intersection');
  if (horizonScore < 0.5) suggestions.push(horizonY < 0.4 ? 'LOWER the horizon toward y≈0.62' : 'RAISE the horizon');
  if (contourScore < 0.5) suggestions.push('REFINE the silhouette contour');
  if (figureGroundScore < 0.5) suggestions.push(fillRatio > 0.75 ? 'CARVE negative space' : 'STRENGTHEN the figure');

  return {
    spatialAwareness: +spatialAwareness.toFixed(3),
    verdict,
    geometry: { aggregate: +geometryAgg.toFixed(3), balance: +balance.toFixed(3), focal: +focalScore.toFixed(3), proportion: +proportion.toFixed(3) },
    construction: { aggregate: +constructionAgg.toFixed(3), horizon: +horizonScore.toFixed(3), axes: +axesScore.toFixed(3), alignment: +alignmentScore.toFixed(3) },
    silhouette: { aggregate: +silhouetteAgg.toFixed(3), contour: +contourScore.toFixed(3), figureGround: +figureGroundScore.toFixed(3) },
    suggestions,
    feelHash: stableHash({ spatialAwareness, geometryAgg, constructionAgg, silhouetteAgg }),
  };
}

// ─── Main Pipeline ───────────────────────────────────────────────────────────

console.log('╔══════════════════════════════════════════════════════════╗');
console.log('║  SCDL → PolarisOS + Photonic Feel Pipeline             ║');
console.log('╚══════════════════════════════════════════════════════════╝\n');

const results = [];

for (const [stem, config] of Object.entries(ASSET_MAP)) {
  const jsonPath = resolve(scdlDir, `${stem}-json.json`);
  let compiled;
  try {
    compiled = JSON.parse(readFileSync(jsonPath, 'utf8'));
  } catch (e) {
    console.error(`✗ ${stem}: cannot read compiled packet (${e.message})`);
    continue;
  }

  const coords = compiled.geometry?.coordinates || compiled.coordinates || [];
  const canvas = compiled.canvas || { width: 16, height: 24 };

  // Deduplicate: painter's order — last write at each (x,y) wins
  // CARRY PROVENANCE: material, partId, role, sourceOpId survive the conversion
  const cellMap = new Map();
  for (const c of coords) {
    const x = c.snappedX ?? c.x;
    const y = c.snappedY ?? c.y;
    cellMap.set(`${x},${y}`, {
      snappedX: x,
      snappedY: y,
      color: c.color,
      // Provenance fields (Phase 1: stop discarding these)
      material: c.material || null,
      partId: c.partId || null,
      role: c.role || null,
      sourceOpId: c.sourceOpId || null,
      emphasis: c.emphasis ?? 1,
      z: c.z ?? 0,
      // Phase 2: Analytic vector identity from the SCDL compiler
      signedDistance: c.signedDistance,
      t: c.t,
      tangent: c.tangent,
      normal: c.normal,
      curvature: c.curvature,
      arcLength: c.arcLength,
      strokeHalfWidth: c.strokeHalfWidth,
    });
  }
  const dedupedCoords = [...cellMap.values()];

  // Convert to PolarisOS envelope format
  const envelope = {
    assetKey: config.assetKey,
    packet: {
      kind: 'pixelbrain.render.v1',
      id: config.id,
      schemaVersion: 1,
      canvas: {
        width: canvas.width,
        height: canvas.height,
        cellSize: config.cellSize,
        transparent: canvas.transparent !== false,
        background: canvas.background || '#00000000',
      },
      coordinates: dedupedCoords.map(c => ({
        snappedX: c.snappedX,
        snappedY: c.snappedY,
        color: c.color,
        // Provenance carried through to the PolarisOS envelope
        ...(c.material ? { material: c.material } : {}),
        ...(c.partId ? { partId: c.partId } : {}),
        ...(c.role ? { role: c.role } : {}),
        ...(c.sourceOpId ? { sourceOpId: c.sourceOpId } : {}),
        ...(c.emphasis !== 1 ? { emphasis: c.emphasis } : {}),
        ...(c.z !== 0 ? { z: c.z } : {}),
        // Phase 2: Analytic vector identity from the SCDL compiler
        ...(c.signedDistance !== undefined ? { signedDistance: c.signedDistance } : {}),
        ...(c.t !== undefined ? { t: c.t } : {}),
        ...(c.tangent ? { tangent: c.tangent } : {}),
        ...(c.normal ? { normal: c.normal } : {}),
        ...(c.curvature !== undefined ? { curvature: c.curvature } : {}),
        ...(c.arcLength !== undefined ? { arcLength: c.arcLength } : {}),
        ...(c.strokeHalfWidth !== undefined ? { strokeHalfWidth: c.strokeHalfWidth } : {}),
      })),
    },
  };

  // Write the PolarisOS envelope
  const outPath = resolve(assetsDir, `${stem}.pixelbrain.json`);
  writeFileSync(outPath, JSON.stringify(envelope, null, 2) + '\n');

  // Run Photonic Feel
  const feelCells = dedupedCoords.map(c => ({
    x: c.snappedX,
    y: c.snappedY,
    color: c.color,
    emphasis: 1,
    occupied: true,
    semanticRole: 'explicit',
  }));

  const feel = evaluateFeel(feelCells, canvas.width, canvas.height);

  results.push({ stem, cells: dedupedCoords.length, ...feel });

  // Report
  const bar = '█'.repeat(Math.round(feel.spatialAwareness * 20)) + '░'.repeat(20 - Math.round(feel.spatialAwareness * 20));
  console.log(`┌─ ${stem} (${dedupedCoords.length} cells, ${canvas.width}×${canvas.height})`);
  console.log(`│  Feel: [${bar}] ${feel.spatialAwareness.toFixed(3)}`);
  console.log(`│  ${feel.verdict}`);
  console.log(`│  Geometry:     ${feel.geometry.aggregate.toFixed(3)} (balance=${feel.geometry.balance.toFixed(2)}, focal=${feel.geometry.focal.toFixed(2)})`);
  console.log(`│  Construction: ${feel.construction.aggregate.toFixed(3)} (horizon=${feel.construction.horizon.toFixed(2)}, axes=${feel.construction.axes.toFixed(2)})`);
  console.log(`│  Silhouette:   ${feel.silhouette.aggregate.toFixed(3)} (contour=${feel.silhouette.contour.toFixed(2)}, fig/grnd=${feel.silhouette.figureGround.toFixed(2)})`);
  if (feel.suggestions.length) {
    console.log(`│  Suggestions:`);
    for (const s of feel.suggestions) console.log(`│    → ${s}`);
  }
  console.log(`│  Written: ${basename(outPath)}`);
  console.log(`└─ feelHash: ${feel.feelHash}\n`);
}

// Summary
console.log('═══════════════════════════════════════════════════════════');
console.log('SUMMARY');
console.log('═══════════════════════════════════════════════════════════');
const sorted = [...results].sort((a, b) => b.spatialAwareness - a.spatialAwareness);
for (const r of sorted) {
  const grade = r.spatialAwareness > 0.8 ? 'S' : r.spatialAwareness > 0.6 ? 'A' : r.spatialAwareness > 0.4 ? 'B' : 'C';
  console.log(`  [${grade}] ${r.stem.padEnd(22)} ${r.spatialAwareness.toFixed(3)}  (${r.cells} cells)`);
}
const avg = results.reduce((s, r) => s + r.spatialAwareness, 0) / results.length;
console.log(`\n  Average spatial awareness: ${avg.toFixed(3)}`);
console.log(`  Total assets: ${results.length}`);
