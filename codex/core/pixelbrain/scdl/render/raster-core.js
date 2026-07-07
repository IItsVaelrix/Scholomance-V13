/**
 * SCDL Raster Core — unclipped rasterizers for scene-graph (defs) and legacy canvas.
 *
 * Extracted from expand-vector.pass.js so that def-local geometry can be
 * rasterized without canvas clipping (negative coordinates are valid inside defs).
 *
 * All algorithms are deterministic and line-for-line identical to the original
 * except for:
 *  - signature (op, accept, ops) instead of (op, W, H, ops)
 *  - `accept(x, y)` predicate replaces `inBounds(x, y, W, H)`
 *  - polygon scan uses its own AABB (floor(minX)..ceil(maxX)) so negative coords work
 *
 * When accept = makeCanvasAccept(w, h) the emitted cell set + order is identical.
 */

// Wire engine capabilities
import { rasterLine } from '../../raster-math.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function pushCell(ops, x, y, color, loc, sourceOp = null) {
  const cell = { op: 'cell', x, y, color, _fromVector: true, loc };
  if (sourceOp) {
    // Propagate semantic info from SemQuant for downstream cells
    if (sourceOp.partId) cell.partId = sourceOp.partId;
    if (sourceOp.id) cell.sourceOpId = sourceOp.id;
    if (sourceOp.material) cell.material = sourceOp.material;
    if (Array.isArray(sourceOp.annotations) && sourceOp.annotations.length) {
      // Keep light — only canonical role if present
      const roleAnn = sourceOp.annotations.find(a => a.domain === 'role');
      if (roleAnn) cell.role = roleAnn.canonicalType;
    }
    // Also carry any explicit role on the op
    if (sourceOp.role) cell.role = sourceOp.role;
  }
  ops.push(cell);
}

