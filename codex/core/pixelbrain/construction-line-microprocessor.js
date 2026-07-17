/**
 * CONSTRUCTION LINE MICROPROCESSOR
 *
 * The focused, reusable processor for SketchAMP.
 * Generates, extracts, validates, and renders precise construction geometry
 * (center, concentric rings, radials, axes) for radial/shield-like PixelBrain assets.
 *
 * Lives alongside other *-microprocessor.js and *-amp.js in pixelbrain/.
 * Produces reference cells suitable for the 00_Reference layer in the Foundry Aseprite bridge.
 *
 * Public API (per PDR):
 *   applyConstructionLines(base, constructionSpec)
 *   extractConstructionFromReference(referenceCells)
 *   validateConstructionAgainstSpec(cells, spec)
 *   renderConstructionGuides(spec, style)
 *   buildConstructionPayload(input)
 *   runConstructionLineProcessor(payload)
 *
 * Deterministic. No random. Uses raster-math for pixel-correct guides.
 */

import {
  rasterLine,
  rasterCircleMidpoint,
  rasterConcentricRings,
  rasterRadials,
  rasterAxes,
  rasterConstructionGuides,
} from './raster-math.js';
import { clampNumber, hashString, GOLDEN_RATIO, goldenRingRadii } from './shared.js';

export const CONSTRUCTION_LINE_MICROPROCESSOR_ID = 'pixelbrain.constructionLines';
export const CONSTRUCTION_VERSION = 'construction-v1';
export const CONSTRUCTION_SKELETON_CONTRACT = 'PB-CONSTRUCTION-SKELETON-v1';

const GUIDE_COLOR = '#00E5FF'; // Bright cyan for reference guides (non-final palette color)
const GUIDE_EMPHASIS = 0.25;

function err(reason, context) {
  const e = new Error(`construction-line-mp: ${reason}`);
  e.cause = context;
  return e;
}

function toFiniteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toPositiveInt(value, fallback) {
  const n = Math.round(toFiniteNumber(value, fallback));
  return n > 0 ? n : fallback;
}

/**
 * Normalize / validate a construction spec into canonical shape.
 * Supports the compact form from the PDR.
 */
function normalizeConstructionSpec(input = {}) {
  if (!input || typeof input !== 'object') {
    throw err('construction spec must be an object');
  }
  if (input.version && input.version !== CONSTRUCTION_VERSION) {
    throw err(`construction version must be "${CONSTRUCTION_VERSION}"`, { version: input.version });
  }

  if (!input.center || typeof input.center !== 'object' || !Number.isFinite(Number(input.center.x)) || !Number.isFinite(Number(input.center.y))) {
    throw err('construction.center {x, y} (numbers) is required');
  }

  const center = {
    x: Math.round(toFiniteNumber(input.center.x, 32)),
    y: Math.round(toFiniteNumber(input.center.y, 32)),
  };

  let rings = [];
  if (Array.isArray(input.rings)) {
    rings = input.rings.map((r, i) => {
      const radius = toPositiveInt(typeof r === 'number' ? r : r?.radius ?? r?.r, 4 + i * 5);
      const role = r?.role ? String(r.role) : `ring-${i}`;
      return Object.freeze({ radius, role });
    });
  } else if (Array.isArray(input.radii)) {
    rings = input.radii.map((rad, i) => ({ radius: toPositiveInt(rad, 4 + i * 5), role: `ring-${i}` }));
  }

  const radials = input.radials || input.spokes || null;
  let radialNorm = null;
  if (radials && (radials.count || radials.num)) {
    radialNorm = Object.freeze({
      count: toPositiveInt(radials.count || radials.num, 8),
      offsetDegrees: toFiniteNumber(radials.offsetDegrees ?? radials.offset ?? 0),
    });
  }

  const bounds = input.bounds ? {
    width: toPositiveInt(input.bounds.width || input.bounds.radius * 2 || 48, 48),
    height: toPositiveInt(input.bounds.height || input.bounds.radius * 2 || 48, 48),
    shape: input.bounds.shape || 'ellipse',
  } : null;

  const axes = input.axes !== false;
  const anchors = input.anchors && typeof input.anchors === 'object'
    ? Object.freeze(Object.fromEntries(Object.entries(input.anchors).map(([id, anchor]) => [
      String(id),
      Object.freeze({
        x: Math.round(toFiniteNumber(anchor?.x, center.x)),
        y: Math.round(toFiniteNumber(anchor?.y, center.y)),
        ...(anchor?.role ? { role: String(anchor.role) } : {}),
      }),
    ])))
    : Object.freeze({});

  const spec = Object.freeze({
    version: CONSTRUCTION_VERSION,
    center: Object.freeze(center),
    rings: Object.freeze(rings),
    radials: radialNorm,
    anchors,
    bounds: bounds ? Object.freeze(bounds) : null,
    axes,
    // Optional style hints (for render only)
    style: input.style ? Object.freeze({ ...input.style }) : null,
  });

  return spec;
}

