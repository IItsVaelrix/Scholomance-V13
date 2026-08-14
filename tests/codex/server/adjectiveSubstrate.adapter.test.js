/* @vitest-environment node */
import { describe, expect, it, vi } from 'vitest';
import { createAdjectiveSubstrate } from '../../../codex/server/adapters/adjectiveSubstrate.adapter.js';
import { corpusSimilarity } from '../../../codex/core/semantic/corpus-distance.js';

const DIMS = 4;
const EDGES = 2;

/** A tiny hand-built substrate, so the loader is tested rather than the corpus. */
function fixture({ contract = 'SCHOL-ADJ-SUBSTRATE-v2', words = ['warm', 'hot', 'cold'] } = {}) {
  const W = words.length;
  // warm ~ hot (same direction), cold opposed.
  // Every row needs >= MIN_SHARED_CONTEXTS (3) non-zero dims or cosineSparse
  // returns null by design — "below this many shared contexts, a cosine is
  // arithmetic, not evidence".
  const vectors = [
    [100, 20, 10, 5],
    [90, 30, 12, 4],
    [-100, -20, -10, -5],
  ];
  const quant = new Int8Array(W * DIMS);
  for (let w = 0; w < W; w += 1) for (let d = 0; d < DIMS; d += 1) quant[w * DIMS + d] = vectors[w][d];
  const scales = new Float32Array(W).fill(0.01);
  const edgeTo = new Int32Array(W * EDGES);
  const edgeWeight = new Float32Array(W * EDGES);
  edgeTo[0] = 1; edgeWeight[0] = 0.98; edgeTo[1] = 2; edgeWeight[1] = 0.1;
  edgeTo[2] = 0; edgeWeight[2] = 0.98; edgeTo[3] = 2; edgeWeight[3] = 0.1;
  edgeTo[4] = 0; edgeWeight[4] = 0.1; edgeTo[5] = 1; edgeWeight[5] = 0.1;

  const bin = Buffer.concat([
    Buffer.from(quant.buffer, quant.byteOffset, quant.byteLength),
    Buffer.from(scales.buffer),
    Buffer.from(edgeTo.buffer),
    Buffer.from(edgeWeight.buffer),
  ]);
  const manifest = {
    contract,
    corpusChecksum: 'deadbeefdeadbeef',
    builtAt: '2026-08-14T00:00:00.000Z',
    dims: DIMS,
    edges: EDGES,
    words,
    antonyms: { 0: [2], 2: [0] }, // warm <-> cold
    // v2: the scale ladder. Absent in v1, which is why scaleField.scale was null.
    scaleOrders: { warm: [{ word: 'warm', rank: 0, relative: 0.5, span: 1 }] },
    intensity: {},
    layout: {
      embeddings: { offset: 0, length: W * DIMS },
      scales: { offset: W * DIMS, length: W },
      edgeTo: { offset: W * DIMS + W * 4, length: W * EDGES },
      edgeWeight: { offset: W * DIMS + W * 4 + W * EDGES * 4, length: W * EDGES },
    },
  };
  return {
    readFileSync: vi.fn((p) => (String(p).endsWith('.json') ? JSON.stringify(manifest) : bin)),
  };
}

describe('adjective substrate adapter', () => {
  it('serves a dense vector that the EXISTING sparse cosine reads unchanged', () => {
    const s = createAdjectiveSubstrate({ fsApi: fixture() });
    expect(s.available).toBe(true);
    // corpusSimilarity is untouched production code; a dense vector is a sparse
    // one with every entry present, which is the whole point of this shape.
    const near = corpusSimilarity(s, 'warm', 'hot');
    const far = corpusSimilarity(s, 'warm', 'cold');
    expect(near.similarity).toBeGreaterThan(0.9);
    // NOT negative: cosineSparse clamps to [0,1]. An opposed vector reads 0.
    // This is why the antonym signal cannot ride the cosine and needs its own
    // channel — see antonymCharge.
    expect(far.similarity).toBe(0);
    expect(near.method).toBe('corpus-ppmi');
  });

  it('returns undefined for words outside the vocabulary, not a zero vector', () => {
    const s = createAdjectiveSubstrate({ fsApi: fixture() });
    expect(s.get('bewilderingly')).toBeUndefined();
    // A zero vector would read as "measured, unrelated". Absence must stay absent.
    expect(corpusSimilarity(s, 'warm', 'bewilderingly').similarity).toBeNull();
  });

  it('exposes WordNet antonym typing as a charge to SUBTRACT, not a similarity', () => {
    const s = createAdjectiveSubstrate({ fsApi: fixture() });
    expect(s.antonymCharge('warm', 'cold')).toBe(1);
    expect(s.antonymCharge('cold', 'warm')).toBe(1); // symmetric
    expect(s.antonymCharge('warm', 'hot')).toBe(0);
    expect(s.antonymCharge('warm', 'unknownword')).toBe(0);
  });

  it('degrades honestly when the substrate is absent', () => {
    const enoent = Object.assign(new Error('nope'), { code: 'ENOENT' });
    const s = createAdjectiveSubstrate({ fsApi: { readFileSync: () => { throw enoent; } } });
    expect(s.available).toBe(false);
    expect(s.get('warm')).toBeUndefined();
    expect(s.stats().available).toBe(false);
    // Silence would be indistinguishable from "measured nothing".
    expect(s.stats().reason).toMatch(/absent/i);
  });

  it('refuses a substrate whose contract it does not know', () => {
    const warn = vi.fn();
    const s = createAdjectiveSubstrate({ fsApi: fixture({ contract: 'SOMETHING-ELSE-v9' }), logger: { warn } });
    expect(s.available).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(s.stats().reason).toMatch(/contract mismatch/i);
  });

  it('reports the corpus checksum so a stale substrate is detectable', () => {
    const s = createAdjectiveSubstrate({ fsApi: fixture() });
    expect(s.stats().corpusChecksum).toBe('deadbeefdeadbeef');
    expect(s.stats().scales).toBe(1);
    expect(s.stats().words).toBe(3);
  });

  it('keeps lookups correct under repeated and unknown-word access', () => {
    const s = createAdjectiveSubstrate({ fsApi: fixture() });
    for (let i = 0; i < 50; i += 1) { s.get(`absent${i}`); s.get('warm'); }
    // The cache is bounded (4096) and caches misses too; repeated access must
    // keep returning the real vector rather than an evicted or stale entry.
    expect(s.get('warm')).toBeInstanceOf(Map);
    expect(s.get('warm').size).toBe(4);
    expect(s.get('absent7')).toBeUndefined();
  });
});
