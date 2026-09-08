/**
 * Tutorial Forest — SCD128 Reforged Storytelling Landmarks & Props
 *
 * Authored in discrete 1x pixel art cells adhering to the Anti-Vector Invariant:
 * 1. Ancient Moss Dolmen (Megalithic portal arch with carved petroglyphs)
 * 2. Hollow Fairy Stump (Ancient hollow trunk with glowing luminescent fungi)
 * 3. Fallen Mossy Log (Weathered fallen trunk with shelf fungi and sapling)
 * 4. Lotus Stone Basin (Carved ritual font with sacred spring water)
 *
 * Accompanied by formal SCD128 Dual-Witness Records.
 */

import {
  computeCanonicalDigest256,
  deriveSlotBlockHex,
} from '../../../../codex/core/pixelbrain/scholomium-ink/scd128/scd128.canonical.js';

const BAYER_2X2 = [
  [0, 2],
  [3, 1],
];

function createPropWitness(propKey, width, height, cellCount) {
  const formSlots = [
    'ASSET_CLASS', 'SCALE_FRAME', 'SILHOUETTE', 'STRUCTURAL_SKELETON',
    'PROPORTION', 'MASS_DISTRIBUTION', 'NEGATIVE_SPACE', 'WORLD_FOOTPRINT',
  ].map((slotName, pos) => {
    const record = {
      canonicalCategory: `landmark_${propKey}`,
      parameters: { width, height, isometric: 'dimetric_prop', scale: 1 },
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
      canonicalCategory: `realize_${propKey}`,
      parameters: { cells: cellCount, dither: 'bayer_2x2', light: [-65, -75, 50] },
    };
    const digest256 = computeCanonicalDigest256(record);
    const blockHex = deriveSlotBlockHex(digest256, pos, 'realization');
    return { slot: slotName, position: pos, blockHex, digest256, ...record };
  });

  const form64Hex = formSlots.map(s => s.blockHex).join('');
  const realization64Hex = realizationSlots.map(s => s.blockHex).join('');

  return {
    contract: 'SCD128-ASSET-RECORD',
    assetClass: 'reforged_landmark_prop',
    propKey,
    scd128Wire: `${form64Hex}${realization64Hex}`,
    form: { bank: 'form', form64Hex, slots: formSlots },
    realization: { bank: 'realization', realization64Hex, slots: realizationSlots },
  };
}

/**
 * 1. Ancient Moss Dolmen (80x72)
 * Two megalithic pillars and massive horizontal capstone with glowing runes.
 */
