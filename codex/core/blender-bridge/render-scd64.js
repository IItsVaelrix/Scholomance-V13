/**
 * RENDER SCD64 domain — the eighth family over the preserved eight-slot contract.
 *
 * Seven slots are CAUSES, the eighth (PIXEL_RECEIPT) is the EFFECT.
 * Each slot is sha256(its own disjoint canonical string).slice(0,8) uppercased.
 * Slot 0 takes a 2-char version byte prefix plus 6 hex.
 *
 * The verdict lattice exploits the cause/effect asymmetry:
 *   REPRODUCED      — all 8 match
 *   NONDETERMINISTIC — only PIXEL_RECEIPT differs (same causes, different pixels)
 *   RESYNTHESIZED   — a cause + PIXEL_RECEIPT differ (expected)
 *   INERT           — a cause differs but PIXEL_RECEIPT does not (declared input unwired)
 *   UNRELATED       — too many slots differ to diagnose
 */

import { createHash } from 'node:crypto';
import { COLOR_LAW_TRANSFER } from './color-law.js';

// 0x02: COLOR_LAW stopped encoding the output file format and started carrying
// the declared colour contract; format/depth/display moved to ENGINE_LAW. Every
// receipt changed, so the version changed with it — without that, receipts
// minted before and after look comparable and are not.
export const RENDER_VERSION = 0x02;

export const RENDER_SLOT_NAMES = Object.freeze([
  'SYNTH_CLASS',
  'FRAME_SYS',
  'ENGINE_LAW',
  'LIGHT_BUDGET',
  'DENOISE',
  'COLOR_LAW',
  'SCENE_GRAPH',
  'PIXEL_RECEIPT',
]);

export const RENDER_SLOT_ALIASES = Object.freeze({
  BUGCLASS:  'SYNTH_CLASS',
  COORDSYS:  'FRAME_SYS',
  INVARIANT: 'ENGINE_LAW',
  MAGNITUDE: 'LIGHT_BUDGET',
  MASKING:   'DENOISE',
  GATE:      'COLOR_LAW',
  PROPAGATE: 'SCENE_GRAPH',
  VERDICT:   'PIXEL_RECEIPT',
});

export const SYNTH_CLASSES = Object.freeze(['RASTER', 'SYNTHESIZED', 'VOLUME', 'SIMULATED']);

export const VERDICTS = Object.freeze([
  'REPRODUCED',
  'NONDETERMINISTIC',
  'RESYNTHESIZED',
  'INERT',
  'UNRELATED',
]);

function slotHash(canonical) {
  return createHash('sha256').update(canonical, 'utf8').digest('hex').slice(0, 8).toUpperCase();
}

/**
 * Build the eight canonical strings from render inputs.
 * Each canonical is a disjoint, deterministic serialization of one cause/effect.
 */
export function buildRenderCanonicals(inputs) {
  const {
    synthClass = 'RASTER',
    resolutionX = 0,
    resolutionY = 0,
    pixelAspect = 1,
    frameIndex = 0,
    cameraMatrix = '',
    blenderVersion = '',
    buildHash = '',
    engine = 'CYCLES',
    device = 'CPU',
    seed = 0,
    samples = 0,
    adaptive = false,
    adaptiveThreshold = 0,
    bounces = 0,
    clamping = 0,
    shutterOpen = 0,
    shutterClose = 0,
    timeSamples = 0,
    denoiser = 'NONE',
    denoiseInputPasses = '',
    denoiseEnabled = false,
    viewTransform = 'Standard',
    look = 'None',
    displayDevice = 'sRGB',
    colorPolicy = 'EXACT',
    transfer = COLOR_LAW_TRANSFER,
    format = 'OPEN_EXR',
    colorDepth = '32',
    sceneGraph = '',
    nodeTreeHashes = '',
    declaredSeeds = '',
    consumedSeals = '',
    pixelDumpHash = '',
  } = inputs;

  return [
    { slot: 'SYNTH_CLASS', canonical: `v${RENDER_VERSION.toString(16).padStart(2, '0')}:${synthClass}` },
    { slot: 'FRAME_SYS', canonical: `${resolutionX}x${resolutionY}@${pixelAspect}:f${frameIndex}:cam:${cameraMatrix}` },
    { slot: 'ENGINE_LAW', canonical: `${blenderVersion}+${buildHash}:${engine}:${device}:${displayDevice}:${format}:${colorDepth}` },
    { slot: 'LIGHT_BUDGET', canonical: `s${seed}:n${samples}:a${adaptive?1:0}:${adaptiveThreshold}:b${bounces}:c${clamping}:sh${shutterOpen},${shutterClose}:t${timeSamples}` },
    { slot: 'DENOISE', canonical: `${denoiser}:${denoiseInputPasses}:${denoiseEnabled?1:0}` },
    // The COLOUR CONTRACT, not the container. Both engines must honour the same
    // policy and transfer function; they will never share an output format, and
    // encoding one here made expectedCrossEngineAgreement's SHOULD_AGREE
    // impossible to satisfy for any correct implementation.
    { slot: 'COLOR_LAW', canonical: `${colorPolicy}:${transfer}:${viewTransform}:${look}` },
    { slot: 'SCENE_GRAPH', canonical: `${sceneGraph}:nt:${nodeTreeHashes}:seeds:${declaredSeeds}:seals:${consumedSeals}` },
    { slot: 'PIXEL_RECEIPT', canonical: pixelDumpHash },
  ];
}

