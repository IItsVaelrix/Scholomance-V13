/**
 * selout-amp.js
 * Selective Outline (selout) pass.
 * Modulates the outline color based on light orientation.
 */

import { resolveMaterialId } from './material-registry.js';

export function applySelout(fills, spec, materialResolver, lightOptions) {
  if (!lightOptions) return fills;

  const lightAngle = lightOptions.angle ?? (Math.PI * 1.25);
  const Lx = Math.cos(lightAngle);
  const Ly = Math.sin(lightAngle);
  const threshold = 0.3;

  const updated = fills.coordinates.map(cell => {
    if (!cell.isRim) return cell;

    const { nx, ny } = cell;
    if (nx === undefined || ny === undefined) return cell;

    const dot = nx * Lx + ny * Ly;
    let anchorOverride = null;
    if (dot > threshold) {
      anchorOverride = 'body';
    } else if (dot < -threshold) {
      anchorOverride = 'void';
    } else {
      return cell; // keep declared
    }

    const part = spec.parts.find(p => p.id === cell.partId);
    if (!part) return cell;

    const material = part.outline?.material || part.fill?.material || 'source';
    const color = materialResolver({ material, anchor: anchorOverride });
    
    if (color) {
      return { ...cell, color };
    }
    return cell;
  });

  return Object.freeze({ ...fills, coordinates: Object.freeze(updated) });
}
