/**
 * QBIT NODE EXTRACTOR
 *
 * Extracts medial-axis QBIT nodes from a composed silhouette, one subgraph
 * per part-membership region. Each node is a local maximum of the per-part
 * chamfer distance field — the thickest reachable point in that area — and
 * is TurboQuant-compressed into 4 bytes for fast similarity retrieval.
 *
 * Pipeline per part:
 *   partOf cells → chamfer distance field → medial axis (local maxima)
 *   → TurboQuant pack (FHT + 4-bit) → within-part spine edges
 *   → { nodes, edges, skeleton }
 *
 * Pure + deterministic. No DOM, no I/O.
 */

import { fastHadamardTransform, quantizeF32To4Bit } from '../quantization/turboquant.js';

const DIAG = Math.SQRT2;
const FEATURE_DIM = 8; // must be power-of-2 for FHT

// ── Distance field ─────────────────────────────────────────────────────────

function chamferDistance(cells, width, height) {
  const grid = new Uint8Array(width * height);
  for (const { x, y } of cells) {
    if (x >= 0 && x < width && y >= 0 && y < height) grid[y * width + x] = 1;
  }

  const INF = 1e9;
  const dist = new Float32Array(width * height);
  for (let i = 0; i < grid.length; i++) dist[i] = grid[i] ? INF : 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!grid[i]) continue;
      let d = dist[i];
      if (x > 0)                d = Math.min(d, dist[i - 1] + 1);
      if (y > 0)                d = Math.min(d, dist[i - width] + 1);
      if (x > 0 && y > 0)      d = Math.min(d, dist[i - width - 1] + DIAG);
      if (x < width - 1 && y > 0) d = Math.min(d, dist[i - width + 1] + DIAG);
      dist[i] = d;
    }
  }

  for (let y = height - 1; y >= 0; y--) {
    for (let x = width - 1; x >= 0; x--) {
      const i = y * width + x;
      if (!grid[i]) continue;
      let d = dist[i];
      if (x < width - 1)                  d = Math.min(d, dist[i + 1] + 1);
      if (y < height - 1)                  d = Math.min(d, dist[i + width] + 1);
      if (x < width - 1 && y < height - 1) d = Math.min(d, dist[i + width + 1] + DIAG);
      if (x > 0 && y < height - 1)         d = Math.min(d, dist[i + width - 1] + DIAG);
      dist[i] = d;
    }
  }

  return { dist, grid };
}

// ── Medial axis ────────────────────────────────────────────────────────────

function medialAxis(dist, grid, width, height) {
  let maxDist = 0;
  for (let i = 0; i < dist.length; i++) {
    if (grid[i] && dist[i] > maxDist) maxDist = dist[i];
  }

  const nodes = [];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      if (!grid[i] || dist[i] === 0) continue;

      const d = dist[i];
      // 4-connected local maximum (>=) — keeps flat ridges on thin parts
      if (d >= dist[i - 1] && d >= dist[i + 1] &&
          d >= dist[i - width] && d >= dist[i + width]) {
        const dxGrad = (dist[i + 1] - dist[i - 1]) * 0.5;
        const dyGrad = (dist[i + width] - dist[i - width]) * 0.5;
        const mag = Math.hypot(dxGrad, dyGrad) || 1;
        nodes.push({
          x, y,
          depth: d,
          normDepth: maxDist > 0 ? d / maxDist : 0,
          nx: dxGrad / mag,
          ny: dyGrad / mag,
        });
      }
    }
  }

  return { nodes, maxDist };
}

// ── TurboQuant packing ─────────────────────────────────────────────────────

function packNode(node, width, height) {
  const vec = new Float32Array(FEATURE_DIM);
  vec[0] = node.x / Math.max(1, width - 1);
  vec[1] = node.y / Math.max(1, height - 1);
  vec[2] = node.normDepth;
  vec[3] = node.nx;
  vec[4] = node.ny;
  // vec[5..7] = 0 (FHT padding)

  fastHadamardTransform(vec);

  const packed = new Uint8Array(FEATURE_DIM / 2); // 4 bytes per node
  for (let i = 0; i < FEATURE_DIM / 2; i++) {
    packed[i] = (quantizeF32To4Bit(vec[i * 2]) << 4) |
                (quantizeF32To4Bit(vec[i * 2 + 1]) & 0x0f);
  }
  return packed;
}

// ── Within-part connectivity ───────────────────────────────────────────────

// Each node connects to its single nearest neighbor within the part.
// Produces a minimum spanning forest — the structural spine of the region.
function buildSpineEdges(nodes) {
  const edges = [];
  for (let i = 0; i < nodes.length; i++) {
    let nearestJ = -1;
    let nearestDist = Infinity;
    for (let j = 0; j < nodes.length; j++) {
      if (i === j) continue;
      const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
      if (d < nearestDist) { nearestDist = d; nearestJ = j; }
    }
    if (nearestJ >= 0) edges.push({ from: i, to: nearestJ, dist: nearestDist });
  }
  return edges;
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Extract per-part QBIT node graphs from a composed silhouette.
 *
 * @param {Object} silhouette — from composeCharacterSilhouette / composeItemSilhouette
 *   silhouette.partOf: Map<"x,y", partId>
 * @param {{ width: number, height: number }} canvas
 * @returns {Map<string, QBITPartGraph>}
 *
 * QBITPartGraph: {
 *   partId: string,
 *   nodes: Array<{ x, y, depth, normDepth, nx, ny, packed: Uint8Array }>,
 *   edges: Array<{ from: number, to: number, dist: number }>,
 *   skeleton: { centroid, core, nodeCount, maxDepth, widthEstimate }
 * }
 */
export function extractQBITGraph(silhouette, canvas) {
  const { partOf } = silhouette;
  const { width, height } = canvas;

  // Group cells by partId — O(n) single pass
  const byPart = new Map();
  partOf.forEach((partId, key) => {
    const [x, y] = key.split(',').map(Number);
    if (!byPart.has(partId)) byPart.set(partId, []);
    byPart.get(partId).push({ x, y });
  });

  const graphs = new Map();

  for (const [partId, cells] of byPart) {
    if (cells.length < 4) continue; // degenerate parts produce no useful axis

    const { dist, grid } = chamferDistance(cells, width, height);
    const { nodes: rawNodes, maxDist } = medialAxis(dist, grid, width, height);

    if (rawNodes.length === 0) continue;

    const nodes = rawNodes.map(n => ({
      x: n.x,
      y: n.y,
      depth: n.depth,
      normDepth: n.normDepth,
      nx: n.nx,
      ny: n.ny,
      packed: packNode(n, width, height),
    }));

    const edges = buildSpineEdges(nodes);

    const coreNode = nodes.reduce((best, n) => n.depth > best.depth ? n : best, nodes[0]);
    const centX = nodes.reduce((s, n) => s + n.x, 0) / nodes.length;
    const centY = nodes.reduce((s, n) => s + n.y, 0) / nodes.length;

    graphs.set(partId, Object.freeze({
      partId,
      nodes: Object.freeze(nodes),
      edges: Object.freeze(edges),
      skeleton: Object.freeze({
        centroid: Object.freeze({ x: centX, y: centY }),
        core: Object.freeze({ x: coreNode.x, y: coreNode.y, depth: coreNode.depth }),
        nodeCount: nodes.length,
        maxDepth: maxDist,
        widthEstimate: coreNode.depth * 2, // diameter at the thickest medial point
      }),
    }));
  }

  return graphs;
}
