/**
 * HERALDRY MICROPROCESSOR — emblem stamping for shield faces and panels.
 *
 * Handles:
 *   - emblem shape        marks from heraldry-library, scalable
 *   - emblem centering    auto-centered on the target part's centroid
 *                         (+ placement dx/dy), or absolute originX/originY
 *   - contrast            emblem color is contrast-checked against the host
 *                         face; auto-escalates to an opposing registry anchor
 *                         when the declared color would vanish (< 0.25 luma Δ)
 *   - readability         emblems never touch the face rim; coverage,
 *                         contrast, and warnings reported per entry
 *   - optional symmetry   'vertical' | 'horizontal' mirror across the
 *                         emblem center
 *   - style variants      'emboss' | 'engrave' (relief, template stage),
 *                         'inlay' | 'emit' (flat fill + optional glow ring),
 *                         'outline' (border-only recolor)
 *
 * Two stages, mirroring the Foundry pipeline:
 *   applyHeraldryTemplate(template, silhouette, spec)  — geometry + relief:
 *     stamps mark cells, retags partOf to the emblem's virtual part, and
 *     shifts slots for emboss/engrave.
 *   applyHeraldryFills(fills, spec, silhouette)        — color + diagnostics:
 *     applies inlay/emit/outline colors with the contrast guarantee and
 *     attaches readability diagnostics as `fills.heraldry`.
 *
 * Deterministic: pure functions of (spec, silhouette); no entropy.
 */

import { HERALDRY_MARKS } from './heraldry-library.js';
import { computeOutline } from './silhouette-composer.js';
import {
  MATERIAL_PALETTES,
  resolveMaterialId,
  hexToRgb,
  luminanceFromRgb,
} from './material-registry.js';

export const HERALDRY_MICROPROCESSOR_ID = 'pixelbrain.heraldry';
export const HERALDRY_MICROPROCESSOR_VERSION = '0.2.0';

const CONTRAST_FLOOR = 0.25;
const COVERAGE_MIN = 0.03;
const COVERAGE_MAX = 0.5;

const luma = (hex) => luminanceFromRgb(hexToRgb(hex));

function anchorColor(material, anchor, fallbackAnchor = 'body') {
  const def = MATERIAL_PALETTES[resolveMaterialId(material)];
  if (!def) return null;
  return def.anchors?.[anchor] || def.anchors?.[fallbackAnchor] || null;
}

/**
 * Resolve the emblem's stamp center: target part centroid (+ dx/dy), an
 * absolute placement, or the canvas center — in that order of preference.
 */
function resolveCenter(entry, spec, silhouette) {
  const placement = entry.placement || {};
  if (entry.target) {
    let sx = 0; let sy = 0; let n = 0;
    for (const [key, partId] of silhouette.partOf.entries()) {
      if (partId !== entry.target) continue;
      const [x, y] = key.split(',').map(Number);
      sx += x; sy += y; n += 1;
    }
    if (n > 0) {
      return {
        cx: Math.round(sx / n) + Math.round(Number(placement.dx) || 0),
        cy: Math.round(sy / n) + Math.round(Number(placement.dy) || 0),
      };
    }
  }
  return {
    cx: Math.round(placement.originX ?? spec.canvas.width / 2) + Math.round(Number(placement.dx) || 0),
    cy: Math.round(placement.originY ?? spec.canvas.height / 2) + Math.round(Number(placement.dy) || 0),
  };
}

/**
 * Collect the mark's cells around (cx, cy), applying scale and optional
 * symmetry. Returns a Set of "x,y" keys (unclipped).
 */
function collectMarkCells(entry, cx, cy) {
  const markFn = HERALDRY_MARKS[entry.mark];
  if (!markFn) return new Set();
  const scale = Number(entry.scale) > 0 ? Number(entry.scale) : 1;

  const raw = new Set();
  let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
  markFn(0, 0, (x, y) => {
    raw.add(`${x},${y}`);
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  });
  if (raw.size === 0) return raw;

  const scaled = new Set();
  if (scale === 1) {
    for (const key of raw) {
      const [mx, my] = key.split(',').map(Number);
      scaled.add(`${cx + mx},${cy + my}`);
    }
  } else {
    // Inverse mapping: forward-scaling discrete cells leaves rounding holes
    // when scale > 1. Iterate the scaled bounding box and include each
    // destination cell whose source maps into the mark.
    for (let y = Math.floor(minY * scale); y <= Math.ceil(maxY * scale); y += 1) {
      for (let x = Math.floor(minX * scale); x <= Math.ceil(maxX * scale); x += 1) {
        if (raw.has(`${Math.round(x / scale)},${Math.round(y / scale)}`)) {
          scaled.add(`${cx + x},${cy + y}`);
        }
      }
    }
  }

  if (entry.symmetry !== 'vertical' && entry.symmetry !== 'horizontal') return scaled;
  const cells = new Set(scaled);
  for (const key of scaled) {
    const [x, y] = key.split(',').map(Number);
    if (entry.symmetry === 'vertical') cells.add(`${cx - (x - cx)},${y}`);
    else cells.add(`${x},${cy - (y - cy)}`);
  }
  return cells;
}

