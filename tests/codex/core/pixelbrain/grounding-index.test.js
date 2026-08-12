/**
 * Grounding Index tests — PB-GROUNDING-v1
 * ========================================================================
 * Proves: deterministic tokenization, index construction, attestation,
 * co-occurrence, corpus-derived grounding in synthesize(), and the
 * critical discrimination test (false friends score lower than real
 * correspondences when grounded in the actual encyclopedia).
 */

import { describe, it, expect } from 'vitest';
import {
  tokenize,
  buildIndex,
  buildIndexFromTexts,
  attest,
  coOccurrence,
  groundingScore,
  prepareForSynthesize,
  pmiPair,
  conceptPMI,
  PMI_FLOOR,
  SCHEMA,
} from '../../../../codex/core/pixelbrain/grounding-index.js';
import { synthesize, relationScore } from '../../../../codex/core/pixelbrain/concept-chemistry.js';

// ─── Test corpus (small, controlled) ─────────────────────────────────

const CORPUS = [
  { id: 'law-determinism', text: 'Determinism is non-negotiable. Same input produces same output. No hidden randomness in scoring pipelines. Checksum verification proves reproducibility.' },
  { id: 'pdr-pipeline', text: 'The asset pipeline compiles SCDL source through construction solver geometry then projects art genes then renders through VRI passes to produce sealed packets with canonical JSON and SHA-256 checksums.' },
  { id: 'pir-bridge', text: 'The Defold bridge consumes sealed scene packets via WebSocket. The wire format projects no nulls and uses explicit counts. Lua verifies the seal equality. The render claim is cross-engine comparable.' },
  { id: 'wp-registry', text: 'The semantic correspondence registry maps attributed graphs to scene graphs, dense embeddings to substrate vectors, labeled operations to SCDL typed ops, and sealed packets to canonical serialization with content-addressed checksums.' },
  { id: 'pir-pixelbrain', text: 'PixelBrain provides deterministic rasterization. The bridge validates packets, normalizes canonically, computes SHA-256 identity, and produces straight RGBA. No PixiJS imports. No DOM. No mutable cache.' },
  { id: 'law-schema', text: 'Schema is sovereign. All data shapes are defined in the schema contract. No agent may create parallel schemas. TypeScript interfaces and Zod validation enforce the contract at every boundary.' },
  { id: 'pir-vri', text: 'The VRI renderer implements seven passes: geometry, texture fields, gene marks, lighting, atmosphere, composite, and raster. Each pass is deterministic. Texture spaces bind to material channels. Art genes modulate surface parameters.' },
  { id: 'bug-worldpack', text: 'The worldpack path resolution failed because the asset loader used relative paths without normalizing against the project root. Fixed by resolving all paths through the canonical root directory.' },
];

