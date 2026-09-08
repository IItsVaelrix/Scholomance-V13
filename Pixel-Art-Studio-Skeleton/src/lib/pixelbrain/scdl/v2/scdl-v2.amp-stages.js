/**
 * Fixed 12-Stage Conveyor-Belt Ordering Engine for SCDL v2 Universal AMP Substrate.
 *
 * Enforces the immutable sequence:
 *   SOURCE_ANALYSIS -> CONSTRUCTION -> SHAPE_PRE -> SHAPE_POST -> MASK ->
 *   PAINT -> LAYER_POST -> PACKET_POST -> RENDER -> TIMELINE ->
 *   RUNTIME_DESCRIPTOR -> WORLD_DESCRIPTOR
 *
 * Within each stage, AMPs execute in strictly ascending integer `order` (tied by `ampId`).
 * AMPs cannot reorder themselves dynamically.
 */

import { AMP_STAGES } from './scdl-v2.amp-abi.js';

export { AMP_STAGES };

const STAGE_INDEX_MAP = Object.freeze(
  Object.fromEntries(AMP_STAGES.map((s, idx) => [s, idx]))
);

export function getStageIndex(stage) {
  const idx = STAGE_INDEX_MAP[stage];
  return idx !== undefined ? idx : -1;
}

export function isValidStage(stage) {
  return typeof stage === 'string' && STAGE_INDEX_MAP[stage] !== undefined;
}

export function isStageBefore(stageA, stageB) {
  const idxA = getStageIndex(stageA);
  const idxB = getStageIndex(stageB);
  if (idxA === -1 || idxB === -1) {
    throw new Error(`Invalid stage comparison between '${stageA}' and '${stageB}'`);
  }
  return idxA < idxB;
}

/**
 * Stable comparator for conveyor-belt sorting:
 * 1. Stage index in AMP_STAGES (strictly sequential conveyor belt)
 * 2. `order` integer ascending (declared in manifest)
 * 3. `ampId` string ascending (lexicographical tie-breaker)
 */
export function compareAmpOrder(a, b) {
  const stageA = a.stage || a.manifest?.stage;
  const stageB = b.stage || b.manifest?.stage;
  const idxA = getStageIndex(stageA);
  const idxB = getStageIndex(stageB);

  if (idxA !== idxB) {
    return idxA - idxB;
  }

  const orderA = typeof a.order === 'number' ? a.order : (a.manifest?.order ?? 0);
  const orderB = typeof b.order === 'number' ? b.order : (b.manifest?.order ?? 0);

  if (orderA !== orderB) {
    return orderA - orderB;
  }

  const idA = String(a.ampId || a.manifest?.ampId || '');
  const idB = String(b.ampId || b.manifest?.ampId || '');
  return idA.localeCompare(idB);
}

/**
 * Constructs an immutable, validated conveyor-belt execution plan from a list
 * of requested or relevance-selected AMP activations.
 *
 * @param {Array<Object>} activations - List of { ampId, manifest, inputs, params, ... }
 * @returns {Array<Object>} - Stably sorted and frozen execution sequence
 */
export function buildConveyorBelt(activations) {
  if (!Array.isArray(activations)) return Object.freeze([]);

  const copy = [...activations].map((item, originalIndex) => {
    const stage = item.stage || item.manifest?.stage;
    if (!isValidStage(stage)) {
      throw new Error(`Activation for AMP '${item.ampId}' declares unknown stage '${stage}'`);
    }
    const order = typeof item.order === 'number' ? item.order : (item.manifest?.order ?? 0);
    return {
      ...item,
      stage,
      order,
      _originalIndex: originalIndex,
    };
  });

  copy.sort((a, b) => {
    const diff = compareAmpOrder(a, b);
    return diff !== 0 ? diff : a._originalIndex - b._originalIndex;
  });

  return Object.freeze(
    copy.map(({ _originalIndex, ...clean }) => Object.freeze(clean))
  );
}
