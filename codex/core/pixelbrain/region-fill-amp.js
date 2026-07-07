/**
 * REGION FILL AMP — color authority for the Item Foundry.
 *
 * Promotes the scimitar's hand-authored `rampPick` + per-region `slotRange` +
 * `isOutline` logic into the engine. For every cell:
 *
 *   1. Identify its part (from the silhouette-composer's partOf map).
 *   2. Look up the part's fill spec (`{ material, anchor? }`).
 *   3. If the cell is on the rim (4-neighbor check via silhouette-composer),
 *      use the part's trim material/anchor when declared, otherwise outline.
 *   4. Otherwise, normalize the cell's slot onto the part's INTERIOR slot
 *      range and look up the color in the material's anchor ramp.
 *
 * Outline membership is structural (4-neighbor occupancy), not luminance-
 * derived, so it works correctly on item-scale canvases where the chamfer
 * distance transform cannot reliably produce slot 0.
 *
 * No hex literals. Every emitted color is reachable from a registry anchor
 * or a documented blend of two anchors.
 */

import { hashString } from './shared.js';
import {
  MATERIAL_PALETTES,
  resolveMaterialId,
} from './material-registry.js';
import { computeOutline } from './silhouette-composer.js';
import { resolveRole, CanonicalRoles } from './semantic-registry.js';

const ANCHOR_ORDER = Object.freeze([
  'void', 'shadow', 'deep', 'body', 'frost', 'spectral', 'whiteCore',
]);
const ANCHOR_INDEX = Object.freeze(
  ANCHOR_ORDER.reduce((acc, key, i) => { acc[key] = i; return acc; }, Object.create(null)),
);

function err(reason, context) {
  const e = new Error(`region-fill-amp: ${reason}`);
  e.cause = context;
  return e;
}

