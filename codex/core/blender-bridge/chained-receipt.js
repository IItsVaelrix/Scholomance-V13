/**
 * chained-receipt — per-frame digest chain for PATH_DEPENDENT renders.
 *
 * An endpoint checksum is valid exactly when the process is conservative.
 * Simulation caches (rigid body, cloth, fluid) are PATH_DEPENDENT: cold-starting
 * frame N returns the UN-SIMULATED state and Blender reports nothing wrong.
 *
 * The chained receipt makes frame N unsealable without N−1:
 *
 *   PIXEL_RECEIPT(N) = sha256(pixel_dump_N ‖ digest_{N−1})
 *   digest_0         = the sealed packet's own seal
 *
 * A cold-started worker has nothing to fold and must REFUSE rather than emit
 * a confident wrong frame. Divergence localizes to the FIRST bad frame.
 *
 * No new primitive: a hash chain (SCR-002, ID) plus SCR-005's monotonic gate
 * for ordering. SYNTH_CLASS gains SIMULATED, which tells a consumer "this
 * receipt is chained; endpoint verification is invalid here."
 */

import { createHash } from 'node:crypto';
import { renderSCD64, classifyDivergence } from './render-scd64.js';

export class ChainError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ChainError';
  }
}

/**
 * Compute the chained pixel receipt hash for frame N.
 *
 *   digest_0 = seal (the packet's own checksum)
 *   PIXEL_RECEIPT(N) = sha256(pixel_dump_bytes_N ‖ digest_{N−1})
 *
 * @param {Buffer} pixelDumpBytes - raw float32 pixel dump for this frame
 * @param {string} prevDigest - hex digest from the previous frame (or the seal for frame 0)
 * @returns {string} uppercase hex sha256
 */
export function chainedPixelHash(pixelDumpBytes, prevDigest) {
  if (!Buffer.isBuffer(pixelDumpBytes)) {
    throw new ChainError('pixelDumpBytes must be a Buffer');
  }
  if (typeof prevDigest !== 'string' || prevDigest.length === 0) {
    throw new ChainError('prevDigest must be a non-empty hex string');
  }
  return createHash('sha256')
    .update(pixelDumpBytes)
    .update(prevDigest, 'utf8')
    .digest('hex')
    .toUpperCase();
}

/**
 * Build a full digest chain from a seal and an ordered array of pixel dump buffers.
 *
 * @param {string} seal - the packet's own checksum (digest_0)
 * @param {Buffer[]} frameDumps - ordered pixel dump buffers, frame 0..N
 * @returns {ReadonlyArray<{frame: number, digest: string}>}
 */
export function buildChain(seal, frameDumps) {
  if (typeof seal !== 'string' || seal.length === 0) {
    throw new ChainError('seal must be a non-empty string (the packet checksum)');
  }
  if (!Array.isArray(frameDumps) || frameDumps.length === 0) {
    throw new ChainError('frameDumps must be a non-empty array of Buffers');
  }

  const chain = [];
  let prevDigest = seal;

  for (let i = 0; i < frameDumps.length; i++) {
    const digest = chainedPixelHash(frameDumps[i], prevDigest);
    chain.push(Object.freeze({ frame: i, digest }));
    prevDigest = digest;
  }

  return Object.freeze(chain);
}

/**
 * Verify a chain against a seal and frame dumps.
 * Returns the index of the first divergent frame, or -1 if all match.
 *
 * @param {string} seal
 * @param {Buffer[]} frameDumps
 * @param {ReadonlyArray<{frame: number, digest: string}>} claimedChain
 * @returns {{valid: boolean, firstBadFrame: number, checkedFrames: number}}
 */
export function verifyChain(seal, frameDumps, claimedChain) {
  if (claimedChain.length !== frameDumps.length) {
    throw new ChainError(
      `chain length ${claimedChain.length} does not match frame count ${frameDumps.length}`,
    );
  }

  let prevDigest = seal;
  for (let i = 0; i < frameDumps.length; i++) {
    const expected = chainedPixelHash(frameDumps[i], prevDigest);
    if (claimedChain[i].digest !== expected) {
      return Object.freeze({ valid: false, firstBadFrame: i, checkedFrames: i });
    }
    prevDigest = expected;
  }

  return Object.freeze({ valid: true, firstBadFrame: -1, checkedFrames: frameDumps.length });
}

/**
 * Mint a chained receipt for a single frame.
 *
 * @param {object} claim - the addon's raw claim for this frame
 * @param {string} pixelDigest - the chained pixel hash for this frame
 * @param {number} frameIndex
 * @param {string} prevDigest - digest from frame N−1 (or the seal for frame 0)
 * @returns {Readonly<object>} frozen receipt
 */
