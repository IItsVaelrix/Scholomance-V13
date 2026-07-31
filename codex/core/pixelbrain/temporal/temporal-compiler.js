/**
 * Temporal Compiler — top-level orchestration: gene → frames → certification.
 *
 * This is the "compile" step for animation-as-source-code:
 *   1. Certify the gene (governor validates structure)
 *   2. Interpolate keyframes → intermediate states (engine)
 *   3. Certify each frame (governor verifies determinism)
 *   4. Emit a compiled temporal packet with per-frame checksums
 *
 * The compiler NEVER:
 *   - Authors genes (Curation Law)
 *   - Modifies keyframe data
 *   - Auto-accepts low Feel scores
 *   - Converts warnings into mutations
 *
 * Output: PB-TEMPORAL-COMPILED-v1 — a frozen, checksummed packet of
 * certified frames ready for VRI consumption or Blender wire protocol.
 */

import {
  TEMPORAL_CONTRACT,
  TEMPORAL_VERSION,
  createTemporalGene,
  validateTemporalSpec,
  computeTemporalChecksum,
} from './temporal-schema.js';
import {
  INTERPOLATION_ENGINE_VERSION,
  evaluateTemporal,
  evaluateEnergyBindings,
  generateFrames,
} from './interpolation-engine.js';
import {
  TEMPORAL_GOVERNOR_VERSION,
  certifyGene,
  certifyInterpolation,
  certifySequence,
  computeProjectionChecksum,
} from './temporal-governor.js';
import { canonicalConstructionStringify } from '../construction/construction-schema.js';
import { sha256Hex } from '../sha256.js';

// ─── Contract ────────────────────────────────────────────────────────────────

export const TEMPORAL_COMPILED_CONTRACT = 'PB-TEMPORAL-COMPILED-v1';
export const TEMPORAL_COMPILER_VERSION = '1.0.0';

// ─── Compilation ─────────────────────────────────────────────────────────────

/**
 * Compile a temporal gene into a certified frame sequence.
 *
 * @param {object} gene - A PB-TEMPORAL-GENE-v1 packet (already created via createTemporalGene)
 * @param {object} options
 * @param {number} options.frameCount - Number of frames to generate
 * @param {string} [options.assetId] - Override asset ID (defaults to gene.assetId)
 * @param {object} [options.algorithmOptions] - Algorithm-specific options (e.g. bezier control points)
 * @returns {object} PB-TEMPORAL-COMPILED-v1 packet (frozen)
 * @throws {Error} On certification failure or invalid gene
 */
export function compileTemporal(gene, options = {}) {
  const { frameCount, algorithmOptions = {} } = options;

  if (!frameCount || frameCount < 1) {
    const err = new Error('compileTemporal requires options.frameCount >= 1');
    err.bytecode = 'PB-ERR-v1-TEMPORAL-COMPILE-INVALID-FRAMECOUNT';
    throw err;
  }

  // Step 1: Certify the gene
  const geneCert = certifyGene(gene);
  if (!geneCert.certified) {
    const err = new Error(
      `Gene certification failed: ${geneCert.issues.join('; ')}`,
    );
    err.bytecode = 'PB-ERR-v1-TEMPORAL-COMPILE-CERTIFICATION-FAILED';
    err.issues = geneCert.issues;
    throw err;
  }

  // Step 2: Generate frames via interpolation engine
  const rawFrames = generateFrames(gene, frameCount, algorithmOptions);

  // Step 3: Certify each frame via governor
  const certifiedFrames = rawFrames.map(({ frame, time, state, energy }) => {
    const result = evaluateTemporal(gene, time, algorithmOptions);
    const cert = certifyInterpolation(gene, time, result, energy, algorithmOptions);

    return {
      frame,
      time,
      state,
      energy,
      projectionChecksum: cert.projectionChecksum,
      certified: cert.certified,
    };
  });

  // Step 4: Verify all frames certified
  const allCertified = certifiedFrames.every(f => f.certified);
  if (!allCertified) {
    const failedFrames = certifiedFrames.filter(f => !f.certified).map(f => f.frame);
    const err = new Error(
      `Temporal compilation failed: frames [${failedFrames.join(', ')}] failed determinism certification`,
    );
    err.bytecode = 'PB-ERR-v1-TEMPORAL-COMPILE-DETERMINISM-FAILED';
    err.failedFrames = failedFrames;
    throw err;
  }

  // Step 5: Build compiled packet
  const compiled = {
    contract: TEMPORAL_COMPILED_CONTRACT,
    version: TEMPORAL_COMPILER_VERSION,
    geneChecksum: gene.checksum,
    geneId: gene.id,
    assetId: options.assetId ?? gene.assetId,
    algorithm: gene.algorithm,
    aspect: gene.aspect,
    projectionMode: gene.projectionMode,
    frameCount,
    startTime: gene.keyframes[0].time,
    endTime: gene.keyframes[gene.keyframes.length - 1].time,
    engineVersion: INTERPOLATION_ENGINE_VERSION,
    governorVersion: TEMPORAL_GOVERNOR_VERSION,
    compilerVersion: TEMPORAL_COMPILER_VERSION,
    frames: certifiedFrames.map(f => ({
      frame: f.frame,
      time: f.time,
      projectionChecksum: f.projectionChecksum,
      state: f.state,
      energy: f.energy,
    })),
  };

  // Compute compilation checksum
  compiled.checksum = computeCompilationChecksum(compiled);

  return Object.freeze(compiled);
}

