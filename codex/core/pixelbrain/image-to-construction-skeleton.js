/**
 * IMAGE → CHARACTER CONSTRUCTION SKELETON
 *
 * Reverse of construction-line-microprocessor.js (spec → guides): given a
 * foundry-generated character PNG, infer the *construction lines* of the image
 * — vertical midline, head circle, and the horizontal division lines through
 * chin / shoulders / waist / hips / knees / ankles — plus the matching
 * PB-CONSTRUCTION-SKELETON-v1 anchors.
 *
 * Method (approach A): row-width-profile landmark detection, with canonical
 * chibi proportion priors used only as a sanity-check / fallback.
 *
 * Two layers:
 *   extractConstructionSkeleton({ mask, width, height }, opts)  — pure, no I/O
 *   imageToConstructionSkeleton(pngPathOrBuffer, opts)          — decodes PNG
 *
 * Deterministic. Integer coordinates only. No randomness.
 */

import { createCharacterSkeleton, validateCharacterSkeleton } from './character-construction-skeleton.js';
import { rasterLine, rasterCircleMidpoint } from './raster-math.js';

export const CONSTRUCTION_SKELETON_CONTRACT = 'PB-CONSTRUCTION-SKELETON-v1';

const GUIDE_COLOR = '#00E5FF'; // 00_Reference layer guide color

function err(reason, context) {
  const e = new Error(`image-to-construction-skeleton: ${reason}`);
  if (context) e.cause = context;
  return e;
}

/**
 * Build an alpha mask (Uint8Array) from a PixelBrain coordinate list.
 * Construction/reference guide cells are excluded so they never pollute the
 * silhouette being analysed.
 */
export function maskFromCoordinates(coordinates, width, height) {
  const w = Math.floor(width);
  const h = Math.floor(height);
  if (!Array.isArray(coordinates)) throw err('coordinates must be an array');
  if (!(w > 0) || !(h > 0)) throw err('width/height must be positive', { width, height });
  const mask = new Uint8Array(w * h);
  for (const c of coordinates) {
    if (!c) continue;
    if (c.isGuide || c.role === 'construction' || c.partId === 'reference') continue;
    const x = Math.round(c.x);
    const y = Math.round(c.y);
    if (x >= 0 && x < w && y >= 0 && y < h) mask[y * w + x] = 255;
  }
  return mask;
}

/**
 * Infer construction lines from a PixelBrain export (.pbrain.json) — accepts a
 * parsed object or a JSON string. Reads the coordinate list + manifest
 * dimensions, builds the silhouette mask, and runs the pure core.
 */
export function pbrainToConstructionSkeleton(pbrain, opts = {}) {
  const data = typeof pbrain === 'string' ? JSON.parse(pbrain) : pbrain;
  if (!data || typeof data !== 'object') throw err('pbrain must be an object or JSON string');
  const coordinates = data.coordinates;
  if (!Array.isArray(coordinates)) throw err('pbrain.coordinates must be an array');
  const manifest = data.metadata?.manifest || {};
  const width = opts.width ?? manifest.width;
  const height = opts.height ?? manifest.height;
  if (!(width > 0) || !(height > 0)) {
    throw err('width/height not found (pass opts.width/height or metadata.manifest)', { width, height });
  }
  const mask = maskFromCoordinates(coordinates, width, height);
  return extractConstructionSkeleton({ mask, width, height }, opts);
}

/**
 * Infer construction lines from a character asset PNG. `input` may be a file
 * path or a PNG Buffer. Decodes via sharp and builds the mask from the alpha
 * channel (`alpha > opts.alphaThreshold`, default 8).
 */
export async function imageToConstructionSkeleton(input, opts = {}) {
  const { default: sharp } = await import('sharp');
  const threshold = opts.alphaThreshold ?? 8;
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i += 1) {
    const alpha = data[i * channels + (channels - 1)];
    if (alpha > threshold) mask[i] = alpha;
  }
  return extractConstructionSkeleton({ mask, width, height }, opts);
}

