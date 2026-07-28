/**
 * Lattice / ablation vessels (reference, pixel-only, vector-only, scales)
 */

import { rasterizeCells, normalizeSpecimen, scaleSpecimen } from './specimen.js';

export function vesselReference(specimen) {
  const raster = rasterizeCells(specimen);
  return {
    id: 'reference',
    backend: 'vixel-lattice',
    scale: 1,
    ...raster,
  };
}

export function vesselPixelOnly(specimen) {
  const ablated = {
    ...specimen,
    cells: specimen.cells.map((c) => ({
      ...c,
      pathRef: null,
      curvature: 0,
    })),
  };
  const raster = rasterizeCells(ablated);
  return { id: 'pixel-only', backend: 'pixel-ablation', scale: 1, ...raster };
}

export function vesselVectorOnly(specimen) {
  // Keep geometry/path; neutralize material color to role-hashed greys
  const ablated = {
    ...specimen,
    cells: specimen.cells.map((c) => {
      const path = c.pathRef || 'none';
      let h = 0;
      for (let i = 0; i < path.length; i++) h = (h * 31 + path.charCodeAt(i)) >>> 0;
      const g = 40 + (h % 180);
      const hex = g.toString(16).padStart(2, '0');
      return {
        ...c,
        color: `#${hex}${hex}${hex}`,
        material: null,
      };
    }),
  };
  const raster = rasterizeCells(ablated);
  return { id: 'vector-only', backend: 'vector-ablation', scale: 1, ...raster };
}

export function vesselScaled(specimen, scale, baseId = 'reference') {
  const scaled = scaleSpecimen(specimen, scale);
  const raster = rasterizeCells(scaled);
  return {
    id: `${baseId}@${scale}x`,
    backend: `${baseId}-scale`,
    scale,
    ...raster,
  };
}

export function prepareSpecimen(input) {
  return normalizeSpecimen(input);
}
