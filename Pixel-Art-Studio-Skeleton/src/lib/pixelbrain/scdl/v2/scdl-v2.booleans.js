import {
  rasterizeLineBresenham,
  rasterizeRectCenter,
  rasterizeRoundedRectCenter,
  rasterizeRingMidpoint,
  rasterizeEllipseCenter,
  rasterizePolygonScanline,
  rasterizePath,
  rasterizeShapeCells,
} from './scdl-v2.raster.js';

export function shapeUnion(a, b) {
  return Object.freeze({ kind: 'CSG_UNION', a, b });
}

export function shapeSubtract(a, b) {
  return Object.freeze({ kind: 'CSG_SUBTRACT', a, b });
}

export function shapeIntersect(a, b) {
  return Object.freeze({ kind: 'CSG_INTERSECT', a, b });
}

export function shapeXor(a, b) {
  return Object.freeze({ kind: 'CSG_XOR', a, b });
}

export function shapeOutline(shape, width, align = 'INNER') {
  return Object.freeze({ kind: 'OUTLINE', shape, width, align });
}

export function shapeErosion(shape, passes = 1) {
  return Object.freeze({ kind: 'EROSION', shape, passes });
}

export const createErosion = shapeErosion;

function toNum(val) {
  if (val === undefined || val === null) return 0;
  if (typeof val === 'number') return val;
  if (val && typeof val === 'object') {
    if (val.value !== undefined) return toNum(val.value);
    if (val.numerator !== undefined && val.denominator !== undefined) {
      return Number(val.numerator) / Number(val.denominator);
    }
  }
  return Number(val);
}

function rasterizePrimitive(shape, rasterPolicy = 'CENTER') {
  if (shape.kind === 'RECT' || shape.kind === 'ROUNDED_RECT') {
    const ox = toNum(shape.origin?.x ?? shape.origin?.value?.x);
    const oy = toNum(shape.origin?.y ?? shape.origin?.value?.y);
    const w = toNum(shape.size?.width ?? shape.size?.x ?? shape.size?.value?.width);
    const h = toNum(shape.size?.height ?? shape.size?.y ?? shape.size?.value?.height);
    if (shape.kind === 'ROUNDED_RECT') {
      return rasterizeRoundedRectCenter(ox, oy, w, h, toNum(shape.cornerRadius));
    }
    return rasterizeRectCenter(ox, oy, w, h);
  }

  if (shape.kind === 'CIRCLE') {
    const cx = toNum(shape.center?.x ?? shape.center?.value?.x);
    const cy = toNum(shape.center?.y ?? shape.center?.value?.y);
    const r = toNum(shape.radius?.value ?? shape.radius);
    const cells = [];
    const minX = Math.floor(cx - r);
    const maxX = Math.ceil(cx + r);
    const minY = Math.floor(cy - r);
    const maxY = Math.ceil(cy + r);
    const rSq = r * r;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        if (dx * dx + dy * dy <= rSq) {
          cells.push({ x, y });
        }
      }
    }
    return cells;
  }

  if (shape.kind === 'RING') {
    const cx = toNum(shape.center?.x ?? shape.center?.value?.x);
    const cy = toNum(shape.center?.y ?? shape.center?.value?.y);
    const inner = toNum(shape.innerRadius);
    const outer = toNum(shape.outerRadius);
    return rasterizeRingMidpoint(cx, cy, inner, outer);
  }

  if (shape.kind === 'ELLIPSE') {
    const cx = toNum(shape.center?.x ?? shape.center?.value?.x);
    const cy = toNum(shape.center?.y ?? shape.center?.value?.y);
    const rx = toNum(shape.radiusX);
    const ry = toNum(shape.radiusY);
    return rasterizeEllipseCenter(cx, cy, rx, ry);
  }

  if (shape.kind === 'LINE') {
    const x0 = toNum(shape.from?.x ?? shape.from?.value?.x);
    const y0 = toNum(shape.from?.y ?? shape.from?.value?.y);
    const x1 = toNum(shape.to?.x ?? shape.to?.value?.x);
    const y1 = toNum(shape.to?.y ?? shape.to?.value?.y);
    return rasterizeLineBresenham(x0, y0, x1, y1);
  }

  if (shape.kind === 'TRIANGLE') {
    const v1 = { x: toNum(shape.p1?.x ?? shape.p1?.value?.x), y: toNum(shape.p1?.y ?? shape.p1?.value?.y) };
    const v2 = { x: toNum(shape.p2?.x ?? shape.p2?.value?.x), y: toNum(shape.p2?.y ?? shape.p2?.value?.y) };
    const v3 = { x: toNum(shape.p3?.x ?? shape.p3?.value?.x), y: toNum(shape.p3?.y ?? shape.p3?.value?.y) };
    return rasterizePolygonScanline([v1, v2, v3], 'NON_ZERO');
  }

  if (shape.kind === 'POLYGON') {
    const verts = shape.vertices.map((v) => ({
      x: toNum(v.x ?? v.value?.x),
      y: toNum(v.y ?? v.value?.y),
    }));
    return rasterizePolygonScanline(verts, 'NON_ZERO');
  }

  if (shape.kind === 'PIXEL') {
    const px = Math.round(toNum(shape.at?.x ?? shape.at?.value?.x));
    const py = Math.round(toNum(shape.at?.y ?? shape.at?.value?.y));
    return [{ x: px, y: py }];
  }

  if (shape.kind === 'PATH') {
    return rasterizePath(shape, rasterPolicy);
  }

  return rasterizeShapeCells(shape, rasterPolicy);
}

