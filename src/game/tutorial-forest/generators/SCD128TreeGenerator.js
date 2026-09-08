/**
 * Tutorial Forest — SCD128 Botanical Tree Generator
 *
 * Implements the discrete pixel-art tree synthesis engine proven in the Seven-Tree
 * Laboratory. Generates discrete 1x pixel art conforming to the Anti-Vector Invariant:
 * - Spherical normal shading per organic leaf lobe against upper-left directional light.
 * - Discrete 8-tone canopy ramps with 2x2 Bayer dithering at tonal steps.
 * - Cylindrical bark shading with vertical wood striations.
 * - Buttressed root anchoring onto isometric coordinates.
 */

import { FOREST_TREE_SPECIES } from '../scd128/treeFamilyWitness.js';

const BAYER_2X2 = [
  [0, 2],
  [3, 1],
];

const LIGHT_DIR = { x: -0.65, y: -0.75, z: 0.5 };
const LIGHT_LEN = Math.hypot(LIGHT_DIR.x, LIGHT_DIR.y, LIGHT_DIR.z);
const LX = LIGHT_DIR.x / LIGHT_LEN;
const LY = LIGHT_DIR.y / LIGHT_LEN;
const LZ = LIGHT_DIR.z / LIGHT_LEN;

function hash2D(x, y, seed = 42) {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n >>> 0) % 1000) / 1000;
}

function renderBough(x0, y0, x1, y1, startW, endW, woodRamp, setPixel) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= steps; i += 1) {
    const t = i / Math.max(1, steps);
    const curX = Math.round(x0 + (x1 - x0) * t);
    const curY = Math.round(y0 + (y1 - y0) * t);
    const w = Math.round(startW + (endW - startW) * t);
    for (let dy = -Math.floor(w / 2); dy <= Math.ceil(w / 2); dy += 1) {
      for (let dx = -Math.floor(w / 2); dx <= Math.ceil(w / 2); dx += 1) {
        if (dx * dx + dy * dy <= (w * w) / 4) {
          const toneIdx = dy > 0 ? 1 : 3;
          setPixel(curX + dx, curY + dy, woodRamp[toneIdx]);
        }
      }
    }
  }
}

/**
 * Synthesizes a botanical tree asset from an approved species specification.
 */