// SVG-like path sampler. Handles M, L, H, V, Q, T, C, S, A, Z.
// Curves are flattened into deterministic 10-step polylines.
function samplePath(d) {
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+/g) || [];
  let i = 0;
  let cx = 0, cy = 0;
  let startX = 0, startY = 0;
  let lastQ = null;
  let lastC = null;
  const out = [];
  const isCommand = token => /^[a-zA-Z]$/.test(token || '');
  const nextNum = () => parseFloat(tokens[i++]);

  while (i < tokens.length) {
    const cmd = tokens[i++];
    const isRel = cmd === cmd.toLowerCase() && cmd !== 'z';
    const C = cmd.toUpperCase();
    if (C === 'M') {
      const x = parseFloat(tokens[i++]);
      const y = parseFloat(tokens[i++]);
      cx = isRel ? cx + x : x;
      cy = isRel ? cy + y : y;
      startX = cx;
      startY = cy;
      out.push([cx, cy]);
      lastQ = null; lastC = null;
    } else if (C === 'L') {
      const x = parseFloat(tokens[i++]);
      const y = parseFloat(tokens[i++]);
      cx = isRel ? cx + x : x;
      cy = isRel ? cy + y : y;
      out.push([cx, cy]);
      lastQ = null; lastC = null;
    } else if (C === 'H') {
      const x = parseFloat(tokens[i++]);
      cx = isRel ? cx + x : x;
      out.push([cx, cy]);
      lastQ = null; lastC = null;
    } else if (C === 'V') {
      const y = parseFloat(tokens[i++]);
      cy = isRel ? cy + y : y;
      out.push([cx, cy]);
      lastQ = null; lastC = null;
    } else if (C === 'Q') {
      const x1 = nextNum();
      const y1 = nextNum();
      const x = nextNum();
      const y = nextNum();
      const ax = isRel ? cx + x1 : x1;
      const ay = isRel ? cy + y1 : y1;
      const ex = isRel ? cx + x : x;
      const ey = isRel ? cy + y : y;
      const lastX = cx, lastY = cy;
      for (let t = 0.1; t <= 1.0; t += 0.1) {
        const u = 1 - t;
        const px = u*u*lastX + 2*u*t*ax + t*t*ex;
        const py = u*u*lastY + 2*u*t*ay + t*t*ey;
        out.push([px, py]);
      }
      cx = ex; cy = ey;
      lastQ = [ax, ay]; lastC = null;
    } else if (C === 'T') {
      const x = nextNum();
      const y = nextNum();
      const ax = lastQ ? (2 * cx - lastQ[0]) : cx;
      const ay = lastQ ? (2 * cy - lastQ[1]) : cy;
      const ex = isRel ? cx + x : x;
      const ey = isRel ? cy + y : y;
      const lastX = cx, lastY = cy;
      for (let t = 0.1; t <= 1.0; t += 0.1) {
        const u = 1 - t;
        out.push([
          u*u*lastX + 2*u*t*ax + t*t*ex,
          u*u*lastY + 2*u*t*ay + t*t*ey,
        ]);
      }
      cx = ex; cy = ey;
      lastQ = [ax, ay]; lastC = null;
    } else if (C === 'C') {
      const x1 = nextNum();
      const y1 = nextNum();
      const x2 = nextNum();
      const y2 = nextNum();
      const x = nextNum();
      const y = nextNum();
      const c1x = isRel ? cx + x1 : x1;
      const c1y = isRel ? cy + y1 : y1;
      const c2x = isRel ? cx + x2 : x2;
      const c2y = isRel ? cy + y2 : y2;
      const ex = isRel ? cx + x : x;
      const ey = isRel ? cy + y : y;
      const sx = cx, sy = cy;
      for (let t = 0.1; t <= 1.0; t += 0.1) {
        const u = 1 - t;
        out.push([
          u*u*u*sx + 3*u*u*t*c1x + 3*u*u*t*c2x + t*t*t*ex,
          u*u*u*sy + 3*u*u*t*c1y + 3*u*t*t*c2y + t*t*t*ey,
        ]);
      }
      cx = ex; cy = ey;
      lastC = [c2x, c2y]; lastQ = null;
    } else if (C === 'S') {
      const x2 = nextNum();
      const y2 = nextNum();
      const x = nextNum();
      const y = nextNum();
      const c1x = lastC ? (2 * cx - lastC[0]) : cx;
      const c1y = lastC ? (2 * cy - lastC[1]) : cy;
      const c2x = isRel ? cx + x2 : x2;
      const c2y = isRel ? cy + y2 : y2;
      const ex = isRel ? cx + x : x;
      const ey = isRel ? cy + y : y;
      const sx = cx, sy = cy;
      for (let t = 0.1; t <= 1.0; t += 0.1) {
        const u = 1 - t;
        out.push([
          u*u*u*sx + 3*u*u*t*c1x + 3*u*t*t*c2x + t*t*t*ex,
          u*u*u*sy + 3*u*u*t*c1y + 3*u*t*t*c2y + t*t*t*ey,
        ]);
      }
      cx = ex; cy = ey;
      lastC = [c2x, c2y]; lastQ = null;
    } else if (C === 'A') {
      i += 5; // rx ry rotation large-arc sweep
      if (!isCommand(tokens[i]) && !isCommand(tokens[i + 1])) {
        const x = nextNum();
        const y = nextNum();
        cx = isRel ? cx + x : x;
        cy = isRel ? cy + y : y;
        out.push([cx, cy]);
      }
      lastQ = null; lastC = null;
    } else if (C === 'Z') {
      cx = startX; cy = startY;
      out.push([cx, cy]);
      lastQ = null; lastC = null;
    } else {
      // unsupported: skip remaining args
    }
  }
  return out;
}

function pointInPolygon(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (((yi > y) !== (yj > y)) &&
        (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-9) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

export const acceptAll = () => true;

export function makeCanvasAccept(w, h) {
  return (x, y) => x >= 0 && x < w && y >= 0 && y < h;
}

// Legacy compatibility for lower-booleans.js (canvas form)
export function inBounds(x, y, w, h) {
  return x >= 0 && x < w && y >= 0 && y < h;
}

// ─── Rasterizers (accept predicate form) ─────────────────────────────────────

export function rasterizeCircle(op, accept, ops) {
  const { cx, cy, radius, color, loc } = op;
  const r2 = radius * radius;
  for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++) {
    for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
      const dx = x - cx, dy = y - cy;
      if (dx*dx + dy*dy <= r2 && accept(x, y)) {
        pushCell(ops, x, y, color, loc, op);
      }
    }
  }
}

