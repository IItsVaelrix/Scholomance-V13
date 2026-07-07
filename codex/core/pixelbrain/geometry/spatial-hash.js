/**
 * spatial-hash.js
 *
 * Grid-bucketed spatial index for fast nearest-cell and range queries.
 *
 * Implementation strategy:
 *   - Divide the lattice into fixed-size buckets.
 *   - Each bucket is a Set of cell keys.
 *   - Nearest-neighbor and range queries only scan buckets that overlap the
 *     query region, keeping cost proportional to result size, not canvas size.
 *
 * Design notes:
 *   - Bucket size of 8 is a good default for PixelBrain canvases (16–512 px).
 *     Adjust via options.bucketSize if profiling shows pressure.
 *   - No quad-tree. For PixelBrain scale, a flat spatial hash is sufficient
 *     and far simpler to reason about. Upgrade only after profiling.
 *   - The index is a plain object. It is NOT auto-updated when callers mutate
 *     a CellSet directly. Rebuild with buildSpatialHash() after mutations.
 */

import { parseCellKey } from './cell-key.js';

const DEFAULT_BUCKET_SIZE = 8;

/**
 * @typedef {{ buckets: Map<string, Set<string>>, bucketSize: number }} SpatialHash
 */

/**
 * Compute the bucket key for a cell coordinate.
 * @private
 */
function _bucketKey(x, y, bucketSize) {
  const bx = Math.floor(x / bucketSize);
  const by = Math.floor(y / bucketSize);
  return `${bx},${by}`;
}

/**
 * Build a SpatialHash from a CellSet or array of {x, y} cells.
 *
 * @param {Set<string> | Array<{x: number, y: number}>} cells
 * @param {{ bucketSize?: number }} [options]
 * @returns {SpatialHash}
 */
export function buildSpatialHash(cells, { bucketSize = DEFAULT_BUCKET_SIZE } = {}) {
  const buckets = new Map();

  const add = (key, x, y) => {
    const bk = _bucketKey(x, y, bucketSize);
    let bucket = buckets.get(bk);
    if (!bucket) {
      bucket = new Set();
      buckets.set(bk, bucket);
    }
    bucket.add(key);
  };

  if (cells instanceof Set) {
    for (const key of cells) {
      const { x, y } = parseCellKey(key);
      add(key, x, y);
    }
  } else {
    for (const cell of cells) {
      const key = `${cell.x},${cell.y}`;
      add(key, cell.x, cell.y);
    }
  }

  return { buckets, bucketSize };
}

/**
 * Query all cells within a rectangular region (inclusive).
 *
 * @param {SpatialHash} hash
 * @param {{ minX: number, minY: number, maxX: number, maxY: number }} region
 * @returns {Array<{x: number, y: number}>} Sorted by (y, x).
 */
export function querySpatialHash(hash, region) {
  const { buckets, bucketSize } = hash;
  const { minX, minY, maxX, maxY } = region;

  const bMinX = Math.floor(minX / bucketSize);
  const bMinY = Math.floor(minY / bucketSize);
  const bMaxX = Math.floor(maxX / bucketSize);
  const bMaxY = Math.floor(maxY / bucketSize);

  const result = [];

  for (let by = bMinY; by <= bMaxY; by++) {
    for (let bx = bMinX; bx <= bMaxX; bx++) {
      const bucket = buckets.get(`${bx},${by}`);
      if (!bucket) continue;
      for (const key of bucket) {
        const { x, y } = parseCellKey(key);
        if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
          result.push({ x, y });
        }
      }
    }
  }

  return result.sort((a, b) => a.y - b.y || a.x - b.x);
}

/**
 * Find the nearest cell in the hash to a query point (px, py).
 * Uses Chebyshev distance (taxicab in bucketing, Euclidean for final sort).
 *
 * @param {SpatialHash} hash
 * @param {number} px
 * @param {number} py
 * @param {{ maxRadius?: number }} [options]  maxRadius limits the search.
 * @returns {{ x: number, y: number, distance: number } | null}
 */
export function nearestCell(hash, px, py, { maxRadius = Infinity } = {}) {
  const { buckets, bucketSize } = hash;

  // Expand search ring outward by one bucket at a time until we find something
  // or exceed maxRadius.
  const maxBucketRadius = Math.ceil(maxRadius / bucketSize) + 1;
  let best = null;
  let bestDist = Infinity;

  for (let ring = 0; ring <= maxBucketRadius; ring++) {
    // Early exit: the minimum possible distance in the next ring exceeds bestDist.
    const ringMin = ring === 0 ? 0 : (ring - 1) * bucketSize;
    if (ringMin > bestDist) break;

    const bx0 = Math.floor(px / bucketSize) - ring;
    const by0 = Math.floor(py / bucketSize) - ring;
    const bx1 = Math.floor(px / bucketSize) + ring;
    const by1 = Math.floor(py / bucketSize) + ring;

    for (let by = by0; by <= by1; by++) {
      for (let bx = bx0; bx <= bx1; bx++) {
        // Only scan border cells on each ring to avoid re-scanning interior.
        if (ring > 0 && bx > bx0 && bx < bx1 && by > by0 && by < by1) continue;

        const bucket = buckets.get(`${bx},${by}`);
        if (!bucket) continue;

        for (const key of bucket) {
          const { x, y } = parseCellKey(key);
          const d = Math.hypot(x - px, y - py);
          if (d < bestDist && d <= maxRadius) {
            bestDist = d;
            best = { x, y, distance: d };
          }
        }
      }
    }
  }

  return best;
}