export function generateBotanicalTree(speciesKey = 'ancient_moss_oak', seed = 4242) {
  const spec = FOREST_TREE_SPECIES[speciesKey] || FOREST_TREE_SPECIES.ancient_moss_oak;
  const { canvasWidth: W, canvasHeight: H, canopyColors, woodColors } = spec;

  const canopyRamp = [
    canopyColors.c0, canopyColors.c1, canopyColors.c2, canopyColors.c3,
    canopyColors.c4, canopyColors.c5, canopyColors.c6, canopyColors.c7,
  ];
  const woodRamp = [
    woodColors.t0, woodColors.t1, woodColors.t2, woodColors.t3, woodColors.t4,
  ];

  const groundY = H - 6;
  const cx = Math.floor(W / 2);

  const cellMap = new Map();
  const setPixel = (x, y, color, alpha = 255) => {
    if (x >= 0 && x < W && y >= 0 && y < H) {
      cellMap.set(`${x},${y}`, { x, y, color, alpha });
    }
  };

  const isHeroic = spec.envelope.startsWith('heroic_');

  // ── 1. Ground Shadow (Soft translucent ambient contact) ─────────────────────
  const shadowRx = Math.floor(spec.rootSpread * (isHeroic ? 1.35 : 1.1));
  const shadowRy = Math.max(3, Math.floor(shadowRx * (isHeroic ? 0.38 : 0.35)));
  for (let dy = -shadowRy; dy <= shadowRy; dy += 1) {
    for (let dx = -shadowRx; dx <= shadowRx; dx += 1) {
      const d = (dx * dx) / (shadowRx * shadowRx) + (dy * dy) / (shadowRy * shadowRy);
      if (d <= 1.0) {
        const falloff = Math.round(150 * (1.0 - d * 0.45));
        setPixel(cx + dx + 2, groundY + dy + 1, '#050A08', falloff);
      }
    }
  }

  // ── 2. Trunk & Buttressed Roots ─────────────────────────────────────────────
  const trunkBaseW = Math.max(4, Math.floor(spec.rootSpread * (isHeroic ? 0.46 : 0.6)));
  const trunkTopW = Math.max(2, Math.floor(trunkBaseW * 0.52));
  const trunkTopY = Math.floor(H * (isHeroic ? 0.38 : spec.envelope === 'broad_rounded' ? 0.42 : 0.28));

  // Trunk body
  for (let y = trunkTopY; y <= groundY; y += 1) {
    const t = (y - trunkTopY) / Math.max(1, groundY - trunkTopY);
    // Buttress flare near roots
    const flare = t > 0.7 ? Math.pow((t - 0.7) / 0.3, 2) * (spec.rootSpread * 0.42) : 0;
    const curW = trunkTopW + (trunkBaseW - trunkTopW) * t + flare;
    const curve = spec.envelope === 'heroic_autumn_maple' ? Math.sin(t * Math.PI) * 6 : 0;
    const treeCx = cx + curve;
    const x0 = Math.round(treeCx - curW / 2);
    const x1 = Math.round(treeCx + curW / 2);

    for (let x = x0; x <= x1; x += 1) {
      // Cylinder lighting
      const nx = (x - treeCx) / (curW / 2 || 1);
      const dot = -nx * 0.8 + 0.3; // Light from left
      const striation = Math.sin(y * 1.5 + x * 0.8) * 0.15;
      const bayer = (BAYER_2X2[y % 2][x % 2] - 1.5) / 6;

      const toneFloat = (dot + striation + bayer + 0.5) * 4;
      const toneIdx = Math.max(0, Math.min(4, Math.round(toneFloat)));
      setPixel(x, y, woodRamp[toneIdx]);
    }
  }

  // Heroic boughs extending into canopy
  if (spec.envelope === 'heroic_broad_oak') {
    renderBough(cx - 4, trunkTopY + 14, cx - 44, Math.floor(H * 0.44), 8, 4, woodRamp, setPixel);
    renderBough(cx + 4, trunkTopY + 12, cx + 46, Math.floor(H * 0.46), 8, 4, woodRamp, setPixel);
    renderBough(cx - 2, trunkTopY + 4, cx - 22, Math.floor(H * 0.28), 7, 3, woodRamp, setPixel);
    renderBough(cx + 2, trunkTopY + 2, cx + 24, Math.floor(H * 0.30), 7, 3, woodRamp, setPixel);
  } else if (spec.envelope === 'heroic_autumn_maple') {
    renderBough(cx - 2, trunkTopY + 12, cx - 36, Math.floor(H * 0.45), 7, 3, woodRamp, setPixel);
    renderBough(cx + 4, trunkTopY + 10, cx + 38, Math.floor(H * 0.42), 7, 3, woodRamp, setPixel);
  }

  // ── 3. Canopy Lobes (Spherical Normals & Notched Perimeters) ─────────────────
  const lobes = deriveSpeciesLobes(spec, cx, H, seed);

  // Render lobes back to front
  for (const lobe of lobes) {
    const rx = lobe.rx;
    const ry = lobe.ry;

    for (let dy = -ry; dy <= ry; dy += 1) {
      for (let dx = -rx; dx <= rx; dx += 1) {
        const distSq = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
        if (distSq <= 1.0) {
          const px = lobe.cx + dx;
          const py = lobe.cy + dy;

          // Organic perimeter notch jitter
          const edgeDist = Math.sqrt(distSq);
          const jitter = (hash2D(px, py, seed) - 0.5) * 0.25;
          if (edgeDist + jitter > 0.98) {
            continue; // Cut perimeter notch
          }

          // Spherical normal calculation
          const nx = dx / rx;
          const ny = dy / ry;
          const nz = Math.sqrt(Math.max(0, 1.0 - (nx * nx + ny * ny)));

          // Directional dot product against upper-left light
          const dot = nx * LX + ny * LY + nz * LZ;
          const lobeLight = Math.max(0, Math.min(1, (dot + 0.7) / 1.5));

          // Bayer 2x2 dithering at tonal band transitions
          const bayer = (BAYER_2X2[py % 2][px % 2] - 1.5) / 6;
          const toneFloat = lobeLight * 7.0 + bayer + lobe.ambientOffset;
          const toneIdx = Math.max(0, Math.min(7, Math.round(toneFloat)));

          // Highlight fleck on sunlit crest
          let color = canopyRamp[toneIdx];
          if (toneIdx >= 6 && hash2D(px, py, seed + 11) > 0.85) {
            color = canopyRamp[7];
          }

          setPixel(px, py, color);
        }
      }
    }
  }

  const cells = Array.from(cellMap.values());
  return {
    speciesKey: spec.id,
    name: spec.name,
    canvasWidth: W,
    canvasHeight: H,
    cells,
  };
}

/**
 * Derives distinct structural bough lobes based on botanical habit.
 */
