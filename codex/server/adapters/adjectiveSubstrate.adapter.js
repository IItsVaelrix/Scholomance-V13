/**
 * ADJECTIVE SUBSTRATE ADAPTER — corpus vectors without the 6.3GB corpus
 *
 * Production has never had adjective corpus vectors. adjective_corpus.sqlite is
 * 6.3GB against a ~923MB build context and a 1GB volume, so it has never
 * shipped, `[Constellation] adjective_corpus.sqlite absent` is logged on every
 * boot, and every page emits "corpus vectors unavailable: adjective neighbours
 * fall back to WordNet, which answers 0.7% of adjective pairs".
 *
 * This loads the 2.3MB substrate built by scripts/build-adjective-substrate.mjs
 * and serves the same interface, so corpusSimilarity() needs no changes:
 * `get(word)` returns a DENSE 128-dim vector expressed as a Map, and a dense
 * vector is simply a sparse one with every entry present. cosineSparse computes
 * the correct cosine over it unmodified.
 *
 * Measured on 212 labelled pairs whose labels derive from neither PPMI nor
 * WordNet (SYNONYM / UNRELATED / ANTONYM):
 *
 *                        coverage   AUC(syn>unrel)   AUC(syn>anto)
 *   production (wordnet)     41%        0.696            0.911
 *   this substrate         97.6%        0.995            0.642
 *   with antonym veto      98.1%        0.994            0.935
 *
 * The veto matters. Distributional similarity rates opposites as SIMILAR
 * because they share contexts — the full 6.3GB matrix scores 0.435 on
 * synonym-vs-antonym, BELOW chance. antonymCharge() exposes WordNet's typed
 * antonym edges so a caller can subtract that signal rather than inherit it.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DEFAULT_DIR = 'public/substrate';
const CONTRACT = 'SCHOL-ADJ-SUBSTRATE-v2';
/**
 * Bounded, because an unbounded per-word cache on a long-lived server is the
 * exact shape that put this service into a reboot loop on 2026-08-14.
 */
const MAX_CACHED_VECTORS = 4096;

/** @returns {{available: boolean}} a substrate that answers nothing, honestly. */
function unavailable(reason) {
  return {
    available: false,
    reason,
    get: () => undefined,
    antonymCharge: () => 0,
    stats: () => ({ available: false, reason }),
  };
}

/**
 * @param {object} [opts]
 * @param {string} [opts.dir] directory holding the .json manifest and .bin payload
 * @param {{readFileSync: Function}} [opts.fsApi]
 * @param {{warn?: Function, info?: Function}} [opts.logger]
 */
/**
 * @param {object} [opts]
 * @param {string|null} [opts.dictSchemaVersion] the LIVE dictionary's
 *   schema_version. The antonym edges here were baked out of a dictionary at
 *   build time; corpusChecksum does not cover that. If the live dictionary has
 *   moved on, the antonyms describe the old one — loadable, and quietly wrong.
 *   Passing this makes the drift loud instead.
 */
