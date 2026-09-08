import fs from 'fs';
import path from 'path';
import { encodePng } from '../codex/core/pixelbrain/scdl/scdl.exporters.js';

const ARTIFACT_DIR = '/home/deck/.gemini/antigravity-ide/brain/2d997ff7-470b-4154-8bf0-043db49fc909';

const BAYER_2X2 = [
  [0, 2],
  [3, 1],
];

function hexToRgb(hex) {
  const clean = String(hex).replace('#', '').padEnd(6, '0');
  return [
    parseInt(clean.slice(0, 2), 16) || 0,
    parseInt(clean.slice(2, 4), 16) || 0,
    parseInt(clean.slice(4, 6), 16) || 0,
  ];
}

function createBuffer(w, h) {
  const data = new Uint8ClampedArray(w * h * 4);
  return {
    w, h, data,
    setPixel(x, y, hex, alpha = 255) {
      if (x < 0 || x >= w || y < 0 || y >= h) return;
      const idx = (y * w + x) * 4;
      const [r, g, b] = hexToRgb(hex);
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = alpha;
    },
    getPixel(x, y) {
      if (x < 0 || x >= w || y < 0 || y >= h) return null;
      const idx = (y * w + x) * 4;
      return [data[idx], data[idx + 1], data[idx + 2], data[idx + 3]];
    }
  };
}

function pseudo(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 1. Reforged Grass Generator
function renderGrassTile(variant, seed = 4242) {
  const w = 80;
  const h = 40;
  const buf = createBuffer(w, h);
  const rnd = pseudo(seed);
  const halfW = 40;
  const halfH = 20;

  // Substrate
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const dx = Math.abs(x - 39.5) / halfW;
      const dy = Math.abs(y - 19.5) / halfH;
      if (dx + dy <= 1.0) {
        const n = rnd();
        // Rich earthy loam with moss understory
        let col = '#301E10';
        if (n > 0.6) col = '#0E481C';
        else if (n > 0.35) col = '#0A3014';
        else if (n > 0.15) col = '#503822';
        else col = '#140A04';

        if (x < 35 && y < 18 && n > 0.65) col = '#186424';
        buf.setPixel(x, y, col);
      }
    }
  }

  // Tufts
  const spacingX = variant === 'grass_deep_sward' ? 7 : 8;
  const spacingY = 5;

  for (let gy = 4; gy <= 34; gy += spacingY) {
    for (let gx = 8; gx <= 72; gx += spacingX) {
      const jx = Math.round(gx + (rnd() - 0.5) * 4);
      const jy = Math.round(gy + (rnd() - 0.5) * 3);
      const dx = Math.abs(jx - 39.5) / halfW;
      const dy = Math.abs(jy - 19.5) / halfH;
      if (dx + dy <= 0.88) {
        if (variant === 'grass_clover_dappled' && rnd() > 0.5) {
          // Clover
          buf.setPixel(jx - 1, jy, '#84CC16');
          buf.setPixel(jx - 2, jy, '#BEF264');
          buf.setPixel(jx + 1, jy, '#44A832');
          buf.setPixel(jx + 2, jy, '#84CC16');
          buf.setPixel(jx, jy - 1, '#BEF264');
          buf.setPixel(jx, jy - 2, '#D9F99D');
          buf.setPixel(jx, jy + 1, '#288828');
          buf.setPixel(jx, jy, '#D9F99D');
          if (rnd() > 0.6) {
            buf.setPixel(jx + 2, jy - 2, rnd() > 0.5 ? '#FDE047' : '#F472B6');
          }
        } else {
          // Blade Tuft
          const isGolden = variant === 'grass_sunlit_tufts' && rnd() > 0.35;
          const isTall = variant === 'grass_sunlit_tufts';

          // Base shadow
          buf.setPixel(jx - 1, jy + 1, '#04180A');
          buf.setPixel(jx, jy + 1, '#04180A');
          buf.setPixel(jx + 1, jy + 1, '#04180A');

          // Left blade
          const b1H = 3 + Math.floor(rnd() * 3);
          for (let d = 0; d <= b1H; d += 1) {
            const px = jx - Math.round(d * 0.6) - 1;
            const py = jy - d;
            buf.setPixel(px, py, d === b1H ? (isGolden ? '#FDE047' : '#BEF264') : '#84CC16');
            buf.setPixel(px + 1, py, '#0A3014');
          }

          // Center blade
          const b2H = (isTall ? 7 : 5) + Math.floor(rnd() * 3);
          for (let d = 0; d <= b2H; d += 1) {
            const px = jx + (d > 4 ? 1 : 0);
            const py = jy - d;
            buf.setPixel(px, py, d === b2H ? (isGolden ? '#FEF08A' : '#D9F99D') : d > b2H - 3 ? '#BEF264' : '#44A832');
            if (d >= 2 && d <= b2H - 2) {
              buf.setPixel(px - 1, py, '#84CC16');
              buf.setPixel(px + 1, py, '#186424');
            }
          }

          // Right blade
          const b3H = 3 + Math.floor(rnd() * 3);
          for (let d = 0; d <= b3H; d += 1) {
            const px = jx + Math.round(d * 0.5) + 1;
            const py = jy - d;
            buf.setPixel(px, py, d === b3H ? '#84CC16' : '#288828');
            buf.setPixel(px + 1, py, '#04180A');
          }
        }
      }
    }
  }

  // Ancient roots
  if (variant === 'grass_ancient_roots') {
    for (let rx = 14; rx <= 66; rx += 1) {
      const ry = Math.round(18 + Math.sin((rx - 40) * 0.1) * 5);
      buf.setPixel(rx, ry - 1, '#8B6544');
      buf.setPixel(rx, ry, '#5A3D24');
      buf.setPixel(rx, ry + 1, '#2A170A');
      buf.setPixel(rx, ry + 2, '#140A04');
      if (rnd() > 0.45) {
        buf.setPixel(rx, ry - 1, '#84CC16');
        buf.setPixel(rx, ry - 2, '#BEF264');
      }
    }
  }

  return buf;
}