function cellKey(cell) {
  return `${Math.round(cell.x)},${Math.round(cell.y)}`;
}

function boundsForCells(cells) {
  if (!cells.length) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const cell of cells) {
    minX = Math.min(minX, cell.x);
    maxX = Math.max(maxX, cell.x);
    minY = Math.min(minY, cell.y);
    maxY = Math.max(maxY, cell.y);
  }
  return Object.freeze({ minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1 });
}

function buildConstructionSkeleton(spec, referenceCells, base = []) {
  const axes = [];
  if (spec.axes) {
    const verticalCells = referenceCells.filter((cell) => cell.isAxis && cell.x === spec.center.x).map(cellKey).sort();
    const horizontalCells = referenceCells.filter((cell) => cell.isAxis && cell.y === spec.center.y).map(cellKey).sort();
    axes.push(Object.freeze({ id: 'axis.vertical', kind: 'vertical', cells: Object.freeze(verticalCells) }));
    axes.push(Object.freeze({ id: 'axis.horizontal', kind: 'horizontal', cells: Object.freeze(horizontalCells) }));
  }
  if (spec.radials?.count) {
    axes.push(Object.freeze({
      id: 'axis.radial',
      kind: 'radial',
      cells: Object.freeze(referenceCells.filter((cell) => cell.isRadial).map(cellKey).sort()),
    }));
  }
  const rings = (spec.rings || []).map((ring, index) => {
    const cells = referenceCells
      .filter((cell) => cell.ringRadius === ring.radius && cell.ringRole === ring.role)
      .map(cellKey)
      .sort();
    return Object.freeze({
      id: `ring.${ring.role || index}`,
      role: ring.role,
      radius: ring.radius,
      cells: Object.freeze(cells),
    });
  });
  const anchors = {
    center: Object.freeze({ ...spec.center, role: 'center' }),
    ...spec.anchors,
  };
  const bounds = {
    reference: boundsForCells(referenceCells),
    ...(Array.isArray(base) && base.length ? { base: boundsForCells(base) } : {}),
  };
  const payload = {
    contract: CONSTRUCTION_SKELETON_CONTRACT,
    specId: 'construction',
    canvas: spec.bounds
      ? { width: spec.bounds.width, height: spec.bounds.height, gridSize: 1 }
      : { width: Math.max(spec.center.x * 2, 1), height: Math.max(spec.center.y * 2, 1), gridSize: 1 },
    center: spec.center,
    axes,
    rings,
    anchors,
    bounds,
  };
  return Object.freeze({
    ...payload,
    hash: `fnv1a_${hashString(JSON.stringify(payload)).toString(16).toUpperCase().padStart(8, '0')}`,
  });
}

/**
 * Core: apply construction to base coordinates or packet.
 * Returns { referenceCells, constructionHints, spec }
 * referenceCells are ready for 00_Reference layer (bright guide color, low emphasis, role:'construction')
 */