export function synthesizeAncientMossDolmen() {
  const width = 80;
  const height = 72;
  const cells = [];

  const stoneDark = '#1E293B';
  const stoneMid = '#475569';
  const stoneHi = '#94A3B8';
  const stonePeak = '#E2E8F0';
  const mossDrape = '#15803D';
  const mossHi = '#84CC16';
  const runeCyan = '#38BDF8';
  const runeWhite = '#E0F2FE';

  const setPixel = (x, y, color) => {
    if (x >= 0 && x < width && y >= 0 && y < height) {
      cells.push({ x, y, color });
    }
  };

  // Left Megalith Pillar (x: 16..28, y: 16..68)
  for (let y = 16; y <= 68; y += 1) {
    const w = 12 + Math.sin(y * 0.3) * 1.5;
    for (let x = Math.round(22 - w / 2); x <= Math.round(22 + w / 2); x += 1) {
      const relX = (x - (22 - w / 2)) / w;
      const bayer = (BAYER_2X2[y % 2][x % 2] - 1.5) / 4;
      let col = relX < 0.35 ? stonePeak : relX < 0.7 ? stoneHi : stoneDark;
      if (bayer > 0 && relX < 0.5) col = stonePeak;
      // Inlaid spiral rune
      if (y >= 32 && y <= 44 && Math.abs(x - 22) <= 3) {
        col = (y === 38 || x === 22) ? runeCyan : runeWhite;
      }
      setPixel(x, y, col);
    }
  }

  // Right Megalith Pillar (x: 52..64, y: 16..68)
  for (let y = 16; y <= 68; y += 1) {
    const w = 12 + Math.cos(y * 0.35) * 1.5;
    for (let x = Math.round(58 - w / 2); x <= Math.round(58 + w / 2); x += 1) {
      const relX = (x - (58 - w / 2)) / w;
      let col = relX < 0.3 ? stoneHi : relX < 0.65 ? stoneMid : stoneDark;
      if (y >= 30 && y <= 42 && Math.abs(x - 58) <= 3) {
        col = (x === 58 || y === 36) ? runeCyan : runeWhite;
      }
      setPixel(x, y, col);
    }
  }

  // Horizontal Megalithic Capstone Lintel (x: 10..70, y: 6..20)
  for (let y = 6; y <= 20; y += 1) {
    const w = 60 - Math.abs(y - 13) * 2;
    for (let x = Math.round(40 - w / 2); x <= Math.round(40 + w / 2); x += 1) {
      const relY = (y - 6) / 14;
      const relX = (x - (40 - w / 2)) / w;
      let col = relY < 0.4 ? stonePeak : relY < 0.75 ? stoneHi : stoneDark;
      if (relX > 0.8) col = stoneDark;

      // Moss drapery on upper capstone
      if (relY < 0.35 && (x + y) % 3 === 0) {
        col = relY < 0.2 ? mossHi : mossDrape;
      }
      // Hanging moss strands
      if (y === 20 && (x === 32 || x === 48 || x === 25 || x === 55)) {
        setPixel(x, 21, mossDrape);
        setPixel(x, 22, mossDrape);
        setPixel(x, 23, mossHi);
      }

      setPixel(x, y, col);
    }
  }

  const witness = createPropWitness('ancient_moss_dolmen', width, height, cells.length);
  return { key: 'ancient_moss_dolmen', width, height, cells, witness };
}

/**
 * 2. Hollow Fairy Stump (64x54)
 * Giant gnarled hollow trunk with glowing bioluminescent fungi.
 */
export function synthesizeHollowFairyStump() {
  const width = 64;
  const height = 54;
  const cells = [];

  const barkDark = '#1C0F05';
  const barkMid = '#3D2817';
  const barkHi = '#635446';
  const hollowVoid = '#0A0502';
  const mushroomCap = '#38BDF8';
  const mushroomGlow = '#67E8F9';
  const mushroomStalk = '#E0F2FE';
  const shelfFungi = '#D97706';
  const mossGreen = '#44A832';

  const setPixel = (x, y, color) => {
    if (x >= 0 && x < width && y >= 0 && y < height) cells.push({ x, y, color });
  };

  // Stump body (x: 14..50, y: 16..50)
  for (let y = 16; y <= 50; y += 1) {
    const flare = Math.max(0, (y - 36) * 0.7);
    const halfW = 16 + flare;
    for (let x = Math.round(32 - halfW); x <= Math.round(32 + halfW); x += 1) {
      const relX = (x - (32 - halfW)) / (halfW * 2);
      const isHollow = (y >= 20 && y <= 44 && Math.abs(x - 32) < 9);

      if (isHollow) {
        // Deep shadow hollow
        let col = hollowVoid;
        // Glowing fairy mushrooms inside hollow
        if ((y === 41 && (x === 30 || x === 34)) || (y === 37 && x === 32)) {
          col = mushroomCap;
        } else if ((y === 42 && (x === 30 || x === 34)) || (y === 38 && x === 32)) {
          col = mushroomStalk;
        } else if (Math.hypot(x - 32, y - 39) < 4) {
          col = mushroomGlow; // subtle cyan back-glow in cavern
        }
        setPixel(x, y, col);
      } else {
        // Gnarled exterior bark ridges
        const ridge = Math.sin(x * 0.9 + y * 0.2);
        let col = ridge > 0.4 ? barkHi : ridge < -0.3 ? barkDark : barkMid;
        if (relX < 0.25) col = barkHi;
        if (relX > 0.75) col = barkDark;

        // Shelf fungi brackets on left flank
        if (x <= 18 && (y === 32 || y === 33 || y === 42)) {
          col = shelfFungi;
        }
        // Moss at base
        if (y >= 46 && (x + y) % 2 === 0) {
          col = mossGreen;
        }

        setPixel(x, y, col);
      }
    }
  }

  // Top jagged cut rim (y: 12..16)
  for (let x = 18; x <= 46; x += 1) {
    const topY = 14 + Math.round(Math.sin(x * 0.7) * 2);
    setPixel(x, topY, barkHi);
    setPixel(x, topY + 1, barkMid);
  }

  const witness = createPropWitness('hollow_fairy_stump', width, height, cells.length);
  return { key: 'hollow_fairy_stump', width, height, cells, witness };
}

