// codex/core/lexical-graph/deviceEmbed.js
//
// Builds a versioned TurboQuant embedding blob for a literary-device node.
// Pack format matches rhyme-astrology (scripts/buildRhymeAstrologyIndex.js):
// [4-byte float32 LE norm][packed 4-bit TurboQuant data]. The source vector
// is the existing deterministic phonosemantic-mock generator
// (codex/core/semantic/vector.utils.js), already reused by the
// rhyme-astrology build pipeline — kept as the single source of truth
// instead of duplicating a second hash here. See:
// docs/superpowers/specs/2026-07-18-lexical-graph-foundation-design.md

import { generatePhonosemanticVector } from '../semantic/vector.utils.js';
import { quantizeVectorJS } from '../quantization/turboquant.js';
import { DEVICE_EMBEDDING_DIMENSIONS } from './types.js';

/** Canonical TurboQuant seed used across the codebase (rhyme-astrology, etc). */
const TURBOQUANT_SEED = 42;

/**
 * Builds the packed embedding blob for a device node. Deterministic: the
 * same `canonicalText` + `definition` pair always produces the same bytes
 * (same input vector, same quantization seed).
 *
 * @param {string} canonicalText
 * @param {string} definition
 * @returns {Buffer}
 */
export function buildDeviceEmbeddingBlob(canonicalText, definition) {
  const input = `${canonicalText ?? ''}\n${definition ?? ''}`;
  const vector = generatePhonosemanticVector(input, DEVICE_EMBEDDING_DIMENSIONS);
  const { data, norm } = quantizeVectorJS(vector, TURBOQUANT_SEED);

  const dataBuffer = Buffer.from(data);
  const buf = Buffer.alloc(4 + dataBuffer.length);
  buf.writeFloatLE(norm, 0);
  dataBuffer.copy(buf, 4);
  return buf;
}
