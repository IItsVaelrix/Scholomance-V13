/**
 * chestplate-bevel-amp.js
 *
 * Deterministic trim/plate beveling for chestplate-class assets. It operates
 * after region fills so it can reinforce actual material colors, but before
 * final sharpness and quantization.
 */

import { MATERIAL_PALETTES, resolveMaterialId } from './material-registry.js';
import { clamp01 } from './shared.js';

function parseHex(hex) {
  const raw = String(hex || '').replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) return null;
  const n = parseInt(raw, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function toHex(rgb) {
  return `#${[rgb.r, rgb.g, rgb.b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

function mix(a, b, amount) {
  const t = clamp01(amount);
  return {
    r: a.r + ((b.r - a.r) * t),
    g: a.g + ((b.g - a.g) * t),
    b: a.b + ((b.b - a.b) * t),
  };
}

function resolveAnchor(part, kind, anchor) {
  const material = part?.[kind]?.material || part?.fill?.material;
  const def = MATERIAL_PALETTES[resolveMaterialId(material)];
  return def?.anchors?.[anchor] || null;
}

function neighborKey(cell, dx, dy) {
  return `${Math.round(cell.x) + dx},${Math.round(cell.y) + dy}`;
}

export function applyChestplateBevel(fills, spec) {
  if (!fills || spec.class !== 'armor' || !String(spec.archetype || '').includes('chestplate')) return fills;
  const strength = spec.fidelity?.bevelStrength ?? 0.72;
  if (strength <= 0) return fills;

  const partById = new Map(spec.parts.map((part) => [part.id, part]));
  const coordMap = new Map(fills.coordinates.map((cell) => [`${cell.x},${cell.y}`, cell]));
  let changedCount = 0;
  let highlightCount = 0;
  let shadowCount = 0;

  const coordinates = fills.coordinates.map((cell) => {
    const part = partById.get(cell.partId);
    if (!part || (!part.trim && !part.outline)) return cell;
    const rgb = parseHex(cell.color);
    if (!rgb) return cell;

    const missingTop = !coordMap.has(neighborKey(cell, 0, -1));
    const missingLeft = !coordMap.has(neighborKey(cell, -1, 0));
    const missingRight = !coordMap.has(neighborKey(cell, 1, 0));
    const missingBottom = !coordMap.has(neighborKey(cell, 0, 1));
    const isTrimOrRim = cell.isRim || part.trim;
    if (!isTrimOrRim) return cell;

    let target = null;
    let role = null;
    if (missingTop || missingLeft) {
      target = resolveAnchor(part, 'trim', 'whiteCore') || resolveAnchor(part, 'fill', 'frost');
      role = 'bevel-highlight';
      highlightCount += 1;
    } else if (missingRight || missingBottom) {
      target = resolveAnchor(part, 'trim', 'shadow') || resolveAnchor(part, 'outline', 'void');
      role = 'bevel-shadow';
      shadowCount += 1;
    }
    const targetRgb = parseHex(target);
    if (!targetRgb) return cell;
    changedCount += 1;
    return {
      ...cell,
      color: toHex(mix(rgb, targetRgb, role === 'bevel-highlight' ? strength * 0.42 : strength * 0.36)),
      chestplateBevel: role,
    };
  });

  return Object.freeze({
    ...fills,
    coordinates: Object.freeze(coordinates),
    chestplateBevel: Object.freeze({
      amp: 'pixelbrain.chestplate-bevel-amp',
      version: '1.0.0',
      changedCount,
      highlightCount,
      shadowCount,
      strength,
    }),
  });
}
