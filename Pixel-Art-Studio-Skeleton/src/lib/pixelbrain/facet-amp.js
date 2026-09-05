/**
 * facet-amp.js
 * Faceting pass for gem-class parts.
 * Partitions the part into planar regions and shades them flat.
 */

import { hashString } from './shared.js';
import { resolveMaterialId, MATERIAL_PALETTES } from './material-registry.js';

function getFacetAnchor(dot) {
  if (dot > 0.6) return 'whiteCore';
  if (dot > 0.2) return 'frost';
  if (dot > -0.2) return 'body';
  if (dot > -0.6) return 'shadow';
  return 'void';
}

export function applyFacets(fills, spec, materialResolver, lightOptions) {
  if (!lightOptions) return fills;

  const lightAngle = lightOptions.angle ?? (Math.PI * 1.25);
  const Lx = Math.cos(lightAngle);
  const Ly = Math.sin(lightAngle);

  // Find faceted parts
  const facetedParts = spec.parts.filter(p => p.shading === 'faceted');
  if (facetedParts.length === 0) return fills;

  // Compute centers
  const partCenters = new Map();
  for (const part of facetedParts) {
    let sumX = 0, sumY = 0, count = 0;
    for (const c of fills.coordinates) {
      if (c.partId === part.id && !c.isRim) {
        sumX += c.x;
        sumY += c.y;
        count++;
      }
    }
    if (count > 0) {
      partCenters.set(part.id, { cx: Math.round(sumX / count), cy: Math.round(sumY / count) });
    }
  }

  const updated = fills.coordinates.map(cell => {
    if (cell.isRim || cell.isMotif) return cell;

    const part = facetedParts.find(p => p.id === cell.partId);
    if (!part) return cell;

    const center = partCenters.get(part.id);
    if (!center) return cell;

    const dx = cell.x - center.cx;
    const dy = cell.y - center.cy;

    // Determine facet based on angle
    // 4 facets: top, right, bottom, left
    let nx = 0, ny = 0;
    if (Math.abs(dx) > Math.abs(dy)) {
      nx = dx > 0 ? 1 : -1;
    } else {
      ny = dy > 0 ? 1 : -1;
    }

    const dot = nx * Lx + ny * Ly;
    const anchor = getFacetAnchor(dot);

    const material = part.fill?.material || 'source';
    let color = materialResolver({ material, anchor });

    // Sparkle at center (junction)
    if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1 && dot > 0.5 && dx*dx + dy*dy <= 1) {
       color = materialResolver({ material, anchor: 'whiteCore' });
    }

    if (color) {
      return { ...cell, color };
    }
    return cell;
  });

  return Object.freeze({ ...fills, coordinates: Object.freeze(updated) });
}
