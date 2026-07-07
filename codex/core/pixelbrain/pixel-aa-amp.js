/**
 * pixel-aa-amp.js
 * Anti-Aliasing pass for pixel art.
 * Softens 1-cell silhouette stair-steps by recoloring the inner corner cell.
 */

import { clamp01 } from './shared.js';

function parseHex(hex) {
  const m = hex.replace('#', '');
  return {
    r: parseInt(m.slice(0, 2), 16),
    g: parseInt(m.slice(2, 4), 16),
    b: parseInt(m.slice(4, 6), 16),
  };
}

function rgbToHex(r, g, b) {
  return `#${[r, g, b].map(x => Math.round(x).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

export function applyPixelAA(fills, spec) {
  const coordMap = new Map();
  fills.coordinates.forEach(c => coordMap.set(`${c.x},${c.y}`, c));

  const isFilled = (x, y) => coordMap.has(`${x},${y}`);
  const isRim = (x, y) => coordMap.get(`${x},${y}`)?.isRim;

  const updated = fills.coordinates.map(cell => {
    // Only act on interior cells
    if (cell.isRim || cell.isMotif) return cell;

    const x = cell.x;
    const y = cell.y;

    // Check 4 diagonal quadrants for the 2x2 corner pattern
    const quadrants = [
      { dx: -1, dy: -1 },
      { dx: 1, dy: -1 },
      { dx: -1, dy: 1 },
      { dx: 1, dy: 1 },
    ];

    for (const q of quadrants) {
      const ex = x + q.dx;
      const ey = y + q.dy;
      const r1x = x + q.dx;
      const r1y = y;
      const r2x = x;
      const r2y = y + q.dy;

      // The pattern: empty corner, two rim neighbors
      if (!isFilled(ex, ey) && isRim(r1x, r1y) && isRim(r2x, r2y)) {
        const r1 = coordMap.get(`${r1x},${r1y}`);
        const r2 = coordMap.get(`${r2x},${r2y}`);
        
        // Exempt if motifs are involved
        if (r1.isMotif || r2.isMotif) continue;

        // Exempt straight 90 degree corners:
        // If it's a stair-step, the rim continues immediately inward.
        // If r1 and r2 both continue straight for > 1 cell, it's a hard corner.
        const r1Continues = isRim(r1x + q.dx, r1y);
        const r2Continues = isRim(r2x, r2y + q.dy);
        if (r1Continues && r2Continues) continue; // Hard 90-degree corner

        // Connective Tissue (Slot-based blending)
        // If the cells have slots (e.g. from SketchAMP), blend the structural meaning.
        let blendedSlot = cell.slot;
        let isRimCell = cell.isRim;
        
        if (cell.slot !== undefined && r1.slot !== undefined && r2.slot !== undefined) {
          const rimSlotAvg = (r1.slot + r2.slot) / 2;
          blendedSlot = Math.round((cell.slot + rimSlotAvg) / 2);
          isRimCell = blendedSlot === 0;
        }

        // Always compute a blended fallback color so pipeline doesn't crash on null.
        // If this is a template, fillTemplate will override it using the new slot.
        // If this is a filled asset, palette-quantization-amp will snap it to the palette.
        const c1 = parseHex(r1.color);
        const c2 = parseHex(r2.color);
        const rimColor = {
          r: (c1.r + c2.r) / 2,
          g: (c1.g + c2.g) / 2,
          b: (c1.b + c2.b) / 2,
        };
        const cCore = parseHex(cell.color);
        
        const blended = rgbToHex(
          (cCore.r + rimColor.r) / 2,
          (cCore.g + rimColor.g) / 2,
          (cCore.b + rimColor.b) / 2
        );

        return { 
          ...cell, 
          slot: blendedSlot !== undefined ? blendedSlot : cell.slot,
          isRim: isRimCell !== undefined ? isRimCell : cell.isRim,
          color: blended,
          colorProvenance: Object.freeze({
            amp: 'pixel-aa-amp',
            version: '1.0.0',
            kind: 'inner-corner-50-50',
            inputs: Object.freeze([cell.color, r1.color, r2.color]),
            formula: 'cell50_rimAverage50',
          }),
        };
      }
    }

    return cell;
  });

  return Object.freeze({ ...fills, coordinates: Object.freeze(updated) });
}
