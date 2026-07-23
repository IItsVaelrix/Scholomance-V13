/**
 * SEMANTIC VECTOR UTILITIES
 *
 * Deterministic vector generation for the Scholomance V12 core.
 *
 * v2: Now delegates to the Phonotopography Engine, which uses real ARPAbet
 * phoneme sequences (via CMU dictionary + heuristic G2P fallback) instead of
 * character-level hashing. All existing consumers of generatePhonosemanticVector
 * automatically receive phoneme-aware vectors.
 *
 * The old character-level implementation is preserved below as
 * generatePhonosemanticVectorLegacy for reference and rollback.
 */

import { generatePhonotopographicVector } from './phonotopography.js';

/**
 * Generate a deterministic "Phonosemantic" vector for raw text or code.
 *
 * v2: Delegates to the Phonotopography Engine (phoneme n-grams → 256-dim
 * topographic vector). The function signature is unchanged for backward
 * compatibility with all existing consumers:
 *   - codex/core/lexical-analysis/semanticBallistics.js
 *   - codex/core/ritual-prediction/reranker.js
 *   - codex/core/lexical-graph/deviceEmbed.js
 *   - codex/core/immunity/pathogenRegistry.js
 *   - scripts/build_vector_artifacts.js
 *   - scripts/buildRhymeAstrologyIndex.js
 *
 * @param {string} input
 * @param {number} [dim=256]
 * @returns {Float32Array}
 */
export function generatePhonosemanticVector(input, dim = 256) {
  return generatePhonotopographicVector(input, dim);
}

/**
 * LEGACY: The original character-level vector generator.
 * Preserved for rollback and comparison testing.
 *
 * V12 Logic:
 * - Dims 0-63: Vowel/Consonant or Syntactic pattern hash
 * - Dims 64-127: Structural resonance (Suffixes/Keywords)
 * - Dims 128-191: Mass and Complexity approximation
 * - Dims 192-255: N-gram distribution
 */
export function generatePhonosemanticVectorLegacy(input, dim = 256) {
  const vec = new Float32Array(dim);
  const text = String(input || "").toLowerCase().trim();
  if (!text) return vec;

  // 1. Structural Resonance (Suffixes / Keywords)
  const suffix = text.slice(-5);
  for (let i = 0; i < suffix.length; i++) {
    const h = (suffix.charCodeAt(i) * 13) % 64;
    vec[64 + h] += 2.0;
  }

  // 2. Syntactic Pattern (Vowels for text, Operators/Keywords for code)
  const pattern = text.replace(/[^aeiouy=><!&|]/g, '');
  for (let i = 0; i < pattern.length; i++) {
    const h = (pattern.charCodeAt(i) * 17) % 64;
    vec[i % 64] += 1.5;
  }

  // 3. N-grams (Local context)
  for (let i = 0; i < text.length - 1; i++) {
    const gram = text.slice(i, i + 2);
    const h = ((gram.charCodeAt(0) << 5) + gram.charCodeAt(1)) % 64;
    vec[192 + h] += 1.0;
  }

  // 4. Complexity / Mass
  const lenBucket = Math.min(text.length, 30);
  vec[128 + (lenBucket % 64)] = 5.0;

  return vec;
}
