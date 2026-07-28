/**
 * Canvas vessel — node-canvas pixel put
 */

import { createRequire } from 'node:module';
import { parseHex } from './specimen.js';
import { contentHash } from './schema.js';

const require = createRequire(import.meta.url);

export function vesselCanvas(specimen) {
  let createCanvas;
  try {
    ({ createCanvas } = require('canvas'));
  } catch (err) {
    throw new Error(`REALIZATION_EQUIV_CANVAS_REQUIRED: ${err.message}`);
  }

  const canvas = createCanvas(specimen.width, specimen.height);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(specimen.width, specimen.height);
  const partMap = new Array(specimen.width * specimen.height).fill(null);
  const pathMap = new Array(specimen.width * specimen.height).fill(null);
  const curvMap = new Float64Array(specimen.width * specimen.height);
  const salMap = new Float64Array(specimen.width * specimen.height);

  for (const c of specimen.cells) {
    const x = Math.round(c.x);
    const y = Math.round(c.y);
    if (x < 0 || y < 0 || x >= specimen.width || y >= specimen.height) continue;
    const i = y * specimen.width + x;
    const { r, g, b, a } = parseHex(c.color);
    const o = i * 4;
    img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = a;
    partMap[i] = c.partId;
    pathMap[i] = c.pathRef;
    curvMap[i] = c.curvature ?? 0;
    salMap[i] = c.salience ?? 0;
  }
  ctx.putImageData(img, 0, 0);
  const rgba = new Uint8ClampedArray(img.data);

  return {
    id: 'canvas',
    backend: 'node-canvas',
    scale: 1,
    width: specimen.width,
    height: specimen.height,
    rgba,
    partMap,
    pathMap,
    curvMap,
    salMap,
    artifactHash: contentHash({
      backend: 'canvas',
      png: canvas.toBuffer('image/png').toString('base64'),
    }),
  };
}
