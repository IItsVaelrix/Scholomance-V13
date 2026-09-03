/**
 * palette-quantization-amp.js
 *
 * Deterministic final palette budget enforcement. The palette is built from
 * material registry anchors referenced by the spec, then nearest-color mapped.
 *
 * Which colors earn one of the `budget` slots is decided by a claim order, and
 * that order is the whole behaviour of this pass:
 *
 *   required (spec names the anchor) > authored (designer's declared palette)
 *   > semantic (crystal/glow/motif cell colors, near-duplicates suppressed)
 *   > available (blanket per-material anchor sweep) > observed (everything else)
 *
 * NOT observation-only. The `destroyed*` diagnostics report, but the tiers above
 * decide pixels. On the VOID chestplate the budget is saturated
 * (`paletteSlotsUsed` 64/64), so promoting any tier displaces another — which is
 * why each promotion here is recorded with the asset it was measured against.
 */

import { MATERIAL_PALETTES, resolveMaterialId } from './material-registry.js';

const ANCHOR_ORDER = Object.freeze(['void', 'shadow', 'deep', 'body', 'frost', 'spectral', 'whiteCore']);

/**
 * Cell fields that mark a cell as carrying authored meaning rather than
 * amp-generated shading. `crystal-core-amp` and the motif engraver assign these
 * colors themselves — they are never named via a part's `target.anchor` — so a
 * frequency- or hex-ordered palette policy will happily delete a three-cell
 * crystal highlight. These markers are what makes that loss visible.
 */
const SEMANTIC_MARKERS = Object.freeze(['crystalCore', 'crystalGlow', 'motifRole', 'semanticRole']);

function normalizeHex(color) {
  const raw = String(color || '').replace('#', '').toUpperCase();
  return /^[0-9A-F]{6}$/.test(raw) ? `#${raw}` : null;
}

/**
 * The hand-authored palette an asset is designed against, if it declares one.
 * Read from the normalized spec first, then from the editor palette metadata
 * that the generators already attach. Returns null when nothing is declared —
 * which is not the same as an empty palette, and must not be treated as one.
 */
function collectAuthoredPalette(spec) {
  const declared = spec?.fidelity?.exactPalette ?? spec?.metadata?.editorPalette?.colors ?? null;
  if (!Array.isArray(declared)) return null;
  const set = new Set();
  for (const color of declared) {
    const hex = normalizeHex(color);
    if (hex) set.add(hex);
  }
  return set;
}

function isSemanticCell(cell) {
  if (cell.isMotif === true) return true;
  return SEMANTIC_MARKERS.some((key) => {
    const value = cell[key];
    return value !== undefined && value !== null && value !== false;
  });
}

