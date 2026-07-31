import { describe, expect, it } from 'vitest';
import {
  resolveSemanticPrimitives,
  generateSemantotopographicVector,
  semanticTopographicSimilarity
} from '../../../../codex/core/semantic/semantotopography.js';

const BANDS = [
  { name: 'B0 primitive', start: 0, end: 64 },
  { name: 'B1 bigram', start: 64, end: 128 },
  { name: 'B2 topology', start: 128, end: 192 },
  { name: 'B3 domain', start: 192, end: 256 }
];

function bandNorm(v, band) {
  let n = 0;
  for (let i = band.start; i < band.end; i++) n += v[i] * v[i];
  return Math.sqrt(n);
}

function bandCosine(v1, v2, band) {
  let dot = 0, n1 = 0, n2 = 0;
  for (let i = band.start; i < band.end; i++) {
    dot += v1[i] * v2[i]; n1 += v1[i] * v1[i]; n2 += v2[i] * v2[i];
  }
  if (n1 === 0 || n2 === 0) return 0;
  return dot / (Math.sqrt(n1) * Math.sqrt(n2));
}

// ── Fix 1: prototype-chain lookup ────────────────────────────────────────────

describe('primitive resolution does not read the prototype chain', () => {
  it('resolves "constructor" to primitives, not to Object', () => {
    // CLOSED_CLASS_MAP[lower] walks the prototype chain, so an ordinary English
    // word that collides with an Object.prototype member returns a Function.
    const result = resolveSemanticPrimitives('constructor');
    expect(Array.isArray(result)).toBe(true);
  });

  it('resolves every Object.prototype member name to an array', () => {
    for (const word of ['toString', 'valueOf', 'hasOwnProperty', 'isPrototypeOf', 'constructor']) {
      expect(Array.isArray(resolveSemanticPrimitives(word)), `${word} did not resolve to an array`).toBe(true);
    }
  });
});

// ── Fix 2: per-band normalization ────────────────────────────────────────────

describe('per-band normalization', () => {
  it('normalizes each populated band to unit norm independently', () => {
    const v = generateSemantotopographicVector('deterministic rendering pipeline');
    for (const band of BANDS) {
      const norm = bandNorm(v, band);
      // A band is either silent (0) or unit — never an arbitrary magnitude that
      // lets one band steer the whole vector's direction.
      expect(norm === 0 || Math.abs(norm - 1) < 1e-5, `${band.name} norm was ${norm}`).toBe(true);
    }
  });

  it('gives no band more than half the vector energy', () => {
    // Band 2 previously held ~75% of the energy because it wrote at magnitude
    // 8.0 while band 0 wrote at ~1.0, and a single global L2 preserved that.
    const v = generateSemantotopographicVector('cat');
    const norms = BANDS.map(b => bandNorm(v, b));
    const total = norms.reduce((s, n) => s + n * n, 0);
    for (let i = 0; i < BANDS.length; i++) {
      expect(norms[i] * norms[i] / total, `${BANDS[i].name} dominates`).toBeLessThanOrEqual(0.5);
    }
  });
});

// ── Fix 3: bands 2 and 3 must not compute the same quantity ──────────────────

describe('band 2 and band 3 are not the same measurement twice', () => {
  it('scores pairs differently in band 2 than in band 3', () => {
    // Band 2 wrote (domainCount/total)*8.0 into dims 128-132 while band 3 wrote
    // the same quantity into 192-196 at 6.0 — one measurement, two bands.
    //
    // Measured before the fix, band 2 vs band 3 cosine:
    //   cat/window                0.833 / 0.886   delta 0.053
    //   determinism/democracy     0.815 / 0.882   delta 0.067
    //   quantum chromo / cake     0.873 / 0.911   delta 0.038
    // Spearman rho across all probed pairs was 0.903 — REDUNDANT. Two bands
    // that agree that closely are one channel occupying 128 dimensions.
    const pairs = [
      ['cat', 'window'],
      ['determinism', 'democracy'],
      ['quantum chromodynamics', 'birthday cake']
    ];
    const deltas = pairs.map(([a, b]) => {
      const va = generateSemantotopographicVector(a);
      const vb = generateSemantotopographicVector(b);
      return Math.abs(bandCosine(va, vb, BANDS[2]) - bandCosine(va, vb, BANDS[3]));
    });
    expect(Math.max(...deltas), `bands 2 and 3 still track each other: ${deltas.map(d => d.toFixed(3))}`)
      .toBeGreaterThan(0.15);
  });
});

