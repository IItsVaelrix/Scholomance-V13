/**
 * cross-engine — compare receipts from different render engines.
 *
 * Remotion is retained and promoted, not deprecated. It becomes the second
 * consumer whose receipt makes Blender's receipt falsifiable — the Pixi/Defold
 * relationship. Retiring it would leave one producer and one consumer, and a
 * comparison between them would prove nothing.
 *
 * This module does NOT render anything. It compares receipts minted by
 * different engines against the same PixelBrain packet. The comparison is
 * over the RENDER SCD64 slots: causes should agree (same packet, same
 * settings), effects (PIXEL_RECEIPT) will differ because the engines are
 * different renderers.
 *
 * The verdict lattice for cross-engine comparison differs from same-engine:
 *   CAUSES_AGREE    — all 7 cause slots match; engines consumed the same input
 *   CAUSES_DIVERGE  — a cause slot differs; the engines saw different inputs
 *   PIXELS_AGREE    — PIXEL_RECEIPT matches (extraordinary; same pixels from
 *                     different renderers would be a structural correspondence)
 *   PIXELS_DIVERGE  — expected; different engines produce different pixels
 *
 * A cross-engine comparison where CAUSES_AGREE and PIXELS_DIVERGE is the
 * HEALTHY state: both engines consumed the same truth and produced their own
 * honest render. This is what makes the comparison falsifiable.
 */

import { parseRenderSCD64, RENDER_SLOT_NAMES, classifyDivergence } from './render-scd64.js';

export class CrossEngineError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CrossEngineError';
  }
}

export const CROSS_ENGINE_VERDICTS = Object.freeze([
  'CAUSES_AGREE',
  'CAUSES_DIVERGE',
  'PIXELS_AGREE',
  'PIXELS_DIVERGE',
]);

/**
 * Compare two receipts from different engines.
 *
 * @param {object} receiptA - receipt from engine A (e.g. Blender)
 * @param {object} receiptB - receipt from engine B (e.g. Remotion)
 * @param {object} [options]
 * @param {string} [options.engineA='blender'] - label for engine A
 * @param {string} [options.engineB='remotion'] - label for engine B
 * @returns {Readonly<object>}
 */
export function compareCrossEngine(receiptA, receiptB, options = {}) {
  const { engineA = 'blender', engineB = 'remotion' } = options;

  if (!receiptA?.scd64 || !receiptB?.scd64) {
    throw new CrossEngineError('both receipts must have an scd64 field');
  }

  const slotsA = parseRenderSCD64(receiptA.scd64);
  const slotsB = parseRenderSCD64(receiptB.scd64);

  const causeSlots = [];
  const effectSlot = { name: 'PIXEL_RECEIPT', match: false };

  for (let i = 0; i < 7; i++) {
    causeSlots.push(Object.freeze({
      name: RENDER_SLOT_NAMES[i],
      slotA: slotsA[i],
      slotB: slotsB[i],
      match: slotsA[i] === slotsB[i],
    }));
  }
  effectSlot.match = slotsA[7] === slotsB[7];
  effectSlot.slotA = slotsA[7];
  effectSlot.slotB = slotsB[7];

  const matchingCauses = causeSlots.filter((s) => s.match).length;
  const divergentCauses = causeSlots.filter((s) => !s.match).map((s) => s.name);
  const causesAgree = matchingCauses === 7;
  const pixelsAgree = effectSlot.match;

  let verdict;
  if (causesAgree && pixelsAgree) verdict = 'PIXELS_AGREE';
  else if (causesAgree && !pixelsAgree) verdict = 'CAUSES_AGREE';
  else if (!causesAgree && pixelsAgree) verdict = 'PIXELS_AGREE';
  else verdict = 'CAUSES_DIVERGE';

  // The healthy state: causes agree, pixels diverge
  const healthy = causesAgree && !pixelsAgree;

  // Use the same-engine divergence classifier for additional detail
  const sameEngineDivergence = classifyDivergence(receiptA.scd64, receiptB.scd64);

  return Object.freeze({
    verdict,
    healthy,
    engineA,
    engineB,
    matchingCauses,
    divergentCauses: Object.freeze(divergentCauses),
    pixelsAgree,
    causeSlots: Object.freeze(causeSlots),
    effectSlot: Object.freeze({ ...effectSlot }),
    sameEngineVerdict: sameEngineDivergence.verdict,
    sameEngineRelationship: sameEngineDivergence.relationship,
    receiptA: receiptA.scd64,
    receiptB: receiptB.scd64,
  });
}

/**
 * Build a minimal Remotion-style claim for testing.
 *
 * Remotion renders via a browser canvas, not Cycles. The claim carries
 * the same observed-render-settings shape but with Remotion-specific values.
 * The pixel dump hash is computed JS-side from the canvas pixel buffer.
 *
 * @param {object} wire - the Python wire packet (same input both engines consume)
 * @param {object} overrides - Remotion-specific render settings
 * @returns {object} claim shaped like the Blender addon's emit_claim output
 */
export function buildRemotionClaim(wire, overrides = {}) {
  return {
    engine: 'remotion',
    packetId: wire.packetId,
    sourceChecksum: wire.sourceChecksum,
    colorPolicy: wire.colorPolicy,
    synthClass: 'RASTER',
    observed: {
      blenderVersion: 'remotion-4.0',
      buildHash: 'remotion',
      engine: 'CANVAS_2D',
      device: 'CPU',
      seed: 0,
      samples: 1,
      adaptive: false,
      denoise: false,
      viewTransform: 'Standard',
      look: 'None',
      resolutionX: overrides.resolutionX ?? wire.canvas.width,
      resolutionY: overrides.resolutionY ?? wire.canvas.height,
      threads: 1,
      ...overrides,
    },
  };
}

/**
 * Determine which cause slots SHOULD agree between engines consuming the
 * same packet, and which are engine-specific.
 *
 * FRAME_SYS and COLOR_LAW should agree (same packet, same policy).
 * ENGINE_LAW will differ (different engine, different build hash).
 * LIGHT_BUDGET may differ (different sampling strategy).
 * DENOISE may differ (different denoiser).
 * SCENE_GRAPH should agree (same packet → same scene projection).
 * SYNTH_CLASS should agree (same content class).
 */
export function expectedCrossEngineAgreement() {
  return Object.freeze({
    SYNTH_CLASS: 'SHOULD_AGREE',
    FRAME_SYS: 'SHOULD_AGREE',
    ENGINE_LAW: 'EXPECTED_DIVERGE',
    LIGHT_BUDGET: 'MAY_DIVERGE',
    DENOISE: 'MAY_DIVERGE',
    COLOR_LAW: 'SHOULD_AGREE',
    SCENE_GRAPH: 'SHOULD_AGREE',
    PIXEL_RECEIPT: 'EXPECTED_DIVERGE',
  });
}
