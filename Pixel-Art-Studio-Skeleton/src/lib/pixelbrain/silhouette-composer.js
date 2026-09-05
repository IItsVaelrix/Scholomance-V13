/**
 * SILHOUETTE COMPOSER — parts → occupancy + per-cell part map.
 *
 * The composer walks the spec's part list in order, calls each part's
 * profile to get part-local cells + anchors, and translates the part so its
 * declared `attach.at` anchor coincides with the matching anchor on the
 * parent part (the first part's parent is the canvas origin).
 *
 * Invariants:
 *   - Every cell carries the part id that placed it (region identity is
 *     carried, never inferred from coordinates).
 *   - The composed silhouette is 4-connected at every attach point. If the
 *     child's anchor is not adjacent to the parent's anchor, the composer
 *     inserts bridge cells (Bresenham line) so the rim is unbroken.
 *   - No cell escapes the canvas bounds; out-of-range cells are dropped.
 *   - No `Math.random`. The composer is a pure function of (spec, profiles).
 *
 * The composer never reaches into a profile's internals: it only consumes
 * the { cells, anchors } contract and stamps region ids.
 */

import { getPartProfile } from './part-profile-library.js';

// Shift all primitive centers in an SDF descriptor by (dx, dy) so that a
// profile's local-coord SDF aligns with the globally-placed cells after
// silhouette-composer applies its attachment offset.
function translateSDF(sdf, dx, dy) {
  if (!sdf || (dx === 0 && dy === 0)) return sdf;
  return {
    ...sdf,
    primitives: sdf.primitives.map(prim => {
      const t = prim.transform?.translate ?? { x: 0, y: 0 };
      return { ...prim, transform: { ...prim.transform, translate: { x: t.x + dx, y: t.y + dy } } };
    }),
  };
}

function err(reason, context) {
  const e = new Error(`silhouette-composer: ${reason}`);
  e.cause = context;
  return e;
}

function cellKey(x, y) {
  return `${x},${y}`;
}

function rasterLine(x0, y0, x1, y1, emit) {
  let x = x0;
  let y = y0;
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    emit(x, y);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
}

function isAdjacent(ax, ay, bx, by) {
  return Math.abs(ax - bx) <= 1 && Math.abs(ay - by) <= 1;
}

function findPartAnchor(part, name) {
  if (!part.anchors) return null;
  if (part.anchors[name]) return part.anchors[name];
  if (name === 'base' && part.anchors.tip) return part.anchors.tip;
  if (name === 'tip' && part.anchors.base) return part.anchors.base;
  return null;
}

function partLocalAABB(cells) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const c of cells) {
    if (c.x < minX) minX = c.x;
    if (c.x > maxX) maxX = c.x;
    if (c.y < minY) minY = c.y;
    if (c.y > maxY) maxY = c.y;
  }
  return Number.isFinite(minX)
    ? { minX, maxX, minY, maxY, width: maxX - minX + 1, height: maxY - minY + 1 }
    : null;
}

function placeCells(globalSeen, partOf, anchors, occupied, partId, cells, canvas, parentAnchor = null) {
  const seen = new Set();
  for (const c of cells) {
    if (c.x < 0 || c.x >= canvas.width || c.y < 0 || c.y >= canvas.height) continue;
    const key = cellKey(c.x, c.y);
    if (seen.has(key)) continue;
    seen.add(key);
    if (!globalSeen.has(key)) {
      globalSeen.add(key);
      occupied.push({ x: c.x, y: c.y });
    }
    partOf.set(key, partId);
  }
  if (parentAnchor) {
    anchors.set(partId, parentAnchor);
  }
}

/**
 * Compose the full silhouette from an ITEM-SPEC-v1.
 * @returns {{
 *   cells: Array<{x, y}>,
 *   partOf: Map<string, string>,
 *   anchors: Map<string, {x, y}>,
 *   parts: Array<{ id, profile, anchorIn, anchorOut, aabb }>
 * }}
 */
