/**
 * SemQuant-keyed RegionPartition
 */

import { contentHash, deepFreeze, quantize6 } from './schema.js';
import { toLabLattice } from './preprocessing.js';

function regionKey(cell) {
  if (cell.partId && cell.canonicalRole) return `part:${cell.partId}|role:${cell.canonicalRole}`;
  if (cell.partId) return `part:${cell.partId}`;
  if (cell.canonicalRole) return `role:${cell.canonicalRole}`;
  if (cell.material) return `material:${cell.material}`;
  return null;
}

function connectedComponents(cells, w, h) {
  const keyOf = (x, y) => `${x},${y}`;
  const map = new Map(cells.map((c) => [keyOf(c.x, c.y), c]));
  const seen = new Set();
  const comps = [];
  for (const c of cells) {
    const k = keyOf(c.x, c.y);
    if (seen.has(k)) continue;
    const stack = [c];
    const group = [];
    seen.add(k);
    while (stack.length) {
      const cur = stack.pop();
      group.push(cur);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cur.x + dx;
        const ny = cur.y + dy;
        const nk = keyOf(nx, ny);
        if (seen.has(nk)) continue;
        if (!map.has(nk)) continue;
        seen.add(nk);
        stack.push(map.get(nk));
      }
    }
    comps.push(group);
  }
  return comps;
}

function buildRegion(id, cells, semanticSource) {
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  let sx = 0; let sy = 0;
  const cellIds = [];
  const pathRefs = new Set();
  for (const c of cells) {
    minX = Math.min(minX, c.x);
    minY = Math.min(minY, c.y);
    maxX = Math.max(maxX, c.x);
    maxY = Math.max(maxY, c.y);
    sx += c.x;
    sy += c.y;
    cellIds.push(`${c.x},${c.y}`);
    if (c.pathRef && c.pathRef !== 'unmatched') pathRefs.add(c.pathRef);
  }
  cellIds.sort();
  const n = cells.length || 1;
  const sample = cells[0];
  return {
    id,
    partId: sample.partId ?? null,
    canonicalRole: sample.canonicalRole ?? null,
    material: sample.material ?? null,
    semanticSource,
    bbox: Object.freeze({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }),
    area: cells.length,
    centroid: Object.freeze({
      x: quantize6(sx / n),
      y: quantize6(sy / n),
    }),
    cellIds: Object.freeze(cellIds),
    pathRefs: Object.freeze([...pathRefs].sort()),
    confidence: semanticSource === 'semquant' ? 1 : semanticSource === 'material' ? 0.6 : 0.3,
    meanLab: Object.freeze({
      L: quantize6(cells.reduce((s, c) => s + c.L, 0) / n),
      a: quantize6(cells.reduce((s, c) => s + c.a, 0) / n),
      b: quantize6(cells.reduce((s, c) => s + c.b, 0) / n),
    }),
  };
}

/**
 * @param {object} input
 * @param {object} [options]
 */
export function partitionRegions(input, options = {}) {
  const lattice = options.lattice ?? toLabLattice(input, options);
  const reasons = [];
  const groups = new Map();

  for (const cell of lattice.occupied) {
    const key = regionKey(cell);
    if (key) {
      const source = cell.partId || cell.canonicalRole ? 'semquant' : 'material';
      if (!groups.has(key)) groups.set(key, { source, cells: [] });
      groups.get(key).cells.push(cell);
    }
  }

  const regions = [];
  let idx = 0;

  // SemQuant / material keyed
  const keyedCells = new Set();
  for (const [key, group] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    for (const c of group.cells) keyedCells.add(`${c.x},${c.y}`);
    regions.push(buildRegion(`r${idx++}:${key}`, group.cells, group.source));
  }

  // Geometry fallback for remaining occupied cells
  const leftovers = lattice.occupied.filter((c) => !keyedCells.has(`${c.x},${c.y}`));
  if (leftovers.length) {
    reasons.push('geometry-fallback');
    const comps = connectedComponents(leftovers, lattice.width, lattice.height);
    comps.sort((a, b) => {
      const ay = Math.min(...a.map((c) => c.y));
      const by = Math.min(...b.map((c) => c.y));
      if (ay !== by) return ay - by;
      return Math.min(...a.map((c) => c.x)) - Math.min(...b.map((c) => c.x));
    });
    for (let i = 0; i < comps.length; i++) {
      regions.push(buildRegion(`r${idx++}:geom:${i}`, comps[i], 'geometry-fallback'));
    }
  }

  const packet = {
    regions: Object.freeze(regions.map((r) => deepFreeze(r))),
    partitionHash: contentHash(regions.map((r) => ({ id: r.id, cellIds: r.cellIds, semanticSource: r.semanticSource }))),
    mode: lattice.mode,
    width: lattice.width,
    height: lattice.height,
    reasons: Object.freeze(reasons),
  };
  return deepFreeze(packet);
}