export function mintChainedReceipt(claim, pixelDigest, frameIndex, prevDigest) {
  if (!claim || typeof claim !== 'object') {
    throw new ChainError('claim must be a non-null object');
  }
  if (typeof pixelDigest !== 'string' || pixelDigest.length === 0) {
    throw new ChainError('pixelDigest must be a non-empty hex string');
  }
  if (!Number.isInteger(frameIndex) || frameIndex < 0) {
    throw new ChainError('frameIndex must be a non-negative integer');
  }

  const observed = claim.observed ?? {};

  const inputs = {
    synthClass: 'SIMULATED',
    resolutionX: observed.resolutionX ?? 0,
    resolutionY: observed.resolutionY ?? 0,
    pixelAspect: observed.pixelAspect ?? 1,
    frameIndex,
    cameraMatrix: observed.cameraMatrix ?? '',
    blenderVersion: observed.blenderVersion ?? '',
    buildHash: observed.buildHash ?? '',
    engine: observed.engine ?? 'CYCLES',
    device: observed.device ?? 'CPU',
    seed: observed.seed ?? 0,
    samples: observed.samples ?? 0,
    adaptive: observed.adaptive ?? false,
    adaptiveThreshold: observed.adaptiveThreshold ?? 0,
    bounces: observed.bounces ?? 0,
    clamping: observed.clamping ?? 0,
    shutterOpen: observed.shutterOpen ?? 0,
    shutterClose: observed.shutterClose ?? 0,
    timeSamples: observed.timeSamples ?? 0,
    denoiser: observed.denoiser ?? 'NONE',
    denoiseInputPasses: observed.denoiseInputPasses ?? '',
    denoiseEnabled: observed.denoiseEnabled ?? false,
    viewTransform: observed.viewTransform ?? 'Standard',
    look: observed.look ?? 'None',
    displayDevice: observed.displayDevice ?? 'sRGB',
    format: observed.format ?? 'OPEN_EXR',
    colorDepth: observed.colorDepth ?? '32',
    sceneGraph: claim.packetId ?? '',
    nodeTreeHashes: observed.nodeTreeHashes ?? '',
    declaredSeeds: observed.declaredSeeds ?? '',
    consumedSeals: claim.sourceChecksum ?? '',
    pixelDumpHash: pixelDigest,
  };

  const scd64 = renderSCD64(inputs);

  return Object.freeze({
    receiptVersion: 1,
    synthClass: 'SIMULATED',
    frameIndex,
    scd64,
    pixelDigest,
    prevDigest,
    claim: Object.freeze({ ...claim }),
    inputs: Object.freeze({ ...inputs }),
  });
}

/**
 * Compare two chained receipts frame-by-frame.
 * Divergence localizes to the FIRST bad frame.
 *
 * @param {ReadonlyArray<object>} chainA
 * @param {ReadonlyArray<object>} chainB
 * @returns {Readonly<object>}
 */
export function compareChains(chainA, chainB) {
  if (chainA.length !== chainB.length) {
    return Object.freeze({
      verdict: 'UNRELATED',
      matchingFrames: 0,
      totalFrames: Math.max(chainA.length, chainB.length),
      firstDivergentFrame: 0,
      reason: `chain length mismatch: ${chainA.length} vs ${chainB.length}`,
    });
  }

  let matchingFrames = 0;
  let firstDivergentFrame = -1;
  const frameVerdicts = [];

  for (let i = 0; i < chainA.length; i++) {
    if (chainA[i].scd64 === chainB[i].scd64) {
      matchingFrames++;
      frameVerdicts.push('REPRODUCED');
    } else {
      if (firstDivergentFrame === -1) firstDivergentFrame = i;
      const div = classifyDivergence(chainA[i].scd64, chainB[i].scd64);
      frameVerdicts.push(div.verdict);
    }
  }

  const verdict = matchingFrames === chainA.length
    ? 'REPRODUCED'
    : firstDivergentFrame === 0
      ? 'NONDETERMINISTIC'
      : 'RESYNTHESIZED';

  return Object.freeze({
    verdict,
    matchingFrames,
    totalFrames: chainA.length,
    firstDivergentFrame,
    frameVerdicts: Object.freeze(frameVerdicts),
  });
}

/**
 * Cold-start refusal check.
 *
 * A cold-started worker evaluating frame N directly (without stepping 1..N)
 * has no valid prevDigest to fold. This function checks whether a receipt
 * claims to be SIMULATED but has a seal-as-prevDigest at a frame > 0,
 * which indicates a cold start.
 *
 * @param {object} receipt
 * @param {string} seal - the packet's own checksum
 * @returns {{refused: boolean, reason: string}}
 */
export function checkColdStart(receipt, seal) {
  if (receipt.synthClass !== 'SIMULATED') {
    return Object.freeze({ refused: false, reason: 'not a SIMULATED receipt' });
  }
  if (receipt.frameIndex > 0 && receipt.prevDigest === seal) {
    return Object.freeze({
      refused: true,
      reason: `frame ${receipt.frameIndex} has seal as prevDigest — cold start detected. ` +
        'A SIMULATED frame N cannot be sealed without N−1. Refusing rather than emitting a confident wrong frame.',
    });
  }
  return Object.freeze({ refused: false, reason: 'chain intact' });
}