// 2. Reforged Path Generator
function renderPathTile(variant, seed = 505) {
  const w = 80;
  const h = 40;
  const buf = createBuffer(w, h);
  const rnd = pseudo(seed);
  const halfW = 40;
  const halfH = 20;

  // 6 distinct polygonal stone slabs
  const slabs = [
    { cx: 38, cy: 19, rx: 11, ry: 6 },
    { cx: 20, cy: 12, rx: 8, ry: 4 },
    { cx: 58, cy: 14, rx: 9, ry: 5 },
    { cx: 24, cy: 26, rx: 9, ry: 5 },
    { cx: 52, cy: 26, rx: 10, ry: 5 },
    { cx: 38, cy: 32, rx: 8, ry: 4 },
    { cx: 39, cy: 7,  rx: 8, ry: 4 },
  ];

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const dx = Math.abs(x - 39.5) / halfW;
      const dy = Math.abs(y - 19.5) / halfH;
      if (dx + dy <= 1.0) {
        let insideSlab = null;
        for (const s of slabs) {
          const sx = (x - s.cx) / s.rx;
          const sy = (y - s.cy) / s.ry;
          const dSq = sx * sx + sy * sy;
          if (dSq <= 1.0) {
            insideSlab = { ...s, sx, sy, dSq };
            break;
          }
        }

        if (insideSlab) {
          // 3D Stone Shading with bevels
          const { sx, sy, dSq } = insideSlab;
          let col = '#64748B'; // stone mid

          // Plane lighting (upper-left light)
          const lightDot = -sx * 0.7 - sy * 0.5;
          if (lightDot > 0.4) col = '#94A3B8';
          else if (lightDot > 0.7) col = '#CBD5E1';
          else if (lightDot < -0.3) col = '#475569';
          else if (lightDot < -0.6) col = '#334155';

          // Chisel crack detail
          if (Math.abs(sx * 4 + sy * 3) < 0.15 && rnd() > 0.3) {
            col = '#1E293B';
          }

          // Crisp 1px bevel rim
          if (dSq > 0.75) {
            if (sx < 0 || sy < 0) col = '#F1F5F9'; // top-left highlight bevel
            else col = '#1E293B'; // bottom-right shadow bevel
          }

          // Runic engraving for path_runic_way on center slab
          if (variant === 'path_runic_way' && insideSlab.cx === 38 && insideSlab.cy === 19) {
            const rx = Math.abs(x - 38);
            const ry = Math.abs(y - 19);
            const isRuneLine = (rx <= 7 && ry === 0) || (ry <= 4 && rx === 0) || (Math.abs(rx - ry * 1.8) < 1 && rx < 6);
            if (isRuneLine) {
              col = '#E0F2FE'; // white-hot mana core
              // Inlaid glow halo
              buf.setPixel(x - 1, y, '#38BDF8');
              buf.setPixel(x + 1, y, '#0284C7');
            }
          }

          // Overgrown creeping thyme
          if (variant === 'path_overgrown' && (rnd() > 0.65 || dSq > 0.7)) {
            col = rnd() > 0.75 ? '#C084FC' : rnd() > 0.4 ? '#84CC16' : '#288828';
          }

          buf.setPixel(x, y, col);
        } else {
          // Mortar trench: dark damp earth with moss
          const n = rnd();
          let mortarCol = '#140A04';
          if (n > 0.65) mortarCol = '#288828';
          else if (n > 0.35) mortarCol = '#0E481C';
          else if (n > 0.15) mortarCol = '#334155'; // gravel pebble
          buf.setPixel(x, y, mortarCol);
        }
      }
    }
  }

  return buf;
}

