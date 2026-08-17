/**
 * T10 — DETERMINANTAL DIVERSITY PARTICLES
 *
 * Shortlist selector after quality floors. Unique count is not the prize.
 * Kernel is order-independent and checksummed.
 *
 * PURE AND ZERO-I/O.
 *
 * @module codex/core/constellation/semantic-particles/diverse-shortlist
 */

import { canonicalSerialize, sha256Hex } from './schema.js';

export function qualityScore(candidate) {
  return Number(candidate?.q ?? 0);
}

function featureKey(candidate) {
  return `${candidate.family || ''}::${candidate.topology || ''}`;
}

export function similarityKernel(candidates) {
  const ordered = [...(candidates || [])].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const n = ordered.length;
  const matrix = ordered.map((a) => ordered.map((b) => {
    if (a.id === b.id) return 1;
    if (featureKey(a) === featureKey(b)) return 0.92;
    if (a.family === b.family) return 0.6;
    return 0.05;
  }));
  return Object.freeze({
    ids: Object.freeze(ordered.map((c) => c.id)),
    matrix: Object.freeze(matrix.map((row) => Object.freeze(row))),
    checksum: sha256Hex(canonicalSerialize({ ids: ordered.map((c) => c.id), matrix })),
  });
}

/**
 * Greedy MAP-style k-DPP: pick highest remaining quality × (1 − max sim
 * to the already chosen set). Candidates below minQuality never enter.
 */
export function dppShortlist(candidates, k, options = {}) {
  const minQuality = options.minQuality ?? 0;
  const pool = (candidates || [])
    .filter((c) => qualityScore(c) >= minQuality)
    .slice()
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const kernel = similarityKernel(pool);
  const indexOf = new Map(kernel.ids.map((id, i) => [id, i]));
  const chosen = [];
  const remaining = new Set(pool.map((c) => c.id));
  while (chosen.length < k && remaining.size > 0) {
    let best = null;
    for (const cand of pool) {
      if (!remaining.has(cand.id)) continue;
      const i = indexOf.get(cand.id);
      let repulse = 0;
      for (const picked of chosen) {
        const j = indexOf.get(picked.id);
        repulse = Math.max(repulse, kernel.matrix[i][j]);
      }
      const score = qualityScore(cand) * (1 - repulse);
      if (!best || score > best.score || (score === best.score && cand.id < best.id)) {
        best = { id: cand.id, score };
      }
    }
    if (!best) break;
    remaining.delete(best.id);
    chosen.push(pool.find((c) => c.id === best.id));
  }
  return chosen;
}