/** Bounding box of figure pixels (mask[i] > 0). Returns null if none. */
function computeBounds(mask, w, h) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let y = 0; y < h; y += 1) {
    const row = y * w;
    for (let x = 0; x < w; x += 1) {
      if (mask[row + x] > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return Object.freeze({
    minX, minY, maxX, maxY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  });
}

/**
 * Pure core. `mask` is a Uint8Array (length width*height) of alpha/coverage.
 */
export function extractConstructionSkeleton({ mask, width, height } = {}, opts = {}) {
  if (!mask || typeof mask.length !== 'number') {
    throw err('mask must be a typed array of length width*height');
  }
  const w = Math.floor(width);
  const h = Math.floor(height);
  if (!(w > 0) || !(h > 0) || mask.length < w * h) {
    throw err('width/height must be positive and match mask length', { width, height, len: mask.length });
  }

  const bounds = computeBounds(mask, w, h);
  if (!bounds) throw err('no figure pixels (fully transparent mask)');

  const rows = buildRowProfile(mask, w, bounds);
  const midline = computeMidline(rows, bounds);
  const comY = computeCenterOfMassY(rows, bounds);

  const lm = detectLandmarks(rows, bounds, midline);

  // --- assemble skeleton anchors (reuse the canonical contract builder) -------
  const headBoxH = Math.max(1, lm.chinY - bounds.minY);
  const headCenterY = Math.round((bounds.minY + lm.chinY) / 2);
  const eyeY = Math.round(bounds.minY + 0.6 * headBoxH);
  const eyeOffset = Math.max(1, Math.round(lm.headHalfW * 0.45));

  const anchors = {
    headTop: { x: midline, y: bounds.minY },
    headCenter: { x: midline, y: headCenterY },
    headChin: { x: midline, y: lm.chinY },
    eyeLeft: { x: midline - eyeOffset, y: eyeY },
    eyeRight: { x: midline + eyeOffset, y: eyeY },
    nose: { x: midline, y: Math.round(bounds.minY + 0.78 * headBoxH) },
    mouth: { x: midline, y: Math.round(bounds.minY + 0.9 * headBoxH) },
    earLeft: { x: midline - lm.headHalfW, y: eyeY },
    earRight: { x: midline + lm.headHalfW, y: eyeY },
    shoulderL: { x: lm.shoulderL, y: lm.shoulderY },
    shoulderR: { x: lm.shoulderR, y: lm.shoulderY },
    hipL: { x: lm.hipL, y: lm.hipY },
    hipR: { x: lm.hipR, y: lm.hipY },
    kneeL: { x: lm.kneeL, y: lm.kneeY },
    kneeR: { x: lm.kneeR, y: lm.kneeY },
    ankleL: { x: lm.ankleL, y: lm.ankleY },
    ankleR: { x: lm.ankleR, y: lm.ankleY },
  };

  const skeleton = createCharacterSkeleton({ anchors }, 'south');
  validateCharacterSkeleton(skeleton);

  // --- construction lines -----------------------------------------------------
  const lineCells = (x0, y0, x1, y1) => {
    const cells = [];
    rasterLine(x0, y0, x1, y1, (x, y) => {
      if (x >= 0 && x < w && y >= 0 && y < h) cells.push({ x, y, color: GUIDE_COLOR, role: 'construction', isGuide: true });
    });
    return cells;
  };
  const circleCells = (cx, cy, r) => {
    const cells = [];
    rasterCircleMidpoint(cx, cy, r, (x, y) => {
      if (x >= 0 && x < w && y >= 0 && y < h) cells.push({ x, y, color: GUIDE_COLOR, role: 'construction', isGuide: true });
    });
    return cells;
  };

  const hGuide = (id, y) => ({
    id, kind: 'guide-horizontal', y,
    x0: bounds.minX, x1: bounds.maxX,
    cells: lineCells(bounds.minX, y, bounds.maxX, y),
  });

  const constructionLines = [
    {
      id: 'axis.vertical', kind: 'axis-vertical', x: midline,
      y0: bounds.minY, y1: bounds.maxY,
      cells: lineCells(midline, bounds.minY, midline, bounds.maxY),
    },
    {
      id: 'head.circle', kind: 'head-circle',
      center: { x: midline, y: headCenterY }, radius: lm.headHalfW,
      cells: circleCells(midline, headCenterY, lm.headHalfW),
    },
    hGuide('guide.chin', lm.chinY),
    hGuide('guide.shoulder', lm.shoulderY),
    hGuide('guide.waist', lm.waistY),
    hGuide('guide.hip', lm.hipY),
    hGuide('guide.knee', lm.kneeY),
    hGuide('guide.ankle', lm.ankleY),
  ];

  return {
    contract: CONSTRUCTION_SKELETON_CONTRACT,
    skeleton,
    constructionLines,
    bounds,
    center: { x: midline, y: comY },
    widthProfile: rows
      .filter(Boolean)
      .map((r) => ({ y: r.y, left: r.left, right: r.right, filled: r.filled, runs: r.runs })),
    provenance: lm.provenance,
  };
}

// --- row profile --------------------------------------------------------------
function rowSpans(mask, w, y, minX, maxX) {
  const spans = [];
  let start = -1;
  for (let x = minX; x <= maxX; x += 1) {
    const on = mask[y * w + x] > 0;
    if (on && start < 0) start = x;
    if (!on && start >= 0) { spans.push([start, x - 1]); start = -1; }
  }
  if (start >= 0) spans.push([start, maxX]);
  return spans;
}

function buildRowProfile(mask, w, bounds) {
  const rows = [];
  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    const spans = rowSpans(mask, w, y, bounds.minX, bounds.maxX);
    if (spans.length === 0) {
      rows[y] = { y, left: bounds.minX, right: bounds.minX, filled: 0, runs: 0, spans: [] };
      continue;
    }
    const left = spans[0][0];
    const right = spans[spans.length - 1][1];
    let filled = 0;
    for (const [a, b] of spans) filled += b - a + 1;
    rows[y] = { y, left, right, filled, runs: spans.length, spans };
  }
  return rows;
}

function computeCenterOfMassY(rows, bounds) {
  let sum = 0, total = 0;
  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    sum += y * rows[y].filled;
    total += rows[y].filled;
  }
  return total ? Math.round(sum / total) : Math.round((bounds.minY + bounds.maxY) / 2);
}

