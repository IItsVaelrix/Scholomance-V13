/**
 * Tutorial Forest — SCD128 Path & Prop Generator
 *
 * Generates:
 * 1. 80x40 Isometric Cobblestone Trail Tiles (embedded flagstones & earth)
 * 2. Mossy Forest Boulder Prop
 * 3. Ancient Waymarker Shrine Prop
 */

import { PROP_PALETTES } from '../scd128/forestPropWitness.js';

const BAYER_2X2 = [
  [0, 2],
  [3, 1],
];

/**
 * Generates an 80x40 isometric diamond path tile with flagstones.
 */
export function generatePathTile({ _seed = 505 } = {}) {
  const width = 80;
  const height = 40;
  const halfW = 40;
  const halfH = 20;
  const p = PROP_PALETTES.stone_trail;
  const stoneRamp = [p.s0, p.s1, p.s2, p.s3, p.s4, p.s5, p.s6, p.s7];

  const cells = [];
  const stones = [
    { cx: 38, cy: 19, rx: 11, ry: 6 },
    { cx: 22, cy: 13, rx: 8, ry: 4 },
    { cx: 56, cy: 15, rx: 9, ry: 5 },
    { cx: 26, cy: 26, rx: 9, ry: 5 },
    { cx: 50, cy: 25, rx: 10, ry: 5 },
    { cx: 39, cy: 32, rx: 8, ry: 4 },
    { cx: 39, cy: 8, rx: 8, ry: 4 },
  ];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = Math.abs(x - 39.5) / halfW;
      const dy = Math.abs(y - 19.5) / halfH;
      const dist = dx + dy;

      if (dist <= 1.0) {
        // Check if inside any flagstone
        let inStone = null;
        for (const stone of stones) {
          const sdx = (x - stone.cx) / stone.rx;
          const sdy = (y - stone.cy) / stone.ry;
          if (sdx * sdx + sdy * sdy <= 1.0) {
            inStone = { ...stone, sdx, sdy, dSq: sdx * sdx + sdy * sdy };
            break;
          }
        }

        if (inStone) {
          // Stone surface relief lighting
          const nx = inStone.sdx;
          const ny = inStone.sdy;
          const dot = -nx * 0.7 - ny * 0.5; // Light from upper-left
          const bayer = (BAYER_2X2[y % 2][x % 2] - 1.5) / 5;
          const toneFloat = (dot + 1.0) * 3.5 + bayer;
          const toneIdx = Math.max(1, Math.min(7, Math.round(toneFloat)));

          let color = stoneRamp[toneIdx];
          // Chiseled edge bevel
          if (inStone.dSq > 0.85) {
            color = (nx < 0 || ny < 0) ? p.s7 : p.s1; // Light rim vs shadow bevel
          }
          cells.push({ x, y, color });
        } else {
          // Loam mortar & moss creep between flagstones
          const hash = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
          const frac = hash - Math.floor(hash);
          let mortarColor = frac > 0.6 ? p.moss_mid : frac > 0.3 ? p.moss_dark : p.s0;
          cells.push({ x, y, color: mortarColor });
        }
      }
    }
  }

  return { width, height, cells };
}
