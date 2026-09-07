import { evaluateCSGToCells } from './scdl-v2.booleans.js';

export function createMaskFromCells(cells) {
  const set = new Set();
  if (Array.isArray(cells)) {
    for (const c of cells) {
      if (c && typeof c.x === 'number' && typeof c.y === 'number') {
        set.add(`${c.x},${c.y}`);
      }
    }
  }

  return Object.freeze({
    kind: 'MASK',
    has(x, y) {
      return set.has(`${x},${y}`);
    },
    get size() {
      return set.size;
    },
    getKeys() {
      return Object.freeze([...set]);
    },
  });
}

export function toMask(shape, optionsOrPolicy = {}) {
  const policy = typeof optionsOrPolicy === 'string' ? optionsOrPolicy : (optionsOrPolicy.rasterPolicy || 'CENTER');
  const cells = evaluateCSGToCells(shape, policy);
  return createMaskFromCells(cells);
}

export function maskUnion(m1, m2) {
  const set = new Set(m1.getKeys());
  for (const k of m2.getKeys()) {
    set.add(k);
  }
  const cells = [...set].map((k) => {
    const [x, y] = k.split(',').map(Number);
    return { x, y };
  });
  return createMaskFromCells(cells);
}

export function maskIntersect(m1, m2) {
  const cells = [];
  for (const k of m1.getKeys()) {
    const [x, y] = k.split(',').map(Number);
    if (m2.has(x, y)) {
      cells.push({ x, y });
    }
  }
  return createMaskFromCells(cells);
}

export function maskSubtract(m1, m2) {
  const cells = [];
  for (const k of m1.getKeys()) {
    const [x, y] = k.split(',').map(Number);
    if (!m2.has(x, y)) {
      cells.push({ x, y });
    }
  }
  return createMaskFromCells(cells);
}

export function maskInvert(m, bounds = { width: 32, height: 32, originX: 0, originY: 0 }) {
  const ox = bounds.originX || 0;
  const oy = bounds.originY || 0;
  const w = bounds.width;
  const h = bounds.height;
  const cells = [];
  for (let y = oy; y < oy + h; y++) {
    for (let x = ox; x < ox + w; x++) {
      if (!m.has(x, y)) {
        cells.push({ x, y });
      }
    }
  }
  return createMaskFromCells(cells);
}

export function clipCellsWithMask(cells, mask) {
  if (!mask || typeof mask.has !== 'function') return cells;
  return cells.filter((c) => mask.has(c.x, c.y));
}
