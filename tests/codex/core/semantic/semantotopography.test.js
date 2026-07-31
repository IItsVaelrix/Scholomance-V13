/**
 * SEMANTOTOPOGRAPHY ENGINE — Test Suite
 *
 * Tests the semantic topographic vector engine:
 *   - Primitive resolution (closed-class, root map, prefix/suffix, hash fallback)
 *   - Similarity discrimination (synonyms > non-synonyms)
 *   - Determinism (100-iteration replay)
 *   - TurboQuant compression
 *   - Edge cases
 *   - Key property: "render ≈ draw" but "render ≠ surrender"
 */

import { describe, it, expect } from 'vitest';
import {
  resolveSemanticPrimitives,
  resolveTextSemantics,
  generateSemantotopographicVector,
  generateSemantotopographicVectorFromPrimitives,
  semanticTopographicSimilarity,
  createSemanticTopographicSignature,
  compareSemanticTopographicSignatures,
  extractSemanticUnigrams,
  extractSemanticBigrams,
} from '../../../../codex/core/semantic/semantotopography.js';
import {
  SEMANTIC_INVENTORY,
  SEMANTIC_INDEX,
  SEMANTIC_FEATURES_V1,
  SEMANTIC_GRAVITY,
  SEMANTIC_DOMAINS,
  PRIMITIVE_TO_DOMAIN,
} from '../../../../codex/core/semantic/semantic.constants.js';

// ── Primitive resolution ─────────────────────────────────────────────────────

describe('resolveSemanticPrimitives', () => {
  it('resolves closed-class words directly', () => {
    expect(resolveSemanticPrimitives('the')).toContain('PHYS_OBJ');
    expect(resolveSemanticPrimitives('i')).toContain('PERSON');
    expect(resolveSemanticPrimitives('because')).toContain('CAUSE_EFFECT');
    expect(resolveSemanticPrimitives('must')).toContain('NECESSARY');
    expect(resolveSemanticPrimitives('not')).toContain('NEGATED');
    expect(resolveSemanticPrimitives('all')).toContain('QUANTITY');
  });

  it('resolves root morphemes', () => {
    expect(resolveSemanticPrimitives('determinism')).toEqual(['CAUSE', 'NECESSARY']);
    expect(resolveSemanticPrimitives('render')).toEqual(['CREATION', 'ACTION']);
    expect(resolveSemanticPrimitives('draw')).toEqual(['CREATION', 'ACTION']);
    expect(resolveSemanticPrimitives('checksum')).toEqual(['EVALUATE', 'QUANTITY']);
    expect(resolveSemanticPrimitives('hash')).toEqual(['EVALUATE', 'PROCESS']);
  });

  it('does NOT match substrings across morpheme boundaries', () => {
    // "surrender" must NOT match "render"
    const surrender = resolveSemanticPrimitives('surrender');
    const render = resolveSemanticPrimitives('render');
    expect(surrender).not.toEqual(render);
    // "checkmate" must NOT match "checksum"
    const checkmate = resolveSemanticPrimitives('checkmate');
    const checksum = resolveSemanticPrimitives('checksum');
    expect(checkmate).not.toEqual(checksum);
  });

  it('resolves prefix + suffix decomposition', () => {
    const unhappy = resolveSemanticPrimitives('unhappy');
    expect(unhappy).toContain('NEGATED');

    const rebuild = resolveSemanticPrimitives('rebuild');
    expect(rebuild.length).toBeGreaterThan(0);

    const precompute = resolveSemanticPrimitives('precompute');
    expect(precompute.length).toBeGreaterThan(0);
  });

  it('falls back to deterministic hash for unknown words', () => {
    const result = resolveSemanticPrimitives('xyzzyplugh');
    expect(result.length).toBeGreaterThan(0);
    expect(result.length).toBeLessThanOrEqual(2);
    // All primitives must be from the inventory
    for (const p of result) {
      expect(SEMANTIC_INDEX.has(p)).toBe(true);
    }
  });

  it('returns empty array for empty/null input', () => {
    expect(resolveSemanticPrimitives('')).toEqual([]);
    expect(resolveSemanticPrimitives(null)).toEqual([]);
    expect(resolveSemanticPrimitives(undefined)).toEqual([]);
    expect(resolveSemanticPrimitives('123')).toEqual([]);
  });

  it('is deterministic', () => {
    const words = ['determinism', 'render', 'surrender', 'xyzzyplugh', 'the', 'because'];
    for (const w of words) {
      const a = resolveSemanticPrimitives(w);
      const b = resolveSemanticPrimitives(w);
      expect(a).toEqual(b);
    }
  });
});