export function applyConstructionLines(base = [], constructionSpec = {}, options = {}) {
  const spec = normalizeConstructionSpec(constructionSpec);
  const { cx, cy } = { cx: spec.center.x, cy: spec.center.y };

  const guideCells = [];
  const emit = (x, y) => {
    guideCells.push({
      x: Math.round(x),
      y: Math.round(y),
      snappedX: Math.round(x),
      snappedY: Math.round(y),
      z: 0,
      color: GUIDE_COLOR,
      emphasis: GUIDE_EMPHASIS,
      partId: 'reference',
      role: 'construction',
      source: 'construction-mp',
      isGuide: true,
      ringRole: null, // filled below if applicable
    });
  };

  // Use high-level raster (populates via side effects on guideCells via closure)
  // We collect via a wrapper that also tags.
  const collected = rasterConstructionGuides(spec, (x, y) => {
    // The raster functions emit raw; we post-process for tags.
  });

  // Re-emit with tagging using precise calls for better control
  guideCells.length = 0; // reset

  // Center cross (always)
  rasterLine(cx - 2, cy, cx + 2, cy, emit);
  rasterLine(cx, cy - 2, cx, cy + 2, emit);

  // Rings with roles
  // Support emergent harmonic (Fibonacci/Golden + Symmetry) via spec.harmonic or spec.golden
  const harmonic = spec.harmonic || spec.golden || false;
  const useGoldenSpacing = harmonic || spec.goldenSpacing || false;
  const applySymmetryToGuides = harmonic || spec.symmetricGuides || false;

  if (spec.rings && spec.rings.length) {
    let ringsToRender = spec.rings;
    if (useGoldenSpacing && spec.rings.length > 1) {
      // Re-space using golden ratio for emergent natural harmony (fibonacci-like subdivision)
      const baseR = spec.rings[0].radius;
      const goldenRadii = goldenRingRadii(baseR, spec.rings.length);
      ringsToRender = spec.rings.map((ring, i) => ({
        ...ring,
        radius: goldenRadii[i] || ring.radius,
      }));
    }
    for (const ring of ringsToRender) {
      const r = ring.radius;
      const ringEmit = (x, y) => {
        const cell = {
          x: Math.round(x), y: Math.round(y), snappedX: Math.round(x), snappedY: Math.round(y),
          z: 0, color: GUIDE_COLOR, emphasis: GUIDE_EMPHASIS,
          partId: 'reference', role: 'construction', source: 'construction-mp', isGuide: true,
          ringRole: ring.role || null, ringRadius: r,
          harmonic: useGoldenSpacing,
        };
        guideCells.push(cell);
      };
      rasterCircleMidpoint(cx, cy, r, ringEmit);
    }
  }

  // Radials
  if (spec.radials && spec.radials.count > 0) {
    const maxR = Math.max(...spec.rings.map(rr => rr.radius), 24);
    const radialEmit = (x, y) => {
      guideCells.push({
        x: Math.round(x), y: Math.round(y), snappedX: Math.round(x), snappedY: Math.round(y),
        z: 0, color: GUIDE_COLOR, emphasis: GUIDE_EMPHASIS * 0.8,
        partId: 'reference', role: 'construction', source: 'construction-mp', isGuide: true,
        isRadial: true,
      });
    };
    rasterRadials(cx, cy, spec.radials.count, maxR, radialEmit, spec.radials.offsetDegrees || 0);
  }

  // Axes if requested
  if (spec.axes) {
    const maxR = Math.max(...(spec.rings || []).map(r => r.radius || 0), 20);
    const axisEmit = (x, y) => {
      guideCells.push({
        x: Math.round(x), y: Math.round(y), snappedX: Math.round(x), snappedY: Math.round(y),
        z: 0, color: GUIDE_COLOR, emphasis: GUIDE_EMPHASIS * 0.7,
        partId: 'reference', role: 'construction', source: 'construction-mp', isGuide: true,
        isAxis: true,
      });
    };
    rasterAxes(cx, cy, maxR, axisEmit, true);
  }

  // Emergent: Apply vertical symmetry to guides when harmonic/symmetricGuides requested
  // This creates the connective tissue between Sketch/Construction and Symmetry at generation time.
  if (applySymmetryToGuides && spec.symmetry?.axis === 'vertical') {
    const w = 64; // default canvas assumption; downstream can adjust
    const mirrored = [];
    guideCells.forEach(cell => {
      mirrored.push(cell);
      const mx = (w - 1) - cell.x;
      if (mx !== cell.x) {
        mirrored.push({
          ...cell,
          x: mx,
          snappedX: mx,
          // keep same role/guidance
        });
      }
    });
    guideCells.length = 0;
    mirrored.forEach(c => guideCells.push(c));
  }

  // Hints for downstream (Structure, Energy, Focal, lighting, emblem mp, etc.)
  const ringRadii = (spec.rings || []).map(r => r.radius).sort((a, b) => a - b);
  const constructionHints = Object.freeze({
    center: { ...spec.center },
    ringRadii,
    radialCount: spec.radials ? spec.radials.count : 0,
    radialOffset: spec.radials ? spec.radials.offsetDegrees : 0,
    hasAxes: !!spec.axes,
    anchors: spec.anchors,
    version: CONSTRUCTION_VERSION,
    harmonic: !!useGoldenSpacing,
    symmetricGuides: !!applySymmetryToGuides,
    goldenRatioUsed: !!useGoldenSpacing,
  });

  const referenceCells = Object.freeze(guideCells.map(c => Object.freeze(c)));
  const skeleton = buildConstructionSkeleton(spec, referenceCells, base);

  // Optionally merge with base cells (for preview or hybrid)
  let merged = base;
  if (Array.isArray(base) && base.length && options.mergeBase !== false) {
    const baseMap = new Map(base.map(c => [`${c.x},${c.y}`, c]));
    referenceCells.forEach(g => {
      const key = `${g.x},${g.y}`;
      if (!baseMap.has(key)) baseMap.set(key, g);
    });
    merged = Array.from(baseMap.values());
  }

  return Object.freeze({
    referenceCells,
    skeleton,
    constructionSkeleton: skeleton,
    constructionHints,
    spec,
    mergedCoordinates: merged,
    diagnostics: Object.freeze({
      guideCount: referenceCells.length,
      ringCount: ringRadii.length,
    }),
  });
}