// ─── Compilation Checksum ────────────────────────────────────────────────────

/**
 * Compute the compilation checksum.
 * Binds: gene checksum, all frame projection checksums, versions, frame count.
 */
function computeCompilationChecksum(compiled) {
  const canonical = canonicalConstructionStringify({
    contract: TEMPORAL_COMPILED_CONTRACT,
    compilerVersion: compiled.compilerVersion,
    geneChecksum: compiled.geneChecksum,
    algorithm: compiled.algorithm,
    frameCount: compiled.frameCount,
    engineVersion: compiled.engineVersion,
    governorVersion: compiled.governorVersion,
    frameChecksums: compiled.frames.map(f => f.projectionChecksum),
  });
  return `sha256-canonical-v1:${sha256Hex(canonical)}`;
}

// ─── Replay ──────────────────────────────────────────────────────────────────

/**
 * Replay a single frame from a compiled temporal packet.
 *
 * Re-evaluates the gene at the frame's time and verifies the projection
 * checksum matches. This proves the frame is regenerable from first principles.
 *
 * @param {object} gene - The original temporal gene
 * @param {object} compiledFrame - A frame from the compiled packet
 * @param {object} [algorithmOptions] - Algorithm-specific options
 * @returns {{ verified: boolean, actualChecksum: string, expectedChecksum: string }}
 */
export function replayFrame(gene, compiledFrame, algorithmOptions = {}) {
  const result = evaluateTemporal(gene, compiledFrame.time, algorithmOptions);
  const energy = evaluateEnergyBindings(gene, compiledFrame.time);

  const actualChecksum = computeProjectionChecksum({
    geneChecksum: gene.checksum,
    algorithm: gene.algorithm,
    time: compiledFrame.time,
    bracketFrom: result.bracket.from,
    bracketTo: result.bracket.to,
    localT: result.localT,
    state: result.state,
    energy,
  });

  return {
    verified: actualChecksum === compiledFrame.projectionChecksum,
    actualChecksum,
    expectedChecksum: compiledFrame.projectionChecksum,
  };
}

// ─── VRI Bridge ──────────────────────────────────────────────────────────────

/**
 * Extract a VRI-ready scene state from a compiled frame.
 *
 * The VRI compiler (vri-compiler.js) consumes construction solver results.
 * This adapter extracts the state + energy from a compiled frame and
 * formats it for VRI consumption.
 *
 * @param {object} compiledFrame - A frame from PB-TEMPORAL-COMPILED-v1
 * @param {object} [vriOptions] - VRI compilation options
 * @returns {{ state: object, energy: object, time: number, projectionChecksum: string }}
 */
export function extractVRIInput(compiledFrame, vriOptions = {}) {
  return {
    state: compiledFrame.state,
    energy: compiledFrame.energy,
    time: compiledFrame.time,
    projectionChecksum: compiledFrame.projectionChecksum,
    frame: compiledFrame.frame,
  };
}

// ─── Blender Wire Bridge ─────────────────────────────────────────────────────

/**
 * Format a compiled frame for the Blender wire protocol.
 *
 * The wire protocol (wire.js) carries construction state as named attributes
 * on a mesh. This adapter formats the temporal state for wire consumption:
 *   - Vertices from state geometry
 *   - Named attributes for energy bindings
 *   - Time parameter for temporal positioning
 *   - Projection checksum for receipt verification
 *
 * @param {object} compiledFrame - A frame from PB-TEMPORAL-COMPILED-v1
 * @param {object} [wireOptions] - Wire protocol options
 * @returns {object} Wire-ready packet
 */
export function formatForWire(compiledFrame, wireOptions = {}) {
  const { state, energy, time, projectionChecksum, frame } = compiledFrame;

  // Extract vertices from state
  const vertices = [];
  const partIds = Object.keys(state).sort();
  for (const partId of partIds) {
    const part = state[partId];
    if (!part) continue;
    for (const field of ['spine', 'closedContour', 'leftBank', 'rightBank']) {
      if (Array.isArray(part[field])) {
        for (const point of part[field]) {
          if (Array.isArray(point)) {
            vertices.push({ x: point[0], y: point[1], partId, field });
          }
        }
      }
    }
  }

  return {
    frame,
    time,
    projectionChecksum,
    vertexCount: vertices.length,
    vertices,
    energyBindings: energy,
    partIds,
    wireVersion: wireOptions.wireVersion ?? '1.0.0',
  };
}