// ── Text resolution ──────────────────────────────────────────────────────────

describe('resolveTextSemantics', () => {
  it('resolves all words in a text', () => {
    const result = resolveTextSemantics('render the pixel art');
    expect(result.length).toBe(4);
    expect(result[0].word).toBe('render');
    expect(result[0].primitives).toEqual(['CREATION', 'ACTION']);
    expect(result[1].word).toBe('the');
    expect(result[1].primitives).toContain('PHYS_OBJ');
  });

  it('handles empty text', () => {
    expect(resolveTextSemantics('')).toEqual([]);
    expect(resolveTextSemantics(null)).toEqual([]);
  });
});

// ── Vector generation ────────────────────────────────────────────────────────

describe('generateSemantotopographicVector', () => {
  it('produces a 256-dim Float32Array', () => {
    const vec = generateSemantotopographicVector('deterministic rendering');
    expect(vec).toBeInstanceOf(Float32Array);
    expect(vec.length).toBe(256);
  });

  it('produces a unit vector (L2 norm ≈ 1)', () => {
    const vec = generateSemantotopographicVector('render the pixel art');
    let norm = 0;
    for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i];
    expect(Math.sqrt(norm)).toBeCloseTo(1.0, 5);
  });

  it('produces a zero vector for empty input', () => {
    const vec = generateSemantotopographicVector('');
    let norm = 0;
    for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i];
    expect(norm).toBe(0);
  });

  it('is deterministic', () => {
    const text = 'deterministic rendering pipeline with checksum verification';
    const a = generateSemantotopographicVector(text);
    const b = generateSemantotopographicVector(text);
    for (let i = 0; i < a.length; i++) {
      expect(a[i]).toBe(b[i]);
    }
  });
});

// ── Similarity discrimination ────────────────────────────────────────────────

describe('semanticTopographicSimilarity', () => {
  it('scores identical concepts highest', () => {
    const self = semanticTopographicSimilarity('render', 'render');
    expect(self).toBeCloseTo(1.0, 5);
  });

  it('scores synonyms higher than non-synonyms', () => {
    // render ≈ draw (both CREATION + ACTION)
    const syn = semanticTopographicSimilarity('render', 'draw');
    // render ≠ surrender (different primitives)
    const non = semanticTopographicSimilarity('render', 'surrender');
    expect(syn).toBeGreaterThan(non);
  });

  it('scores causal synonyms higher than unrelated', () => {
    // determinism ≈ reproducibility (both causal/necessity domain)
    const syn = semanticTopographicSimilarity('determinism', 'reproducibility');
    // determinism ≠ democracy (different domain)
    const non = semanticTopographicSimilarity('determinism', 'democracy');
    expect(syn).toBeGreaterThan(non);
  });

  it('scores verification synonyms higher than unrelated', () => {
    // checksum ≈ hash (both EVALUATE)
    const syn = semanticTopographicSimilarity('checksum', 'hash');
    // checksum ≠ checkmate (different domain)
    const non = semanticTopographicSimilarity('checksum', 'checkmate');
    expect(syn).toBeGreaterThan(non);
  });

  it('discriminates multi-word phrases', () => {
    const related = semanticTopographicSimilarity(
      'deterministic rendering pipeline',
      'reproducible render output'
    );
    const unrelated = semanticTopographicSimilarity(
      'deterministic rendering pipeline',
      'democratic voting system'
    );
    expect(related).toBeGreaterThan(unrelated);
  });

  it('discriminates verification phrases', () => {
    const related = semanticTopographicSimilarity(
      'verify the checksum hash',
      'validate the digest hash'
    );
    const unrelated = semanticTopographicSimilarity(
      'verify the checksum hash',
      'checkmate the opponent'
    );
    expect(related).toBeGreaterThan(unrelated);
  });

  it('returns values in [0, 1]', () => {
    const pairs = [
      ['hello', 'world'],
      ['determinism', 'chaos'],
      ['render', 'draw'],
      ['the', 'a'],
    ];
    for (const [a, b] of pairs) {
      const s = semanticTopographicSimilarity(a, b);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
    }
  });
});

