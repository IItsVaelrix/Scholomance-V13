/**
 * chestplate-surface-texture-amp.js
 *
 * Deterministic material texture for chestplate surfaces. This is not noise
 * as entropy; it is coordinate-hashed clustering that maps back to registry
 * anchors so final output stays reproducible and palette-bounded.
 */

import { MATERIAL_PALETTES, resolveMaterialId } from './material-registry.js';
import { hashString } from './shared.js';

function anchor(part, key) {
  const material = part?.fill?.material;
  const def = MATERIAL_PALETTES[resolveMaterialId(material)];
  return def?.anchors?.[key] || null;
}

function shouldTexture(cell, spec) {
  if (cell.isRim || cell.isMotif || cell.crystalCore || cell.crystalGlow) return false;
  if (cell.partId === 'emblem' || cell.partId === 'rune_channels' || cell.partId === 'harness') return false;
  if (cell.partId === 'center_core' || cell.partId === 'top_crystal' || cell.partId === 'lower_drop') return false;
  const h = hashString(`${spec.seed}:${cell.partId}:${cell.x}:${cell.y}`);
  return h % 31 === 0;
}

export function applyChestplateSurfaceTexture(fills, spec) {
  if (!fills || spec.class !== 'armor' || !String(spec.archetype || '').includes('chestplate')) return fills;
  if (spec.fidelity?.noiseFloor !== 'low' && spec.fidelity?.noiseFloor !== 'none') return fills;

  const partById = new Map(spec.parts.map((part) => [part.id, part]));
  let changedCount = 0;
  const coordinates = fills.coordinates.map((cell) => {
    const part = partById.get(cell.partId);
    if (!part || !shouldTexture(cell, spec)) return cell;

    const h = hashString(`texture:${spec.seed}:${cell.x},${cell.y}:${cell.partId}`);
    const target = h % 4 === 0
      ? anchor(part, 'shadow')
      : h % 4 === 1
        ? anchor(part, 'deep')
        : null;
    if (!target || target === cell.color) return cell;
    changedCount += 1;
    return {
      ...cell,
      color: target,
      chestplateTexture: h % 3 === 2 ? 'material-fleck-highlight' : 'material-fleck-shadow',
    };
  });

  return Object.freeze({
    ...fills,
    coordinates: Object.freeze(coordinates),
    chestplateSurfaceTexture: Object.freeze({
      amp: 'pixelbrain.chestplate-surface-texture-amp',
      version: '1.0.0',
      changedCount,
    }),
  });
}