describe('Grounding Index (PB-GROUNDING-v1)', () => {
  describe('tokenization', () => {
    it('is deterministic', () => {
      expect(tokenize('deterministic checksum verification')).toEqual(
        tokenize('deterministic checksum verification'),
      );
    });

    it('stems morphological variants to the same root', () => {
      const a = tokenize('rendering renders rendered');
      // "rendering" → "render", "renders" → "render", "rendered" → "render"
      const stems = new Set(a);
      expect(stems.size).toBe(1);
      expect(stems.has('render')).toBe(true);
    });

    it('removes stopwords', () => {
      const tokens = tokenize('the quick brown fox is a very fast animal');
      expect(tokens).not.toContain('the');
      expect(tokens).not.toContain('is');
      expect(tokens).not.toContain('a');
      expect(tokens).not.toContain('very');
    });

    it('handles empty and degenerate input', () => {
      expect(tokenize('')).toEqual([]);
      expect(tokenize('   ')).toEqual([]);
      expect(tokenize('a')).toEqual([]); // single char, too short
    });
  });

  describe('index construction', () => {
    it('produces a frozen index with schema and checksum', () => {
      const idx = buildIndex(CORPUS);
      expect(idx.schema).toBe(SCHEMA);
      expect(idx.checksum).toMatch(/^grnd1:[0-9a-f]{16}$/);
      expect(idx.docCount).toBe(8);
      expect(Object.isFrozen(idx)).toBe(true);
    });

    it('is deterministic — same corpus, same checksum', () => {
      const a = buildIndex(CORPUS);
      const b = buildIndex(CORPUS);
      expect(a.checksum).toBe(b.checksum);
      expect(a.tokenCount).toBe(b.tokenCount);
    });

    it('different corpus produces different checksum', () => {
      const a = buildIndex(CORPUS);
      const b = buildIndex(CORPUS.slice(0, 4));
      expect(a.checksum).not.toBe(b.checksum);
    });
  });

  describe('attestation', () => {
    const idx = buildIndex(CORPUS);

    it('scores well-attested concepts high', () => {
      // "determinism checksum" appears in multiple docs
      const result = attest(idx, 'determinism checksum');
      expect(result.score).toBeGreaterThan(0.3);
      expect(result.matchingDocs).toBeGreaterThanOrEqual(3);
    });

    it('scores unattested concepts at zero', () => {
      const result = attest(idx, 'quantum entanglement teleportation');
      expect(result.score).toBe(0);
      expect(result.matchingDocs).toBe(0);
    });

    it('scores partially attested concepts in between', () => {
      const result = attest(idx, 'determinism quantum');
      expect(result.score).toBeGreaterThan(0);
      expect(result.score).toBeLessThan(attest(idx, 'determinism checksum').score);
    });

    it('returns token hit details', () => {
      const result = attest(idx, 'sealed packet checksum');
      expect(result.tokenHits).toBeDefined();
      expect(Object.keys(result.tokenHits).length).toBeGreaterThan(0);
    });
  });

  describe('co-occurrence', () => {
    const idx = buildIndex(CORPUS);

    it('detects strong co-occurrence for related concepts', () => {
      // "sealed packet" and "checksum" appear in the same documents
      const co = coOccurrence(idx, 'sealed packet canonical', 'checksum deterministic');
      expect(co.jaccard).toBeGreaterThan(0.2);
      expect(co.intersection).toBeGreaterThanOrEqual(2);
    });

    it('detects zero co-occurrence for unrelated concepts', () => {
      const co = coOccurrence(idx, 'sealed packet', 'quantum teleportation');
      expect(co.jaccard).toBe(0);
      expect(co.intersection).toBe(0);
    });

    it('reports document set sizes', () => {
      const co = coOccurrence(idx, 'determinism', 'schema');
      expect(co.docsA).toBeGreaterThan(0);
      expect(co.docsB).toBeGreaterThan(0);
      expect(co.union).toBeGreaterThanOrEqual(co.intersection);
    });
  });

  describe('grounding score', () => {
    const idx = buildIndex(CORPUS);

    it('combines attestation and co-occurrence', () => {
      const gs = groundingScore(idx, 'sealed packet canonical JSON', 'checksum deterministic verification');
      expect(gs.grounding).toBeGreaterThan(0);
      expect(gs.attestA).toBeGreaterThan(0);
      expect(gs.attestB).toBeGreaterThan(0);
      expect(gs.coOcc).toBeGreaterThan(0);
    });

    it('scores unattested pairs at zero', () => {
      const gs = groundingScore(idx, 'quantum entanglement', 'teleportation beam');
      expect(gs.grounding).toBe(0);
    });
  });

  describe('synthesize with corpus index', () => {
    const idx = prepareForSynthesize(buildIndex(CORPUS));

    it('computes grounding from corpus when no explicit values given', () => {
      const result = synthesize({
        a: 'sealed packet canonical JSON checksum',
        b: 'deterministic verification reproducibility',
        product: 'content-addressed deterministic asset identity',
        index: idx,
      });
      expect(result.groundingSource).toBe('corpus');
      expect(result.grounding).toBeGreaterThan(0);
      expect(result.coOccurrence).toBeDefined();
      expect(result.checksum).toMatch(/^synth1:[0-9a-f]{16}$/);
    });

    it('explicit groundingA/B override the index', () => {
      const result = synthesize({
        a: 'sealed packet',
        b: 'checksum',
        product: 'deterministic identity',
        groundingA: 0.9,
        groundingB: 0.8,
        index: idx, // should be ignored
      });
      expect(result.groundingSource).toBe('explicit');
      expect(result.grounding).toBe(0.85);
    });

    it('no index and no explicit values → grounding zero', () => {
      const result = synthesize({
        a: 'sealed packet',
        b: 'checksum',
        product: 'deterministic identity',
      });
      expect(result.groundingSource).toBe('none');
      expect(result.grounding).toBe(0);
    });

    it('is deterministic with corpus index', () => {
      const r1 = synthesize({
        a: 'construction solver geometry',
        b: 'VRI renderer passes',
        product: 'unified deterministic asset pipeline',
        index: idx,
      });
      const r2 = synthesize({
        a: 'construction solver geometry',
        b: 'VRI renderer passes',
        product: 'unified deterministic asset pipeline',
        index: idx,
      });
      expect(r1).toEqual(r2);
      expect(r1.checksum).toBe(r2.checksum);
    });
  });

  describe('CRITICAL: false friend discrimination', () => {
    const idx = prepareForSynthesize(buildIndex(CORPUS));

    it('real correspondence scores higher than false friend', () => {
      // REAL: sealed packet ↔ canonical serialization (both attested, co-occur)
      const real = synthesize({
        a: 'sealed packet canonical JSON serialization',
        b: 'checksum content-addressed deterministic identity',
        product: 'content-addressed sealed deterministic packet',
        index: idx,
      });

      // FALSE FRIEND: checksum ≈ embedding (checksum attested, embedding NOT)
      const falseFriend = synthesize({
        a: 'checksum content-addressed hash',
        b: 'dense latent vector embedding neural',
        product: 'checksum embedding equivalence',
        index: idx,
      });

      expect(real.feasibility).toBeGreaterThan(falseFriend.feasibility);
      expect(real.grounding).toBeGreaterThan(falseFriend.grounding);
    });

    it('attested concept pair scores higher than one attested + one foreign', () => {
      // Both attested in corpus
      const bothAttested = synthesize({
        a: 'determinism reproducibility checksum',
        b: 'sealed packet pipeline render',
        product: 'deterministic sealed render pipeline',
        index: idx,
      });

      // One attested, one completely foreign
      const oneForeign = synthesize({
        a: 'determinism reproducibility checksum',
        b: 'blender shader node bmesh fcurve',
        product: 'deterministic blender render',
        index: idx,
      });

      expect(bothAttested.grounding).toBeGreaterThan(oneForeign.grounding);
      expect(bothAttested.feasibility).toBeGreaterThan(oneForeign.feasibility);
    });

    it('completely unattested pair scores near zero', () => {
      const unattested = synthesize({
        a: 'quantum entanglement teleportation',
        b: 'croissant pastry laminated dough',
        product: 'quantum pastry synthesis',
        index: idx,
      });
      expect(unattested.grounding).toBe(0);
      expect(unattested.feasibility).toBeLessThan(0.1);
    });

    // The property nobody tested, which is why the inversion shipped.
    it('does not reward ignorance: an unattested pair cannot outscore an attested co-occurring pair', () => {
      // Every token attested AND co-occurring in the corpus.
      const known = synthesize({
        a: 'sealed packet canonical serialization',
        b: 'checksum content-addressed identity',
        product: 'content-addressed sealed packet',
        index: idx,
      });

      // Not one token of `b` appears anywhere in the corpus.
      const ignorant = synthesize({
        a: 'sealed packet canonical serialization',
        b: 'zzyzx quixotry brillig slithy toves',
        product: 'sealed zzyzx equivalence',
        index: idx,
      });

      expect(ignorant.feasibility).toBeLessThan(known.feasibility);
    });

    it('reports coverage so a low-evidence pair cannot claim a confident signal', () => {
      const pmi = conceptPMI(idx, 'checksum content-addressed hash', 'dense latent vector embedding neural');
      expect(pmi.crossPairs).toBeGreaterThan(pmi.pairs);   // unattested tokens are counted, not dropped
      expect(pmi.coverage).toBeLessThan(0.5);
      expect(relationScore(pmi, idx.baseCooccurRate).relation).toBeLessThan(0.75);
    });

    it('measures the corpus co-occurrence base rate rather than assuming one', () => {
      // Never-co-occurring is this substrate's DEFAULT state, so the base rate must
      // come from the corpus. Measured 2026-08-12: ~0.176 here, ~0.034 for the real
      // encyclopedia index. A hardcoded constant would be wrong on both.
      expect(idx.baseCooccurRate).toBeGreaterThan(0);
      expect(idx.baseCooccurRate).toBeLessThan(1);
    });

    it('abstains rather than inventing a rate when the index has none', () => {
      const pmi = conceptPMI(idx, 'sealed packet canonical serialization', 'checksum content-addressed identity');
      expect(relationScore(pmi, undefined).basis).toBe('NO_SIGNAL');
    });
  });

  describe('100-iteration determinism replay', () => {
    it('produces identical checksums across 100 runs', () => {
      const idx = prepareForSynthesize(buildIndex(CORPUS));
      const checksums = new Set();
      for (let i = 0; i < 100; i++) {
        const r = synthesize({
          a: 'construction solver geometry constraints',
          b: 'VRI renderer shader passes lighting',
          product: 'unified deterministic asset compilation pipeline',
          index: idx,
        });
        checksums.add(r.checksum);
      }
      expect(checksums.size).toBe(1);
    });
  });

  describe('backward compatibility', () => {
    // RECALIBRATED 2026-08-12 for WEIGHTS_V2. This is the EXPLICIT grounding path,
    // which takes no index, so `relation` abstains and its weight redistributes —
    // the false-friend repair does not touch this number. The move from 0.629 to
    // 0.5149 comes from WEIGHTS_V2 plus residualCoherence (REPAIR 2), both of which
    // are deliberate. The frozen constant was a v1 value in a v2 world.
    it('CAL-001 explicit grounding still produces same feasibility', () => {
      // From calibration-001: R1 with explicit groundingA=0.85, groundingB=0.90
      const r = synthesize({
        a: 'determinism purity measurement code chunk',
        b: 'immune scan drift detection law audit replay verification structural mutation',
        product: 'unified determinism purity score grade violations channels',
        groundingA: 0.85,
        groundingB: 0.90,
      });
      expect(r.feasibility).toBe(0.5149);
      // stabilityClass() is a pure function of feasibility, so the class follows
      // the recalibrated score mechanically. Not an independent regression.
      expect(r.stability).toBe('METASTABLE');
      expect(r.groundingSource).toBe('explicit');
    });
  });
});

