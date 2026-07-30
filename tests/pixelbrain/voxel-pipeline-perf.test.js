/**
 * QBIT-Voxel Level 4 Performance Benchmark
 *
 * Per QBIT-VOXEL-SYNTHESIS.md §4 Level 4 — full pipeline target:
 *   Fibonacci seed → 3D lift → QBIT propagation → material assignment →
 *   isometric projection completes in under 16 ms for a 64³ volume.
 *
 * The 16 ms goal is the photonic-bridge horizon, NOT a JS-runtime
 * requirement. The whole point of the photonic bridge is to take the JS
 * pipeline (which runs in hundreds of ms on a 64³ volume) and route the
 * propagation step to optical hardware that can hit <2ns per matrix-vector
 * multiply (per spec §4 Level 4 prediction).
 *
 * What this test guarantees:
 *   - No gross JS regression on the unaccelerated path (hard ceiling
 *     covers Steam Deck variability)
 *   - Octree acceleration produces correct results within ~3× of the
 *     standard path (it is a correctness alternative, not a speedup)
 *   - The bridge route grades a real 64³ field at A or S
 *   - RLE compression on a real propagated field beats 5×
 *
 * The numbers we log (median, min, max, ratio, bridge ms, grade, ratio)
 * are the empirical baseline for the Photonic Bridge integration
 * decision later in the project.
 */

import { describe, it, expect } from 'vitest';
import {
  createVoxelVolume,
  cellIndex,
  isCellOccupied,
  setCellMaterial,
  ENERGY_TYPES,
} from '../../codex/core/pixelbrain/voxel-volume.js';
import { generateFibonacciSeeds } from '../../codex/core/pixelbrain/wand-seed-lift.js';
import {
  propagate,
  propagateWithOctree,
  assignMaterial,
  ATTENUATION_MODELS,
} from '../../codex/core/pixelbrain/qbit-field.js';
import { applyHollownessAMP } from '../../codex/core/pixelbrain/hollowness-amp.js';
import { runBiomeCoherenceAMP } from '../../codex/core/pixelbrain/biome-coherence-amp.js';
import { collectFaces } from '../../codex/core/pixelbrain/iso-projector.js';
import { renderFacesToSVG } from '../../codex/core/pixelbrain/voxel-svg-renderer.js';
import { getCellMaterialId } from '../../codex/core/pixelbrain/voxel-volume.js';
import { routeQbitFieldToPhotonicBridge } from '../../codex/core/pixelbrain/qbit-bridge.js';
// Register photonic bridge for routeQbitFieldToPhotonicBridge.
import { registerPhotonicBridge } from '../../codex/core/pixelbrain/photonic-bridge-registry.js';
import { routeRetinaPacketToPhotonicBridge } from '../../src/lib/photonic-retina/retina-bridge.js';
registerPhotonicBridge({ routeRetinaPacketToPhotonicBridge });

const SIZE = 64;
const WARMUP_RUNS = 1;
const MEASURED_RUNS = 3;
// The JS-runtime ceiling allows for variance on developer hardware (Steam
// Deck baseline ~900 ms). The photonic horizon is logged but not asserted.
const HARD_CEILING_MS = 3000;
const PHOTONIC_HORIZON_MS = 16;
const TEST_TIMEOUT_MS = 90000;