/**
 * 3. Fallen Mossy Log (76x36)
 * Rotting ancient trunk resting horizontally with shelf fungi and sprouting fern.
 */
export function synthesizeFallenMossyLog() {
  const width = 76;
  const height = 36;
  const cells = [];

  const barkDark = '#1A0E04';
  const barkMid = '#3D2514';
  const barkHi = '#68452A';
  const woodHeart = '#8C6239';
  const mossRich = '#288828';
  const mossBright = '#84CC16';
  const bracketGold = '#F59E0B';
  const bracketDark = '#78350F';

  const setPixel = (x, y, color) => {
    if (x >= 0 && x < width && y >= 0 && y < height) cells.push({ x, y, color });
  };

  // Cylinder horizontal log (x: 10..68, y: 14..28)
  for (let x = 10; x <= 68; x += 1) {
    const taper = (x - 10) / 58 * 2; // subtle taper towards right
    const topY = Math.round(15 + Math.sin(x * 0.1) * 1.2);
    const botY = Math.round(27 - taper);

    for (let y = topY; y <= botY; y += 1) {
      const relY = (y - topY) / (botY - topY);

      let col = relY < 0.35 ? barkHi : relY < 0.7 ? barkMid : barkDark;

      // Moss carpet along the top spine
      if (relY < 0.4 && (x % 3 !== 0)) {
        col = relY < 0.2 ? mossBright : mossRich;
      }

      // Bracket shelf fungi on side
      if ((x === 24 || x === 25 || x === 44 || x === 45) && (y === 21 || y === 22)) {
        col = bracketGold;
      }
      if ((x === 23 || x === 43) && y === 22) {
        col = bracketDark;
      }

      setPixel(x, y, col);
    }
  }

  // Exposed broken hollow at left end (x: 6..12, y: 15..27)
  for (let dy = -5; dy <= 5; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      if (dx * dx * 2 + dy * dy <= 25) {
        setPixel(10 + dx, 21 + dy, dx < 0 ? woodHeart : barkDark);
      }
    }
  }

  // Sprouting fern frond out of bark (x: 36, y: 8..14)
  for (let step = 0; step < 7; step += 1) {
    setPixel(36, 14 - step, mossBright);
    if (step > 2) {
      setPixel(35, 14 - step, mossRich);
      setPixel(37, 14 - step, mossRich);
    }
  }

  const witness = createPropWitness('fallen_mossy_log', width, height, cells.length);
  return { key: 'fallen_mossy_log', width, height, cells, witness };
}

/**
 * 4. Lotus Stone Basin (48x44)
 * Carved holy well font with sacred glowing spring water and lotus buds.
 */