// ── TurboQuant compression ───────────────────────────────────────────────────

describe('TurboQuant signatures', () => {
  it('creates and compares signatures', () => {
    const sigA = createSemanticTopographicSignature('deterministic rendering');
    const sigB = createSemanticTopographicSignature('reproducible render');
    const sigC = createSemanticTopographicSignature('democratic voting');

    expect(sigA.data).toBeInstanceOf(Uint8Array);
    expect(typeof sigA.norm).toBe('number');

    const related = compareSemanticTopographicSignatures(sigA, sigB);
    const unrelated = compareSemanticTopographicSignatures(sigA, sigC);
    expect(related).toBeGreaterThan(unrelated);
  });
});

// ── N-gram extraction ────────────────────────────────────────────────────────

describe('n-gram extraction', () => {
  it('extracts unigrams', () => {
    const counts = extractSemanticUnigrams(['CAUSE', 'NECESSARY', 'CAUSE']);
    expect(counts.get('CAUSE')).toBe(2);
    expect(counts.get('NECESSARY')).toBe(1);
  });

  it('extracts bigrams', () => {
    const counts = extractSemanticBigrams(['CAUSE', 'NECESSARY', 'FACTUAL']);
    expect(counts.get('CAUSE+NECESSARY')).toBe(1);
    expect(counts.get('NECESSARY+FACTUAL')).toBe(1);
  });
});

// ── Constants integrity ──────────────────────────────────────────────────────

describe('semantic constants', () => {
  it('has 40 primitives in the inventory', () => {
    expect(SEMANTIC_INVENTORY.length).toBe(40);
  });

  it('has a feature vector for every primitive', () => {
    for (const p of SEMANTIC_INVENTORY) {
      expect(SEMANTIC_FEATURES_V1[p]).toBeDefined();
    }
  });

  it('has a gravity value for every primitive', () => {
    for (const p of SEMANTIC_INVENTORY) {
      expect(typeof SEMANTIC_GRAVITY[p]).toBe('number');
    }
  });

  it('has 5 domains with 8 primitives each', () => {
    const domains = Object.keys(SEMANTIC_DOMAINS);
    expect(domains.length).toBe(5);
    for (const d of domains) {
      expect(SEMANTIC_DOMAINS[d].length).toBe(8);
    }
  });

  it('maps every primitive to exactly one domain', () => {
    for (const p of SEMANTIC_INVENTORY) {
      expect(PRIMITIVE_TO_DOMAIN[p]).toBeDefined();
    }
  });
});

// ── Determinism: 100-iteration replay ────────────────────────────────────────

describe('determinism', () => {
  it('produces identical vectors across 100 iterations', () => {
    const text = 'deterministic rendering pipeline with checksum verification and semantic ballistics';
    const baseline = generateSemantotopographicVector(text);
    for (let i = 0; i < 100; i++) {
      const vec = generateSemantotopographicVector(text);
      for (let d = 0; d < 256; d++) {
        expect(vec[d]).toBe(baseline[d]);
      }
    }
  });

  it('produces identical similarity scores across 100 iterations', () => {
    const baseline = semanticTopographicSimilarity('determinism', 'reproducibility');
    for (let i = 0; i < 100; i++) {
      expect(semanticTopographicSimilarity('determinism', 'reproducibility')).toBe(baseline);
    }
  });
});