function computeMidline(rows, bounds) {
  // center of mass x (per-row extent midpoint, weighted by filled), then refine
  // by the column that minimises left/right asymmetry.
  let sum = 0, total = 0;
  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    const r = rows[y];
    sum += ((r.left + r.right) / 2) * r.filled;
    total += r.filled;
  }
  const com = total ? Math.round(sum / total) : Math.round((bounds.minX + bounds.maxX) / 2);

  let best = com, bestScore = Infinity;
  for (let cx = com - 2; cx <= com + 2; cx += 1) {
    if (cx < bounds.minX || cx > bounds.maxX) continue;
    let score = 0;
    for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
      const r = rows[y];
      if (!r.filled) continue;
      score += Math.abs((cx - r.left) - (r.right - cx));
    }
    if (score < bestScore) { bestScore = score; best = cx; }
  }
  return best;
}

// --- landmark detection -------------------------------------------------------
function detectLandmarks(rows, bounds, midline) {
  const hh = bounds.height;
  const yAt = (frac) => Math.round(bounds.minY + frac * (hh - 1));
  const clampY = (y) => Math.max(bounds.minY, Math.min(bounds.maxY, y));

  const argFilled = (y0, y1, want) => {
    const a = clampY(y0), b = clampY(y1);
    let by = a, bv = want === 'max' ? -1 : Infinity;
    for (let y = a; y <= b; y += 1) {
      const v = rows[y].filled;
      if (want === 'max' ? v > bv : v < bv) { bv = v; by = y; }
    }
    return by;
  };

  const provenance = {};

  // Chibi model: the head is the dominant mass at the top, the neck is the
  // deepest valley in the width profile below it, and the body bulges below.
  // head crown = the widest row in the upper half of the figure.
  const crownRow = argFilled(bounds.minY, yAt(0.55), 'max');
  const headWidthMax = rows[crownRow].filled;

  // chin / neck = the narrowest row (deepest valley) below the crown.
  let chinY = argFilled(crownRow + 1, yAt(0.72), 'min');
  const neckWidth = rows[clampY(chinY)].filled;
  const isPinch = chinY > crownRow && neckWidth <= 0.72 * headWidthMax;
  if (!isPinch || chinY < yAt(0.1) || chinY > yAt(0.6)) {
    chinY = yAt(0.3);
    provenance.headChin = 'prior';
  } else {
    provenance.headChin = 'measured';
  }

  // head half-width = widest half-extent over the head rows
  let headHalfW = 1;
  for (let y = bounds.minY; y <= chinY; y += 1) {
    headHalfW = Math.max(headHalfW, Math.round((rows[y].right - rows[y].left) / 2));
  }

  // shoulders = widest body row just below the neck
  const shoulderY = argFilled(chinY + 1, chinY + Math.round(0.28 * hh), 'max');
  provenance.shoulderY = 'measured';
  const shoulderL = rows[shoulderY].left;
  const shoulderR = rows[shoulderY].right;

  // leg split = first row below the shoulders with two runs (a center gap).
  // The hip line is where the legs begin.
  let legTop = null;
  for (let y = shoulderY + 1; y <= bounds.maxY; y += 1) {
    if (rows[y].runs >= 2) { legTop = y; break; }
  }
  if (legTop == null) { legTop = yAt(0.6); provenance.legTop = 'prior'; }
  else provenance.legTop = 'measured';

  // hips = the last single-run row above the split (body width where legs begin)
  const hipY = legTop;
  const hipRowSrc = clampY(Math.max(shoulderY, legTop - 1));
  const hipL = rows[hipRowSrc].left;
  const hipR = rows[hipRowSrc].right;
  provenance.hipY = provenance.legTop;

  // waist = midpoint guide between shoulders and hips (chibi torsos rarely have
  // a measurable waist pinch, so this is a derived division line)
  const waistY = Math.round((shoulderY + hipY) / 2);
  provenance.waistY = 'derived';

  const ankleY = bounds.maxY;
  const kneeY = Math.round((legTop + ankleY) / 2);

  const legColumnsAt = (y) => {
    const r = rows[clampY(y)];
    if (r && r.spans.length >= 2) {
      const first = r.spans[0];
      const last = r.spans[r.spans.length - 1];
      return [Math.round((first[0] + first[1]) / 2), Math.round((last[0] + last[1]) / 2)];
    }
    // proportional fallback
    const off = Math.max(1, Math.round(0.18 * bounds.width));
    return [midline - off, midline + off];
  };

  const [ankleL, ankleR] = legColumnsAt(ankleY);
  const [kneeL, kneeR] = legColumnsAt(kneeY);

  provenance.face = 'prior';

  return {
    headHalfW, chinY, shoulderY, shoulderL, shoulderR,
    waistY, hipY, hipL, hipR,
    legTop, kneeY, kneeL, kneeR, ankleY, ankleL, ankleR,
    provenance,
  };
}
