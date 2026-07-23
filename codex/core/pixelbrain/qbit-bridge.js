/**
 * QBIT-Voxel ↔ Photonic Bridge Wiring
 *
 * Implements QBIT-VOXEL-SYNTHESIS.md §3 Difficulty 8 and §4 Level 4.
 *
 * Takes a QBIT field (Float32 energy tensor + optional gradient tensor),
 * builds a `qbit-field` photonic retinaInput, routes it through the
 * Photonic Bridge, and returns a deterministic report that includes:
 *   - retina packet
 *   - compatibility grade (predicted A or S for QBIT propagation)
 *   - operation graph (PROPAGATE op marked PHOTONIC_FRIENDLY)
 *   - RLE compression telemetry
 *   - latency / power estimate
 *
 * This module is the wire — not the engine. All decisions about WHAT to
 * propagate live in `qbit-field.js`. This module only adapts the result
 * shape to what the bridge expects, and reads the bridge's verdict.
 */

import { getPhotonicBridge } from './photonic-bridge-registry.js';
import { encodeEnergyFieldRLE } from './qbit-field-rle.js';

const DEFAULT_QBIT_RETINA_OPTIONS = Object.freeze({
  targetDimension: 256,
  bitWidth: 4,
});

function buildGradientField(field, width, height, depth) {
  const totalCells = width * height * depth;
  const gradient = new Float32Array(totalCells * 3);

  for (let y = 0; y < height; y++) {
    for (let z = 0; z < depth; z++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width * depth + z * width + x;
        const g = field.gradientAt(x, y, z);
        gradient[idx * 3] = g.gx;
        gradient[idx * 3 + 1] = g.gy;
        gradient[idx * 3 + 2] = g.gz;
      }
    }
  }

  return gradient;
}

function materializeEnergyField(field, width, height, depth) {
  const totalCells = width * height * depth;
  const buffer = new Float32Array(totalCells);

  for (let y = 0; y < height; y++) {
    for (let z = 0; z < depth; z++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width * depth + z * width + x;
        buffer[idx] = field.energyAt(x, y, z);
      }
    }
  }

  return buffer;
}

/**
 * Build a retina input from a QBIT field. The input is shaped as
 * `sourceKind: 'qbit-field'` with 3D dimensions.
 *
 * @param {object} field          QBIT field returned by `propagate()`
 * @param {object} options        { includeGradient: boolean, metadata: object }
 * @returns {object}              retina input object suitable for
 *                                `encodeToPhotonicRetina()` or
 *                                `routeRetinaPacketToPhotonicBridge()`
 */
export function buildQbitFieldRetinaInput(field, options = {}) {
  const { width, height, depth } = field;
  const includeGradient = options.includeGradient !== false;

  const energyField = materializeEnergyField(field, width, height, depth);
  const gradientField = includeGradient
    ? buildGradientField(field, width, height, depth)
    : null;

  const payload = {
    width,
    height,
    depth,
    energyField,
  };
  if (gradientField) {
    payload.gradientField = gradientField;
  }

  const baseMetadata = options.metadata && typeof options.metadata === 'object'
    ? options.metadata
    : {};

  return {
    sourceKind: 'qbit-field',
    payload,
    dimensions: { width, height, depth },
    metadata: {
      attenuationModel: baseMetadata.attenuationModel ?? 'inverse_square',
      seedCount: baseMetadata.seedCount ?? 0,
      ...baseMetadata,
    },
  };
}

/**
 * Route a QBIT field through the Photonic Bridge and return a unified
 * report. The report includes the bridge verdict (grade, score, ops) plus
 * RLE compression telemetry computed independently.
 *
 * @param {object} field    QBIT field returned by `propagate()`
 * @param {object} options  {
 *   retinaOptions: { targetDimension, bitWidth, mode, quantizationKind, rotationKind, ... },
 *   bridgeOptions: { mode, minWarnScore, minGateScore, ... },
 *   includeGradient: boolean,
 *   includeRle: boolean,
 *   metadata: object
 * }
 * @returns {object}        route report with compatibility grade + telemetry
 */
export function routeQbitFieldToPhotonicBridge(field, options = {}) {
  if (!field || typeof field.energyAt !== 'function') {
    throw new TypeError('routeQbitFieldToPhotonicBridge requires a QBIT field with energyAt(x,y,z)');
  }

  const retinaInput = buildQbitFieldRetinaInput(field, {
    includeGradient: options.includeGradient !== false,
    metadata: options.metadata,
  });

  const retinaOpts = {
    ...DEFAULT_QBIT_RETINA_OPTIONS,
    ...(options.retinaOptions || {}),
  };

  const bridge = getPhotonicBridge();
  if (!bridge || !bridge.routeRetinaPacketToPhotonicBridge) {
    throw new Error('Photonic bridge not registered. Call registerPhotonicBridge() from src/ layer first.');
  }

  const route = bridge.routeRetinaPacketToPhotonicBridge(retinaInput, {
    retina: retinaOpts,
    bridge: options.bridgeOptions || {},
    previewLength: options.previewLength,
  });

  let rle = null;
  if (options.includeRle !== false && retinaInput.payload.energyField) {
    rle = encodeEnergyFieldRLE(
      retinaInput.payload.energyField,
      field.width,
      field.height,
      field.depth
    );
  }

  return Object.freeze({
    ok: route.ok,
    routeId: route.routeId,
    grade: route.bridgeReport?.compatibilityGrade ?? 'D',
    score: route.bridgeReport?.compatibilityScore ?? 0,
    bridgeReport: route.bridgeReport,
    packet: route.packet,
    preview: route.preview,
    delta: route.delta,
    opticalSimulation: route.opticalSimulation,
    rle: rle && Object.freeze({
      runCount: rle.runCount,
      originalBytes: rle.originalBytes,
      compressedBytes: rle.compressedBytes,
      compressionRatio: rle.compressionRatio,
    }),
    diagnostics: route.diagnostics,
  });
}

export const QBIT_BRIDGE_DEFAULTS = DEFAULT_QBIT_RETINA_OPTIONS;