// ─── Purpose-built PMI corpus ────────────────────────────────────────
// 3 docs × 2 blank-line-delimited paragraphs = 6 windows.
//   alpha+beta co-occur in windows {0,2,4}; gamma+delta only in {1}; etc.
// This makes PMI exact and deterministic:
//   PMI(alpha,beta) = log2(0.5 / 0.25) = +1.0   (attraction)
//   PMI(alpha,gamma) = never co-occur → PMI_FLOOR (repulsion)
const PMI_CORPUS = [
  { id: 'd1', text: 'alpha beta\n\ngamma delta' },
  { id: 'd2', text: 'alpha beta\n\nepsilon zeta' },
  { id: 'd3', text: 'alpha beta\n\neta theta' },
];

describe('FIX #1: grounding composite is attestation-only', () => {
  const idx = buildIndex(CORPUS);

  it('flags document-level Jaccard as explicitly non-scoring', () => {
    const gs = groundingScore(idx, 'sealed packet canonical JSON', 'checksum deterministic verification');
    expect(gs.coOccurrenceScoring).toBe(false);
  });

  it('grounding equals the attestation mean exactly (Jaccard excluded from composite)', () => {
    const gs = groundingScore(idx, 'sealed packet canonical JSON', 'checksum deterministic verification');
    const expected = Math.round(((gs.attestA + gs.attestB) / 2) * 1e4) / 1e4;
    expect(gs.grounding).toBe(expected);
    // coOcc is still reported for diagnostics, but did NOT enter the composite
    expect(gs.coOcc).toBeGreaterThan(0);
    expect(gs.details.compositeNote).toMatch(/mean\(attestA, attestB\)/);
  });
});