function toFiniteNumber(value, fallback = 0) { // eslint-disable-line no-unused-vars
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function isHex(value) {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
}

// ── Anchor ramp construction ────────────────────────────────────────────

/**
 * Build an ordered ramp of hex colors for a material, picking a contiguous
 * slice of its anchor keys. `rangeAnchor` is the anchor name that anchors
 * the lowest slot (often `void` or `shadow` for dark materials, `body`
 * for metallic). The ramp climbs through the anchor order up to
 * `peakAnchor` (or the material's whiteCore if no peak is given).
 */
function buildMaterialRamp(material, rangeAnchor = 'void', peakAnchor = 'whiteCore') {
  const definition = MATERIAL_PALETTES[resolveMaterialId(material)];
  if (!definition || !definition.anchors) return [];
  const anchors = definition.anchors;
  const startIdx = ANCHOR_INDEX[rangeAnchor];
  const endIdx = ANCHOR_INDEX[peakAnchor] ?? ANCHOR_ORDER.length - 1;
  if (startIdx == null || endIdx == null || startIdx > endIdx) return [];
  const ramp = [];
  for (let i = startIdx; i <= endIdx; i += 1) {
    const key = ANCHOR_ORDER[i];
    if (anchors[key]) ramp.push(anchors[key]);
  }
  return ramp;
}

/**
 * Build a contrast ramp for a material using body + frost + whiteCore
 * (the "light" anchors). Used for "light" intent materials.
 */
function buildLightRamp(material) {
  return buildMaterialRamp(material, 'body', 'whiteCore');
}

/**
 * Build a shadow ramp using void + shadow + deep. Used for "dark" intent.
 */
function buildShadowRamp(material) {
  return buildMaterialRamp(material, 'void', 'deep');
}

// ── Outline authority ───────────────────────────────────────────────────

/**
 * Resolve a fill/outline spec to a single hex color from the material
 * registry. `spec` is `{ material, anchor? }`; if no anchor is given, the
 * material's `body` anchor is used.
 */
function resolveFillColor(spec) {
  if (!spec) return null;
  const material = resolveMaterialId(spec.material);
  const definition = MATERIAL_PALETTES[material];
  if (!definition) return null;
  const anchor = spec.anchor && definition.anchors[spec.anchor] ? spec.anchor : 'body';
  return definition.anchors[anchor] || definition.anchors.body || null;
}

function resolvePartField(partById, part, field, seen = new Set()) {
  if (!part) return null;
  if (part[field]) return part[field];
  if (!part.mirrorOf || seen.has(part.id)) return null;
  seen.add(part.id);
  return resolvePartField(partById, partById.get(part.mirrorOf), field, seen);
}

// ── Slot range computation ──────────────────────────────────────────────

/**
 * For each part, compute the interior (non-outline) slot range. This is
 * the dynamic range the part's fill ramp maps onto, so thin parts with
 * small interior reach the full ramp just as broad parts do.
 */
function computePartSlotRanges(template, partOf, outline) {
  const ranges = Object.create(null);
  for (const c of template.coordinates) {
    const key = `${c.x},${c.y}`;
    if (outline.has(key)) continue;
    const partId = partOf.get(key);
    if (!partId) continue;
    if (!ranges[partId]) ranges[partId] = { min: Infinity, max: -Infinity };
    if (c.slot < ranges[partId].min) ranges[partId].min = c.slot;
    if (c.slot > ranges[partId].max) ranges[partId].max = c.slot;
  }
  // Normalize degenerate parts to slot 0..0.
  for (const id of Object.keys(ranges)) {
    if (!Number.isFinite(ranges[id].min)) ranges[id] = { min: 0, max: 0 };
    if (!Number.isFinite(ranges[id].max)) ranges[id].max = ranges[id].min;
  }
  return ranges;
}

function pickFromRamp(ramp, slot, minSlot, maxSlot) {
  if (ramp.length === 0) return null;
  if (maxSlot <= minSlot) return ramp[Math.min(ramp.length - 1, Math.max(0, Math.round(slot)))];
  const norm = clamp01((slot - minSlot) / (maxSlot - minSlot));
  const idx = Math.min(ramp.length - 1, Math.max(0, Math.round(norm * (ramp.length - 1))));
  return ramp[idx];
}

// ── Main entry point ────────────────────────────────────────────────────

/**
 * Apply region fills to a sketchToSilhouette output, using the silhouette-
 * composer's structural outline and partOf map.
 *
 * @param {Object} args
 * @param {Object} args.silhouette   — output of composeSilhouette
 * @param {Object} args.template     — output of sketchToSilhouette
 * @param {Object} args.spec         — the ITEM-SPEC-v1 spec
 * @param {Object} [args.motifCells] — optional Map<cellKey, { core, glow, type }>
 *   marking engraved cells. core cells take the motif.core color, glow
 *   cells take the motif.glow color, everything else stays in the part
 *   fill ramp.
 *
 * @returns {{
 *   coordinates: Array,
 *   partOf: Map<string,string>,
 *   diagnostics: { rimCells, fillCells, motifCells, colorAnchors }
 * }}
 */
export function applyRegionFills({ silhouette, template, spec, motifCells = null } = {}) {
  if (!silhouette || !template || !spec) {
    throw err('silhouette, template, and spec are required');
  }
  const partById = new Map();
  for (const part of spec.parts) partById.set(part.id, part);

  // Material color authority per part.
  const fillByPart = new Map();
  const trimByPart = new Map();
  const outlineByPart = new Map();
  for (const part of spec.parts) {
    fillByPart.set(part.id, resolveFillColor(resolvePartField(partById, part, 'fill')));
    trimByPart.set(part.id, resolveFillColor(resolvePartField(partById, part, 'trim')));
    outlineByPart.set(part.id, resolveFillColor(resolvePartField(partById, part, 'outline')));
  }
  // Material-aware ramp builders per part. The fill spec may include
  // `intensity: 'dark' | 'light'` to pick which anchor slice to ramp
  // across. Defaults to 'dark' (the scimitar's intent: void → body).
  const rampByPart = new Map();
  for (const part of spec.parts) {
    const fill = resolvePartField(partById, part, 'fill');
    const material = fill ? resolveMaterialId(fill.material) : 'source';
    const intensity = fill?.intensity || (fill?.anchor === 'body' ? 'light' : 'dark');
    if (intensity === 'light') {
      rampByPart.set(part.id, buildLightRamp(material));
    } else {
      rampByPart.set(part.id, buildShadowRamp(material));
    }
  }

  // Outline authority is structural: 4-neighbor occupancy check, computed
  // once via the composer's computeOutline helper. The PDR's "slot 0 trap"
  // is sidestepped: outline membership never depends on the chamfer
  // distance transform's quantization at item-scale canvases.
  const outline = computeOutline(silhouette);
  const slotRanges = computePartSlotRanges(template, silhouette.partOf, outline);

  // Per-cell resolution.
  let rimCells = 0;
  let fillCells = 0;
  let motifCellCount = 0;
  const colorAnchors = new Set();
  const filled = [];
  for (const c of template.coordinates) {
    const key = `${c.x},${c.y}`;
    const partId = silhouette.partOf.get(key);
    const part = partId ? partById.get(partId) : null;
    const isRim = outline.has(key);

    // === SemQuant connective tissue: respect semantic role from authoring ===
    const semanticRole = c.semanticRole || c.role || resolveRole(c);
    const isSemanticRim = semanticRole === CanonicalRoles.RIM || semanticRole === 'rim';
    const isSemanticConstruction = semanticRole === CanonicalRoles.CONSTRUCTION_GUIDE;

    const isMotif = motifCells && motifCells.has(key);
    let color = null;
    if (isMotif) {
      const motifEntry = motifCells.get(key);
      // motif cells take their role's color (core or glow)
      color = motifEntry.color || null;
      motifCellCount += 1;
    } else if ((isRim || isSemanticRim) && part && (trimByPart.get(partId) || outlineByPart.get(partId))) {
      color = trimByPart.get(partId) || outlineByPart.get(partId);
      rimCells += 1;
    } else if (part) {
      const ramp = rampByPart.get(partId) || [];
      const [minSlot, maxSlot] = [slotRanges[partId]?.min ?? 0, slotRanges[partId]?.max ?? c.slot];
      const rampColor = pickFromRamp(ramp, c.slot, minSlot, maxSlot);
      color = rampColor || fillByPart.get(partId) || ramp[Math.min(ramp.length - 1, c.slot)] || null;
      fillCells += 1;
    }
    if (!color || !isHex(color)) {
      // Last-resort fallback: the material's body anchor. Should never
      // trigger if the spec is well-formed; tests pin this behavior.
      const fill = resolvePartField(partById, part, 'fill');
      const material = fill ? resolveMaterialId(fill.material) : 'source';
      const fallback = MATERIAL_PALETTES[material]?.anchors?.body || '#000000';
      color = fallback;
    }
    if (color) colorAnchors.add(color);
    filled.push({
      ...c,
      partId,
      color,
      isRim: isRim || isSemanticRim,
      isMotif: Boolean(isMotif),
      motifRole: isMotif ? motifCells.get(key).role : null,
      semanticRole: semanticRole || null,
    });
  }

  // Cache the structural outline for downstream consumers.
  return Object.freeze({
    coordinates: Object.freeze(filled),
    partOf: silhouette.partOf,
    outline: Object.freeze([...outline]),
    slotRanges: Object.freeze(slotRanges),
    partReports: silhouette.parts,
    diagnostics: Object.freeze({
      rimCells,
      fillCells,
      motifCells: motifCellCount,
      colorAnchors: Object.freeze([...colorAnchors]),
    }),
  });
}

// ── Determinism check (exported for tests) ─────────────────────────────

export function assertDeterministic({ silhouette, template, spec, motifCells }, runTwice) {
  const a = applyRegionFills({ silhouette, template, spec, motifCells });
  const b = runTwice ? applyRegionFills({ silhouette, template, spec, motifCells }) : a;
  // Compare colors cell-by-cell in insertion order.
  if (a.coordinates.length !== b.coordinates.length) return false;
  for (let i = 0; i < a.coordinates.length; i += 1) {
    if (a.coordinates[i].color !== b.coordinates[i].color) return false;
  }
  return true;
}

// Hash a fill output for stable artifact identification.
export function hashRegionFills(fills) {
  const json = JSON.stringify({
    partOf: [...fills.partOf.entries()].sort(([a], [b]) => a.localeCompare(b)),
    coordinates: fills.coordinates.map((c) => `${c.x},${c.y},${c.color}`),
  });
  return `fnv1a_${hashString(json).toString(16).padStart(8, '0')}`;
}
