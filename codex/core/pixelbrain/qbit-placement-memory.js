//
// Coordinate-placement memory. The geometry analogue of qbit-phosphorylation's
// COLOR commit: a cell deterministically "remembers" that its placement is
// settled, so downstream perception may ignore it. Deterministic (Retina PDR
// determinism contract): no Date.now, no Math.random; generation is supplied.

export const PLACEMENT_COMMIT_THRESHOLD = 0.6;

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/**
 * Confidence that a cell's coordinate placement is settled.
 * snapStable is the gate (an unstable snap can never commit); symmetry
 * agreement and energy raise confidence within the stable band.
 */
export function evaluatePlacementCommit(evidence, options = {}) {
  const generation = Number.isInteger(options.generation) ? options.generation : 0;

  if (!evidence || typeof evidence !== 'object' || evidence.snapStable !== true) {
    return { committed: false, confidence: 0, generation };
  }

  const symmetry = clamp01(evidence.symmetryAgreement);
  const energy = clamp01(evidence.energy);
  const confidence = 0.5 + (0.3 * symmetry) + (0.2 * energy);

  return {
    committed: confidence >= PLACEMENT_COMMIT_THRESHOLD,
    confidence,
    generation,
  };
}

/** Row-major committed bitmask over a dense evidence array. */
export function buildCommittedMask(evidenceList, options = {}) {
  const list = Array.isArray(evidenceList) ? evidenceList : [];
  const mask = new Uint8Array(list.length);
  for (let i = 0; i < list.length; i += 1) {
    mask[i] = evaluatePlacementCommit(list[i], options).committed ? 1 : 0;
  }
  return mask;
}
