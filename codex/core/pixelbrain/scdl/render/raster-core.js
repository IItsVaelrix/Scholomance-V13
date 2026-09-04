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

    // Phase 2: Stamp analytic per-cell vector identity at raster time.
    // signedDistance, t, tangent, normal, curvature — computed from the op's
    // own geometry, not inferred later. This is the truth, not a nearest-neighbour guess.
    const vi = computeVectorIdentity(sourceOp, x, y);
    if (vi) {
      // The SDF is data, not a verdict. Preserve it exactly as the analytic
      // geometry computed it. For a stroked op (rim/ring) the rasterized cells
      // legitimately straddle the centerline — the outer half reads positive,
      // the inner half negative — and that sign structure IS the silhouette the
      // renderer antialiases. Clamping here would overwrite the measurement and
      // hard-edge exactly the boundary the vixel exists to keep smooth.
      // Coverage decisions belong to the renderer (fill vs band), not the compiler.
      cell.signedDistance = vi.signedDistance;
      cell.t = vi.t;
      cell.tangent = vi.tangent;
      cell.normal = vi.normal;
      cell.curvature = vi.curvature;
      if (vi.arcLength !== undefined) cell.arcLength = vi.arcLength;
      // Stroke ops carry their half-width so the renderer can apply band coverage
      // (edge at |sd| = halfWidth) instead of half-space coverage (edge at sd = 0).
      // Exception: a filled circle's interior cells are FILL, not band — marking
      // them interiorFill tells the renderer to use half-space coverage so a disc
      // renders solid instead of hollow. The half-width is still recorded; the
      // renderer decides which coverage model the mark selects.
      if (vi.halfWidth !== undefined) cell.strokeHalfWidth = vi.halfWidth;
      if (vi.interiorFill === true) cell.interiorFill = true;
    }
  }
  ops.push(cell);
}

/**
 * Map one SCDL op to an evaluateSDF-compatible primitive, or null if this op
 * type has no lossless mapping today. See docs/scholomance-encyclopedia/
 * PDR-archive/2026-09-03-scdl-sdf-descriptors-v1-pdr.md §2 for why each
 * excluded type is excluded (not merely "not yet done").
 */
export function opToSDFPrimitive(op) {
  const type = op.op || op.type;

  if (type === 'circle' || type === 'ellipse') {
    const rx = op.rx ?? op.radius ?? 1;
    const ry = op.ry ?? op.radius ?? 1;
    if (rx !== ry) return null; // eccentric ellipse — no lossless evaluateSDF mapping
    return { type: 'circle', params: { center: { x: op.cx, y: op.cy }, radius: rx } };
  }

  if (type === 'rect') {
    return {
      type: 'box',
      params: {
        center: { x: op.x + op.w / 2, y: op.y + op.h / 2 },
        size: { x: op.w, y: op.h },
      },
    };
  }

  return null; // ring, polygon, sphere, path, line — all deferred, PDR §2
}

/**
 * Closed-form area centroid and principal (long) axis of a simple polygon.
 *
 * Why this exists: a per-pixel "which edge is nearest" query (as used for
 * signedDistance/normal below) is a nearest-point-on-boundary map, and that
 * map is mathematically discontinuous on the shape's medial axis — wherever
 * two non-adjacent edges are equidistant, the attributed edge (and anything
 * derived from it: arc-length position, tangent) jumps. That is not an
 * implementation bug to patch case-by-case; it is a property of nearest-point
 * maps on any shape wider than a thin stroke. Measured on lightning-sword's
 * blade polygon: `t` jumped from 0.883 to 0.143 (a ~31-unit swing in
 * `t * arcLength`) between two adjacent pixel columns, at the same column on
 * every row — a hard seam the texture pass reads as a tear.
 *
 * The fix is to stop deriving the texture's flow direction from a per-pixel
 * nearest-feature search at all. A polygon's area-weighted second moments
 * (the same closed-form formulas used for rigid-body mass properties — see
 * Eberly, "Polygon Mass Properties", or Box2D's `ComputeMass`) give a single
 * principal axis for the *whole* shape: the direction of greatest spatial
 * extent, computed once from the vertex list, not sampled per pixel. A
 * constant vector cannot be discontinuous. `t` becomes a linear projection
 * onto that axis, so it varies smoothly — provably, not just observedly —
 * across the entire interior, independent of which pixel is being asked.
 *
 * signedDistance and normal (the shape's boundary/outward-facing-direction
 * quantities used by geometry coverage and lighting) are untouched by this:
 * they still come from the nearest-edge search below, which is exact for
 * signedDistance (it is genuinely a distance-to-nearest-feature value, and
 * that value — unlike the identity of the feature — is continuous) and is
 * the intentional source of each polygon's faux-bevel lighting response.
 */
