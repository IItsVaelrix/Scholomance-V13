/**
 * crystal-core-amp.js
 *
 * Structured sternum crystal/core pass for deterministic chestplate assets.
 * It creates facets and a contained glow from the generated core part cells.
 */

import { MATERIAL_PALETTES, resolveMaterialId } from './material-registry.js';

function resolve(part, field, anchor) {
  const material = part?.[field]?.material || part?.fill?.material;
  const def = MATERIAL_PALETTES[resolveMaterialId(material)];
  return def?.anchors?.[anchor] || null;
}

function bounds(cells) {
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
  return Number.isFinite(minX) ? { minX, maxX, minY, maxY } : null;
}

export function applyCrystalCore(fills, spec, silhouette) {
  if (!fills || spec.class !== 'armor' || !String(spec.archetype || '').includes('chestplate')) return fills;
  const corePart = spec.parts.find((part) => part.id === 'center_core' || part.profile?.startsWith('gem.socket.void'));
  if (!corePart) return fills;

  const coreKeys = new Set();
  silhouette.partOf.forEach((partId, key) => {
    if (partId === corePart.id) coreKeys.add(key);
  });
  if (coreKeys.size === 0) return fills;

  const coreCells = fills.coordinates.filter((cell) => coreKeys.has(`${cell.x},${cell.y}`));
  const box = bounds(coreCells);
  if (!box) return fills;
  const cx = (box.minX + box.maxX) / 2;
  const cy = (box.minY + box.maxY) / 2;
  const rx = Math.max(1, (box.maxX - box.minX) / 2);
  const ry = Math.max(1, (box.maxY - box.minY) / 2);

  const white = resolve(corePart, 'fill', 'whiteCore') || '#FFFFFF';
  const spectral = resolve(corePart, 'fill', 'spectral') || white;
  const frost = resolve(corePart, 'fill', 'frost') || spectral;
  const body = resolve(corePart, 'fill', 'body') || frost;
  const deep = resolve(corePart, 'fill', 'deep') || body;
  const outline = resolve(corePart, 'outline', 'deep') || deep;
  let changedCount = 0;

  const containment = spec.fidelity?.centralGlowContainment ?? 0.88;
  const coordinates = fills.coordinates.map((cell) => {
    const key = `${cell.x},${cell.y}`;
    const isCore = coreKeys.has(key);
    if (!isCore) {
      if (!corePart.glow) return cell;
      const dx = Math.abs(cell.x - cx);
      const dy = Math.abs(cell.y - cy);
      const radius = Math.max(1, Number(corePart.glow.radius || 0));
      const nearCore = dx <= rx + radius && dy <= ry + radius;
      const interiorPart = cell.partId === 'body' || cell.partId === 'emblem' || cell.partId === 'rune_channels';
      if (!nearCore || !interiorPart) return cell;
      const distance = Math.hypot(dx / (rx + radius), dy / (ry + radius));
      if (distance > containment) return cell;
      changedCount += 1;
      return {
        ...cell,
        color: distance < 0.68 ? frost : body,
        crystalGlow: 'contained-glow',
      };
    }

    const nx = Math.abs((cell.x - cx) / rx);
    const ny = Math.abs((cell.y - cy) / ry);
    const d = Math.hypot(nx, ny);
    let color = deep;
    let role = 'facet-rim';
    if (d < 0.26) {
      color = white;
      role = 'facet-core';
    } else if (d < 0.48) {
      color = spectral;
      role = 'facet-inner';
    } else if (Math.abs(nx - ny) < 0.22 || ny < 0.35) {
      color = frost;
      role = 'facet-plane';
    } else if (d > 0.84) {
      color = outline;
      role = 'facet-containment';
    } else {
      color = body;
      role = 'facet-body';
    }
    changedCount += 1;
    return { ...cell, color, crystalCore: role };
  });

  return Object.freeze({
    ...fills,
    coordinates: Object.freeze(coordinates),
    crystalCore: Object.freeze({
      amp: 'pixelbrain.crystal-core-amp',
      version: '1.0.0',
      partId: corePart.id,
      changedCount,
      containment,
    }),
  });
}
