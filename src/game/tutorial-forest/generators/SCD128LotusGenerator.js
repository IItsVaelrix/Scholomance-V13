/**
 * Tutorial Forest — SCD128 Pixel Lotus & Water Generator
 *
 * Synthesizes:
 * 1. 80x40 Isometric Diamond Water Tiles with multi-frame animated caustics.
 * 2. Floating Jade Lilypad Clusters.
 * 3. Radiant Sacred Lotus Flowers with bioluminescent bloom phases.
 */

import { LOTUS_PALETTES } from '../scd128/lotusTileWitness.js';

const BAYER_2X2 = [
  [0, 2],
  [3, 1],
];

/**
 * Generates an 80x40 animated water tile with caustic wave interference.
 */
export function generateLotusWaterTile({ frame = 0, _seed = 101 } = {}) {
  const width = 80;
  const height = 40;
  const p = LOTUS_PALETTES.sacred_spring_water;
  const waterRamp = [p.w0, p.w1, p.w2, p.w3, p.w4, p.w5, p.w6, p.w7];

  const cells = [];
  const halfW = 40;
  const halfH = 20;
  const phase = (frame / 4) * Math.PI * 2;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = Math.abs(x - 39.5) / halfW;
      const dy = Math.abs(y - 19.5) / halfH;
      const dist = dx + dy;

      if (dist <= 1.0) {
        // Multi-frequency sinusoidal caustic wave interference
        const w1 = Math.sin(x * 0.15 + y * 0.1 + phase);
        const w2 = Math.cos(x * 0.08 - y * 0.18 + phase * 1.3);
        const w3 = Math.sin((x + y) * 0.12 - phase * 0.7);
        const wave = (w1 + w2 + w3) / 3;

        // Depth falloff: deep sapphire in center, bright turquoise near edges
        const depth = 1.0 - dist; // 1 at center, 0 at edge
        let toneFloat = (1.0 - depth * 0.6 + wave * 0.35) * 6.5;

        // Caustic crest sparkles
        if (wave > 0.65 && dist < 0.9) {
          toneFloat = 7.0;
        }

        const bayer = (BAYER_2X2[y % 2][x % 2] - 1.5) / 5;
        const toneIdx = Math.max(0, Math.min(7, Math.round(toneFloat + bayer)));
        let color = waterRamp[toneIdx];

        // Soft shore rim
        if (dist >= 0.95) {
          color = p.w2;
        }

        cells.push({ x, y, color });
      }
    }
  }

  return { width, height, cells, frame };
}

/**
 * Generates floating jade lilypads.
 */
export function generateLilypadProp({ _seed = 202 } = {}) {
  const width = 48;
  const height = 32;
  const p = LOTUS_PALETTES.bioluminescent_lotus;
  const cellMap = new Map();

  const setPixel = (x, y, color) => {
    if (x >= 0 && x < width && y >= 0 && y < height) {
      cellMap.set(`${x},${y}`, { x, y, color });
    }
  };

  // Draw 2-3 overlapping lilypad disks
  const pads = [
    { cx: 20, cy: 16, rx: 12, ry: 7, cleftAngle: 0.6 },
    { cx: 34, cy: 18, rx: 9, ry: 5, cleftAngle: -1.2 },
    { cx: 12, cy: 22, rx: 7, ry: 4, cleftAngle: 2.1 },
  ];

  for (const pad of pads) {
    for (let dy = -pad.ry; dy <= pad.ry; dy += 1) {
      for (let dx = -pad.rx; dx <= pad.rx; dx += 1) {
        const dSq = (dx * dx) / (pad.rx * pad.rx) + (dy * dy) / (pad.ry * pad.ry);
        if (dSq <= 1.0) {
          // Check radial wedge cleft
          const angle = Math.atan2(dy, dx);
          const angleDiff = Math.abs(angle - pad.cleftAngle);
          if (angleDiff < 0.25) {
            continue; // Cut radial wedge
          }

          let color = p.pad_mid;
          if (dy < 0 && dx < 0) color = p.pad_hi; // Light from top-left
          else if (dy > 0 && dx > 0) color = p.pad_dark;

          // Dewdrop highlights
          if (dSq < 0.2 && Math.abs(dx) === 1 && Math.abs(dy) === 1) {
            color = p.pad_dew;
          }

          setPixel(pad.cx + dx, pad.cy + dy, color);
        }
      }
    }
  }

  return {
    width,
    height,
    cells: Array.from(cellMap.values()),
  };
}

/**
 * Generates radiant Sacred Lotus Flower with bioluminescent pulsation.
 */
export function generateSacredLotusBloom({ pulsePhase = 0, _seed = 303 } = {}) {
  const width = 36;
  const height = 36;
  const p = LOTUS_PALETTES.bioluminescent_lotus;
  const cellMap = new Map();

  const setPixel = (x, y, color) => {
    if (x >= 0 && x < width && y >= 0 && y < height) {
      cellMap.set(`${x},${y}`, { x, y, color });
    }
  };

  const cx = 18;
  const cy = 20;

  // 1. Water shadow under the flower
  for (let dy = -3; dy <= 3; dy += 1) {
    for (let dx = -8; dx <= 8; dx += 1) {
      if ((dx * dx) / 64 + (dy * dy) / 9 <= 1.0) {
        setPixel(cx + dx, cy + dy + 4, '#040812');
      }
    }
  }

  // 2. Outer Tier Petals (8 spreading radiant petals)
  const outerPetals = 8;
  const outerRadius = 13;
  for (let i = 0; i < outerPetals; i += 1) {
    const angle = (i / outerPetals) * Math.PI * 2 + 0.2;
    const px = Math.round(cx + Math.cos(angle) * outerRadius);
    const py = Math.round(cy + Math.sin(angle) * (outerRadius * 0.65));

    // Petal tip
    setPixel(px, py, p.p7);
    setPixel(px + 1, py, p.p6);
    setPixel(px - 1, py, p.p5);
    setPixel(px, py + 1, p.p4);
    setPixel(px, py - 1, p.p6);
  }

  // 3. Inner Cupped Petals (6 upright cupped petals)
  const innerPetals = 6;
  const innerRadius = 8;
  for (let i = 0; i < innerPetals; i += 1) {
    const angle = (i / innerPetals) * Math.PI * 2 - 0.1;
    const px = Math.round(cx + Math.cos(angle) * innerRadius);
    const py = Math.round(cy + Math.sin(angle) * (innerRadius * 0.6));

    setPixel(px, py, p.p6);
    setPixel(px + 1, py, p.p5);
    setPixel(px - 1, py, p.p4);
    setPixel(px, py - 1, p.p7);
  }

  // 4. Central Golden Anther / Sacred Stamen Receptacle
  for (let dy = -3; dy <= 3; dy += 1) {
    for (let dx = -4; dx <= 4; dx += 1) {
      if ((dx * dx) / 16 + (dy * dy) / 9 <= 1.0) {
        const isCore = (dx * dx) + (dy * dy) <= 2;
        const color = isCore ? p.core_hi : (dy > 0 ? p.core_dark : p.core_mid);
        setPixel(cx + dx, cy + dy - 1, color);
      }
    }
  }

  // 5. Bioluminescent Pulse Glow Flecks
  if (pulsePhase > 0.5) {
    setPixel(cx, cy - 2, '#FFFFFF');
    setPixel(cx - 2, cy - 1, p.p7);
    setPixel(cx + 2, cy - 1, p.p7);
  }

  return {
    width,
    height,
    cells: Array.from(cellMap.values()),
    pulsePhase,
  };
}