function polygonPrincipalAxis(pts) {
  const n = pts.length;
  let cross2 = 0, cx = 0, cy = 0, sxx = 0, syy = 0, sxy = 0;
  for (let i = 0; i < n; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % n];
    const cross = x0 * y1 - x1 * y0;
    cross2 += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
    sxx += (x0 * x0 + x0 * x1 + x1 * x1) * cross;
    syy += (y0 * y0 + y0 * y1 + y1 * y1) * cross;
    sxy += (x0 * y1 + 2 * x0 * y0 + 2 * x1 * y1 + x1 * y0) * cross;
  }
  const area = cross2 / 2;
  if (Math.abs(area) < 1e-9) {
    // Degenerate (zero-area / collinear) polygon: no well-defined interior,
    // so fall back to the direction between its first two vertices rather
    // than divide by zero.
    const [x0, y0] = pts[0];
    const [x1, y1] = pts[1] || pts[0];
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    return { centroid: [x0, y0], axis: [dx / len, dy / len] };
  }

  const centroidX = cx / (6 * area);
  const centroidY = cy / (6 * area);

  // Statistical covariance of the filled region (area-weighted variance in
  // x and y, and their covariance), from the second moments above.
  const covXX = sxx / (12 * area) - centroidX * centroidX;
  const covYY = syy / (12 * area) - centroidY * centroidY;
  const covXY = sxy / (24 * area) - centroidX * centroidY;

  // Principal axis = eigenvector of [[covXX, covXY], [covXY, covYY]] for the
  // larger eigenvalue: the direction of greatest extent (ordinary 2D PCA).
  const trace = covXX + covYY;
  const diff = covXX - covYY;
  const disc = Math.sqrt(diff * diff + 4 * covXY * covXY);
  const lambdaMax = (trace + disc) / 2;

  let ax, ay;
  if (Math.abs(covXY) > 1e-9) {
    ax = lambdaMax - covYY;
    ay = covXY;
  } else if (covXX >= covYY) {
    ax = 1; ay = 0;
  } else {
    ax = 0; ay = 1;
  }
  const len = Math.hypot(ax, ay) || 1;
  return { centroid: [centroidX, centroidY], axis: [ax / len, ay / len] };
}

/**
 * Compute analytic vector identity for a cell at (px, py) relative to its source op.
 * Returns { signedDistance, t, tangent, normal, curvature } or null if the op type
 * is not analytically tractable.
 *
 * signedDistance: negative inside, positive outside, zero on boundary
 * t: for circle/ellipse, true arc-length parameter (0..1) along the perimeter.
 *    For rect/polygon, signed distance (canvas units) along the shape's own
 *    principal axis (see polygonPrincipalAxis) — continuous across the whole
 *    interior, not a per-pixel nearest-edge arc-length position.
 * tangent: unit tangent vector [tx, ty]. For circle/ellipse, at the nearest
 *    boundary point. For rect/polygon, the shape's principal axis — constant
 *    across the whole shape, so texture flow direction cannot tear.
 * normal: unit outward normal [nx, ny], from the nearest boundary point
 * curvature: 1/R at the nearest boundary point for circle/ellipse; 0 for
 *    rect/polygon (a straight edge has no curvature — the old near-edge
 *    threshold heuristic was itself a discontinuity source, not a feature)
 */
