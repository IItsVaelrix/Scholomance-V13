/**
 * raster-math.js
 * Universal rasterization primitives for drawing vector-like shapes onto the PixelBrain grid.
 */

export function rasterLine(x0, y0, x1, y1, emit) {
  let x = Math.round(x0);
  let y = Math.round(y0);
  const endX = Math.round(x1);
  const endY = Math.round(y1);
  const dx = Math.abs(endX - x);
  const dy = -Math.abs(endY - y);
  const sx = x < endX ? 1 : -1;
  const sy = y < endY ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    emit(x, y);
    if (x === endX && y === endY) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
}

export function rasterArc(cx, cy, r, emit, startAngle = 0, endAngle = Math.PI * 2) {
  const steps = Math.max(8, Math.ceil(r * Math.PI * 2 * 2)); 
  let prevX = null;
  let prevY = null;
  for (let i = 0; i <= steps; i++) {
    const angle = startAngle + (endAngle - startAngle) * (i / steps);
    const x = Math.round(cx) + Math.round(Math.cos(angle) * r);
    const y = Math.round(cy) + Math.round(Math.sin(angle) * r);
    if (prevX !== null) {
      rasterLine(prevX, prevY, x, y, emit);
    } else {
      emit(x, y);
    }
    prevX = x;
    prevY = y;
  }
}

export function rasterCircle(cx, cy, r, emit) {
  rasterArc(cx, cy, r, emit, 0, Math.PI * 2);
}

export function rasterPolygon(points, emit) {
  for (let i = 0; i < points.length; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    rasterLine(p1[0], p1[1], p2[0], p2[1], emit);
  }
}

export function rasterPath(points, emit) {
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    rasterLine(p1[0], p1[1], p2[0], p2[1], emit);
  }
}

/**
 * Precise integer midpoint circle algorithm (Bresenham-style) for perfect 8-way symmetry.
 * Critical for concentric construction rings without 1px drift.
 */
export function rasterCircleMidpoint(cx, cy, radius, emit) {
  let x = 0;
  let y = Math.round(radius);
  let d = 3 - 2 * y;

  const plot = (px, py) => {
    emit(Math.round(cx) + px, Math.round(cy) + py);
    emit(Math.round(cx) - px, Math.round(cy) + py);
    emit(Math.round(cx) + px, Math.round(cy) - py);
    emit(Math.round(cx) - px, Math.round(cy) - py);
    emit(Math.round(cx) + py, Math.round(cy) + px);
    emit(Math.round(cx) - py, Math.round(cy) + px);
    emit(Math.round(cx) + py, Math.round(cy) - px);
    emit(Math.round(cx) - py, Math.round(cy) - px);
  };

  plot(x, y);

  while (y >= x) {
    x++;
    if (d > 0) {
      y--;
      d = d + 4 * (x - y) + 10;
    } else {
      d = d + 4 * x + 6;
    }
    plot(x, y);
  }
}

/**
 * Draw multiple concentric rings using the precise midpoint method.
 * Returns array of emitted points for further tagging.
 */
export function rasterConcentricRings(cx, cy, radii, emit) {
  const points = [];
  const wrappedEmit = (x, y) => {
    points.push({ x: Math.round(x), y: Math.round(y) });
    emit(x, y);
  };
  for (const r of (radii || [])) {
    const rr = Math.max(1, Math.round(r));
    rasterCircleMidpoint(cx, cy, rr, wrappedEmit);
  }
  return points;
}

/**
 * Draw radial spokes from center to a given radius (or per-ring).
 * count: number of spokes (even for symmetry).
 * offset: starting angle in degrees.
 */
export function rasterRadials(cx, cy, count, maxRadius, emit, offsetDeg = 0) {
  if (!count || count < 1) return [];
  const points = [];
  const wrapped = (x, y) => {
    points.push({ x: Math.round(x), y: Math.round(y) });
    emit(x, y);
  };
  const step = (Math.PI * 2) / count;
  const off = (offsetDeg * Math.PI) / 180;
  for (let i = 0; i < count; i++) {
    const a = off + i * step;
    const ex = cx + Math.cos(a) * maxRadius;
    const ey = cy + Math.sin(a) * maxRadius;
    rasterLine(cx, cy, ex, ey, wrapped);
  }
  return points;
}

/**
 * Draw cardinal + optional diagonal axes through center.
 */
export function rasterAxes(cx, cy, maxRadius, emit, includeDiagonals = true) {
  const axes = [
    [cx - maxRadius, cy, cx + maxRadius, cy], // horizontal
    [cx, cy - maxRadius, cx, cy + maxRadius], // vertical
  ];
  if (includeDiagonals) {
    const diag = maxRadius * 0.7071;
    axes.push(
      [cx - diag, cy - diag, cx + diag, cy + diag],
      [cx - diag, cy + diag, cx + diag, cy - diag]
    );
  }
  const points = [];
  const wrapped = (x, y) => { points.push({x:Math.round(x),y:Math.round(y)}); emit(x,y); };
  for (const [x0,y0,x1,y1] of axes) {
    rasterLine(x0, y0, x1, y1, wrapped);
  }
  return points;
}

/**
 * High-level: raster all construction guides for a spec.
 * Emits via provided function. Returns collected guide points.
 * spec: { center:{x,y}, rings?: [{radius}], radials?: {count, offsetDegrees?}, axes?: boolean, bounds? }
 */