// ── Fix 4: negation must flip, not add ───────────────────────────────────────

describe('negation inverts meaning rather than adding to it', () => {
  it('makes "impossible" anti-correlated with "possible" on the primitive band', () => {
    // NEGATED as an additive primitive makes "not X" MAXIMALLY SIMILAR to X:
    // impossible = [NEGATED, POSSIBLE, STATE] shares two of three dims with
    // possible = [POSSIBLE, STATE]. Negation has to flip a sign.
    const cos = bandCosine(
      generateSemantotopographicVector('possible'),
      generateSemantotopographicVector('impossible'),
      BANDS[0]
    );
    expect(cos).toBeLessThan(0);
  });

  it('scores a negated pair below an unrelated pair', () => {
    const negated = semanticTopographicSimilarity('visible', 'invisible');
    const unrelated = semanticTopographicSimilarity('visible', 'carafe');
    expect(negated).toBeLessThan(unrelated);
  });

  it('leaves an unnegated word unchanged by the negation channel', () => {
    const a = generateSemantotopographicVector('possible');
    const b = generateSemantotopographicVector('possible');
    expect(bandCosine(a, b, BANDS[0])).toBeCloseTo(1, 10);
  });
});

// ── Fix 5: band 2 must encode in direction, not magnitude ────────────────────

describe('band 2 encodes in direction', () => {
  it('separates unrelated single words instead of reading ~1.0 for everything', () => {
    // Eleven scalar ratios written into eleven FIXED dims give every short text
    // the same band-2 direction; per-band normalization then erases the only
    // thing that differed, which was magnitude.
    const cos = bandCosine(
      generateSemantotopographicVector('cat'),
      generateSemantotopographicVector('window'),
      BANDS[2]
    );
    expect(cos).toBeLessThan(0.99);
  });
});

// ── Fix 6: band 3 must encode in direction too ───────────────────────────────

describe('band 3 encodes in direction', () => {
  it('separates maximally distant texts instead of reading ~0.9 for everything', () => {
    // Band 3 wrote five domain ratios into five FIXED dims (192-196) at scale
    // 6.0 and the register ratio into two more (213, 214) — the same
    // magnitude shape that was removed from band 2. After per-band
    // normalization it read 0.887-0.988 for every pair probed, including
    // 0.915 for quantum chromodynamics vs birthday cake.
    const cos = bandCosine(
      generateSemantotopographicVector('quantum chromodynamics'),
      generateSemantotopographicVector('birthday cake'),
      BANDS[3]
    );
    expect(cos).toBeLessThan(0.7);
  });

  it('separates unrelated single words', () => {
    const cos = bandCosine(
      generateSemantotopographicVector('cat'),
      generateSemantotopographicVector('window'),
      BANDS[3]
    );
    expect(cos).toBeLessThan(0.8);
  });

  it('keeps the register signal it already had', () => {
    // Function-word-heavy vs content-word-heavy text was the one thing band 3
    // did discriminate (0.316). Directional bucketing must not lose it.
    const cos = bandCosine(
      generateSemantotopographicVector('the of and to in'),
      generateSemantotopographicVector('run jump build write'),
      BANDS[3]
    );
    expect(cos).toBeLessThan(0.6);
  });
});

// ── The consequence all five fixes exist to produce ──────────────────────────

describe('structural baseline', () => {
  it('scores maximally distant texts below 0.5', () => {
    expect(semanticTopographicSimilarity('quantum chromodynamics', 'birthday cake'))
      .toBeLessThan(0.5);
  });

  it('separates similar from unrelated by more than 0.2', () => {
    const similar = semanticTopographicSimilarity('render', 'draw');
    const unrelated = semanticTopographicSimilarity('cat', 'window');
    expect(similar - unrelated).toBeGreaterThan(0.2);
  });
});