/**
 * Render construction guides as pure coordinate list (for direct use or tests).
 * style can override color/emphasis.
 */
export function renderConstructionGuides(constructionSpec, style = {}) {
  const spec = normalizeConstructionSpec(constructionSpec);
  const color = style.guideColor || GUIDE_COLOR;
  const emphasis = style.emphasis ?? GUIDE_EMPHASIS;

  const cells = [];
  const emit = (x, y) => {
    cells.push(Object.freeze({
      x: Math.round(x),
      y: Math.round(y),
      snappedX: Math.round(x),
      snappedY: Math.round(y),
      color,
      emphasis,
      partId: 'reference',
      role: 'construction',
      source: 'construction-mp',
      isGuide: true,
    }));
  };

  // Re-use the tagging logic but with style
  // For simplicity, delegate to apply and remap
  const result = applyConstructionLines([], spec, { mergeBase: false });
  return result.referenceCells.map(c => ({
    ...c,
    color,
    emphasis,
  }));
}

/**
 * Extract approximate construction data from existing reference/guide cells (e.g. imported from Aseprite).
 * Returns a best-effort spec + hints + drift report.
 */
export function extractConstructionFromReference(referenceCells = []) {
  if (!Array.isArray(referenceCells) || referenceCells.length === 0) {
    return { spec: null, hints: null, drift: { max: 0, notes: ['no reference cells'] } };
  }

  const guides = referenceCells.filter(c => c.role === 'construction' || c.isGuide || (c.partId === 'reference'));
  if (guides.length === 0) guides.push(...referenceCells); // fallback

  // Find center: average or most common intersection (simple: use min/max or first dense)
  let sumX = 0, sumY = 0, n = 0;
  guides.forEach(c => { sumX += toFiniteNumber(c.x); sumY += toFiniteNumber(c.y); n++; });
  const cx = Math.round(sumX / Math.max(1, n));
  const cy = Math.round(sumY / Math.max(1, n));

  // Detect rings by distance from center. Only keep "ring-like" buckets (high density points at that exact r,
  // spokes/axes contribute only 1-2 points per r while real circles contribute many).
  const radiusBuckets = new Map();
  guides.forEach(c => {
    const dx = toFiniteNumber(c.x) - cx;
    const dy = toFiniteNumber(c.y) - cy;
    const r = Math.round(Math.sqrt(dx*dx + dy*dy));
    if (r > 0) {
      const key = r;
      if (!radiusBuckets.has(key)) radiusBuckets.set(key, 0);
      radiusBuckets.set(key, radiusBuckets.get(key) + 1);
    }
  });

  const significant = Array.from(radiusBuckets.entries())
    .filter(([, cnt]) => cnt >= 4); // rings have perimeter density; spokes are sparse

  const radii = significant
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([r]) => r)
    .sort((a, b) => a - b);

  const extractedSpec = normalizeConstructionSpec({
    version: CONSTRUCTION_VERSION,
    center: { x: cx, y: cy },
    rings: radii.map(r => ({ radius: r, role: `ring-r${r}` })),
  });

  // Simple drift: compare consecutive rings spacing variance
  let maxDrift = 0;
  for (let i = 1; i < radii.length; i++) {
    const d = Math.abs(radii[i] - radii[i - 1]);
    if (d > maxDrift) maxDrift = d;
  }

  const hints = {
    center: extractedSpec.center,
    ringRadii: radii,
    version: CONSTRUCTION_VERSION,
    extracted: true,
  };

  return {
    spec: extractedSpec,
    hints: Object.freeze(hints),
    drift: Object.freeze({ max: maxDrift, radii, note: maxDrift > 2 ? 'significant drift detected' : 'ok' }),
  };
}