describe('FIX #2: PMI signed co-occurrence over paragraph windows', () => {
  const idx = buildIndex(PMI_CORPUS);

  it('builds paragraph windows (6 windows from 3 two-paragraph docs)', () => {
    expect(idx.windowCount).toBe(6);
  });

  it('keeps the grnd1 checksum stable (window data is additive, not in checksum)', () => {
    // Checksum is over the doc-level inverted index only.
    expect(idx.checksum).toMatch(/^grnd1:[0-9a-f]{16}$/);
    expect(buildIndex(PMI_CORPUS).checksum).toBe(idx.checksum);
  });

  it('scores tokens that co-occur above chance as POSITIVE (attraction)', () => {
    const r = pmiPair(idx, 'alpha', 'beta');
    expect(r.pmi).toBeGreaterThan(0);
    expect(r.pmi).toBeCloseTo(1.0, 4); // log2(0.5 / (0.5*0.5)) = 1
  });

  it('scores attested-but-never-together tokens at the NEGATIVE floor (repulsion)', () => {
    const r = pmiPair(idx, 'alpha', 'gamma');
    expect(r.pmi).toBe(PMI_FLOOR);
    expect(r.pmi).toBeLessThan(0);
    expect(r.note).toMatch(/never-cooccur/);
  });

  it('returns null (no signal) for an unattested token', () => {
    const r = pmiPair(idx, 'alpha', 'quantum');
    expect(r.pmi).toBe(null);
  });

  it('conceptPMI flags a false-friend pair as REPULSION', () => {
    const r = conceptPMI(idx, 'alpha beta', 'gamma delta');
    expect(r.signal).toBe('REPULSION');
    expect(r.meanPMI).toBeLessThan(0);
    expect(r.repulsive).toBe(4);
    expect(r.flooredNeverCooccur).toBe(4);
  });

  it('conceptPMI flags a co-occurring pair as ATTRACTION', () => {
    const r = conceptPMI(idx, 'alpha', 'beta');
    expect(r.signal).toBe('ATTRACTION');
    expect(r.meanPMI).toBeGreaterThan(0);
  });

  it('PMI is deterministic across 100 iterations', () => {
    const seen = new Set();
    for (let i = 0; i < 100; i++) {
      seen.add(conceptPMI(idx, 'alpha beta', 'gamma delta').meanPMI);
    }
    expect(seen.size).toBe(1);
  });
});