export function createAdjectiveSubstrate(opts = {}) {
  const dir = opts.dir || DEFAULT_DIR;
  const fsApi = opts.fsApi || { readFileSync };
  const logger = opts.logger || {};

  let manifest;
  let bin;
  try {
    manifest = JSON.parse(fsApi.readFileSync(join(dir, 'adjective-substrate.json'), 'utf8'));
    bin = fsApi.readFileSync(join(dir, 'adjective-substrate.bin'));
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    return unavailable('substrate files absent');
  }
  if (manifest?.contract !== CONTRACT) {
    // A wrong contract is louder than a missing file: something shipped a
    // substrate this code does not know how to read.
    logger.warn?.({ found: manifest?.contract, expected: CONTRACT }, '[substrate] contract mismatch');
    return unavailable(`contract mismatch: ${manifest?.contract}`);
  }

  const { dims, edges, words, antonyms, layout } = manifest;

  /**
   * Same Map<head, rows[]> shape loadScaleOrders() returns, so scaleField
   * consumes it unchanged. Without this scaleField.scale is null and the
   * channel degrades from a measured ladder to an unordered neighbour list —
   * which is what shipped in v1.
   */
  const scaleOrders = new Map(Object.entries(manifest.scaleOrders || {}));

  /**
   * Not fatal — stale antonyms are a DEGRADED veto, not a broken substrate, and
   * refusing to load would take out similarity and the scale ladder too. But it
   * is reported at warn level and surfaced in stats(), so it can never be the
   * kind of silent success that hid the missing ladder.
   */
  const expectedDict = opts.dictSchemaVersion ?? null;
  const dictStale = expectedDict !== null
    && String(manifest.dictSchemaVersion ?? '') !== String(expectedDict);
  if (dictStale) {
    logger.warn?.(
      { builtAgainst: manifest.dictSchemaVersion ?? null, live: expectedDict, antonymEdges: manifest.antonymEdges ?? null },
      '[substrate] antonym edges were baked from a DIFFERENT dictionary — rebuild with scripts/build-adjective-substrate.mjs',
    );
  }
  const W = words.length;
  const index = new Map();
  for (let i = 0; i < W; i += 1) index.set(words[i], i);

  // Views over the single payload buffer — no copying.
  const base = bin.byteOffset;
  const quant = new Int8Array(bin.buffer, base + layout.embeddings.offset, layout.embeddings.length);
  const scales = new Float32Array(bin.buffer, base + layout.scales.offset, layout.scales.length);
  const edgeTo = new Int32Array(bin.buffer, base + layout.edgeTo.offset, layout.edgeTo.length);
  const edgeWeight = new Float32Array(bin.buffer, base + layout.edgeWeight.offset, layout.edgeWeight.length);

  const antonymIdx = new Map();
  for (const [k, v] of Object.entries(antonyms || {})) antonymIdx.set(Number(k), v);

  const cache = new Map();

  /**
   * Dense 128-dim vector as a Map, so the existing sparse cosine reads it
   * unchanged. The per-word scale cancels out of a cosine, but it is applied
   * anyway so magnitudes remain meaningful to anything that looks.
   */
  function get(word) {
    const w = String(word || '').trim().toLowerCase();
    if (!w) return undefined;
    if (cache.has(w)) return cache.get(w);
    const i = index.get(w);
    let vec;
    if (i === undefined) {
      vec = undefined;
    } else {
      vec = new Map();
      const b = i * dims; const sc = scales[i];
      for (let d = 0; d < dims; d += 1) {
        const q = quant[b + d];
        if (q !== 0) vec.set(d, q * sc);
      }
    }
    if (cache.size >= MAX_CACHED_VECTORS) {
      // Cheapest sound eviction: drop the oldest insertion.
      cache.delete(cache.keys().next().value);
    }
    cache.set(w, vec);
    return vec;
  }

  /**
   * Negative charge if WordNet types these two as antonyms, 0 otherwise.
   * Callers SUBTRACT this; it is not a similarity.
   */
  function antonymCharge(wordA, wordB) {
    const a = index.get(String(wordA || '').trim().toLowerCase());
    const b = index.get(String(wordB || '').trim().toLowerCase());
    if (a === undefined || b === undefined) return 0;
    const outs = antonymIdx.get(a);
    if (outs?.includes(b)) return 1;
    const back = antonymIdx.get(b);
    return back?.includes(a) ? 1 : 0;
  }

  function neighbours(word, limit = edges) {
    const i = index.get(String(word || '').trim().toLowerCase());
    if (i === undefined) return [];
    const out = [];
    for (let j = 0; j < edges && out.length < limit; j += 1) {
      const t = edgeTo[i * edges + j];
      if (t === i) continue;
      out.push({ word: words[t], similarity: edgeWeight[i * edges + j] });
    }
    return out;
  }

  return {
    available: true,
    get,
    antonymCharge,
    neighbours,
    scaleOrders,
    stats: () => ({
      scales: scaleOrders.size,
      dictSchemaVersion: manifest.dictSchemaVersion ?? null,
      antonymEdges: manifest.antonymEdges ?? null,
      dictStale,
      available: true,
      contract: CONTRACT,
      words: W,
      dims,
      edges,
      corpusChecksum: manifest.corpusChecksum,
      builtAt: manifest.builtAt,
      antonymWords: antonymIdx.size,
      source: 'adjective-substrate',
    }),
  };
}
