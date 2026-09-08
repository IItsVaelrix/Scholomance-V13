/**
 * Tutorial Forest — Dofus/Wakfu-Inspired Procedural Ground Synthesizer
 *
 * Implements the Anti-Vector Invariant with Macro-Scale Painterly Cohesion:
 * - 2:1 Dimetric isometric diamond standard (80x40 diamond, 80x56 extruded cliffs).
 * - Restful, warm olive-lime meadow canvas inspired by Dofus & Wakfu:
 *   Zero repetitive vertical stripe noise; 85% quiet negative space.
 * - Sparse, deliberate micro-details (daisy flecks, clover patches, smooth river pebbles).
 * - Organic cobblestone & dirt road with varying polygonal stone sizes and soft borders.
 * - Multi-depth mineral spring water with soft sandy silt shores.
 * - Warm stratified limestone cliffs with soft rounded moss ledges.
 * - Formal SCD128 Dual-Witness Records for all 13 handcrafted tile variants.
 */

import {
  computeCanonicalDigest256,
  deriveSlotBlockHex,
} from '../../../../codex/core/pixelbrain/scholomium-ink/scd128/scd128.canonical.js';

const BAYER_2X2 = [
  [0, 2],
  [3, 1],
];

function pseudoNoise(seed) {
  let s = (seed >>> 0) || 4242;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Warm, Stylized Dofus/Wakfu Color Palettes
 */
export const REFORGED_PALETTES = Object.freeze({
  verdant_sward: {
    m5: '#DDF46A', // bright sunlit clover highlight
    m4: '#C2E048', // warm sunlit meadow green
    m3: '#A8C838', // primary Dofus grass tone
    m2: '#8DA829', // rich meadow midtone
    m1: '#65821A', // under-canopy shaded grass
    m0: '#425810', // deep foliage crevice shadow
    dirt_hi: '#C49862', dirt_mid: '#9E703A', dirt_dark: '#5A3816', dirt_crevice: '#321D08',
    flower_white: '#FFFFFF', flower_yellow: '#FDE047', flower_red: '#EF4444',
    pebble_hi: '#D2D4C8', pebble_mid: '#9EA094', pebble_shadow: '#42443C',
  },
  sacred_water: {
    w6: '#E0F2FE', w5: '#A5F3FC', w4: '#67E8F9', w3: '#22D3EE',
    w2: '#0891B2', w1: '#0E7490', w0: '#042F2E',
    pebble_glow: '#5EEAD4', shore_sand: '#C49862', shore_silt: '#7A5228',
    reed_dark: '#14532D', reed_mid: '#15803D', reed_tip: '#78350F',
  },
  ancient_stone: {
    s6: '#F0F2E8', s5: '#D2D4C8', s4: '#9EA094', s3: '#6E7068',
    s2: '#4A4D44', s1: '#2C3028', s0: '#181C16',
    rune_core: '#E0F2FE', rune_glow: '#38BDF8', rune_dim: '#0284C7',
    moss_hi: '#A8C838', moss_mid: '#65821A', moss_dark: '#3A4E0D',
    dirt_joint: '#3D2510',
  },
  stratified_cliff: {
    c6: '#D2D4C8', c5: '#9EA094', c4: '#6E7068', c3: '#4A4D44',
    c2: '#30332B', c1: '#1C1F18', c0: '#0C0E0A',
    moss_drape: '#65821A', moss_glow: '#A8C838', root_tendril: '#7A5228',
    wet_glint: '#A5F3FC', wet_rock: '#2C3E44',
  },
});

export function createReforgedTileWitness(variantKey, width, height, cellCount) {
  const formSlots = [
    'ASSET_CLASS', 'SCALE_FRAME', 'SILHOUETTE', 'STRUCTURAL_SKELETON',
    'PROPORTION', 'MASS_DISTRIBUTION', 'NEGATIVE_SPACE', 'WORLD_FOOTPRINT',
  ].map((slotName, pos) => {
    const record = {
      canonicalCategory: `dofus_tile_${variantKey}`,
      parameters: { width, height, isometric: '2:1_dimetric', scale: 1 },
    };
    const digest256 = computeCanonicalDigest256(record);
    const blockHex = deriveSlotBlockHex(digest256, pos, 'form');
    return { slot: slotName, position: pos, blockHex, digest256, ...record };
  });

  const realizationSlots = [
    'PIXEL_DENSITY', 'EDGE_LANGUAGE', 'CLUSTER_RHYTHM', 'VALUE_HIERARCHY',
    'MATERIAL_LANGUAGE', 'PALETTE_LOGIC', 'LIGHT_RESPONSE', 'SURFACE_VARIATION',
  ].map((slotName, pos) => {
    const record = {
      canonicalCategory: `dofus_realize_${variantKey}`,
      parameters: { cells: cellCount, aesthetic: 'dofus_wakfu_stylized', normal: [-65, -75, 50] },
    };
    const digest256 = computeCanonicalDigest256(record);
    const blockHex = deriveSlotBlockHex(digest256, pos, 'realization');
    return { slot: slotName, position: pos, blockHex, digest256, ...record };
  });

  const form64Hex = formSlots.map(s => s.blockHex).join('');
  const realization64Hex = realizationSlots.map(s => s.blockHex).join('');

  return {
    contract: 'SCD128-ASSET-RECORD',
    assetClass: 'reforged_iso_tile',
    variantKey,
    scd128Wire: `${form64Hex}${realization64Hex}`,
    form: { bank: 'form', form64Hex, slots: formSlots },
    realization: { bank: 'realization', realization64Hex, slots: realizationSlots },
  };
}

export function synthesizeReforgedTile(variantKey, seed = 4242) {
  const isCliff = variantKey.startsWith('cliff_');
  const width = 80;
  const diamondH = 40;
  const height = isCliff ? 56 : 40;
  const halfW = 40;
  const halfH = 20;

  const rnd = pseudoNoise(seed);
  const pSward = REFORGED_PALETTES.verdant_sward;
  const pWater = REFORGED_PALETTES.sacred_water;
  const pStone = REFORGED_PALETTES.ancient_stone;
  const pCliff = REFORGED_PALETTES.stratified_cliff;

  const grid = new Map();
  const setCell = (x, y, color) => {
    if (x >= 0 && x < width && y >= 0 && y < height) {
      grid.set(`${x},${y}`, { x, y, color });
    }
  };

  // ──────────────────────────────────────────────────────────────────────────
  // A. DOFUS-STYLE MEADOW (Soft, Quiet, Painterly Canvas with Sparse Accents)
  // ──────────────────────────────────────────────────────────────────────────
  if (variantKey.startsWith('grass_')) {
    // 1. Broad, Warm Painterly Base Gradient (Zero repeating vertical stripes!)
    for (let y = 0; y < diamondH; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const dx = Math.abs(x - 39.5) / halfW;
        const dy = Math.abs(y - 19.5) / halfH;
        if (dx + dy <= 1.0) {
          // Unified, restful Dofus meadow canvas across tiles (Zero checkerboard seam!)
          let col = pSward.m2; // The signature warm Dofus lime-olive (#8DA829)
          if (variantKey === 'grass_sunlit_tufts') {
            const b = BAYER_2X2[y % 2][x % 2];
            col = b === 0 ? pSward.m3 : pSward.m2;
          } else if (variantKey === 'grass_deep_sward') {
            const b = BAYER_2X2[y % 2][x % 2];
            col = b === 3 ? pSward.m1 : pSward.m2;
          } else {
            col = pSward.m2;
          }

          setCell(x, y, col);
        }
      }
    }

    // 2. Sparse, Deliberate Micro-Vignettes (85% Negative Space!)
    // Instead of dense noise, place 2-3 hand-crafted accents per tile
    if (variantKey === 'grass_clover_dappled') {
      // Cluster of white daisies with yellow centers
      const cx = 36 + Math.round((rnd() - 0.5) * 16);
      const cy = 18 + Math.round((rnd() - 0.5) * 8);

      // Daisy 1
      setCell(cx, cy, pSward.flower_yellow);
      setCell(cx - 1, cy, pSward.flower_white);
      setCell(cx + 1, cy, pSward.flower_white);
      setCell(cx, cy - 1, pSward.flower_white);
      setCell(cx, cy + 1, pSward.flower_white);
      setCell(cx, cy + 2, pSward.m1); // stem

      // Daisy 2
      setCell(cx + 6, cy - 3, pSward.flower_yellow);
      setCell(cx + 5, cy - 3, pSward.flower_white);
      setCell(cx + 7, cy - 3, pSward.flower_white);
      setCell(cx + 6, cy - 4, pSward.flower_white);
      setCell(cx + 6, cy - 2, pSward.flower_white);

      // A single clover tuft
      setCell(cx - 8, cy + 4, pSward.m4);
      setCell(cx - 9, cy + 4, pSward.m5);
      setCell(cx - 7, cy + 4, pSward.m3);
      setCell(cx - 8, cy + 3, pSward.m5);
    } else if (variantKey === 'grass_sunlit_tufts') {
      // Warm sunlit blade accent
      const tx = 40 + Math.round((rnd() - 0.5) * 14);
      const ty = 20 + Math.round((rnd() - 0.5) * 6);

      setCell(tx, ty, pSward.m4);
      setCell(tx - 1, ty - 1, pSward.m4);
      setCell(tx - 1, ty - 2, pSward.m5);
      setCell(tx + 1, ty - 1, pSward.m4);
      setCell(tx + 1, ty - 2, pSward.m5);
      setCell(tx, ty - 3, pSward.m5);
      setCell(tx, ty + 1, pSward.m0); // soft cast shadow
    } else if (variantKey === 'grass_ancient_roots') {
      // Lush forest undergrowth with soft clover patches
      const rx = 38 + Math.round((rnd() - 0.5) * 12);
      const ry = 19 + Math.round((rnd() - 0.5) * 6);
      for (let dy = -2; dy <= 2; dy += 1) {
        for (let dx = -3; dx <= 3; dx += 1) {
          if (dx * dx + dy * dy <= 6) {
            setCell(rx + dx, ry + dy, (dx + dy) % 2 === 0 ? pSward.m4 : pSward.m3);
          }
        }
      }
      setCell(rx - 8, ry + 3, pSward.m4);
      setCell(rx + 8, ry - 3, pSward.m4);
    } else {
      // grass_deep_sward: A single tiny pebble and two blade leaves
      const px = 42;
      const py = 22;
      setCell(px, py, pSward.pebble_hi);
      setCell(px + 1, py, pSward.pebble_mid);
      setCell(px, py + 1, pSward.pebble_shadow);
      setCell(px - 4, py - 2, pSward.m4);
      setCell(px - 4, py - 3, pSward.m5);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // B. DOFUS-STYLE ORGANIC PATHS (Warm Earth Trail with Irregular Flagstones)
  // ──────────────────────────────────────────────────────────────────────────
  else if (variantKey.startsWith('path_')) {
    // 1. Warm Loam / Dirt Trail Base
    for (let y = 0; y < diamondH; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const dx = Math.abs(x - 39.5) / halfW;
        const dy = Math.abs(y - 19.5) / halfH;
        if (dx + dy <= 1.0) {
          const n = rnd();
          let col = pSward.dirt_mid;
          if (n > 0.65) col = pSward.dirt_hi;
          else if (n < 0.25) col = pSward.dirt_dark;

          // Grass edging encroaching naturally on north/south edges
          if (dy > 0.6 && n > 0.4) col = pSward.m2;

          setCell(x, y, col);
        }
      }
    }

    // 2. Large, Irregular Polygonal Flagstone Slabs (Dofus-Style Organic Pavers)
    const stones = [
      { cx: 38, cy: 19, rx: 14, ry: 7 },
      { cx: 18, cy: 14, rx: 9, ry: 5 },
      { cx: 58, cy: 15, rx: 10, ry: 5 },
      { cx: 22, cy: 26, rx: 10, ry: 5 },
      { cx: 54, cy: 25, rx: 9, ry: 5 },
    ];

    for (let y = 0; y < diamondH; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const dx = Math.abs(x - 39.5) / halfW;
        const dy = Math.abs(y - 19.5) / halfH;
        if (dx + dy <= 0.94) {
          for (const s of stones) {
            const sx = (x - s.cx) / s.rx;
            const sy = (y - s.cy) / s.ry;
            const dSq = sx * sx + sy * sy;

            if (dSq <= 1.0) {
              // 3D Stone Slab Shading
              const lightDot = -sx * 0.7 - sy * 0.5;
              let col = pStone.s4;
              if (lightDot > 0.4) col = pStone.s5;
              else if (lightDot < -0.3) col = pStone.s3;

              // Top-left crisp sunlit bevel
              if (dSq > 0.75) {
                col = (sx < 0 || sy < 0) ? pStone.s6 : pStone.s2;
              }

              // Runic Way Inlay on central stone
              if (variantKey === 'path_runic_way' && s.cx === 38) {
                const rx = Math.abs(x - 38);
                const ry = Math.abs(y - 19);
                if ((rx <= 6 && ry === 0) || (ry <= 3 && rx === 0)) {
                  col = pStone.rune_core;
                  setCell(x - 1, y, pStone.rune_glow);
                  setCell(x + 1, y, pStone.rune_glow);
                }
              }

              // Overgrown Path Variant (creeping moss and wildflowers)
              if (variantKey === 'path_overgrown' && (dSq > 0.7 && rnd() > 0.4)) {
                col = pSward.m3;
              }

              setCell(x, y, col);
              break;
            }
          }
        }
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // C. NATURALISTIC WATER & SHORELINES
  // ──────────────────────────────────────────────────────────────────────────
  else if (variantKey.startsWith('water_')) {
    for (let y = 0; y < diamondH; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const dx = Math.abs(x - 39.5) / halfW;
        const dy = Math.abs(y - 19.5) / halfH;
        const dist = dx + dy;

        if (dist <= 1.0) {
          if (variantKey === 'water_shore_transition') {
            // Soft transitional shore: warm meadow grass laps into golden silt beach
            const shoreFactor = (x + y * 1.2) / (width + diamondH * 1.2);
            const b = (BAYER_2X2[y % 2][x % 2] - 1.5) / 20;
            const sf = shoreFactor + b;
            if (sf < 0.38) {
              setCell(x, y, pSward.m2);
            } else if (sf < 0.48) {
              setCell(x, y, pWater.shore_sand); // golden beach silt
            } else if (sf < 0.52) {
              setCell(x, y, pWater.w6); // soft white foam line
            } else {
              setCell(x, y, pWater.w2); // clear turquoise water
            }
          } else {
            // water_deep_spring: Smooth, tranquil luminous cyan-teal mineral water
            const depth = (1.0 - dist);
            let col = depth > 0.45 ? pWater.w0 : depth > 0.25 ? pWater.w1 : pWater.w2;
            // Submerged smooth river pebble
            if (Math.hypot(x - 36, y - 18) < 3.2 || Math.hypot(x - 48, y - 22) < 2.5) {
              col = pWater.pebble_glow;
            }
            setCell(x, y, col);
          }
        }
      }
    }

    // Reeds for water_reed_cluster
    if (variantKey === 'water_reed_cluster') {
      for (let r = 0; r < 4; r += 1) {
        const rx = 28 + r * 9;
        const ry = 22 + Math.round(rnd() * 4);
        for (let dy = 0; dy <= 7; dy += 1) {
          setCell(rx, ry - dy, dy >= 6 ? pWater.reed_tip : dy > 4 ? pSward.m4 : pWater.reed_dark);
        }
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // D. STRATIFIED LIMESTONE CLIFFS (Warm, Weathered Rock Shelves)
  // ──────────────────────────────────────────────────────────────────────────
  else if (isCliff) {
    // Top Grass Cap (Warm meadow green)
    for (let y = 0; y < diamondH; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const dx = Math.abs(x - 39.5) / halfW;
        const dy = Math.abs(y - 19.5) / halfH;
        if (dx + dy <= 1.0) {
          setCell(x, y, pSward.m3);
        }
      }
    }

    // Extruded Warm Limestone Cliff Face (16px drop)
    for (let dy = 0; dy < 16; dy += 1) {
      for (let x = 0; x < width; x += 1) {
        const xOffset = Math.abs(x - 39.5) / halfW;
        if (xOffset <= 1.0) {
          const rimY = Math.floor(19.5 + (1.0 - xOffset) * halfH);
          const py = rimY + dy;
          if (py < height) {
            const shelfY = dy % 5;
            let col = pCliff.c4;
            if (shelfY === 0) col = pCliff.c6;      // warm stone ledge highlight
            else if (shelfY === 1) col = pCliff.c5; // stone face
            else if (shelfY === 2) col = pCliff.c3; // stone shadow
            else if (shelfY === 3) col = pCliff.c2; // overhang crevice
            else if (shelfY === 4) col = pCliff.c1; // deep occlusion

            // Soft draping moss
            if (dy <= 3 && Math.sin(x * 0.35) > 0.1) {
              col = pCliff.moss_glow;
            }

            if (variantKey === 'cliff_root_curtain' && (Math.abs(x - 34) <= 1 || Math.abs(x - 48) <= 2)) {
              col = pSward.dirt_mid;
            }

            setCell(x, py, col);
          }
        }
      }
    }
  }

  const cells = Array.from(grid.values());
  const witness = createReforgedTileWitness(variantKey, width, height, cells.length);

  return {
    variantKey,
    width,
    height,
    isCliff,
    cells,
    witness,
  };
}