/**
 * Mint a 64-char uppercase hex RENDER SCD64 from render inputs.
 */
export function renderSCD64(inputs) {
  const canonicals = buildRenderCanonicals(inputs);
  return canonicals.map(({ slot, canonical }) => {
    const h = slotHash(canonical);
    // Slot 0 gets a 2-char version prefix
    if (slot === 'SYNTH_CLASS') {
      return RENDER_VERSION.toString(16).padStart(2, '0').toUpperCase() + h.slice(2);
    }
    return h;
  }).join('');
}

/**
 * Parse a 64-char SCD64 into 8 slots of 8 hex chars each.
 */
export function parseRenderSCD64(checksum) {
  if (typeof checksum !== 'string' || checksum.length !== 64 || !/^[0-9A-F]{64}$/.test(checksum)) {
    throw new Error('RENDER SCD64 must be exactly 64 uppercase hex characters');
  }
  const slots = [];
  for (let i = 0; i < 8; i++) {
    slots.push(checksum.slice(i * 8, (i + 1) * 8));
  }
  return slots;
}

/**
 * Classify the divergence between two RENDER SCD64 checksums.
 *
 * The verdict lattice exploits cause/effect asymmetry:
 * - PIXEL_RECEIPT is slot 7 (the effect)
 * - Slots 0-6 are causes
 */
export function classifyDivergence(a, b) {
  const aSlots = parseRenderSCD64(a);
  const bSlots = parseRenderSCD64(b);

  const differentBlocks = [];
  let matchingBlocks = 0;

  for (let i = 0; i < 8; i++) {
    if (aSlots[i] === bSlots[i]) {
      matchingBlocks++;
    } else {
      differentBlocks.push(RENDER_SLOT_NAMES[i]);
    }
  }

  const similarity = matchingBlocks / 8;
  const pixelReceiptDiffers = differentBlocks.includes('PIXEL_RECEIPT');
  const causeDiffers = differentBlocks.some((s) => s !== 'PIXEL_RECEIPT');

  let verdict;
  if (matchingBlocks === 8) {
    verdict = 'REPRODUCED';
  } else if (matchingBlocks < 4) {
    verdict = 'UNRELATED';
  } else if (!causeDiffers && pixelReceiptDiffers) {
    verdict = 'NONDETERMINISTIC';
  } else if (causeDiffers && pixelReceiptDiffers) {
    verdict = 'RESYNTHESIZED';
  } else if (causeDiffers && !pixelReceiptDiffers) {
    verdict = 'INERT';
  } else {
    verdict = 'UNRELATED';
  }

  let relationship;
  if (matchingBlocks === 8) relationship = 'IDENTICAL';
  else if (matchingBlocks >= 6) relationship = 'MUTATION';
  else if (matchingBlocks >= 4) relationship = 'RELATED_FAMILY';
  else if (matchingBlocks >= 2) relationship = 'WEAK_NEIGHBOR';
  else relationship = 'UNRELATED';

  return Object.freeze({
    verdict,
    differentBlocks: Object.freeze(differentBlocks),
    matchingBlocks,
    similarity,
    relationship,
  });
}