/**
 * Evaluates a CSG shape into discrete lattice cells with scoped silhouette maps.
 * Guarantees that independent entities maintain isolated coordinate ownership (Pattern #3).
 */
export function evaluateCSGToCells(shape, rasterPolicy = 'CENTER') {
  if (!shape || typeof shape !== 'object') return [];

  switch (shape.kind) {
    case 'CSG_UNION': {
      const aCells = evaluateCSGToCells(shape.a, rasterPolicy);
      const bCells = evaluateCSGToCells(shape.b, rasterPolicy);
      const map = new Map();
      for (const c of aCells) map.set(`${c.x},${c.y}`, c);
      for (const c of bCells) map.set(`${c.x},${c.y}`, c);
      return [...map.values()];
    }

    case 'CSG_SUBTRACT': {
      const aCells = evaluateCSGToCells(shape.a, rasterPolicy);
      const bCells = evaluateCSGToCells(shape.b, rasterPolicy);
      const bSet = new Set(bCells.map((c) => `${c.x},${c.y}`));
      return aCells.filter((c) => !bSet.has(`${c.x},${c.y}`));
    }

    case 'CSG_INTERSECT': {
      const aCells = evaluateCSGToCells(shape.a, rasterPolicy);
      const bCells = evaluateCSGToCells(shape.b, rasterPolicy);
      const bSet = new Set(bCells.map((c) => `${c.x},${c.y}`));
      return aCells.filter((c) => bSet.has(`${c.x},${c.y}`));
    }

    case 'CSG_XOR': {
      const aCells = evaluateCSGToCells(shape.a, rasterPolicy);
      const bCells = evaluateCSGToCells(shape.b, rasterPolicy);
      const aMap = new Map(aCells.map((c) => [`${c.x},${c.y}`, c]));
      const bMap = new Map(bCells.map((c) => [`${c.x},${c.y}`, c]));
      const result = [];
      for (const [key, cell] of aMap) {
        if (!bMap.has(key)) result.push(cell);
      }
      for (const [key, cell] of bMap) {
        if (!aMap.has(key)) result.push(cell);
      }
      return result;
    }

    case 'OUTLINE': {
      const rawW = shape.width !== undefined ? toNum(shape.width) : 1;
      const w = Math.max(0, Math.floor(rawW));
      if (w === 0) return [];
      const baseCells = evaluateCSGToCells(shape.shape, rasterPolicy);
      const currentSet = new Set(baseCells.map((c) => `${c.x},${c.y}`));
      const cellLookup = new Map(baseCells.map((c) => [`${c.x},${c.y}`, c]));
      const outlineKeys = new Set();

      for (let step = 0; step < w; step++) {
        const stepBoundary = [];
        for (const key of currentSet) {
          const [cx, cy] = key.split(',').map(Number);
          const up = currentSet.has(`${cx},${cy - 1}`);
          const down = currentSet.has(`${cx},${cy + 1}`);
          const left = currentSet.has(`${cx - 1},${cy}`);
          const right = currentSet.has(`${cx + 1},${cy}`);
          if (!up || !down || !left || !right) {
            stepBoundary.push(key);
          }
        }
        if (stepBoundary.length === 0) break;
        for (const k of stepBoundary) {
          outlineKeys.add(k);
          currentSet.delete(k);
        }
      }
      return Array.from(outlineKeys).map((k) => cellLookup.get(k) || { x: Number(k.split(',')[0]), y: Number(k.split(',')[1]) });
    }

    case 'EROSION': {
      const rawP = shape.passes !== undefined ? toNum(shape.passes) : 1;
      const passes = Math.max(0, Math.floor(rawP));
      const baseCells = evaluateCSGToCells(shape.shape, rasterPolicy);
      if (passes === 0) return baseCells;
      const currentSet = new Set(baseCells.map((c) => `${c.x},${c.y}`));
      const cellLookup = new Map(baseCells.map((c) => [`${c.x},${c.y}`, c]));

      for (let step = 0; step < passes; step++) {
        const stepBoundary = [];
        for (const key of currentSet) {
          const [cx, cy] = key.split(',').map(Number);
          const up = currentSet.has(`${cx},${cy - 1}`);
          const down = currentSet.has(`${cx},${cy + 1}`);
          const left = currentSet.has(`${cx - 1},${cy}`);
          const right = currentSet.has(`${cx + 1},${cy}`);
          if (!up || !down || !left || !right) {
            stepBoundary.push(key);
          }
        }
        if (stepBoundary.length === 0) break;
        for (const k of stepBoundary) {
          currentSet.delete(k);
        }
      }
      return Array.from(currentSet).map((k) => cellLookup.get(k) || { x: Number(k.split(',')[0]), y: Number(k.split(',')[1]) });
    }

    default:
      return rasterizePrimitive(shape, rasterPolicy);
  }
}