export function synthesizeLotusStoneBasin() {
  const width = 48;
  const height = 44;
  const cells = [];

  const stonePeak = '#E2E8F0';
  const stoneHi = '#94A3B8';
  const stoneMid = '#475569';
  const stoneDark = '#1E293B';
  const waterCyan = '#22D3EE';
  const waterDeep = '#0891B2';
  const budPink = '#F472B6';
  const budGlow = '#FDF2F8';

  const setPixel = (x, y, color) => {
    if (x >= 0 && x < width && y >= 0 && y < height) cells.push({ x, y, color });
  };

  const cx = 24;
  const cy = 18;

  // Stone pedestal base (y: 26..38)
  for (let y = 26; y <= 38; y += 1) {
    const w = 18 - (y - 26) * 0.5;
    for (let x = Math.round(cx - w / 2); x <= Math.round(cx + w / 2); x += 1) {
      const relX = (x - (cx - w / 2)) / w;
      setPixel(x, y, relX < 0.35 ? stoneHi : relX < 0.7 ? stoneMid : stoneDark);
    }
  }

  // Elliptical basin rim (dimetric 2:1 ratio)
  for (let y = 10; y <= 26; y += 1) {
    for (let x = 6; x <= 42; x += 1) {
      const dx = (x - cx) / 18;
      const dy = (y - cy) / 8;
      const dist = dx * dx + dy * dy;

      if (dist <= 1.0) {
        if (dist > 0.65) {
          // Carved stone rim
          const light = -dx * 0.7 - dy * 0.5;
          setPixel(x, y, light > 0.4 ? stonePeak : light > -0.2 ? stoneHi : stoneDark);
        } else {
          // Reflective sacred spring water within font
          const waterDist = dist / 0.65;
          let col = waterDist < 0.5 ? waterCyan : waterDeep;

          // Floating sacred lotus bud at center
          if (Math.hypot(x - cx, y - cy) <= 2) {
            col = (x === cx && y === cy) ? budGlow : budPink;
          }

          setPixel(x, y, col);
        }
      }
    }
  }

  const witness = createPropWitness('lotus_stone_basin', width, height, cells.length);
  return { key: 'lotus_stone_basin', width, height, cells, witness };
}

/**
 * 5. Rustic Stone Well & Wooden Winch (56x60)
 * Weathered circular stonework, wooden posts, shingle roof, rope winch and bucket.
 */