export function computeVectorIdentity(op, px, py) {
  const type = op.op || op.type;

  if (type === 'circle' || type === 'ellipse') {
    // opToSDFPrimitive is the single source of truth for the true-circle case
    // (rx === ry). It returns null for eccentric ellipses, which have no
    // evaluateSDF descriptor but still need rendering here, so those fall back
    // to reading op.rx/op.ry directly rather than sharing the extraction.
    const primitive = opToSDFPrimitive(op);
    const cx = primitive ? primitive.params.center.x : op.cx;
    const cy = primitive ? primitive.params.center.y : op.cy;
    const rx = primitive ? primitive.params.radius : (op.rx ?? op.radius ?? 1);
    const ry = primitive ? primitive.params.radius : (op.ry ?? op.radius ?? 1);

    const dx = (px - cx) / rx;
    const dy = (py - cy) / ry;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1e-9;

    // Signed distance (negative inside)
    const signedDistance = (dist - 1) * Math.min(rx, ry);

    // Parametric angle → t
    const angle = Math.atan2(dy, dx);
    const t = (angle + Math.PI) / (2 * Math.PI);

    // Tangent (counterclockwise) and outward normal
    const tangent = [-Math.sin(angle), Math.cos(angle)];
    const normal = [Math.cos(angle), Math.sin(angle)];

    // Curvature of ellipse: κ = (rx·ry) / (rx²sin²θ + ry²cos²θ)^(3/2)
    const sinA = Math.sin(angle);
    const cosA = Math.cos(angle);
    const denom = Math.pow(rx * rx * sinA * sinA + ry * ry * cosA * cosA, 1.5);
    const curvature = denom > 0 ? (rx * ry) / denom : 0;

    // Arc length: Ramanujan's approximation for ellipse perimeter
    const arcLength = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)));

    // The ellipse rasterizer is a STROKE: rasterizeEllipse walks the perimeter in
    // angular steps and plots round(boundaryPoint) — it does NOT fill the interior.
    // So `signedDistance` above is a CENTERLINE distance (to the ellipse curve), and
    // the plotted cells legitimately straddle it (outer half positive, inner half
    // negative). The renderer must apply band coverage (edge at |sd| = halfWidth),
    // not half-space coverage. The intrinsic half-thickness is the rasterizer's
    // rounding radius: a plotted cell center sits within half a cell of the curve.
    // An authored op.width overrides this for deliberately thicker strokes.
    const halfWidth = op.width != null ? op.width / 2 : 0.5;

    // A true circle is the exception: rasterizeCircle FILLS (every cell inside
    // the radius is emitted), so cells strictly inside the stroke band are
    // interior fill, not part of any band. Without this mark the renderer's
    // band coverage hollows a filled disc into a ring — measured on
    // lightning-sword's pommel, hollow at every scale including 1x. The mark
    // is a fact about the op's rasterization; the coverage decision it informs
    // still belongs to the renderer. Absent (not false) when not interior, so
    // the return shape stays exactly what it was for every non-interior cell.
    const interiorFill = type === 'circle' && signedDistance < -halfWidth;

    return {
      signedDistance, t, tangent, normal, curvature, arcLength, halfWidth,
      ...(interiorFill ? { interiorFill: true } : {}),
    };
  }

  if (type === 'rect') {
    const { x, y, w, h } = op;
    const primitive = opToSDFPrimitive(op); // always non-null for rect — same values, one source
    const rcx = primitive.params.center.x;
    const rcy = primitive.params.center.y;

    // SDF for axis-aligned rect
    const ddx = Math.abs(px - rcx) - w / 2;
    const ddy = Math.abs(py - rcy) - h / 2;
    const outside = Math.sqrt(Math.max(ddx, 0) ** 2 + Math.max(ddy, 0) ** 2);
    const inside = Math.min(Math.max(ddx, ddy), 0);
    const signedDistance = outside + inside;

    // Normal: direction of steepest SDF ascent
    let nx = 0, ny = 0;
    if (ddx > ddy) nx = Math.sign(px - rcx) || 1;
    else ny = Math.sign(py - rcy) || 1;
    const len = Math.sqrt(nx * nx + ny * ny) || 1;
    nx /= len; ny /= len;
    const normal = [nx, ny];

    // Texture flow direction: the shape's own principal axis (see
    // polygonPrincipalAxis above), not a per-pixel nearest-edge parametric
    // position — that formulation jumps at the diagonals from each corner,
    // wherever "nearest edge" flips between two adjacent sides.
    const corners = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
    const { centroid: [flowCx, flowCy], axis: [fax, fay] } = polygonPrincipalAxis(corners);
    const flowTangent = [fax, fay];
    const t = (px - flowCx) * fax + (py - flowCy) * fay;
    const curvature = 0; // a straight edge has no curvature; see header note

    return { signedDistance, t, tangent: flowTangent, normal, curvature, arcLength: 1 };
  }

  if (type === 'polygon') {
    const pts = op.points || [];
    if (pts.length < 3) return null;

    // Point-in-polygon (ray casting)
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i];
      const [xj, yj] = pts[j];
      if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / ((yj - yi) || 1e-9) + xi)) {
        inside = !inside;
      }
    }

    // Find nearest edge — this stays a per-pixel search because
    // signedDistance genuinely is "distance to nearest boundary point," and
    // that value (unlike the identity of which edge owns it) is continuous.
    // normal inherits the nearest edge's orientation deliberately: this is
    // the source of each polygon's faux-bevel lighting response and is left
    // untouched. See the header note above polygonPrincipalAxis for why `t`
    // and `tangent` — the texture-flow quantities — do NOT come from here.
    let minDist = Infinity;
    let bestNormal = [0, 1];

    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length;
      const [xi, yi] = pts[i];
      const [xj, yj] = pts[j];
      const ex = xj - xi, ey = yj - yi;
      const len = Math.sqrt(ex * ex + ey * ey);
      if (len === 0) continue;

      const tEdge = Math.max(0, Math.min(1, ((px - xi) * ex + (py - yi) * ey) / (len * len)));
      const closestX = xi + tEdge * ex;
      const closestY = yi + tEdge * ey;
      const dist = Math.sqrt((px - closestX) ** 2 + (py - closestY) ** 2);

      if (dist < minDist) {
        minDist = dist;
        let nx = -ey / len;
        let ny = ex / len;

        // Polygon centroid for outward normal orientation
        let polyCx = 0, polyCy = 0;
        for (let k = 0; k < pts.length; k++) { polyCx += pts[k][0]; polyCy += pts[k][1]; }
        polyCx /= pts.length;
        polyCy /= pts.length;

        if (nx * (px - polyCx) + ny * (py - polyCy) < 0) {
          nx = -nx;
          ny = -ny;
        }
        bestNormal = [nx, ny];
      }
    }

    const signedDistance = inside ? -minDist : minDist;

    // Texture flow direction: the polygon's own principal axis, not the
    // per-pixel nearest-edge search above. See polygonPrincipalAxis's header
    // note — this is what removes the tearing seam.
    const { centroid: [flowCx, flowCy], axis: [fax, fay] } = polygonPrincipalAxis(pts);
    const flowTangent = [fax, fay];
    const t = (px - flowCx) * fax + (py - flowCy) * fay;
    const curvature = 0; // a straight edge has no curvature; see header note

    return { signedDistance, t, tangent: flowTangent, normal: bestNormal, curvature, arcLength: 1 };
  }

  if (type === 'ring') {
    const cx = op.cx;
    const cy = op.cy;
    const radius = op.radius ?? 1;
    const width = op.width ?? 1;
    const inner = Math.max(0, radius - width / 2);
    const outer = radius + width / 2;

    const dx = px - cx;
    const dy = py - cy;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1e-9;

    // SDF for ring (annulus)
    const midR = (inner + outer) / 2;
    const halfW = (outer - inner) / 2;
    const signedDistance = Math.abs(dist - midR) - halfW;

    const angle = Math.atan2(dy, dx);
    const t = (angle + Math.PI) / (2 * Math.PI);
    const tangent = [-Math.sin(angle), Math.cos(angle)];
    const normal = [Math.cos(angle), Math.sin(angle)];
    const curvature = dist > 0 ? 1 / dist : 0;

    // Arc length: centerline circumference
    const arcLength = 2 * Math.PI * midR;

    return { signedDistance, t, tangent, normal, curvature, arcLength };
  }

  // line, path, sphere, symmetry — not analytically tractable for SDF
  return null;
}