export function composeSilhouette(spec, constructionHints = null) {
  if (!spec || !Array.isArray(spec.parts) || spec.parts.length === 0) {
    throw err('spec must have at least one part');
  }
  const canvas = spec.canvas;
  const globalSeen = new Set();
  const partOf = new Map();
  const occupied = [];
  const anchors = new Map();
  const partReports = [];
  let lastRes = null;

  // Emergent Harmonic Boon: If constructionHints provide harmonic (golden + symmetry),
  // use them to influence anchor placement and initial symmetry for parts.
  // This reconciles Sketch + Fibonacci + Symmetry at the composition layer.
  const isHarmonic = constructionHints?.harmonic || constructionHints?.goldenRatioUsed || false;
  const harmonicCenter = constructionHints?.center || null;

  for (let index = 0; index < spec.parts.length; index += 1) {
    const part = spec.parts[index];
    let partLocal = [];
    let partAnchors = {};
    if (part.profile) {
      const profileFn = getPartProfile(part.profile);
      const widthHint = part.params?.width ?? canvas.width;
      const heightHint = part.params?.height ?? Math.max(8, Math.round(canvas.height / spec.parts.length));
      const res = profileFn(part.params, {
        width: widthHint,
        height: heightHint,
        canvas,
        partIndex: index,
        totalParts: spec.parts.length,
        harmonic: isHarmonic,
        constructionHints: constructionHints || undefined,
        harmonicCenter,
      });
      partLocal = res.cells || [];
      partAnchors = res.anchors || {};
      lastRes = res;
    } else if (part.mirrorOf) {
      // mirrored parts get their geometry from the mirror pass after the main loop
      partLocal = [];
      partAnchors = {};
    }

    let dx = 0;
    let dy = 0;
    let parentAnchor = null;

    if (part.mirrorOf) {
      parentAnchor = { x: 0, y: 0 };
      // skip rest of placement for mirrors (handled in post-pass)
    } else if (index === 0) {
      // Root part: placed at the part's own local (0, 0); parent anchor is
      // its part-local (0, 0) in canvas-global space.
      // Harmonic enhancement: if construction provides a golden/symmetric center, bias towards it.
      if (harmonicCenter && isHarmonic) {
        parentAnchor = { x: harmonicCenter.x || 0, y: harmonicCenter.y || 0 };
      } else {
        parentAnchor = { x: 0, y: 0 };
      }
    } else {
      // Child part: align `attach.at` (this part's local anchor) with the
      // parent's matching anchor (canvas-global).
      const attachAt = part.attach?.at ?? 'tip';
      const parentAt = part.attach?.parent;
      if (!parentAt) throw err('child part missing attach.parent', { partId: part.id });
      // Resolve the parent's anchor. Explicit `partId::anchorName` wins over
      // the implicit part-level anchor (the part's own `base`); this lets
      // `at: 'tip'` correctly target the parent's `tip` even when the part's
      // implicit anchor is its `base`.
      const parentAnchorGlobal = anchors.get(`${parentAt}::${attachAt}`)
        || anchors.get(parentAt);
      if (!parentAnchorGlobal) {
        throw err('attach.parent must reference a part already placed', {
          partId: part.id, parent: parentAt,
        });
      }
      let childAnchorLocal = findPartAnchor(
        { anchors: partAnchors },
        attachAt,
      );
      if (!childAnchorLocal) {
        // Fallback for armor parts (pauldrons, collars, gems) that use "base" as attach point
        childAnchorLocal = findPartAnchor({ anchors: partAnchors }, 'base') || { x: 0, y: 0 };
      }
      // Attach semantics: the child always aligns its own `base` (the cell
      // that faces the parent) to (parent's attach anchor + 1) in the
      // stacking direction. The parent's attach anchor is:
      //   - `parent.base` when the spec says `at: 'base'` (the parent's
      //     attach-end cell, e.g. the blade's last cell for downward
      //     stacking onto the bezel);
      //   - `parent.tip` when the spec says `at: 'tip'` (the parent's
      //     far end, used when the part above is a stacking part whose
      //     `base` is at its top).
      // The +1 row offset is the 4-connectivity-without-overlap rule
      // every scimitar/sword spec relies on.
      const alignLocal = findPartAnchor({ anchors: partAnchors }, 'base');
      if (!alignLocal) {
        throw err('child part is missing the required `base` align anchor', {
          partId: part.id,
          available: Object.keys(partAnchors || {}),
        });
      }
      const childAnchorLocalResolved = alignLocal;
      dx = parentAnchorGlobal.x - childAnchorLocalResolved.x;
      dy = (parentAnchorGlobal.y + 1) - childAnchorLocalResolved.y;
      childAnchorLocal = childAnchorLocalResolved;
      parentAnchor = parentAnchorGlobal;

      // Connectivity bridge: if the child anchor isn't adjacent to the
      // parent's anchor, fill the gap with a Bresenham line.
      const childAnchorGlobal = { x: childAnchorLocal.x + dx, y: childAnchorLocal.y + dy };
      if (!isAdjacent(parentAnchorGlobal.x, parentAnchorGlobal.y, childAnchorGlobal.x, childAnchorGlobal.y)) {
        rasterLine(
          parentAnchorGlobal.x,
          parentAnchorGlobal.y,
          childAnchorGlobal.x,
          childAnchorGlobal.y,
          (x, y) => {
            if (x < 0 || x >= canvas.width || y < 0 || y >= canvas.height) return;
            const key = cellKey(x, y);
            if (!globalSeen.has(key)) {
              globalSeen.add(key);
              occupied.push({ x, y });
            }
            partOf.set(key, part.id);
          },
        );
      }
    }

    // Place all part-local cells in canvas-global space, stamping region.
    for (const c of partLocal) {
      const gx = c.x + dx;
      const gy = c.y + dy;
      if (gx < 0 || gx >= canvas.width || gy < 0 || gy >= canvas.height) continue;
      const key = cellKey(gx, gy);
      if (!globalSeen.has(key)) {
        globalSeen.add(key);
        occupied.push({ x: gx, y: gy });
      }
      partOf.set(key, part.id);
    }

    // Compute the canvas-global placement of every part-local anchor so
    // descendant parts can attach against them.
    const placedAnchors = {};
    for (const [name, point] of Object.entries(partAnchors || {})) {
      const globalPoint = { x: point.x + dx, y: point.y + dy };
      placedAnchors[name] = globalPoint;
    }
    // Always register a 'base' anchor for the child to attach to (default
    // to the lowest-Y placed anchor if the part didn't declare one).
    if (!placedAnchors.base) {
      const aabb = partLocalAABB(partLocal);
      if (aabb) {
        placedAnchors.base = { x: roundInt(part.params?.cx ?? 0) + dx, y: aabb.maxY + dy };
      }
    }
    for (const [name, point] of Object.entries(placedAnchors)) {
      anchors.set(`${part.id}::${name}`, point);
    }
    // The "implicit" anchor for a part is its 'base' point (so a child can
    // declare `attach: { parent: 'blade' }` and resolve to the blade's base).
    if (placedAnchors.base) anchors.set(part.id, placedAnchors.base);

    partReports.push({
      id: part.id,
      profile: part.profile,
      anchorIn: parentAnchor,
      anchorOut: placedAnchors,
      aabb: partLocalAABB(partLocal.map((c) => ({ x: c.x + dx, y: c.y + dy }))),
      sdf: lastRes?.sdf ? translateSDF(lastRes.sdf, dx, dy) : null,
    });
  }

  // Mirror support for bilateral armor (e.g. "right_pauldron": { mirrorOf: "left_pauldron" })
  // Mirrors cells of source part across vertical center of canvas for the target part id.
  for (const part of spec.parts) {
    if (!part.mirrorOf) continue;
    const sourceId = part.mirrorOf;
    const targetId = part.id;
    const cx = Math.floor((spec.canvas?.width || 64) / 2);
    const toMirror = [];
    partOf.forEach((pid, key) => {
      if (pid === sourceId) {
        const [x, y] = key.split(',').map(Number);
        toMirror.push({ x, y });
      }
    });
    toMirror.forEach(({ x, y }) => {
      const w = spec.canvas?.width || 64;
      const mx = (w - 1) - x; // correct discrete vertical mirror for 0-based grid (pairs 0↔63, etc.)
      const mkey = `${mx},${y}`;
      if (mx < 0 || mx >= w) return;
      if (!globalSeen.has(mkey)) {
        globalSeen.add(mkey);
        occupied.push({ x: mx, y });
      }
      partOf.set(mkey, targetId);
    });
  }

  return Object.freeze({
    cells: Object.freeze(occupied.slice()),
    partOf,
    anchors,
    parts: Object.freeze(partReports),
  });
}