// 3. Reforged Water & Shorelines
function renderWaterTile(variant, seed = 707) {
  const w = 80;
  const h = 40;
  const buf = createBuffer(w, h);
  const rnd = pseudo(seed);
  const halfW = 40;
  const halfH = 20;

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const dx = Math.abs(x - 39.5) / halfW;
      const dy = Math.abs(y - 19.5) / halfH;
      const dist = dx + dy;

      if (dist <= 1.0) {
        if (variant === 'water_shore_transition') {
          // Shore gradient: grass laps into wet sand into water
          const shoreFactor = (x + y * 1.2) / (w + h * 1.2);
          if (shoreFactor < 0.38) {
            // Earth/grass verge
            buf.setPixel(x, y, rnd() > 0.5 ? '#288828' : '#0E481C');
          } else if (shoreFactor < 0.48) {
            // Wet sand/silt beach
            buf.setPixel(x, y, rnd() > 0.5 ? '#785A3C' : '#503822');
          } else if (shoreFactor < 0.52) {
            // Lapping water foam line
            buf.setPixel(x, y, '#E0F2FE');
          } else {
            // Clear shallow turquoise water
            const wT = (shoreFactor - 0.52) / 0.48;
            let col = wT < 0.3 ? '#22D3EE' : wT < 0.7 ? '#06B6D4' : '#0891B2';
            if (rnd() > 0.92) col = '#A5F3FC'; // specular glint
            buf.setPixel(x, y, col);
          }
        } else {
          // water_deep_spring
          const depth = (1.0 - dist);
          let col = depth > 0.6 ? '#042F2E' : depth > 0.35 ? '#0F766E' : '#0891B2';
          // Submerged mineral stone
          if (Math.hypot(x - 35, y - 18) < 3.5 || Math.hypot(x - 48, y - 22) < 2.5) {
            col = '#5EEAD4';
          }
          // Surface caustic ripple
          if (Math.sin(x * 0.4 + y * 0.8) > 0.7) {
            col = '#67E8F9';
          }
          buf.setPixel(x, y, col);
        }
      }
    }
  }

  // Reeds
  if (variant === 'water_reed_cluster') {
    for (let r = 0; r < 5; r += 1) {
      const rx = 24 + r * 8;
      const ry = 22 + Math.round(rnd() * 6);
      for (let dy = 0; dy <= 6; dy += 1) {
        buf.setPixel(rx, ry - dy, dy === 6 ? '#78350F' : dy > 4 ? '#86EFAC' : '#15803D');
      }
    }
  }

  return buf;
}

