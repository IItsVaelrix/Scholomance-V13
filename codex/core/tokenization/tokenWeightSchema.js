/**
 * Shared token-weight vocabulary for document, syntax, and activation signals.
 *
 * CLASSIFICATION: core / pure / schema
 * LAYER: codex/core
 */

export const TOKEN_WEIGHT_DIMENSION = Object.freeze({
  DOCUMENT: 'document',
  SYNTACTIC: 'syntactic',
  ACTIVATION: 'activation',
});

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function clamp01(value) {
  if (!isFiniteNumber(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/**
 * Combines available token-weight dimensions into a single 0..1 score.
 *
 * Base mix:
 * - document: 0.50
 * - syntactic: 0.35
 * - activation: 0.15
 *
 * Missing dimensions are renormalized away, so a partial record remains useful.
 *
 * @param {{ normalized?: string, document?: number|null, syntactic?: number|null, activation?: number|null }} weights
 * @returns {number}
 */
export function combineTokenWeights(weights = {}) {
  const available = [
    isFiniteNumber(weights.document) ? { value: weights.document, base: 0.50 } : null,
    isFiniteNumber(weights.syntactic) ? { value: weights.syntactic, base: 0.35 } : null,
    isFiniteNumber(weights.activation) ? { value: weights.activation, base: 0.15 } : null,
  ].filter(Boolean);

  if (available.length === 0) return 0;
  if (available.length === 1) return clamp01(available[0].value);

  const totalBase = available.reduce((sum, dimension) => sum + dimension.base, 0);
  const combined = available.reduce(
    (sum, dimension) => sum + dimension.value * (dimension.base / totalBase),
    0
  );

  return clamp01(combined);
}

/**
 * Lifts a flat document-weight map into multidimensional records.
 *
 * @param {Record<string, number>} tokenWeights
 * @returns {Array<{ normalized: string, document: number, syntactic: null, activation: null }>}
 */
export function liftDocumentWeights(tokenWeights = {}) {
  return Object.entries(tokenWeights || {}).map(([normalized, weight]) => ({
    normalized,
    document: weight,
    syntactic: null,
    activation: null,
  }));
}

/**
 * Collapses multidimensional token-weight records into a flat score map.
 *
 * @param {Array<{ normalized?: string, document?: number|null, syntactic?: number|null, activation?: number|null }>} records
 * @returns {Record<string, number>}
 */
export function collapseToFlatWeights(records = []) {
  const output = {};

  for (const record of Array.isArray(records) ? records : []) {
    const normalized = String(record?.normalized || '').trim();
    if (!normalized) continue;
    output[normalized] = combineTokenWeights(record);
  }

  return output;
}
