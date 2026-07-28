#!/usr/bin/env node
/**
 * WAND → SCDL → VIXEL → FEEL PIPELINE
 *
 * The full integrated art pipeline:
 *   1. Load SCDL compiled packet (pixel grid with materials)
 *   2. Load Wand formula definitions (vector contours per part)
 *   3. Evaluate Wand formulas → vectorPaths
 *   4. Fuse pixelGrid + vectorPaths → VixelField (QBIT Lattice)
 *   5. Evaluate VixelField → VixelFeelReport (Photonic Feel)
 *   6. Output structured report
 *
 * Usage:
 *   node scripts/wand-vixel-pipeline.mjs <asset-name>
 *   node scripts/wand-vixel-pipeline.mjs brazier
 *   node scripts/wand-vixel-pipeline.mjs --all
 *
 * @bytecode WAND-VIXEL-PIPELINE-v1
 */

import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

// ─── Imports from the real modules ───────────────────────────────────────────

import { evaluateFormula } from '../codex/core/pixelbrain/formula-to-coordinates.js';
import { fuseToVixelField, diffVixelFields } from '../src/lib/vixel-lattice/vixel-fusion.js';
import { evaluateVixelFeel, diffVixelFeel } from '../src/lib/vixel-lattice/vixel-feel-adapter.js';

// ─── Paths ───────────────────────────────────────────────────────────────────

const SHRINE_DIR = resolve('PolarisOS/worldpacks/shrine-demo');
const SCDL_DIR = join(SHRINE_DIR, 'scdl');
const WAND_DIR = join(SHRINE_DIR, 'wand');

// ─── Loaders ─────────────────────────────────────────────────────────────────

function loadScdlPacket(assetName) {
  const path = join(SCDL_DIR, `${assetName}-json.json`);
  const raw = JSON.parse(readFileSync(path, 'utf8'));

  // Extract the pixelGrid format that fuseToVixelField expects
  return {
    id: raw.id,
    source: raw.source,
    canvas: raw.canvas,
    coordinates: raw.geometry.coordinates.map(c => ({
      x: c.x,
      y: c.y,
      color: c.color,
      partId: c.partId || 'unknown',
      material: c.material || 'source',
      emphasis: c.emphasis !== undefined ? c.emphasis : 1,
      z: c.z || 0,
    })),
  };
}

function loadWandDefinition(assetName) {
  const path = join(WAND_DIR, `${assetName}.wand.json`);
  return JSON.parse(readFileSync(path, 'utf8'));
}

// ─── Wand evaluation ─────────────────────────────────────────────────────────

/**
 * Evaluate all Wand formulas for an asset and produce vectorPaths
 * in the format fuseToVixelField expects: [{role, points: [{x, y}]}]
 */
function evaluateWandFormulas(wandDef) {
  const canvasSize = wandDef.canvas;
  const vectorPaths = [];

  for (const formulaDef of wandDef.formulas) {
    const coords = evaluateFormula(formulaDef.formula, canvasSize, 0, { strict: true });

    if (coords.length === 0) {
      console.warn(`  [WAND] WARNING: ${formulaDef.role} produced 0 coordinates`);
      continue;
    }

    // Convert formula output to vectorPath format
    // Apply pressure as emphasis if specified
    const points = coords.map(c => ({
      x: c.x,
      y: c.y,
      pressure: formulaDef.pressure !== undefined ? formulaDef.pressure : (c.emphasis || 1),
    }));

    vectorPaths.push({
      role: formulaDef.role,
      points,
      source: formulaDef.type,
      pressure: formulaDef.pressure,
    });
  }

  return vectorPaths;
}

// ─── Pipeline ────────────────────────────────────────────────────────────────