// 4. Reforged Stratified Cliff (80x56)
function renderCliffTile(variant, seed = 808) {
  const w = 80;
  const h = 56;
  const buf = createBuffer(w, h);
  const rnd = pseudo(seed);
  const halfW = 40;
  const halfH = 20;

  // Top grass cap (y: 0..39)
  for (let y = 0; y < 40; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const dx = Math.abs(x - 39.5) / halfW;
      const dy = Math.abs(y - 19.5) / halfH;
      if (dx + dy <= 1.0) {
        const n = rnd();
        buf.setPixel(x, y, n > 0.6 ? '#84CC16' : n > 0.3 ? '#44A832' : '#288828');
      }
    }
  }

  // Extruded rock face (16px drop)
  for (let dy = 0; dy < 16; dy += 1) {
    for (let x = 0; x < w; x += 1) {
      const xOffset = Math.abs(x - 39.5) / halfW;
      if (xOffset <= 1.0) {
        const rimY = Math.floor(19.5 + (1.0 - xOffset) * halfH);
        const py = rimY + dy;
        if (py < h) {
          // Stratified shelves every 4px
          const shelfY = dy % 4;
          let col = '#44403C';
          if (shelfY === 0) col = '#78716C'; // shelf top highlight
          else if (shelfY === 1) col = '#57534E'; // shelf body
          else if (shelfY === 2) col = '#292524'; // face shadow
          else if (shelfY === 3) col = '#140A04'; // overhang deep occlusion crevice

          // Vertical fractures
          if (x % 14 === 0) col = '#0C0A09';

          // Moss drapery
          if ((dy <= 4 || rnd() > 0.7) && Math.sin(x * 0.4) > 0.1) {
            col = rnd() > 0.6 ? '#84CC16' : '#15803D';
          }

          // Root curtain variant
          if (variant === 'cliff_root_curtain' && (Math.abs(x - 32) <= 1 || Math.abs(x - 50) <= 2)) {
            col = shelfY === 0 ? '#8B6544' : '#5A3D24';
          }

          buf.setPixel(x, py, col);
        }
      }
    }
  }

  return buf;
}

// Assemble full demonstration montage
const montageW = 4 * 88 + 16;
const montageH = 4 * 62 + 16;
const mBuf = createBuffer(montageW, montageH);

const allTiles = [
  renderGrassTile('grass_deep_sward', 101),
  renderGrassTile('grass_clover_dappled', 102),
  renderGrassTile('grass_ancient_roots', 103),
  renderGrassTile('grass_sunlit_tufts', 104),

  renderPathTile('path_ancient_flagstone', 201),
  renderPathTile('path_runic_way', 202),
  renderPathTile('path_overgrown', 203),
  renderWaterTile('water_shore_transition', 301),

  renderWaterTile('water_deep_spring', 302),
  renderWaterTile('water_reed_cluster', 303),
  renderCliffTile('cliff_mossy_granite', 401),
  renderCliffTile('cliff_root_curtain', 402),
];

allTiles.forEach((tile, idx) => {
  const col = idx % 4;
  const row = Math.floor(idx / 4);
  const startX = 8 + col * 88 + Math.floor((80 - tile.w) / 2);
  const startY = 8 + row * 62 + Math.floor((56 - tile.h) / 2);

  for (let y = 0; y < tile.h; y += 1) {
    for (let x = 0; x < tile.w; x += 1) {
      const p = tile.getPixel(x, y);
      if (p && p[3] > 0) {
        mBuf.setPixel(startX + x, startY + y, `#${((1 << 24) + (p[0] << 16) + (p[1] << 8) + p[2]).toString(16).slice(1)}`);
      }
    }
  }
});

const pngOut = encodePng(montageW, montageH, mBuf.data);
fs.writeFileSync(path.join(ARTIFACT_DIR, 'reforged_hifi_montage_comparison.png'), pngOut);
console.log('Saved reforged_hifi_montage_comparison.png successfully!');
