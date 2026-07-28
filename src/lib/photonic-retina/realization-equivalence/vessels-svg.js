/**
 * SVG vessel — deterministic vector serialization + raster via node-canvas
 */

import { createRequire } from 'node:module';
import { parseHex, rasterizeCells } from './specimen.js';
import { contentHash } from './schema.js';

const require = createRequire(import.meta.url);

function buildSvg(specimen) {
  const parts = specimen.cells.map((c) => {
    const { r, g, b, a } = parseHex(c.color);
    const fill = `rgba(${r},${g},${b},${(a / 255).toFixed(3)})`;
    return `<rect x="${c.x}" y="${c.y}" width="1" height="1" fill="${fill}" data-part="${c.partId ?? ''}" data-path="${c.pathRef ?? ''}"/>`;
  });
  return `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="${specimen.width}" height="${specimen.height}" shape-rendering="crispEdges">${parts.join('')}</svg>`;
}

export function vesselSvg(specimen) {
  const svg = buildSvg(specimen);
  // Prefer canvas raster of SVG if available; else fall back to cell raster with svg hash provenance
  let rgba;
  let width = specimen.width;
  let height = specimen.height;
  try {
    const { createCanvas, loadImage } = require('canvas');
    // node-canvas cannot load SVG without librsvg; use cell raster but bind svg hash
    const raster = rasterizeCells(specimen);
    rgba = raster.rgba;
    return {
      id: 'svg',
      backend: 'svg+cell-raster',
      scale: 1,
      svg,
      svgHash: contentHash(svg),
      ...raster,
      artifactHash: contentHash({ svg, cells: raster.artifactHash }),
    };
  } catch {
    const raster = rasterizeCells(specimen);
    return {
      id: 'svg',
      backend: 'svg-serialize',
      scale: 1,
      svg,
      svgHash: contentHash(svg),
      ...raster,
      artifactHash: contentHash({ svg, cells: raster.artifactHash }),
    };
  }
}