/**
 * Template stage: stamp emblems into the slot map and retag region identity.
 */
export function applyHeraldryTemplate(template, silhouette, spec) {
  if (!spec.heraldry || spec.heraldry.length === 0) return template;

  const updatedCoords = [...template.coordinates];
  const coordMap = new Map();
  updatedCoords.forEach((c, idx) => coordMap.set(`${c.x},${c.y}`, idx));
  const outline = computeOutline(silhouette);

  for (const entry of spec.heraldry) {
    const { cx, cy } = resolveCenter(entry, spec, silhouette);
    const targetPartId = entry.id || 'emblem';
    const effect = entry.style?.effect || 'emboss';
    const embossMod = effect === 'engrave' ? -2 : effect === 'emboss' ? 2 : 0;
    let stampedCells = 0;

    for (const key of collectMarkCells(entry, cx, cy)) {
      const idx = coordMap.get(key);
      if (idx === undefined) continue;                 // outside the silhouette
      if (outline.has(key)) continue;                  // readability: never break the rim
      if (entry.target && silhouette.partOf.get(key) !== entry.target) continue; // containment

      silhouette.partOf.set(key, targetPartId);
      stampedCells += 1;
      if (embossMod !== 0) {
        const baseSlot = updatedCoords[idx].slot;
        // Emboss height/engrave depth so the emblem catches light naturally
        // from the material ramp.
        updatedCoords[idx] = {
          ...updatedCoords[idx],
          slot: Math.max(0, baseSlot + embossMod),
          nx: 0,
          ny: -1,
        };
      }
    }
    if (stampedCells === 0 && entry.required !== false) {
      throw new Error(`heraldry-amp: required emblem "${targetPartId}" stamped zero cells`);
    }
  }

  return { ...template, coordinates: updatedCoords };
}

/**
 * Pick the emblem's base color from its style/virtual-part declaration.
 */
function declaredEmblemColor(entry, spec) {
  const style = entry.style || {};
  if (style.material) return anchorColor(style.material, style.anchor);
  if (style.coreMaterial) return anchorColor(style.coreMaterial, style.anchor);
  const virtualPart = spec.parts.find((p) => p.id === (entry.id || 'emblem'));
  if (virtualPart?.fill?.material) return anchorColor(virtualPart.fill.material, virtualPart.fill.anchor);
  return null;
}

/**
 * Contrast guarantee: if the chosen color sits within CONTRAST_FLOOR of the
 * face luminance, escalate to the registry anchor (from the emblem's own
 * material, falling back to the face material) that maximizes contrast.
 */
function ensureContrast(color, faceLuma, materials) {
  if (color && Math.abs(luma(color) - faceLuma) >= CONTRAST_FLOOR) {
    return { color, autoContrasted: false };
  }
  let best = color;
  let bestDelta = color ? Math.abs(luma(color) - faceLuma) : -1;
  for (const material of materials) {
    const def = MATERIAL_PALETTES[resolveMaterialId(material)];
    for (const hex of Object.values(def?.anchors || {})) {
      const delta = Math.abs(luma(hex) - faceLuma);
      if (delta > bestDelta) { best = hex; bestDelta = delta; }
    }
  }
  return { color: best, autoContrasted: true };
}

/**
 * Fill stage: colorize inlay/emit/outline emblems with the contrast
 * guarantee, add emit glow rings, and report readability diagnostics.
 */
