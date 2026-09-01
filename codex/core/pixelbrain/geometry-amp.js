/**
 * geometry-amp.js
 *
 * Geometry AMP converts composed PixelBrain item geometry into deterministic
 * shader masks and construction diagnostics. It does not draw pixels; it gives
 * shader forge enough structure to shade parts differently.
 */

import { hashString } from './shared.js';
import { extractQBITGraph } from './qbit-node-extractor.js';

export function boundsForPart(partOf, partId) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let count = 0;
  partOf.forEach((pid, key) => {
    if (pid !== partId) return;
    const [x, y] = key.split(',').map(Number);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    count += 1;
  });
  if (!count) return null;
  return Object.freeze({
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
    centerX: Number(((minX + maxX) / 2).toFixed(4)),
    centerY: Number(((minY + maxY) / 2).toFixed(4)),
    count,
  });
}

/**
 * The set of cells belonging to one part — its "shape" — as a sorted,
 * frozen {x,y} list. Extracted so other consumers that need "which cells
 * does part X occupy" (e.g. the SCDL cross-part boolean-op resolver) reuse
 * the same silhouette-indexed lookup this AMP already builds per part,
 * instead of re-deriving it.
 */
export function buildPartMask(partOf, partId) {
  const cells = [];
  partOf.forEach((pid, key) => {
    if (pid !== partId) return;
    const [x, y] = key.split(',').map(Number);
    cells.push(Object.freeze({ x, y }));
  });
  cells.sort((a, b) => (a.y - b.y) || (a.x - b.x));
  return Object.freeze(cells);
}

function classifyRole(part) {
  const id = String(part.id || '');
  const profile = String(part.profile || '');
  if (id.includes('pauldron') || id.includes('shoulder')) return 'shoulder_enamel';
  if (id.includes('core') || id.includes('crystal') || id.includes('drop')) return 'crystal_core';
  if (id.includes('emblem') || id.includes('rune') || id.includes('harness')) return 'glyph_glow';
  if (id.includes('mantle')) return 'void_mantle';
  if (profile.includes('collar')) return 'collar';
  if (id === 'body' || profile.includes('chestplate')) return 'body_voidsteel';
  return 'detail';
}

function resolvePartField(partById, part, field, seen = new Set()) {
  if (!part) return null;
  if (part[field]) return part[field];
  if (!part.mirrorOf || seen.has(part.id)) return null;
  seen.add(part.id);
  return resolvePartField(partById, partById.get(part.mirrorOf), field, seen);
}

function uvBounds(bounds, canvas) {
  return Object.freeze({
    minX: Number((bounds.minX / canvas.width).toFixed(6)),
    maxX: Number(((bounds.maxX + 1) / canvas.width).toFixed(6)),
    minY: Number((bounds.minY / canvas.height).toFixed(6)),
    maxY: Number(((bounds.maxY + 1) / canvas.height).toFixed(6)),
    centerX: Number((bounds.centerX / canvas.width).toFixed(6)),
    centerY: Number((bounds.centerY / canvas.height).toFixed(6)),
    radiusX: Number((Math.max(1, bounds.width) / canvas.width / 2).toFixed(6)),
    radiusY: Number((Math.max(1, bounds.height) / canvas.height / 2).toFixed(6)),
  });
}

export function buildGeometryAmpPayload({ spec, silhouette, construction = null } = {}) {
  if (!spec || !silhouette) {
    throw new Error('geometry-amp: spec and silhouette are required');
  }
  const parts = [];
  const masks = Object.create(null);
  const roleCounts = Object.create(null);
  const partById = new Map(spec.parts.map((part) => [part.id, part]));

  const qbitGraphs = extractQBITGraph(silhouette, spec.canvas);

  for (const part of spec.parts) {
    const bounds = boundsForPart(silhouette.partOf, part.id);
    if (!bounds) continue;
    masks[part.id] = buildPartMask(silhouette.partOf, part.id);
    const role = classifyRole(part);
    roleCounts[role] = (roleCounts[role] || 0) + bounds.count;
    parts.push(Object.freeze({
      id: part.id,
      role,
      material: resolvePartField(partById, part, 'fill')?.material || null,
      trim: resolvePartField(partById, part, 'trim')?.material || null,
      outline: resolvePartField(partById, part, 'outline')?.material || null,
      bounds,
      uv: uvBounds(bounds, spec.canvas),
      qbit: qbitGraphs.get(part.id) ?? null,
    }));
  }

  const body = parts.find((part) => part.role === 'body_voidsteel');
  const shoulders = parts.filter((part) => part.role === 'shoulder_enamel');
  const shoulderSpan = shoulders.length
    ? Math.max(...shoulders.map((p) => p.bounds.maxX)) - Math.min(...shoulders.map((p) => p.bounds.minX)) + 1
    : 0;

  const payload = Object.freeze({
    amp: 'pixelbrain.geometry-amp',
    version: '1.0.0',
    specId: spec.id,
    canvas: spec.canvas,
    parts: Object.freeze(parts),
    roleCounts: Object.freeze({ ...roleCounts }),
    masks: Object.freeze({ ...masks }),
    construction: construction?.hints || construction?.constructionHints || null,
    posture: Object.freeze({
      bodyCenterX: body?.bounds.centerX ?? spec.canvas.width / 2,
      bodyCenterY: body?.bounds.centerY ?? spec.canvas.height / 2,
      shoulderSpan,
      shoulderToBodyRatio: body ? Number((shoulderSpan / Math.max(1, body.bounds.width)).toFixed(4)) : 0,
    }),
  });

  return Object.freeze({
    ...payload,
    hash: `fnv1a_${hashString(JSON.stringify(payload)).toString(16).toUpperCase().padStart(8, '0')}`,
  });
}
