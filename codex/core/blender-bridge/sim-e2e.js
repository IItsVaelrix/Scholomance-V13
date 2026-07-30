/**
 * sim-e2e — Simulation E2E orchestrator.
 *
 * Orchestrates the full simulation pipeline:
 * 1. Takes per-frame claims from Blender (emitted by sim_claim.py)
 * 2. Hashes each pixel dump JS-side
 * 3. Builds the digest chain (chained receipt protocol)
 * 4. Mints chained receipts
 * 5. Verifies the chain
 * 6. Checks for cold-start refusal
 *
 * The consumer (Blender) never computes a hash and never mints a receipt.
 * It steps frames in order, renders, dumps pixels, and emits raw claims.
 * All hashing and chaining is JS-side.
 *
 * SYNTH_CLASS is SIMULATED, which tells a consumer "this receipt is chained;
 * endpoint verification is invalid here."
 */

import { readFileSync, existsSync } from 'node:fs';
import { hashPixelDump } from './receipt.js';
import {
  chainedPixelHash, buildChain, verifyChain,
  mintChainedReceipt, compareChains, checkColdStart,
} from './chained-receipt.js';

export class SimE2EError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SimE2EError';
  }
}

/**
 * Load pixel dump hashes from an array of dump paths.
 * All hashing is JS-side.
 *
 * @param {string[]} dumpPaths - paths to .f32 pixel dump files
 * @returns {string[]} uppercase hex sha256 hashes
 */
export function hashFrameDumps(dumpPaths) {
  return dumpPaths.map((p) => {
    if (!existsSync(p)) {
      throw new SimE2EError(`pixel dump not found: ${p}`);
    }
    return hashPixelDump(p);
  });
}

/**
 * Build the full simulation chain from a seal and pixel dump buffers.
 *
 * @param {string} seal - the packet's own checksum (digest_0)
 * @param {Buffer[]} frameBuffers - ordered pixel dump buffers
 * @returns {ReadonlyArray<{frame: number, digest: string}>}
 */
export function buildSimChain(seal, frameBuffers) {
  return buildChain(seal, frameBuffers);
}

/**
 * Mint chained receipts for all frames.
 *
 * @param {object[]} claims - per-frame claims from Blender
 * @param {string[]} pixelHashes - per-frame pixel dump hashes
 * @param {string} seal - the packet's own checksum
 * @returns {ReadonlyArray<object>} frozen chained receipts
 */
export function mintSimReceipts(claims, pixelHashes, seal) {
  if (claims.length !== pixelHashes.length) {
    throw new SimE2EError(
      `claim count ${claims.length} does not match hash count ${pixelHashes.length}`,
    );
  }
  if (claims.length === 0) {
    throw new SimE2EError('no frames to mint');
  }

  const receipts = [];
  let prevDigest = seal;

  for (let i = 0; i < claims.length; i++) {
    const pixelDigest = chainedPixelHash(
      Buffer.from(pixelHashes[i], 'hex'),
      prevDigest,
    );
    const receipt = mintChainedReceipt(claims[i], pixelDigest, i, prevDigest);
    receipts.push(receipt);
    prevDigest = pixelDigest;
  }

  return Object.freeze(receipts);
}

/**
 * Full simulation E2E: hash dumps, build chain, mint receipts, verify.
 *
 * @param {object} manifest - the sim_manifest.json from Blender
 * @param {string[]} dumpPaths - paths to .f32 pixel dump files
 * @param {Buffer[]} dumpBuffers - raw pixel dump buffers (alternative to paths)
 * @returns {Readonly<object>} full E2E result
 */
export function runSimE2E(manifest, { dumpPaths, dumpBuffers } = {}) {
  if (!manifest || typeof manifest !== 'object') {
    throw new SimE2EError('manifest must be a non-null object');
  }
  if (manifest.synthClass !== 'SIMULATED') {
    throw new SimE2EError(`expected SIMULATED synthClass, got ${manifest.synthClass}`);
  }

  const claims = manifest.claims;
  if (!Array.isArray(claims) || claims.length === 0) {
    throw new SimE2EError('manifest.claims must be a non-empty array');
  }

  const seal = manifest.sourceChecksum;
  if (!seal || typeof seal !== 'string') {
    throw new SimE2EError('manifest.sourceChecksum must be a non-empty string');
  }

  // Hash pixel dumps
  let pixelHashes;
  let buffers;
  if (dumpBuffers && dumpBuffers.length > 0) {
    buffers = dumpBuffers;
    pixelHashes = dumpBuffers.map((buf) => {
      const { createHash } = require('node:crypto');
      return createHash('sha256').update(buf).digest('hex').toUpperCase();
    });
  } else if (dumpPaths && dumpPaths.length > 0) {
    pixelHashes = hashFrameDumps(dumpPaths);
    buffers = dumpPaths.map((p) => readFileSync(p));
  } else {
    throw new SimE2EError('either dumpPaths or dumpBuffers must be provided');
  }

  if (pixelHashes.length !== claims.length) {
    throw new SimE2EError(
      `dump count ${pixelHashes.length} does not match claim count ${claims.length}`,
    );
  }

  // Build chain
  const chain = buildChain(seal, buffers);

  // Mint receipts
  const receipts = mintSimReceipts(claims, pixelHashes, seal);

  // Verify chain
  const verification = verifyChain(seal, buffers, chain);

  // Cold-start check on each receipt
  const coldStartChecks = receipts.map((r) => checkColdStart(r, seal));
  const anyColdStart = coldStartChecks.some((c) => c.refused);

  // Compare chain against itself (should be REPRODUCED)
  const selfComparison = compareChains(receipts, receipts);

  return Object.freeze({
    seal,
    frameCount: claims.length,
    frameStart: manifest.frameStart ?? 0,
    frameEnd: manifest.frameEnd ?? claims.length - 1,
    chain: Object.freeze(chain.map((c) => ({ ...c }))),
    receipts,
    verification,
    coldStartChecks: Object.freeze(coldStartChecks),
    anyColdStart,
    selfComparison,
    pixelHashes: Object.freeze(pixelHashes),
  });
}

/**
 * Compare two simulation runs (e.g. two renders of the same scene).
 * Divergence localizes to the FIRST bad frame.
 *
 * @param {object} resultA - from runSimE2E
 * @param {object} resultB - from runSimE2E
 * @returns {Readonly<object>}
 */
export function compareSimRuns(resultA, resultB) {
  if (resultA.seal !== resultB.seal) {
    return Object.freeze({
      verdict: 'UNRELATED',
      reason: 'different seals — different packets',
    });
  }

  const comparison = compareChains(resultA.receipts, resultB.receipts);

  return Object.freeze({
    ...comparison,
    seal: resultA.seal,
    framesA: resultA.frameCount,
    framesB: resultB.frameCount,
  });
}