/**
 * SVG lets an arc command's two single-digit flags (large-arc-flag,
 * sweep-flag) touch each other or the following coordinate with no
 * separator — "A2 2 0 011 0" means large-arc=0, sweep=1, x=1, y=0. The
 * generic number regex in samplePath reads a run of digits greedily, so it
 * would swallow both flags (or a flag plus part of the next coordinate)
 * into one multi-digit number, desyncing every token for the rest of that
 * path. Rewrite each 'A'/'a' command's flag pair as two explicitly
 * space-separated single-digit tokens first; everything else in the string
 * (including an already space-separated arc) passes through unchanged.
 */
function _normalizeArcFlags(d) {
  let out = '';
  let i = 0;
  const n = d.length;
  const isDigit = c => c >= '0' && c <= '9';
  const skipSep = () => { while (i < n && /[\s,]/.test(d[i])) out += d[i++]; };
  const readNumber = () => {
    skipSep();
    const start = i;
    if (d[i] === '-' || d[i] === '+') i++;
    while (i < n && isDigit(d[i])) i++;
    if (d[i] === '.') { i++; while (i < n && isDigit(d[i])) i++; }
    out += d.slice(start, i);
  };

  while (i < n) {
    const ch = d[i];
    if (ch !== 'A' && ch !== 'a') { out += ch; i++; continue; }

    out += ch; i++;
    readNumber(); // rx
    readNumber(); // ry
    readNumber(); // x-axis-rotation
    skipSep();
    if (i < n && (d[i] === '0' || d[i] === '1')) { out += d[i]; i++; out += ' '; }
    skipSep();
    if (i < n && (d[i] === '0' || d[i] === '1')) { out += d[i]; i++; out += ' '; }
    readNumber(); // x
    readNumber(); // y
  }
  return out;
}