export function applyHeraldryFills(fills, spec, silhouette) {
  if (!spec.heraldry || spec.heraldry.length === 0) return fills;

  const coordIndex = new Map();
  fills.coordinates.forEach((c, idx) => coordIndex.set(`${c.x},${c.y}`, idx));
  const updated = [...fills.coordinates];
  const outline = computeOutline(silhouette);
  const diagnostics = [];

  const partCellCount = new Map();
  for (const partId of silhouette.partOf.values()) {
    partCellCount.set(partId, (partCellCount.get(partId) || 0) + 1);
  }

  for (const entry of spec.heraldry) {
    const emblemId = entry.id || 'emblem';
    const effect = entry.style?.effect || 'emboss';
    const emblemKeys = [];
    for (const [key, partId] of silhouette.partOf.entries()) {
      if (partId === emblemId) emblemKeys.push(key);
    }
    emblemKeys.sort(); // deterministic application order

    // Face = declared target, else the part the spec attaches the virtual
    // emblem part to, else the root part.
    const virtualPart = spec.parts.find((p) => p.id === emblemId);
    const facePartId = entry.target || virtualPart?.attach?.parent || spec.parts[0].id;
    const facePart = spec.parts.find((p) => p.id === facePartId);
    const faceColor = facePart?.fill?.material
      ? anchorColor(facePart.fill.material, facePart.fill.anchor)
      : '#000000';
    const faceLuma = luma(faceColor || '#000000');

    const warnings = [];
    const faceCells = (partCellCount.get(facePartId) || 0) + emblemKeys.length;
    const coverage = faceCells > 0 ? emblemKeys.length / faceCells : 0;
    if (emblemKeys.length === 0) warnings.push('emblem stamped zero cells (mark clipped away entirely)');
    if (coverage > 0 && coverage < COVERAGE_MIN) warnings.push(`emblem too small to read (coverage ${(coverage * 100).toFixed(1)}%)`);
    if (coverage > COVERAGE_MAX) warnings.push(`emblem overwhelms the face (coverage ${(coverage * 100).toFixed(1)}%)`);

    let appliedColor = null;
    let autoContrasted = false;

    if (effect === 'inlay' || effect === 'emit' || effect === 'outline') {
      const declared = declaredEmblemColor(entry, spec);
      const candidateMaterials = [
        entry.style?.material,
        entry.style?.coreMaterial,
        virtualPart?.fill?.material,
        facePart?.fill?.material,
      ].filter(Boolean);
      const ensured = ensureContrast(declared, faceLuma, candidateMaterials);
      appliedColor = ensured.color;
      autoContrasted = ensured.autoContrasted;

      const emblemSet = new Set(emblemKeys);
      for (const key of emblemKeys) {
        const idx = coordIndex.get(key);
        if (idx === undefined) continue;
        if (effect === 'outline') {
          const [x, y] = key.split(',').map(Number);
          const isBorder = [[1, 0], [-1, 0], [0, 1], [0, -1]]
            .some(([dx, dy]) => !emblemSet.has(`${x + dx},${y + dy}`));
          if (!isBorder) continue;
        }
        if (appliedColor) updated[idx] = { ...updated[idx], color: appliedColor };
      }

      // Emit style: a glow ring on the face around the emblem.
      if (effect === 'emit' && entry.style?.glowMaterial) {
        const glowColor = anchorColor(entry.style.glowMaterial, entry.style.glowAnchor);
        const radius = Math.max(1, Math.round(Number(entry.style.glowRadius) || 1));
        if (glowColor) {
          for (const key of emblemKeys) {
            const [x, y] = key.split(',').map(Number);
            for (let dy = -radius; dy <= radius; dy += 1) {
              for (let dx = -radius; dx <= radius; dx += 1) {
                const nKey = `${x + dx},${y + dy}`;
                if (emblemSet.has(nKey) || outline.has(nKey)) continue;
                if (silhouette.partOf.get(nKey) !== facePartId) continue;
                const nIdx = coordIndex.get(nKey);
                if (nIdx !== undefined) updated[nIdx] = { ...updated[nIdx], color: glowColor };
              }
            }
          }
        }
      }
    }

    const contrast = appliedColor ? Math.abs(luma(appliedColor) - faceLuma) : null;
    if (contrast !== null && contrast < CONTRAST_FLOOR) {
      warnings.push(`emblem contrast ${contrast.toFixed(2)} below the ${CONTRAST_FLOOR} readability floor`);
    }

    diagnostics.push(Object.freeze({
      microprocessor: HERALDRY_MICROPROCESSOR_ID,
      version: HERALDRY_MICROPROCESSOR_VERSION,
      id: emblemId,
      mark: entry.mark,
      effect,
      cells: emblemKeys.length,
      coverage: Number(coverage.toFixed(4)),
      contrast: contrast === null ? null : Number(contrast.toFixed(4)),
      color: appliedColor,
      autoContrasted,
      warnings: Object.freeze(warnings),
    }));
  }

  return Object.freeze({
    ...fills,
    coordinates: Object.freeze(updated),
    heraldry: Object.freeze(diagnostics),
  });
}
