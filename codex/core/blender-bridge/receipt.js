/**
 * receipt — parse addon claim → mint receipt → compare.
 *
 * The consumer (Blender addon) never computes a hash and never mints a receipt.
 * It emits raw strings and ints. This module does all hashing JS-side.
 *
 * A receipt is a frozen, content-addressed RENDER SCD64 plus metadata.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { renderSCD64, classifyDivergence } from './render-scd64.js';

export class ReceiptError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ReceiptError';
  }
}

/**
 * Hash a raw float32 pixel dump file.
 * The dump is metadata-free by construction — no EXR header, no timestamp.
 */
export function hashPixelDump(dumpPath) {
  const buf = readFileSync(dumpPath);
  return createHash('sha256').update(buf).digest('hex').toUpperCase();
}

/**
 * Hash a raw float32 pixel buffer directly (for testing without files).
 */
export function hashPixelBuffer(buffer) {
  return createHash('sha256').update(buffer).digest('hex').toUpperCase();
}

/**
 * Mint a receipt from an addon claim and a pixel dump path.
 *
 * The claim carries observed render settings as raw strings/ints.
 * This function hashes the pixel dump, builds the RENDER SCD64, and freezes.
 */
export function mintReceipt(claim, pixelDumpHash) {
  if (!claim || typeof claim !== 'object') {
    throw new ReceiptError('claim must be a non-null object');
  }
  if (typeof pixelDumpHash !== 'string' || pixelDumpHash.length === 0) {
    throw new ReceiptError('pixelDumpHash must be a non-empty string');
  }

  const observed = claim.observed ?? {};

  const inputs = {
    synthClass: claim.synthClass ?? 'RASTER',
    resolutionX: observed.resolutionX ?? 0,
    resolutionY: observed.resolutionY ?? 0,
    pixelAspect: observed.pixelAspect ?? 1,
    frameIndex: observed.frameIndex ?? 0,
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
    pixelDumpHash,
  };

  const scd64 = renderSCD64(inputs);

  return Object.freeze({
    receiptVersion: 1,
    scd64,
    pixelDumpHash,
    claim: Object.freeze({ ...claim }),
    inputs: Object.freeze({ ...inputs }),
    mintedAt: Date.now(),
  });
}

/**
 * Compare two receipts and classify the divergence.
 */
export function compareReceipts(a, b) {
  if (!a?.scd64 || !b?.scd64) {
    throw new ReceiptError('both receipts must have an scd64 field');
  }
  const divergence = classifyDivergence(a.scd64, b.scd64);
  return Object.freeze({
    ...divergence,
    receiptA: a.scd64,
    receiptB: b.scd64,
    pixelMatch: a.pixelDumpHash === b.pixelDumpHash,
  });
}