// SVG-like path sampler. Handles M, L, H, V, Q, T, C, S, A, Z.
// Curves are flattened into deterministic 10-step polylines.
function samplePath(d) {
  const tokens = _normalizeArcFlags(String(d || '')).match(/[a-zA-Z]|-?\d*\.?\d+/g) || [];
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

/**
 * Tier thresholds for the sphere op: cosθ cuts between the five tone bands,
 * brightest first.
 *
 * Chosen against the measured share of disc area each band receives, so all
 * five tiers are actually reachable and the highlight stays a highlight. On a
 * radius-9 sphere lit from `-1 -1` the split is roughly
 * 7% / 21% / 28% / 21% / 24% — classic five-tone pixel shading — and it holds
 * at small radii (r=4 gives 6% / 22% / 27% / 27% / 18%).
 *
 * The previous values `[0.999, 0.70, 0.10, -0.40]` reserved the brightest tier
 * for normals within 2.56° of the light, which on a discrete lattice is a
 * one-pixel sliver or, for a fractional centre, nothing at all.
 */
export const SPHERE_THRESHOLDS = Object.freeze([0.95, 0.78, 0.50, 0.18]);

/**
 * Rasterize a Lambert-shaded sphere.
 *
 * The surface normal is the **hemisphere** normal, not the in-plane radial
 * direction: for a cell at offset (dx, dy) from the centre, the implied point on
 * the sphere sits at height nz = √(r² − dx² − dy²) above the image plane, giving
 * the unit normal (dx, dy, nz)/r. Dropping that z term — as this function did
 * previously — makes brightness a function of *angle around the centre* only,
 * constant along every ray outward, which renders a pinwheel rather than a
 * sphere.
 *
 * The op supplies only a 2D light direction, so the light is lifted out of the
 * image plane by the magnitude of its in-plane part: L = ‖(lx, ly, ‖(lx,ly)‖)‖.
 * That keeps the classic "upper-left, toward the viewer" pixel-art key light,
 * is invariant to the scale of (lx, ly), and places the specular point about
 * 71% of the way to the lit edge.
 *
 * A zero light vector is refused at the language boundary (SCDL error 4107), so
 * the head-on fallback below is not a documented authoring mode — it exists only
 * so a direct call into this exported function cannot divide by zero and emit
 * NaN-coloured cells.
 */
export function rasterizeSphere(op, accept, ops) {
  const { cx, cy, radius, lx, ly, tierColors, loc } = op;
  if (!Array.isArray(tierColors) || tierColors.length < 1) return;
  const r = radius;
  const r2 = r * r;

  const inPlane = Math.hypot(lx, ly);
  // Lift the light out of the image plane by its in-plane magnitude; a zero
  // in-plane vector degenerates to head-on rather than dividing by zero.
  const lz = inPlane === 0 ? 1 : inPlane;
  const lLen = Math.hypot(lx, ly, lz) || 1;
  const lNormX = (inPlane === 0 ? 0 : lx) / lLen;
  const lNormY = (inPlane === 0 ? 0 : ly) / lLen;
  const lNormZ = lz / lLen;

  const last = tierColors.length - 1;
  for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++) {
    for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
      const dx = x - cx, dy = y - cy;
      const d2 = dx*dx + dy*dy;
      if (d2 > r2) continue;
      if (!accept(x, y)) continue;

      // Hemisphere normal — well defined at every cell including the centre,
      // so there is no degenerate 0/0 case to special-case.
      const nz = Math.sqrt(r2 - d2);
      const cosTheta = (dx * lNormX + dy * lNormY + nz * lNormZ) / r;

      let tierIdx = 4;
      if      (cosTheta >= SPHERE_THRESHOLDS[0]) tierIdx = 0;
      else if (cosTheta >= SPHERE_THRESHOLDS[1]) tierIdx = 1;
      else if (cosTheta >= SPHERE_THRESHOLDS[2]) tierIdx = 2;
      else if (cosTheta >= SPHERE_THRESHOLDS[3]) tierIdx = 3;

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