function deriveSpeciesLobes(spec, cx, H, _seed) {
  const lobes = [];

  if (spec.envelope === 'heroic_broad_oak') {
    // Grandfather Oak: expansive, volumetric canopy cloud lobes (160x200 canvas)
    const crownCenterY = Math.floor(H * 0.38);
    lobes.push(
      // Lower lateral bough lobes
      { cx: cx - 42, cy: crownCenterY + 22, rx: 28, ry: 22, ambientOffset: -0.3 },
      { cx: cx + 45, cy: crownCenterY + 24, rx: 26, ry: 20, ambientOffset: -0.4 },
      { cx: cx - 22, cy: crownCenterY + 16, rx: 32, ry: 24, ambientOffset: -0.1 },
      { cx: cx + 24, cy: crownCenterY + 14, rx: 30, ry: 23, ambientOffset: -0.2 },
      // Mid-crown main clusters
      { cx: cx - 35, cy: crownCenterY - 4, rx: 34, ry: 26, ambientOffset: 0.2 },
      { cx: cx + 32, cy: crownCenterY - 6, rx: 32, ry: 25, ambientOffset: 0.1 },
      { cx: cx - 12, cy: crownCenterY - 18, rx: 36, ry: 28, ambientOffset: 0.4 },
      { cx: cx + 15, cy: crownCenterY - 16, rx: 34, ry: 27, ambientOffset: 0.3 },
      // Top crest lobes catching upper sun
      { cx, cy: crownCenterY - 36, rx: 32, ry: 24, ambientOffset: 0.6 },
      { cx: cx - 18, cy: crownCenterY - 44, rx: 24, ry: 18, ambientOffset: 0.5 },
      { cx: cx + 16, cy: crownCenterY - 42, rx: 22, ry: 17, ambientOffset: 0.5 },
    );
  } else if (spec.envelope === 'heroic_autumn_maple') {
    // Autumnal Gold Maple: tall, graceful cloud-like clumps (140x180 canvas)
    const crownCenterY = Math.floor(H * 0.40);
    lobes.push(
      // Lower hanging boughs
      { cx: cx - 34, cy: crownCenterY + 18, rx: 22, ry: 18, ambientOffset: -0.3 },
      { cx: cx + 36, cy: crownCenterY + 16, rx: 24, ry: 19, ambientOffset: -0.4 },
      // Middle leafy tiers
      { cx: cx - 26, cy: crownCenterY - 2, rx: 26, ry: 22, ambientOffset: 0.1 },
      { cx: cx + 28, cy: crownCenterY - 4, rx: 28, ry: 23, ambientOffset: 0.2 },
      { cx: cx - 8, cy: crownCenterY - 18, rx: 30, ry: 25, ambientOffset: 0.4 },
      { cx: cx + 12, cy: crownCenterY - 22, rx: 28, ry: 24, ambientOffset: 0.3 },
      // Top sunlit crown
      { cx, cy: crownCenterY - 38, rx: 24, ry: 20, ambientOffset: 0.6 },
      { cx: cx - 14, cy: crownCenterY - 44, rx: 18, ry: 15, ambientOffset: 0.5 },
    );
  } else if (spec.envelope === 'broad_rounded') {
    // Ancient Oak: massive bulbous crown clusters
    const crownCenterY = Math.floor(H * 0.35);
    lobes.push(
      { cx: cx - 10, cy: crownCenterY + 4, rx: 14, ry: 12, ambientOffset: -0.2 },
      { cx: cx + 11, cy: crownCenterY + 5, rx: 13, ry: 11, ambientOffset: -0.4 },
      { cx: cx - 6, cy: crownCenterY - 8, rx: 15, ry: 13, ambientOffset: 0.3 },
      { cx: cx + 7, cy: crownCenterY - 7, rx: 14, ry: 12, ambientOffset: 0.1 },
      { cx, cy: crownCenterY - 14, rx: 13, ry: 10, ambientOffset: 0.5 },
      { cx: cx - 2, cy: crownCenterY - 2, rx: 16, ry: 14, ambientOffset: 0.2 },
    );
  } else if (spec.envelope === 'horizontal_terraced') {
    // Lotus Cedar: horizontal stepped shelves
    const steps = [
      { yRatio: 0.52, rx: 16, ry: 6, ox: -1 },
      { yRatio: 0.40, rx: 14, ry: 5, ox: 2 },
      { yRatio: 0.28, rx: 11, ry: 5, ox: -2 },
      { yRatio: 0.18, rx: 8, ry: 4, ox: 1 },
      { yRatio: 0.10, rx: 5, ry: 3, ox: 0 },
    ];
    for (let i = 0; i < steps.length; i += 1) {
      const s = steps[i];
      lobes.push({
        cx: cx + s.ox,
        cy: Math.floor(H * s.yRatio),
        rx: s.rx,
        ry: s.ry,
        ambientOffset: 0.4 - i * 0.15,
      });
    }
  } else if (spec.envelope === 'dense_conical_spire') {
    // Sentinel Pine: tiered conical whorls
    const tiers = [
      { yRatio: 0.60, rx: 12, ry: 7 },
      { yRatio: 0.46, rx: 10, ry: 6 },
      { yRatio: 0.33, rx: 8, ry: 5 },
      { yRatio: 0.22, rx: 6, ry: 5 },
      { yRatio: 0.12, rx: 3, ry: 4 },
    ];
    for (let i = 0; i < tiers.length; i += 1) {
      const t = tiers[i];
      lobes.push({
        cx,
        cy: Math.floor(H * t.yRatio),
        rx: t.rx,
        ry: t.ry,
        ambientOffset: 0.5 - i * 0.15,
      });
    }
  } else {
    // Sunlit Sapling: compact airy crown
    const cy = Math.floor(H * 0.38);
    lobes.push(
      { cx: cx - 4, cy: cy + 3, rx: 9, ry: 8, ambientOffset: -0.1 },
      { cx: cx + 4, cy: cy + 2, rx: 8, ry: 7, ambientOffset: -0.2 },
      { cx, cy: cy - 5, rx: 9, ry: 8, ambientOffset: 0.4 },
    );
  }

  return lobes;
}