export function validateConstructionAgainstSpec(referenceCells, spec) {
  const extracted = extractConstructionFromReference(referenceCells);
  if (!extracted.spec || !spec) return { valid: false, reason: 'missing data' };

  const expectedRadii = (spec.rings || []).map(r => r.radius).sort((a,b)=>a-b);
  const actualRadii = extracted.hints.ringRadii || [];

  const centerDx = Math.abs(extracted.hints.center.x - spec.center.x);
  const centerDy = Math.abs(extracted.hints.center.y - spec.center.y);
  const centerDrift = Math.max(centerDx, centerDy);

  // Set-aware max deviation for the known main radii (spoke artifacts may pollute actual list)
  let radiusDrift = 0;
  for (const er of expectedRadii) {
    let minD = Infinity;
    for (const ar of actualRadii) {
      minD = Math.min(minD, Math.abs(er - ar));
    }
    if (minD < Infinity) radiusDrift = Math.max(radiusDrift, minD);
  }

  const valid = centerDrift <= 1 && radiusDrift <= 1;

  return Object.freeze({
    valid,
    centerDrift,
    radiusDrift,
    expectedRadii,
    actualRadii,
    diagnostics: extracted.drift,
  });
}

/** Build a full payload (for pipeline / asset packet / diagnostics) */
export function buildConstructionPayload(input = {}) {
  const { spec: rawSpec, baseCoordinates = [], intent = 'generate-reference' } = input || {};
  const result = applyConstructionLines(baseCoordinates, rawSpec);

  const payload = Object.freeze({
    amp: CONSTRUCTION_LINE_MICROPROCESSOR_ID,
    version: CONSTRUCTION_VERSION,
    intent,
    spec: result.spec,
    referenceCells: result.referenceCells,
    constructionHints: result.constructionHints,
    outputCoordinates: result.mergedCoordinates,
    diagnostics: result.diagnostics,
    inputHash: hashString(JSON.stringify({ center: rawSpec?.center, rings: (rawSpec?.rings||[]).map(r=>r.radius) })).toString(16),
  });

  return payload;
}

export function runConstructionLineProcessor(payload, context = {}) {
  return buildConstructionPayload(payload);
}

// Convenience re-exports for sketch-amp facade + direct use
export { normalizeConstructionSpec, normalizeConstructionSpec as parseConstructionSpec };
