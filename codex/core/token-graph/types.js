/**
 * Shared token-graph constants and helpers.
 */

export const TOKEN_GRAPH_NODE_TYPES = Object.freeze([
  'LEXEME',
  'SCROLL_TOKEN',
  'SCHOOL_ANCHOR',
  'SEMANTIC_ANCHOR',
]);

export const TOKEN_GRAPH_RELATIONS = Object.freeze([
  'PHONETIC_SIMILARITY',
  'SEMANTIC_ASSOCIATION',
  'SYNTACTIC_COMPATIBILITY',
  'SCHOOL_RESONANCE',
  'MEMORY_AFFINITY',
  'SEQUENTIAL_LIKELIHOOD',
]);

export const DEFAULT_TOKEN_GRAPH_LIMITS = Object.freeze({
  maxDepth: 2,
  maxFanout: 24,
  maxCandidates: 64,
  decay: 0.78,
});

export function clamp01(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  if (numeric <= 0) return 0;
  if (numeric >= 1) return 1;
  return numeric;
}

export function normalizeGraphToken(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function normalizeSchoolId(value) {
  return String(value || '').trim().toUpperCase();
}

/**
 * Deterministic ordering by code point. NOT `localeCompare`.
 *
 * This function decides roughly 65% of judiciary ties — measured: over 4,000
 * realistic ballots, 757 pairs tied on `arbitrationScore` and 492 of them fell
 * through to this comparison. It was `localeCompare` with no fixed locale, so
 * the winner depended on the VIEWER'S LOCALE:
 *
 *     en-US   ä < z      i < I
 *     sv-SE   ä > z      i < I
 *     tr-TR   ä < z      i > I
 *
 * A function named `stableTokenCompare` deciding a majority of rankings must not
 * consult the environment. Its contract is determinism, not collation, and all
 * twelve call sites are internal tie-breaks rather than user-facing sorts.
 */
export function stableTokenCompare(a, b) {
  const left = String(a || '');
  const right = String(b || '');
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

export function mergeUniqueStrings(...groups) {
  const merged = new Set();
  groups.forEach((group) => {
    const values = Array.isArray(group) ? group : [];
    values.forEach((value) => {
      const normalized = String(value || '').trim();
      if (!normalized) return;
      merged.add(normalized);
    });
  });
  return [...merged];
}

export function normalizeGraphWeight(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return clamp01(fallback);
  return clamp01(numeric);
}

export function compareWeightedEdges(edgeA, edgeB, nodeLookup = null) {
  const weightDiff = normalizeGraphWeight(edgeB?.weight) - normalizeGraphWeight(edgeA?.weight);
  if (weightDiff !== 0) return weightDiff;

  const tokenA = nodeLookup?.get?.(edgeA?.toId)?.token || edgeA?.toId || '';
  const tokenB = nodeLookup?.get?.(edgeB?.toId)?.token || edgeB?.toId || '';
  const tokenDiff = stableTokenCompare(tokenA, tokenB);
  if (tokenDiff !== 0) return tokenDiff;

  const relationDiff = stableTokenCompare(edgeA?.relation, edgeB?.relation);
  if (relationDiff !== 0) return relationDiff;

  return stableTokenCompare(edgeA?.id, edgeB?.id);
}