export function synthesizeRusticStoneWell() {
  const width = 56;
  const height = 60;
  const cells = [];

  const setPixel = (x, y, color, alpha = 255) => {
    if (x >= 0 && x < width && y >= 0 && y < height) {
      cells.push({ x, y, color, alpha });
    }
  };

  const cx = 28;

  // Ground shadow
  for (let dy = -6; dy <= 6; dy += 1) {
    for (let dx = -22; dx <= 22; dx += 1) {
      if ((dx * dx) / (22 * 22) + (dy * dy) / (6 * 6) <= 1.0) {
        setPixel(cx + dx + 1, 53 + dy, '#050A08', 140);
      }
    }
  }

  // Stone well cylindrical base (y: 36..54)
  const stoneLight = '#CBD5E1';
  const stoneMid = '#94A3B8';
  const stoneShade = '#475569';
  const stoneDark = '#1E293B';
  const mossGreen = '#65A30D';
  const mossDark = '#365314';

  for (let y = 36; y <= 54; y += 1) {
    const isRim = y <= 38;
    const rx = isRim ? 18 : 17;
    for (let x = cx - rx; x <= cx + rx; x += 1) {
      const relX = (x - cx) / rx;
      const bayer = (BAYER_2X2[y % 2][x % 2] - 1.5) / 4;
      const course = Math.floor(y / 4);
      const isMortar = (y % 4 === 0) || ((x + course * 7) % 8 === 0);

      if (isMortar && !isRim) {
        setPixel(x, y, stoneDark);
      } else {
        const light = -relX * 0.75 + (isRim ? 0.35 : 0) + bayer;
        let col = light > 0.4 ? stoneLight : light > -0.1 ? stoneMid : light > -0.5 ? stoneShade : stoneDark;
        // Moss growing on shaded right/bottom side
        if (relX > 0.2 && y >= 45 && (x + y) % 3 !== 0) {
          col = relX > 0.5 ? mossDark : mossGreen;
        }
        setPixel(x, y, col);
      }
    }
  }

  // Deep water inside well (y: 35..39)
  for (let y = 35; y <= 39; y += 1) {
    for (let x = cx - 13; x <= cx + 13; x += 1) {
      const dx = (x - cx) / 13;
      const dy = (y - 37) / 3.5;
      if (dx * dx + dy * dy <= 1.0) {
        const col = (dx * dx + dy * dy < 0.4) ? '#0891B2' : '#042F2E';
        setPixel(x, y, col);
      }
    }
  }

  // Wooden uprights
  const woodLight = '#B45309';
  const woodMid = '#92400E';
  const woodDark = '#78350F';
  const woodDeep = '#451A03';

  // Left post (x: 12..15, y: 16..42)
  for (let y = 16; y <= 42; y += 1) {
    for (let x = 12; x <= 15; x += 1) {
      setPixel(x, y, x <= 13 ? woodMid : woodDark);
    }
  }
  // Right post (x: 40..43, y: 16..42)
  for (let y = 16; y <= 42; y += 1) {
    for (let x = 40; x <= 43; x += 1) {
      setPixel(x, y, x <= 41 ? woodDark : woodDeep);
    }
  }

  // Crossbeam & winch axle (y: 19..22, x: 13..42)
  for (let y = 19; y <= 22; y += 1) {
    for (let x = 13; x <= 42; x += 1) {
      const isSpool = x >= 24 && x <= 32;
      let col = y === 19 ? woodLight : woodDark;
      if (isSpool) {
        col = (x + y) % 2 === 0 ? '#E2C299' : '#A2845E'; // Hemp rope coil
      }
      setPixel(x, y, col);
    }
  }

  // Hanging rope and bucket
  for (let y = 23; y <= 36; y += 1) {
    setPixel(28, y, '#E2C299');
  }
  // Wooden bucket at end of rope (x: 26..30, y: 31..37)
  for (let y = 31; y <= 37; y += 1) {
    for (let x = 26; x <= 30; x += 1) {
      const isIronBand = y === 32 || y === 36;
      setPixel(x, y, isIronBand ? '#475569' : woodMid);
    }
  }

  // Roof structure (A-frame gabled shingle roof, y: 6..18)
  for (let y = 6; y <= 18; y += 1) {
    const t = (y - 6) / 12;
    const spanW = Math.round(14 + t * 30);
    const x0 = Math.round(cx - spanW / 2);
    const x1 = Math.round(cx + spanW / 2);

    for (let x = x0; x <= x1; x += 1) {
      const isRidge = y <= 8;
      const isLeftSlope = x < cx;
      const shingleTile = (Math.floor(x / 4) + Math.floor(y / 3)) % 2;

      let col = isLeftSlope ? (shingleTile ? woodLight : woodMid) : (shingleTile ? woodDark : woodDeep);
      if (isRidge) col = '#D97706';
      setPixel(x, y, col);
    }
  }

  // Wild daisies at well base
  const flowers = [
    { x: 10, y: 53 }, { x: 12, y: 55 }, { x: 44, y: 54 }, { x: 46, y: 52 },
  ];
  for (const f of flowers) {
    setPixel(f.x, f.y, '#FEF08A');
    setPixel(f.x - 1, f.y, '#FFFFFF');
    setPixel(f.x + 1, f.y, '#FFFFFF');
    setPixel(f.x, f.y - 1, '#FFFFFF');
    setPixel(f.x, f.y + 1, '#4D7C0F');
  }

  const witness = createPropWitness('rustic_stone_well', width, height, cells.length);
  return { key: 'rustic_stone_well', width, height, cells, witness };
}

/**
 * 6. Timber Fence Rails with Pitchfork (80x48)
 * Rustic split-rail wooden fence with an iron pitchfork leaning against a post.
 */
