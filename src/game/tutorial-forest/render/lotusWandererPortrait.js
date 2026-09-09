/** Browser-side raster of the lotus_wanderer SCDL character, for React UI (not Phaser). */
import { compileCharacterPortrait } from '../scdl/scdlCharacterCompiler.js';

function hexToRgb(hex) {
  const clean = String(hex).replace('#', '').padEnd(6, '0');
  return {
    r: Number.parseInt(clean.slice(0, 2), 16) || 0,
    g: Number.parseInt(clean.slice(2, 4), 16) || 0,
    b: Number.parseInt(clean.slice(4, 6), 16) || 0,
  };
}

function rasterizeCells(width, height, cells) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  context.imageSmoothingEnabled = false;
  const imageData = context.createImageData(width, height);
  for (const cell of cells) {
    if (cell.x < 0 || cell.y < 0 || cell.x >= width || cell.y >= height) continue;
    const offset = (cell.y * width + cell.x) * 4;
    const { r, g, b } = hexToRgb(cell.color);
    imageData.data[offset] = r;
    imageData.data[offset + 1] = g;
    imageData.data[offset + 2] = b;
    imageData.data[offset + 3] = cell.alpha ?? 255;
  }
  context.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}

const portraitCache = new Map();

/** Data URL for the idle south-facing lotus_wanderer, redrawn only when the weapon slot changes. */
export function getLotusWandererPortraitUrl({ equipped } = {}) {
  const cacheKey = equipped?.weapon ? 'weapon' : 'unarmed';
  if (portraitCache.has(cacheKey)) return portraitCache.get(cacheKey);

  const portrait = compileCharacterPortrait({ equipped });
  const url = rasterizeCells(portrait.canvas.width, portrait.canvas.height, portrait.cells);
  portraitCache.set(cacheKey, url);
  return url;
}