function runPipeline(assetName) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  WAND → VIXEL PIPELINE: ${assetName}`);
  console.log(`${'═'.repeat(60)}`);

  // Step 1: Load SCDL compiled packet
  console.log(`\n  [1/5] Loading SCDL packet...`);
  const pixelGrid = loadScdlPacket(assetName);
  console.log(`        Packet: ${pixelGrid.id}`);
  console.log(`        Canvas: ${pixelGrid.canvas.width}×${pixelGrid.canvas.height}`);
  console.log(`        Cells:  ${pixelGrid.coordinates.length}`);

  // Step 2: Load Wand definitions
  console.log(`\n  [2/5] Loading Wand formulas...`);
  const wandDef = loadWandDefinition(assetName);
  console.log(`        Formulas: ${wandDef.formulas.length}`);
  for (const f of wandDef.formulas) {
    console.log(`          • ${f.role} (${f.type})`);
  }

  // Step 3: Evaluate Wand → vectorPaths
  console.log(`\n  [3/5] Evaluating Wand formulas...`);
  const vectorPaths = evaluateWandFormulas(wandDef);
  const totalPoints = vectorPaths.reduce((sum, p) => sum + p.points.length, 0);
  console.log(`        Paths:  ${vectorPaths.length}`);
  console.log(`        Points: ${totalPoints}`);

  // Step 4: Fuse → VixelField
  console.log(`\n  [4/5] Fusing pixel + vector → VixelField...`);
  const field = fuseToVixelField(pixelGrid, vectorPaths, {
    id: `vixel_${assetName}`,
  });
  console.log(`        Field:  ${field.id}`);
  console.log(`        Vixels: ${field.vixels.length}`);
  console.log(`        Hash:   ${field.vixelHash}`);
  console.log(`        Match:  ${field.provenance.matchRatio * 100}%`);
  console.log(`        Vector source: ${field.provenance.vectorSource}`);

  // Step 5: Evaluate Feel
  console.log(`\n  [5/5] Evaluating Photonic Feel...`);
  const report = evaluateVixelFeel(field);
  console.log(`        Spatial Awareness: ${report.spatialAwareness}`);
  console.log(`        Verdict: ${report.verdict}`);
  console.log(`        Feel Hash: ${report.feelHash}`);

  // Vixel-specific diagnostics
  const diag = report.vixelDiagnostics;
  console.log(`\n  ─── Vixel Diagnostics ───`);
  console.log(`        Match Ratio:          ${diag.matchRatio}`);
  console.log(`        Texture-Form Coherence: ${diag.textureFormCoherence}`);
  console.log(`        Role Distribution:    ${JSON.stringify(diag.roleDistribution)}`);
  console.log(`        Curvature Histogram:  ${JSON.stringify(diag.curvatureHistogram)}`);

  // Suggestions
  if (report.suggestions && report.suggestions.length > 0) {
    console.log(`\n  ─── Suggestions ───`);
    for (const s of report.suggestions) {
      console.log(`        → ${s}`);
    }
  }

  // Perceptual evidence sidecar (quality trio)
  if (report.perceptualEvidence) {
    const pe = report.perceptualEvidence;
    console.log(`\n  ─── Perceptual Evidence ───`);
    console.log(`        Mode: ${pe.mode}`);
    console.log(`        Feature hash: ${pe.features.featureHash}`);
    console.log(`        Regions: ${pe.partition.regions.length}`);
    console.log(`        Composition hash: ${pe.composition.compositionHash}`);
    console.log(`        Fidelity identityRetention: ${pe.fidelity.identityRetention}`);
    console.log(`        Fidelity coherenceGain: ${pe.fidelity.coherenceGain}`);
    if (pe.fidelity.constrainedSuggestion) {
      console.log(`        Suggestion: ${pe.fidelity.constrainedSuggestion}`);
    }
    console.log(`        Evidence hash: ${pe.evidenceHash}`);
  }

  // Sample fused vixels
  console.log(`\n  ─── Sample Fused Vixels ───`);
  const samples = field.vixels.filter((_, i) => i % Math.max(1, Math.floor(field.vixels.length / 5)) === 0).slice(0, 5);
  for (const v of samples) {
    console.log(`        (${v.x},${v.y}) ${v.pixel.color} [${v.pixel.material}]`);
    console.log(`          → ${v.vector.pathRef}  t=${v.vector.parametricT}  κ=${v.vector.curvature}`);
    console.log(`          → normal=[${v.vector.normalX}, ${v.vector.normalY}]  dist=${v.vector.pressure}`);
    console.log(`          → feel: ${v.feel.role}  salience=${v.feel.salience}  boundary=${v.feel.isBoundary}`);
  }

  return { assetName, field, report, vectorPaths, pixelGrid };
}

// ─── Determinism verification ────────────────────────────────────────────────

function verifyDeterminism(assetName) {
  console.log(`\n  ─── Determinism Check ───`);
  const r1 = runPipelineQuiet(assetName);
  const r2 = runPipelineQuiet(assetName);
  const pass = r1.field.vixelHash === r2.field.vixelHash && r1.report.feelHash === r2.report.feelHash;
  console.log(`        Run 1 hash: ${r1.field.vixelHash}`);
  console.log(`        Run 2 hash: ${r2.field.vixelHash}`);
  console.log(`        Deterministic: ${pass ? 'PASS ✓' : 'FAIL ✗'}`);
  return pass;
}

function runPipelineQuiet(assetName) {
  const pixelGrid = loadScdlPacket(assetName);
  const wandDef = loadWandDefinition(assetName);
  const vectorPaths = evaluateWandFormulas(wandDef);
  const field = fuseToVixelField(pixelGrid, vectorPaths, { id: `vixel_${assetName}` });
  const report = evaluateVixelFeel(field);
  return { field, report };
}

// ─── Main ────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes('--all')) {
  // Discover all wand definitions
  const wandFiles = readdirSync(WAND_DIR).filter(f => f.endsWith('.wand.json'));
  const assets = wandFiles.map(f => f.replace('.wand.json', ''));

  console.log(`\n  Discovered ${assets.length} Wand-defined assets: ${assets.join(', ')}`);

  const results = [];
  for (const asset of assets) {
    try {
      results.push(runPipeline(asset));
    } catch (e) {
      console.error(`\n  ERROR processing ${asset}: ${e.message}`);
    }
  }

  // Summary table
  console.log(`\n\n${'═'.repeat(60)}`);
  console.log(`  SUMMARY`);
  console.log(`${'═'.repeat(60)}`);
  console.log(`  ${'Asset'.padEnd(20)} ${'Awareness'.padEnd(12)} ${'Match%'.padEnd(10)} ${'Coherence'.padEnd(12)} ${'Cells'.padEnd(8)}`);
  console.log(`  ${'─'.repeat(20)} ${'─'.repeat(12)} ${'─'.repeat(10)} ${'─'.repeat(12)} ${'─'.repeat(8)}`);
  for (const r of results) {
    console.log(`  ${r.assetName.padEnd(20)} ${String(r.report.spatialAwareness).padEnd(12)} ${String(Math.round(r.field.provenance.matchRatio * 100) + '%').padEnd(10)} ${String(r.report.vixelDiagnostics.textureFormCoherence).padEnd(12)} ${String(r.field.vixels.length).padEnd(8)}`);
  }

  // Determinism
  console.log(`\n  Determinism verification:`);
  for (const asset of assets) {
    verifyDeterminism(asset);
  }

} else if (args.length > 0) {
  const assetName = args[0];
  runPipeline(assetName);
  verifyDeterminism(assetName);
} else {
  console.log(`
WAND → VIXEL PIPELINE

Usage:
  node scripts/wand-vixel-pipeline.mjs <asset-name>
  node scripts/wand-vixel-pipeline.mjs --all

Assets with Wand definitions:
  brazier, lantern, player-marker

Pipeline:
  SCDL compile → pixelGrid (materials, colors)
  Wand formulas → vectorPaths (smooth contours)
  fuseToVixelField → VixelField (QBIT Lattice)
  evaluateVixelFeel → VixelFeelReport (Photonic Feel)
`);
}