export function rasterizeRing(op, accept, ops) {
  const { cx, cy, radius, width, color, loc } = op;
  const inner = Math.max(0, radius - (width / 2));
  const outer = radius + (width / 2);
  const inner2 = inner * inner;
  const outer2 = outer * outer;
  for (let y = Math.floor(cy - outer); y <= Math.ceil(cy + outer); y++) {
    for (let x = Math.floor(cx - outer); x <= Math.ceil(cx + outer); x++) {
      const dx = x - cx, dy = y - cy;
      const d2 = dx*dx + dy*dy;
      if (d2 >= inner2 && d2 <= outer2 && accept(x, y)) {
        pushCell(ops, x, y, color, loc, op);
      }
    }
  }
}

export function rasterizeRect(op, accept, ops) {
  const { x, y, w, h, color, loc } = op;
  for (let yy = Math.floor(y); yy < Math.ceil(y + h); yy++) {
    for (let xx = Math.floor(x); xx < Math.ceil(x + w); xx++) {
      if (accept(xx, yy)) {
        pushCell(ops, xx, yy, color, loc, op);
      }
    }
  }
}

export function rasterizePolygon(op, accept, ops) {
  const { points, color, loc } = op;
  if (!Array.isArray(points) || points.length < 3) return;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [px, py] of points) {
    if (px < minX) minX = px;
    if (px > maxX) maxX = px;
    if (py < minY) minY = py;
    if (py > maxY) maxY = py;
  }
  for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
    for (let x = Math.floor(minX); x <= Math.ceil(maxX); x++) {
      if (pointInPolygon(x + 0.5, y + 0.5, points) && accept(x, y)) {
        pushCell(ops, x, y, color, loc, op);
      }
    }
  }
}

export function rasterizePath(op, accept, ops) {
  const { d, color, loc } = op;
  const pts = samplePath(d);
  if (pts.length < 3) return;
  // Sample the path: walk segments at integer-t intervals to catch all cells
  const samples = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      samples.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]);
    }
  }
  // Close the polygon
  samples.push(samples[0]);
  // Use polygon rasterizer on the sampled polyline
  const polyOp = { points: samples, color, loc, partId: op.partId, id: op.id, material: op.material, annotations: op.annotations, role: op.role };
  rasterizePolygon(polyOp, accept, ops);
}

// Tier thresholds for the sphere op
export const SPHERE_THRESHOLDS = Object.freeze([0.999, 0.70, 0.10, -0.40]);

export function rasterizeSphere(op, accept, ops) {
  const { cx, cy, radius, lx, ly, tierColors, loc } = op;
  if (!Array.isArray(tierColors) || tierColors.length < 1) return;
  const r2 = radius * radius;
  const lLen = Math.hypot(lx, ly) || 1;
  const lNormX = lx / lLen;
  const lNormY = ly / lLen;
  const last = tierColors.length - 1;
  for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++) {
    for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
      const dx = x - cx, dy = y - cy;
      const d2 = dx*dx + dy*dy;
      if (d2 > r2) continue;
      if (!accept(x, y)) continue;
      const d  = Math.sqrt(d2);
      let tierIdx = 4;
      if (d > 0) {
        const nx = dx / d;
        const ny = dy / d;
        const cosTheta = nx * lNormX + ny * lNormY;
        if      (cosTheta >= SPHERE_THRESHOLDS[0]) tierIdx = 0;
        else if (cosTheta >= SPHERE_THRESHOLDS[1]) tierIdx = 1;
        else if (cosTheta >= SPHERE_THRESHOLDS[2]) tierIdx = 2;
        else if (cosTheta >= SPHERE_THRESHOLDS[3]) tierIdx = 3;
      }
      const color = tierColors[Math.min(tierIdx, last)];
      pushCell(ops, x, y, color, loc, op);
    }
  }
}

export function rasterizeEllipse(op, accept, ops) {
  const { cx, cy, rx, ry, color, loc } = op;
  const steps = Math.max(12, Math.ceil((rx + ry) * Math.PI * 2));
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const x = cx + Math.cos(t) * rx;
    const y = cy + Math.sin(t) * ry;
    const ix = Math.round(x), iy = Math.round(y);
    if (accept(ix, iy)) pushCell(ops, ix, iy, color, loc, op);
  }
}

export function rasterizeLine(op, accept, ops) {
  const { x0, y0, x1, y1, color, loc } = op;
  rasterLine(x0, y0, x1, y1, (x, y) => {
    if (accept(x, y)) pushCell(ops, x, y, color, loc, op);
  });
}
