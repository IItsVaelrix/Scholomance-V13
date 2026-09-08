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

// Rich 10-stop botanical palette
const PAL = {
  // Sward Greens
  g8: '#D9F99D', // intense specular sunlit tip
  g7: '#BEF264', // sun-kissed lime tip
  g6: '#84CC16', // bright green highlight
  g5: '#44A832', // vibrant spring foliage
  g4: '#288828', // base blade body
  g3: '#186424', // under-canopy green
  g2: '#0E481C', // shadowed grass
  g1: '#0A3014', // deep blade base
  g0: '#04180A', // root occlusion crevice
  // Loam / Soil Substrate
  s3: '#785A3C', // dry surface silt
  s2: '#503822', // rich humus loam
  s1: '#301E10', // damp soil
  s0: '#140A04', // deep earth trench
  // Flowers & Accents
  f_gold: '#FDE047',
  f_white: '#F8FAFC',
  f_rose: '#F472B6',
  f_lavender: '#C084FC',
  // Bark / Roots
  bark_hi: '#8B6544',
  bark_mid: '#5A3D24',
  bark_dark: '#2A170A',
};

function pseudo(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Draws a single realistic 3D grass tuft (cluster of 3-5 blades).
 */
function drawGrassTuft(buf, cx, cy, rnd, { tall = false, golden = false } = {}) {
  // Base occlusion shadow under the tuft
  for (let dx = -3; dx <= 3; dx += 1) {
    if (rnd() > 0.3) buf.setPixel(cx + dx, cy + 1, PAL.g0);
  }

  // Blade 1: Left leaning blade
  const b1H = 3 + Math.floor(rnd() * 3);
  for (let dy = 0; dy <= b1H; dy += 1) {
    const px = cx - Math.round(dy * 0.6) - 1;
    const py = cy - dy;
    const isTip = dy === b1H;
    const isLeft = true;
    let col = isTip ? (golden ? PAL.f_gold : PAL.g7) : (isLeft ? PAL.g6 : PAL.g4);
    if (dy <= 1) col = PAL.g2;
    buf.setPixel(px, py, col);
    // Shadow behind blade
    buf.setPixel(px + 1, py, PAL.g1);
  }

  // Blade 2: Tall central blade
  const b2H = (tall ? 7 : 5) + Math.floor(rnd() * 3);
  for (let dy = 0; dy <= b2H; dy += 1) {
    const px = cx + (dy > 4 ? 1 : 0);
    const py = cy - dy;
    const isTip = dy === b2H;
    let col = isTip ? (golden ? '#FEF08A' : PAL.g8) : dy > b2H - 3 ? (golden ? PAL.f_gold : PAL.g7) : PAL.g5;
    if (dy <= 2) col = PAL.g3;
    buf.setPixel(px, py, col);
    // Blade width on midsection
    if (dy >= 2 && dy <= b2H - 2) {
      buf.setPixel(px - 1, py, PAL.g6); // sunlit left highlight
      buf.setPixel(px + 1, py, PAL.g3); // shadow right edge
    }
  }

  // Blade 3: Right leaning blade
  const b3H = 3 + Math.floor(rnd() * 3);
  for (let dy = 0; dy <= b3H; dy += 1) {
    const px = cx + Math.round(dy * 0.5) + 1;
    const py = cy - dy;
    const isTip = dy === b3H;
    let col = isTip ? PAL.g6 : PAL.g4;
    if (dy <= 1) col = PAL.g1;
    buf.setPixel(px, py, col);
    buf.setPixel(px + 1, py, PAL.g0); // cast shadow
  }

  // Blade 4: Small front tuft
  if (rnd() > 0.4) {
    buf.setPixel(cx - 1, cy, PAL.g5);
    buf.setPixel(cx - 1, cy - 1, PAL.g7);
    buf.setPixel(cx + 1, cy, PAL.g3);
  }
}

/**
 * Draws a 4-leaf clover cluster.
 */
function drawClover(buf, cx, cy, rnd) {
  // Stem
  buf.setPixel(cx, cy + 1, PAL.g2);
  buf.setPixel(cx, cy + 2, PAL.g0);

  // 4 leaves in clover cross pattern
  buf.setPixel(cx - 1, cy, PAL.g6);
  buf.setPixel(cx - 2, cy, PAL.g7);

  buf.setPixel(cx + 1, cy, PAL.g5);
  buf.setPixel(cx + 2, cy, PAL.g6);

  buf.setPixel(cx, cy - 1, PAL.g7);
  buf.setPixel(cx, cy - 2, PAL.g8);

  buf.setPixel(cx, cy + 1, PAL.g4);

  // Pale center heart
  buf.setPixel(cx, cy, PAL.g8);

  // Occasional flower bud
  if (rnd() > 0.6) {
    const fCol = rnd() > 0.5 ? PAL.f_gold : PAL.f_rose;
    buf.setPixel(cx + 2, cy - 2, fCol);
    buf.setPixel(cx + 3, cy - 3, PAL.f_white);
  }
}

/**
 * Synthesizes a true pixel-art 80x40 isometric diamond grass tile.
 */
function renderHighFidelityGrass(variant = 'deep_sward', seed = 4242) {
  const w = 80;
  const h = 40;
  const buf = createBuffer(w, h);
  const rnd = pseudo(seed);

  const halfW = 40;
  const halfH = 20;

  // PASS 1: Loam & Moss Substrate (Organic Textured Base)
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const dx = Math.abs(x - 39.5) / halfW;
      const dy = Math.abs(y - 19.5) / halfH;
      const dist = dx + dy;

      if (dist <= 1.0) {
        const bayer = BAYER_2X2[y % 2][x % 2];
        const n = rnd();

        // Substrate: rich damp earth with velvety moss bed
        let baseCol = PAL.s1;
        if (n > 0.6) baseCol = PAL.g2; // moss undertone
        else if (n > 0.35) baseCol = PAL.g1; // shadowed foliage
        else if (n > 0.15) baseCol = PAL.s2; // rich loam
        else baseCol = PAL.s0; // deep earth shadow

        // Upper-left directional ambient illumination
        if (x < 35 && y < 18 && bayer === 0 && n > 0.5) {
          baseCol = PAL.g3;
        }

        buf.setPixel(x, y, baseCol);
      }
    }
  }

  // PASS 2: Deterministic Grid-Jittered Blade Tufts
  // Distribute tufts across the diamond
  const tuftSpacingX = variant === 'deep_sward' ? 7 : 8;
  const tuftSpacingY = 5;

  for (let gy = 4; gy <= 34; gy += tuftSpacingY) {
    for (let gx = 8; gx <= 72; gx += tuftSpacingX) {
      // Jitter position
      const jx = Math.round(gx + (rnd() - 0.5) * 4);
      const jy = Math.round(gy + (rnd() - 0.5) * 3);

      const dx = Math.abs(jx - 39.5) / halfW;
      const dy = Math.abs(jy - 19.5) / halfH;
      if (dx + dy <= 0.88) {
        if (variant === 'clover_dappled' && rnd() > 0.55) {
          drawClover(buf, jx, jy, rnd);
        } else {
          drawGrassTuft(buf, jx, jy, rnd, {
            tall: variant === 'sunlit_tufts',
            golden: variant === 'sunlit_tufts' && rnd() > 0.4,
          });
        }
      }
    }
  }

  // PASS 3: Special Variant Features
  if (variant === 'ancient_roots') {
    // Winding gnarled root traversing the diamond
    for (let rx = 14; rx <= 66; rx += 1) {
      const ry = Math.round(18 + Math.sin((rx - 40) * 0.1) * 5);
      // Root cylinder thickness 3px
      buf.setPixel(rx, ry - 1, PAL.bark_hi); // top sunlit ridge
      buf.setPixel(rx, ry, PAL.bark_mid);    // root core
      buf.setPixel(rx, ry + 1, PAL.bark_dark); // bottom shadow
      buf.setPixel(rx, ry + 2, PAL.s0);      // ground cast shadow

      // Moss clinging to upper root shoulder
      if (rnd() > 0.45) {
        buf.setPixel(rx, ry - 1, PAL.g6);
        buf.setPixel(rx, ry - 2, PAL.g7);
      }
    }
  }

  return buf;
}

// Generate test preview of the 4 grass types
const previewW = 4 * 84;
const previewH = 44;
const previewBuf = createBuffer(previewW, previewH);

const testTypes = ['deep_sward', 'clover_dappled', 'ancient_roots', 'sunlit_tufts'];
testTypes.forEach((t, i) => {
  const tile = renderHighFidelityGrass(t, 500 + i * 100);
  for (let y = 0; y < tile.h; y += 1) {
    for (let x = 0; x < tile.w; x += 1) {
      const p = tile.getPixel(x, y);
      if (p && p[3] > 0) {
        const dstIdx = (y * previewW + (i * 84 + x)) * 4;
        previewBuf.data[dstIdx] = p[0];
        previewBuf.data[dstIdx + 1] = p[1];
        previewBuf.data[dstIdx + 2] = p[2];
        previewBuf.data[dstIdx + 3] = p[3];
      }
    }
  }
});

const pngData = encodePng(previewW, previewH, previewBuf.data);
fs.writeFileSync(path.join(ARTIFACT_DIR, 'test_hifi_grass_preview.png'), pngData);
console.log('Saved test_hifi_grass_preview.png successfully!');