export function synthesizeTimberFenceWithPitchfork() {
  const width = 80;
  const height = 48;
  const cells = [];

  const setPixel = (x, y, color, alpha = 255) => {
    if (x >= 0 && x < width && y >= 0 && y < height) {
      cells.push({ x, y, color, alpha });
    }
  };

  const woodLight = '#B45309';
  const woodMid = '#92400E';
  const woodDark = '#78350F';
  const woodDeep = '#451A03';

  // Ground shadows under posts
  const postCenters = [12, 40, 68];
  for (const pc of postCenters) {
    for (let dy = -3; dy <= 3; dy += 1) {
      for (let dx = -7; dx <= 7; dx += 1) {
        if ((dx * dx) / 49 + (dy * dy) / 9 <= 1.0) {
          setPixel(pc + dx, 44 + dy, '#050A08', 130);
        }
      }
    }
  }

  // Horizontal rails (Rendered behind posts)
  // Top rail (y: 20..24, x: 6..74)
  for (let y = 20; y <= 24; y += 1) {
    for (let x = 6; x <= 74; x += 1) {
      const knot = Math.sin(x * 0.4) > 0.8;
      const col = y === 20 ? woodLight : (y >= 23 || knot) ? woodDark : woodMid;
      setPixel(x, y, col);
    }
  }

  // Bottom rail (y: 31..35, x: 6..74)
  for (let y = 31; y <= 35; y += 1) {
    for (let x = 6; x <= 74; x += 1) {
      const knot = Math.sin(x * 0.35 + 2) > 0.8;
      const col = y === 31 ? woodLight : (y >= 34 || knot) ? woodDark : woodMid;
      setPixel(x, y, col);
    }
  }

  // Three vertical fence posts (x: 10..15, 38..43, 66..71)
  const posts = [
    { x0: 10, x1: 15, topY: 13 },
    { x0: 38, x1: 43, topY: 10 },
    { x0: 66, x1: 71, topY: 12 },
  ];

  for (const p of posts) {
    // Post body
    for (let y = p.topY; y <= 44; y += 1) {
      for (let x = p.x0; x <= p.x1; x += 1) {
        const relX = (x - p.x0) / (p.x1 - p.x0);
        const col = relX < 0.35 ? woodLight : relX < 0.75 ? woodMid : woodDeep;
        setPixel(x, y, col);
      }
    }
    // Chiseled post cap
    setPixel(p.x0 + 2, p.topY - 1, woodLight);
    setPixel(p.x0 + 3, p.topY - 1, woodLight);
  }

  // Leaning Iron Pitchfork (slanted from handle top x: 30, y: 12 down to x: 22, y: 44)
  const ironLight = '#F1F5F9';
  const ironMid = '#94A3B8';
  const ironDark = '#475569';
  const ironRust = '#334155';

  // Wooden ash handle
  for (let i = 0; i <= 32; i += 1) {
    const t = i / 32;
    const hx = Math.round(30 - t * 8);
    const hy = Math.round(14 + t * 30);
    setPixel(hx, hy, '#E2C299');
    setPixel(hx + 1, hy, '#B45309');
  }

  // Iron collar & 3 forged tines at top (y: 6..14)
  // Collar
  for (let x = 29; x <= 32; x += 1) {
    setPixel(x, 14, ironMid);
  }
  // Crossbar
  for (let x = 28; x <= 35; x += 1) {
    setPixel(x, 11, ironDark);
  }
  // Tines (three curved prongs pointing up)
  const tineX = [28, 31, 35];
  for (const tx of tineX) {
    for (let ty = 6; ty <= 11; ty += 1) {
      setPixel(tx, ty, ty === 6 ? ironLight : ty < 9 ? ironMid : ironRust);
    }
  }

  // Grassy tufts at post bases
  for (const pc of postCenters) {
    setPixel(pc - 3, 44, '#65A30D');
    setPixel(pc - 4, 43, '#84CC16');
    setPixel(pc + 3, 44, '#4D7C0F');
    setPixel(pc + 4, 42, '#84CC16');
  }

  const witness = createPropWitness('timber_fence_pitchfork', width, height, cells.length);
  return { key: 'timber_fence_pitchfork', width, height, cells, witness };
}

/**
 * 7. Sunflower Patch (64x48)
 * Tall sun-facing golden sunflowers with dark seed centers nestled in wild foliage.
 */