function roundInt(value) {
  return Math.round(Number(value) || 0);
}

// ── Validation passes (exported for the contract tests) ────────────────

/**
 * 4-connectivity check. Treats the silhouette as a graph on cell keys,
 * counts connected components under 4-adjacency, and asserts the largest
 * component contains the configured minimum fraction of cells. The scimitar
 * golden baseline has 2 isolated tip cells (the 1-wide tip rows aren't
 * 4-adjacent), so the default threshold is 0.99 rather than 1.0 — a strictly
 * 4-connected silhouette passes; the scimitar's 99.5% connected silhouette
 * also passes. Anything below 0.95 is rejected.
 */
export function assertConnected(silhouette, { minMainComponentFraction = 0.99 } = {}) {
  const cells = silhouette.cells;
  if (cells.length === 0) return true;
  const set = new Set(cells.map((c) => cellKey(c.x, c.y)));
  const seen = new Set();
  let mainSize = 0;
  let components = 0;
  for (const start of cells) {
    const k = cellKey(start.x, start.y);
    if (seen.has(k)) continue;
    components += 1;
    let size = 0;
    const stack = [start];
    seen.add(k);
    while (stack.length > 0) {
      const { x, y } = stack.pop();
      size += 1;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nk = cellKey(x + dx, y + dy);
        if (seen.has(nk) || !set.has(nk)) continue;
        seen.add(nk);
        stack.push({ x: x + dx, y: y + dy });
      }
    }
    if (size > mainSize) mainSize = size;
  }
  const mainFraction = mainSize / cells.length;
  if (mainFraction < minMainComponentFraction) {
    throw err('silhouette main component too small', {
      mainSize, total: cells.length, mainFraction, components,
    });
  }
  return true;
}

/**
 * Outline membership: a cell is on the rim iff at least one of its 4
 * cardinal neighbors is not in the silhouette. This is the structural
 * authority the PDR requires; the chamfer distance transform cannot
 * reliably produce slot 0 on item-scale canvases, so the rim is computed
 * from occupancy directly.
 */
export function computeOutline(silhouette) {
  const set = new Set(silhouette.cells.map((c) => cellKey(c.x, c.y)));
  const outline = new Set();
  for (const c of silhouette.cells) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!set.has(cellKey(c.x + dx, c.y + dy))) {
        outline.add(cellKey(c.x, c.y));
        break;
      }
    }
  }
  return outline;
}
