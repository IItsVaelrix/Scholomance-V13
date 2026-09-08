/**
 * Tutorial Forest — SCD128 Grass Tile Generator
 *
 * Produces crisp 1x pixel art 80x40 isometric diamond grass tiles, cliff faces,
 * and terrain variations adhering to the Anti-Vector Invariant:
 * - Pure integer / discrete cell coordinates.
 * - 8-stop hue-shifted palettes (Verdant Glade, Mossy Grove, Path Verge).
 * - Cellular SWARD noise for organic blade tufts.
 * - 2x2 Bayer dithering at tonal boundaries.
 */

import { GRASS_PALETTES } from '../scd128/grassTileWitness.js';

const BAYER_2X2 = [
  [0, 2],
  [3, 1],
];

function pseudoNoise(x, y, seed = 1337) {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n >>> 0) % 1000) / 1000;
}

function smoothNoise(x, y, seed = 1337) {
  const s = 0.12;
  const v1 = Math.sin(x * s + y * s * 0.7 + seed);
  const v2 = Math.cos(x * s * 0.8 - y * s + seed * 1.5);
  const v3 = Math.sin((x + y) * s * 0.5);
  return (v1 + v2 + v3) / 3;
}

/**
 * Generates an 80x40 isometric diamond grass tile.
 */
export function generateGrassTile({
  variant = 'glade_lush',
  paletteKey = 'verdant_glade',
  seed = 4242,
  hasCliff = false,
  cliffHeight = 24,
}) {
  const width = 80;
  const height = hasCliff ? 40 + cliffHeight : 40;
  const palette = GRASS_PALETTES[paletteKey] || GRASS_PALETTES.verdant_glade;
  const colorRamp = [palette.c0, palette.c1, palette.c2, palette.c3, palette.c4, palette.c5, palette.c6, palette.c7];

  const cells = [];
  const diamondH = 40;
  const halfW = 40;
  const halfH = 20;

  for (let y = 0; y < diamondH; y += 1) {
    for (let x = 0; x < width; x += 1) {
      // Test diamond equation: |x - cx|/halfW + |y - cy|/halfH <= 1
      const dx = Math.abs(x - 39.5) / halfW;
      const dy = Math.abs(y - 19.5) / halfH;
      const dist = dx + dy;

      if (dist <= 1.0) {
        // Base lighting gradient (directional light from upper-left)
        const lightGrad = (1 - (x / width * 0.4 + y / diamondH * 0.6));
        const noise = smoothNoise(x, y, seed);
        const detail = pseudoNoise(x, y, seed);

        // Calculate discrete tone index [0..7]
        let toneFloat = (lightGrad * 0.5 + (noise + 1) * 0.25) * 7.5;
        if (variant === 'clearing_open') toneFloat += 0.8;
        if (variant === 'mossy_shade') toneFloat -= 0.6;

        const bayer = (BAYER_2X2[y % 2][x % 2] - 1.5) / 4;
        const toneIndex = Math.max(0, Math.min(7, Math.round(toneFloat + bayer)));
        let color = colorRamp[toneIndex];

        // Discrete blade tufts stippling
        if (detail > 0.88 && dist < 0.9) {
          color = colorRamp[Math.min(7, toneIndex + 1)];
        } else if (detail < 0.08 && dist < 0.9) {
          color = colorRamp[Math.max(0, toneIndex - 1)];
        }

        // Flower flecks in glade & meadow
        if (variant === 'flower_carpet' || (variant === 'glade_lush' && detail > 0.96 && dist < 0.8)) {
          color = detail > 0.985 ? palette.flower_rare : palette.flower_accent;
        }

        // Dark rim outline for tile definition
        if (dist >= 0.96) {
          color = palette.c1;
        }

        cells.push({ x, y, color });
      }
    }
  }

  // Cliff drop face extrusion
  if (hasCliff) {
    const soilRamp = [palette.soil_dark, palette.soil_mid, palette.soil_hi];
    for (let dy = 0; dy < cliffHeight; dy += 1) {
      for (let x = 0; x < width; x += 1) {
        // Find bottom rim Y for this X column
        const xOffset = Math.abs(x - 39.5) / halfW;
        if (xOffset <= 1.0) {
          const rimY = Math.floor(19.5 + (1.0 - xOffset) * halfH);
          const py = rimY + dy;
          if (py < height) {
            const cliffNoise = pseudoNoise(x, py, seed + 99);
            const striation = Math.sin(py * 0.8 + x * 0.1);
            let sIdx = striation > 0.3 ? 2 : striation < -0.3 ? 0 : 1;
            if (cliffNoise > 0.85) sIdx = Math.min(2, sIdx + 1);

            // Clinging moss near the top rim
            let cliffColor = soilRamp[sIdx];
            if (dy <= 3 && cliffNoise > 0.4) {
              cliffColor = palette.c2;
            }

            cells.push({ x, y: py, color: cliffColor });
          }
        }
      }
    }
  }

  return {
    variant,
    paletteKey,
    width,
    height,
    cells,
  };
}