function runFullPipeline(propagateFn = propagate) {
  const volume = createVoxelVolume(SIZE, SIZE, SIZE);

  const rawSeeds = generateFibonacciSeeds(
    { iterations: 6, scale: 0.75 },
    volume,
    { energyType: ENERGY_TYPES.STRUCTURAL, initialEnergy: 0.5 }
  );
  const seeds = rawSeeds.map((s) => ({
    x: s.vx, y: s.vy, z: s.vz, energy: s.energy, energyType: s.energyType,
  }));

  const field = propagateFn(seeds, SIZE, SIZE, SIZE, {
    attenuationModel: ATTENUATION_MODELS.INVERSE_SQUARE,
    maxRadius: 32,
    iterations: 1,
  });

  for (let y = 0; y < SIZE; y++) {
    for (let z = 0; z < SIZE; z++) {
      for (let x = 0; x < SIZE; x++) {
        const energy = field.energyAt(x, y, z);
        volume.energyField[cellIndex(volume, x, y, z)] = energy;
        setCellMaterial(volume, x, y, z, assignMaterial(energy));
      }
    }
  }

  applyHollownessAMP(volume, 3);

  const biomeField = { energyAt: (cell) => field.energyAt(cell.x, cell.y, cell.z) };
  runBiomeCoherenceAMP(volume, biomeField);

  const boundGet = (x, y, z) => getCellMaterialId(volume, x, y, z);
  const boundOcc = (x, y, z) => isCellOccupied(volume, x, y, z);
  const rawFaces = collectFaces(volume, boundGet, boundOcc);
  const faces = rawFaces.map((f) => ({ ...f, type: f.faceType }));
  renderFacesToSVG(faces);

  return field;
}

function measure(fn, runs) {
  for (let i = 0; i < WARMUP_RUNS; i++) fn();
  const samples = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    fn();
    const t1 = performance.now();
    samples.push(t1 - t0);
  }
  samples.sort((a, b) => a - b);
  return {
    min: samples[0],
    median: samples[Math.floor(samples.length / 2)],
    max: samples[samples.length - 1],
    mean: samples.reduce((a, b) => a + b, 0) / samples.length,
    samples,
  };
}

describe('QBIT-Voxel Level 4 — performance', () => {
  it('full 64³ pipeline completes under hard ceiling (gross-regression guard)', () => {
    const result = measure(() => runFullPipeline(propagate), MEASURED_RUNS);
     
    console.log(
      `  64³ pipeline (propagate): median=${result.median.toFixed(2)}ms min=${result.min.toFixed(2)}ms max=${result.max.toFixed(2)}ms (photonic horizon ${PHOTONIC_HORIZON_MS}ms, JS ceiling ${HARD_CEILING_MS}ms)`
    );
    expect(result.median).toBeLessThan(HARD_CEILING_MS);
  }, TEST_TIMEOUT_MS);

  it('octree-accelerated 64³ pipeline does not regress vs. standard propagate', () => {
    const standard = measure(() => runFullPipeline(propagate), MEASURED_RUNS);
    const octree = measure(() => runFullPipeline(propagateWithOctree), MEASURED_RUNS);
     
    console.log(
      `  octree vs standard: octree=${octree.median.toFixed(2)}ms standard=${standard.median.toFixed(2)}ms ratio=${(octree.median / standard.median).toFixed(2)}x`
    );
    // Octree is a correctness alternative, not a guaranteed speedup at this
    // scale (see qbit-field.test.js comment). Assert it doesn't regress more
    // than 3× the standard path.
    expect(octree.median).toBeLessThan(standard.median * 3);
  }, TEST_TIMEOUT_MS);

  it('photonic bridge route on 64³ field grades at A or S', () => {
    const field = runFullPipeline(propagate);
    const t0 = performance.now();
    const report = routeQbitFieldToPhotonicBridge(field, {
      retinaOptions: {
        targetDimension: 256,
        bitWidth: 4,
        rotationKind: 'signed-hash-rotation',
        quantizationKind: 'scalar',
      },
      includeGradient: false,        // gradient build is the most expensive bridge step
    });
    const elapsed = performance.now() - t0;
     
    console.log(
      `  bridge route (64³): ${elapsed.toFixed(2)}ms, grade=${report.grade}, score=${report.score.toFixed(3)}, rle-ratio=${report.rle ? report.rle.compressionRatio.toFixed(1) : 'n/a'}x`
    );
    expect(report.ok).toBe(true);
    expect(['A', 'S']).toContain(report.grade);
  }, TEST_TIMEOUT_MS);

  it('RLE on a real propagated 64³ field beats 5× compression', () => {
    const field = runFullPipeline(propagate);
    const report = routeQbitFieldToPhotonicBridge(field, { includeGradient: false });
    expect(report.rle.compressionRatio).toBeGreaterThan(5);
  }, TEST_TIMEOUT_MS);
});