function parseHex(hex) {
  const raw = String(hex || '').replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) return null;
  const n = parseInt(raw, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function distance(a, b) {
  return ((a.r - b.r) ** 2) + ((a.g - b.g) ** 2) + ((a.b - b.b) ** 2);
}

function uniquePush(list, color) {
  if (color && !list.includes(color)) list.push(color);
}

/**
 * Split the spec's anchor colors into the two tiers that have different claims
 * on the budget:
 *
 *   required  — anchors the spec names explicitly via `target.anchor`. These are
 *               authored intent: the design says "this edge is void_gold.body".
 *   available  — the blanket ANCHOR_ORDER sweep of every referenced material.
 *               These are merely *offered* by the material, not requested by the
 *               artwork, and they are what crowds the budget (9 materials x 7
 *               anchors = 63 of 64 slots on the VOID chestplate).
 *
 * Keeping them separate lets colors that the artwork actually needs outrank
 * anchors that exist only because their material was mentioned somewhere.
 */
function collectSpecPalette(spec) {
  const required = [];
  const available = [];
  for (const part of spec.parts || []) {
    for (const field of ['fill', 'trim', 'outline', 'wrap']) {
      const target = part[field];
      if (!target?.material) continue;
      const def = MATERIAL_PALETTES[resolveMaterialId(target.material)];
      if (!def?.anchors) continue;
      if (target.anchor && def.anchors[target.anchor]) {
        uniquePush(required, def.anchors[target.anchor]);
      }
      for (const key of ANCHOR_ORDER) uniquePush(available, def.anchors[key]);
    }
    for (const target of [part.motif?.core, part.motif?.glow, part.glow]) {
      if (!target?.material) continue;
      const def = MATERIAL_PALETTES[resolveMaterialId(target.material)];
      if (!def?.anchors) continue;
      for (const key of ANCHOR_ORDER) uniquePush(available, def.anchors[key]);
    }
  }
  return { required, available };
}

/**
 * Colors carried by semantically-marked cells, in deterministic order.
 *
 * These are the crystal highlights, glows and motifs. They are low-frequency by
 * nature and the amps assign their colors directly, so they appear in neither
 * `required` (the spec never names them) nor the authored exact palette. Without
 * an explicit reservation a budget cut deletes them: measured on the VOID
 * chestplate as 148/148 semantic cells recolored, 17 -> 7 distinct colors, and
 * 62% of them merged into the surrounding body color.
 */
function collectSemanticColors(coordinates) {
  const colors = new Set();
  for (const cell of coordinates) {
    if (!isSemanticCell(cell)) continue;
    const hex = normalizeHex(cell.color);
    if (hex) colors.add(hex);
  }
  return [...colors].sort();
}

/**
 * A semantic candidate this far (squared RGB distance) from an already-seated
 * color is a copy of it, not a new color — Euclidean 12/255, ~4.7% of the RGB
 * diagonal.
 *
 * WHY THIS EXISTS. Semantic cell colors are assigned by amps *after* shading,
 * anti-aliasing and the sharpness pass, so they are frequently an authored color
 * nudged by one to five units per channel. Reserving a slot for each of those is
 * self-defeating: it spends the budget on a near-duplicate of a color the budget
 * already contains, and — because `nearestColor` picks the closest entry — it
 * then steals the cells that color was meant to paint. Measured on the VOID
 * chestplate: reserving semantic colors unconditionally admitted 22 non-authored
 * entries (#6A30BB, #6A31BB, #6A32BA, #6A32BB as four separate slots) and the
 * rendered asset lost #6B35B8, #A17AE0, #A66BE0 and #7463E8 to them.
 *
 * Suppression applies to the semantic tier only. `available` keeps its historical
 * behaviour so this pass's blast radius is exactly the tier it added.
 */
const SEMANTIC_NEAR_DUPLICATE_MAX_DISTANCE_SQUARED = 144;

/** The already-seated color a candidate would merge onto, or null if none is near. */
function nearestSeatedColor(color, seatedRgb, limit = SEMANTIC_NEAR_DUPLICATE_MAX_DISTANCE_SQUARED) {
  const rgb = parseHex(color);
  if (!rgb) return null;
  let best = null;
  let bestDistance = limit + 1;
  for (const entry of seatedRgb) {
    const d = distance(rgb, entry.rgb);
    // `best` is null until the first qualifier, so the tie-break must not
    // dereference it: an entry at exactly `limit + 1` would otherwise crash here.
    if (d < bestDistance || (d === bestDistance && best !== null && entry.color < best.color)) {
      best = entry;
      bestDistance = d;
    }
  }
  return best ? best.color : null;
}

function nearestColor(color, paletteRgb) {
  const rgb = parseHex(color);
  if (!rgb || paletteRgb.length === 0) return color;
  let best = paletteRgb[0];
  let bestDistance = Infinity;
  for (const entry of paletteRgb) {
    const d = distance(rgb, entry.rgb);
    if (d < bestDistance || (d === bestDistance && entry.color < best.color)) {
      best = entry;
      bestDistance = d;
    }
  }
  return best.color;
}

export function applyPaletteQuantization(coordinates, spec) {
  if (!Array.isArray(coordinates)) return Object.freeze({ coordinates: [], diagnostics: { uniqueColors: 0 } });
  const budget = spec.fidelity?.paletteBudget || null;
  if (!budget) {
    const uniqueColors = new Set(coordinates.map((cell) => cell.color).filter(Boolean)).size;
    return Object.freeze({
      coordinates,
      diagnostics: Object.freeze({
        uniqueColors,
        budget: null,
        changedCount: 0,
        slotsUnused: null,
        paletteSlotsUsed: null,
        destroyedTotal: 0,
        destroyedAuthored: 0,
        destroyedSemantic: 0,
        destroyedSemanticMerged: 0,
        destroyedNoise: 0,
        semanticColorCandidates: 0,
        semanticSuppressed: 0,
        authoredPaletteDeclared: collectAuthoredPalette(spec) !== null,
        authoredTotal: null,
        authoredSeated: null,
        alarm: false,
      }),
    });
  }

  // Budget allocation, highest claim first. An anchor earns a slot because the
  // artwork requires it, not merely because its material is mentioned in the
  // spec.
  //
  //   1. required  — anchors the spec names explicitly (`target.anchor`)
  //   2. authored  — the hand-authored palette declared on the spec/metadata
  //   3. semantic  — colors on crystal / glow / motif cells (see above)
  //   4. available — every other anchor offered by a referenced material
  //   5. observed  — the remaining artwork colors, mostly amp-generated shading
  //
  // Tier 2 is not optional, and it is not the same thing as tier 4. Measured on
  // the VOID chestplate before this ordering existed (budget 64, blanket sweep
  // alone filling 63 of those slots): seating `semantic` above `available`
  // without first seating the authored palette pushed 8 of the 28 authored
  // colors out of the slice — including #6B35B8, the `void_rune_glow.frost`
  // anchor and the purple of the two hand-placed crosses — while admitting 22
  // non-authored near-duplicates of the colors it had just evicted
  // (#6A31BB/#6A32BA/#6A32BB alongside the #6B35B8 it replaced). Authored
  // coverage went 20/28 -> 13/28 and distinct colors 35 -> 43.
  //
  // So the claim order is: what the spec names, then what the designer picked,
  // then what a cell means, then whatever a mentioned material happens to offer.
  const { required, available } = collectSpecPalette(spec);
  const authored = collectAuthoredPalette(spec);
  const semantic = collectSemanticColors(coordinates);
  const uniqueOriginal = [...new Set(coordinates.map((cell) => cell.color).filter(Boolean))].sort();

  const sourcePalette = [];
  for (const color of required) uniquePush(sourcePalette, color);
  if (authored) for (const color of [...authored].sort()) uniquePush(sourcePalette, color);

  // Tier 3 is seated against what is already in the palette, so a crystal
  // highlight that amps painted #6A31BB claims the cells of its authored partner
  // #6B35B8 (squared RGB distance 26, Euclidean 5.1 of 255) instead of taking a
  // budget slot away from it.
  const seatedRgb = sourcePalette
    .map((color) => ({ color, rgb: parseHex(color) }))
    .filter((entry) => entry.rgb);
  let semanticSuppressed = 0;
  const semanticMergeTargets = new Map();
  for (const color of semantic) {
    const partner = nearestSeatedColor(color, seatedRgb);
    if (partner) {
      semanticSuppressed += 1;
      semanticMergeTargets.set(color, partner);
      continue;
    }
    uniquePush(sourcePalette, color);
    const rgb = parseHex(color);
    if (rgb) seatedRgb.push({ color, rgb });
  }

  for (const color of available) uniquePush(sourcePalette, color);
  for (const color of uniqueOriginal) uniquePush(sourcePalette, color);
  const palette = sourcePalette.slice(0, Math.max(1, budget));
  const paletteRgb = palette
    .map((color) => ({ color, rgb: parseHex(color) }))
    .filter((entry) => entry.rgb);

  let changedCount = 0;
  const output = coordinates.map((cell) => {
    const color = nearestColor(cell.color, paletteRgb);
    if (color !== cell.color) changedCount += 1;
    return color === cell.color ? cell : { ...cell, color, quantizedFrom: cell.color };
  });
  const uniqueColors = new Set(output.map((cell) => cell.color).filter(Boolean)).size;

  // Classify what the budget actually cost. `changedCount` alone is not an
  // alarm: collapsing amp-generated intermediates onto the design's own ramp is
  // this pass working. Losing an authored or semantically-marked color is not.
  const semanticColors = new Set();
  for (const cell of coordinates) {
    if (!isSemanticCell(cell)) continue;
    const hex = normalizeHex(cell.color);
    if (hex) semanticColors.add(hex);
  }

  const destroyed = new Set();
  for (const cell of output) {
    if (!cell.quantizedFrom) continue;
    const hex = normalizeHex(cell.quantizedFrom);
    if (hex) destroyed.add(hex);
  }

  let destroyedAuthored = 0;
  let destroyedSemantic = 0;
  let destroyedSemanticMerged = 0;
  let destroyedNoise = 0;
  // Colors the design itself asked for, by name. A semantic cell that collapses
  // onto one of these kept its intended identity — the amps had simply painted it
  // a few units off — so that is the pass working, not a loss to alarm on.
  const designedColors = new Set(
    [...required, ...(authored ? [...authored] : [])]
      .map(normalizeHex)
      .filter(Boolean),
  );
  for (const hex of destroyed) {
    if (authored?.has(hex)) destroyedAuthored += 1;
    else if (semanticColors.has(hex)) {
      const partner = semanticMergeTargets.get(hex);
      if (partner && designedColors.has(partner)) destroyedSemanticMerged += 1;
      else destroyedSemantic += 1;
    }
    else destroyedNoise += 1;
  }

  return Object.freeze({
    coordinates: Object.freeze(output),
    diagnostics: Object.freeze({
      amp: 'pixelbrain.palette-quantization-amp',
      version: '1.2.0',
      budget,
      uniqueInputColors: uniqueOriginal.length,
      uniqueColors,
      palette: Object.freeze(palette),
      changedCount,
      ok: uniqueColors <= budget,
      slotsUnused: Math.max(0, budget - uniqueColors),
      // Eviction pressure lives here, not in `slotsUnused`: the slice is what
      // decides which colors exist at all. 63/64 on the VOID chestplate before
      // the authored tier existed — which is why anything promoted to the front
      // of the claim order displaces something, and why that order is the
      // security property of this pass.
      paletteSlotsUsed: palette.length,
      destroyedTotal: destroyed.size,
      destroyedAuthored,
      destroyedSemantic,
      destroyedSemanticMerged,
      destroyedNoise,
      semanticColorCandidates: semantic.length,
      semanticSuppressed,
      authoredPaletteDeclared: authored !== null,
      // How much of a declared authored palette actually reached the palette.
      // `destroyedAuthored === 0` with `authoredSeated < authoredTotal` is still
      // a loss: the color never existed to be painted with.
      authoredTotal: authored ? authored.size : null,
      authoredSeated: authored ? palette.filter((c) => authored.has(normalizeHex(c) || '')).length : null,
      alarm: destroyedAuthored > 0 || destroyedSemantic > 0,
    }),
  });
}