describe('FIX #2/#3: synthesize surfaces bond sign as a diagnostic; PMI is a scored channel (v2)', () => {
  const idx = prepareForSynthesize(buildIndex(PMI_CORPUS));

  it('attaches corpusPMI when an index is provided', () => {
    const r = synthesize({ a: 'alpha beta', b: 'gamma delta', product: 'alpha gamma merge', index: idx });
    expect(r.corpusPMI).toBeDefined();
    expect(r.corpusPMI.signal).toBe('REPULSION');
  });

  it('logs bond sign and magnitude on every reaction', () => {
    const r = synthesize({ a: 'alpha', b: 'beta', product: 'alpha beta product' });
    expect(['+', '-', '0']).toContain(r.bondSign);
    expect(r.bondMagnitude).toBeGreaterThanOrEqual(0);
    expect(r.bondMagnitude).toBe(Math.round(Math.abs(r.bond) * 1e4) / 1e4);
  });

  // CONTRACT REVERSED by f343f375 and completed 2026-08-12. This test formerly
  // asserted "corpusPMI does NOT alter feasibility (diagnostic only, not a
  // weight)". Folding PMI in IS the point of WEIGHTS_V2 — it is the only channel
  // that asks whether two concepts belong together — so the old assertion can
  // never hold again and asserting it would pin the module to a contract it
  // deliberately left.
  it('corpusPMI DOES enter feasibility, weighted by coverage and base rate', () => {
    // PMI_CORPUS: alpha/beta share a window, gamma/delta share another, and the
    // two groups never co-occur — so every cross pair is attested (coverage 1.0)
    // and none of them co-occur (cooccurRate 0).
    const r = synthesize({ a: 'alpha beta', b: 'gamma delta', product: 'alpha gamma merge', index: idx });
    // The v1 three-channel sum is no longer the whole score.
    const W_BOND = 0.15, W_GROUND = 0.65, W_COHERE = 0.20;
    const v1Raw = W_BOND * r.bond + W_GROUND * r.grounding + W_COHERE * r.coherence;
    expect(r.feasibility).not.toBeCloseTo(v1Raw * r.lawScale, 3);
    expect(r.corpusPMI).toBeDefined();
    expect(r.corpusPMI.coverage).toBeGreaterThan(0);
    expect(r.corpusPMI.cooccurRate).toBeGreaterThanOrEqual(0);
  });

  it('no corpusPMI when explicit grounding is used (index path not taken)', () => {
    const r = synthesize({ a: 'alpha', b: 'beta', product: 'product', groundingA: 0.5, groundingB: 0.5 });
    expect(r.corpusPMI).toBeUndefined();
    expect(r.groundingSource).toBe('explicit');
    // bond sign/magnitude still logged regardless of grounding path
    expect(['+', '-', '0']).toContain(r.bondSign);
  });
});