export function synthesizeSunflowerPatch() {
  const width = 64;
  const height = 48;
  const cells = [];

  const setPixel = (x, y, color, alpha = 255) => {
    if (x >= 0 && x < width && y >= 0 && y < height) {
      cells.push({ x, y, color, alpha });
    }
  };

  // Base earth mound
  for (let dy = -5; dy <= 5; dy += 1) {
    for (let dx = -26; dx <= 26; dx += 1) {
      if ((dx * dx) / (26 * 26) + (dy * dy) / (5 * 5) <= 1.0) {
        setPixel(32 + dx, 42 + dy, '#451A03', 180);
      }
    }
  }

  // Sunflowers configuration
  const flowers = [
    { cx: 16, cy: 15, stemX: 18, stemBottom: 42, radius: 9 },
    { cx: 36, cy: 12, stemX: 38, stemBottom: 43, radius: 10 },
    { cx: 50, cy: 18, stemX: 51, stemBottom: 42, radius: 8 },
    { cx: 28, cy: 26, stemX: 29, stemBottom: 43, radius: 8 },
  ];

  // Draw stems and leaves first
  const stemDark = '#1E3A10';
  const stemMid = '#3F6212';
  const leafLight = '#84CC16';
  const leafMid = '#4D7C0F';

  for (const fl of flowers) {
    // 2px thick stem
    for (let y = fl.cy + fl.radius; y <= fl.stemBottom; y += 1) {
      setPixel(fl.stemX, y, stemMid);
      setPixel(fl.stemX + 1, y, stemDark);

      // Leaves projecting outward
      if (y === fl.cy + 12 || y === fl.cy + 18) {
        for (let lx = 1; lx <= 6; lx += 1) {
          setPixel(fl.stemX - lx, y - 1, leafLight);
          setPixel(fl.stemX - lx, y, leafMid);
        }
      }
      if (y === fl.cy + 15) {
        for (let rx = 1; rx <= 6; rx += 1) {
          setPixel(fl.stemX + 1 + rx, y - 1, leafLight);
          setPixel(fl.stemX + 1 + rx, y, leafMid);
        }
      }
    }
  }

  // Draw flower heads (Ray petals + Dark seed disc)
  const petalHi = '#FEF08A';
  const petalMid = '#FDE047';
  const petalGold = '#FBBF24';
  const petalShadow = '#CA8A04';
  const seedDark = '#291004';
  const seedMid = '#451A03';
  const seedHighlight = '#78350F';

  for (const fl of flowers) {
    const r = fl.radius;
    // Petals (circular disc with radial points)
    for (let dy = -r; dy <= r; dy += 1) {
      for (let dx = -r; dx <= r; dx += 1) {
        const dist = Math.hypot(dx, dy);
        if (dist <= r) {
          // Ray petals
          if (dist > r * 0.45) {
            const angle = Math.atan2(dy, dx);
            const petalled = Math.cos(angle * 12) * 1.5;
            if (dist <= r + petalled) {
              const sunDot = (-dx * 0.6 - dy * 0.8) / (dist || 1);
              const col = sunDot > 0.4 ? petalHi : sunDot > 0 ? petalMid : sunDot > -0.4 ? petalGold : petalShadow;
              setPixel(fl.cx + dx, fl.cy + dy, col);
            }
          } else {
            // Seed disc center
            const seedFleck = (dx * 3 + dy * 5) % 2 === 0;
            const col = (dx < 0 && dy < 0 && seedFleck) ? seedHighlight : seedFleck ? seedMid : seedDark;
            setPixel(fl.cx + dx, fl.cy + dy, col);
          }
        }
      }
    }
  }

  // Undergrowth clovers and grass
  for (let x = 10; x <= 54; x += 4) {
    setPixel(x, 42, '#84CC16');
    setPixel(x - 1, 41, '#65A30D');
    setPixel(x + 1, 41, '#65A30D');
    setPixel(x, 40, '#84CC16');
  }

  const witness = createPropWitness('sunflower_patch', width, height, cells.length);
  return { key: 'sunflower_patch', width, height, cells, witness };
}