export function rasterConstructionGuides(spec, emit) {
  const cx = Math.round(spec?.center?.x ?? 0);
  const cy = Math.round(spec?.center?.y ?? 0);
  const allPoints = [];

  const wEmit = (x, y) => {
    const p = { x: Math.round(x), y: Math.round(y) };
    allPoints.push(p);
    emit(x, y);
  };

  // Center marker (small cross)
  rasterLine(cx - 2, cy, cx + 2, cy, wEmit);
  rasterLine(cx, cy - 2, cx, cy + 2, wEmit);

  // Rings
  if (Array.isArray(spec?.rings)) {
    const radii = spec.rings.map(r => (typeof r === 'number' ? r : r.radius || r.r)).filter(Boolean);
    rasterConcentricRings(cx, cy, radii, wEmit);
  } else if (Array.isArray(spec?.radii)) {
    rasterConcentricRings(cx, cy, spec.radii, wEmit);
  }

  // Radials / spokes
  const radialCfg = spec?.radials || spec?.spokes;
  if (radialCfg && radialCfg.count > 0) {
    const maxR = Math.max(...(spec.rings || []).map(r => r.radius || r.r || 0), spec.bounds?.radius || 24);
    rasterRadials(cx, cy, radialCfg.count, maxR, wEmit, radialCfg.offsetDegrees || radialCfg.offset || 0);
  }

  // Axes
  if (spec?.axes !== false) {
    const maxR = Math.max(16, ...(spec.rings || []).map(r => (r.radius || r.r || 0)));
    rasterAxes(cx, cy, maxR, wEmit, spec.axes === true || spec.axes === undefined);
  }

  // Optional outer bounds ellipse (simple for now)
  if (spec?.bounds) {
    const bw = spec.bounds.width || spec.bounds.radius * 2 || 0;
    const bh = spec.bounds.height || spec.bounds.radius * 2 || 0;
    if (bw && bh) {
      // Approximate with circle if near square, else lines for box
      const br = Math.round(Math.max(bw, bh) / 2);
      rasterCircleMidpoint(cx, cy, br, wEmit);
    }
  }

  return allPoints;
}

/**
 * Rasterize a precise ellipse perimeter using midpoint algorithm.
 */
export function rasterEllipse(cx, cy, rx, ry, emit) {
  let x = 0;
  let y = ry;
  let dx = 2 * ry * ry * x;
  let dy = 2 * rx * rx * y;
  let d1 = (ry * ry) - (rx * rx * ry) + (0.25 * rx * rx);

  const plot = (px, py) => {
    emit(Math.round(cx) + px, Math.round(cy) + py);
    emit(Math.round(cx) - px, Math.round(cy) + py);
    emit(Math.round(cx) + px, Math.round(cy) - py);
    emit(Math.round(cx) - px, Math.round(cy) - py);
  };

  while (dx < dy) {
    plot(x, y);
    if (d1 < 0) {
      x++;
      dx = dx + (2 * ry * ry);
      d1 = d1 + dx + (ry * ry);
    } else {
      x++;
      y--;
      dx = dx + (2 * ry * ry);
      dy = dy - (2 * rx * rx);
      d1 = d1 + dx - dy + (ry * ry);
    }
  }

  let d2 = ((ry * ry) * ((x + 0.5) * (x + 0.5))) + ((rx * rx) * ((y - 1) * (y - 1))) - (rx * rx * ry * ry);
  while (y >= 0) {
    plot(x, y);
    if (d2 > 0) {
      y--;
      dy = dy - (2 * rx * rx);
      d2 = d2 + (rx * rx) - dy;
    } else {
      y--;
      x++;
      dx = dx + (2 * ry * ry);
      dy = dy - (2 * rx * rx);
      d2 = d2 + dx - dy + (rx * rx);
    }
  }
}

/**
 * Rasterize a filled ellipse directly.
 */
export function rasterEllipseFilled(cx, cy, rx, ry, emit) {
  const rxSq = rx * rx;
  const rySq = ry * ry;
  for (let y = -ry; y <= ry; y++) {
    const dySq = y * y;
    const xDist = Math.round(rx * Math.sqrt(1 - dySq / rySq));
    for (let x = -xDist; x <= xDist; x++) {
      emit(Math.round(cx) + x, Math.round(cy) + y);
    }
  }
}

/**
 * Rasterize an accurate cubic bezier curve with dynamic subdivision.
 */
export function rasterBezierCurve(x0, y0, x1, y1, x2, y2, x3, y3, emit) {
  const dist = Math.hypot(x1 - x0, y1 - y0) + Math.hypot(x2 - x1, y2 - y1) + Math.hypot(x3 - x2, y3 - y2);
  const steps = Math.max(16, Math.ceil(dist * 2));
  let prevX = null;
  let prevY = null;
  
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const invT = 1 - t;
    const px = invT * invT * invT * x0 + 3 * invT * invT * t * x1 + 3 * invT * t * t * x2 + t * t * t * x3;
    const py = invT * invT * invT * y0 + 3 * invT * invT * t * y1 + 3 * invT * t * t * y2 + t * t * t * y3;
    const currX = Math.round(px);
    const currY = Math.round(py);
    if (prevX !== null) {
      rasterLine(prevX, prevY, currX, currY, emit);
    } else {
      emit(currX, currY);
    }
    prevX = currX;
    prevY = currY;
  }
}
