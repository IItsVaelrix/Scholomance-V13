/**
 * PB-PERCEPTUAL-FEATURES-v1 encoder
 */

import { FEATURE_SCHEMA, quantize6, contentHash, deepFreeze } from './schema.js';
import { toLabLattice, deltaE76 } from './preprocessing.js';

function clampGet(grid, w, h, x, y) {
  const cx = Math.max(0, Math.min(w - 1, x));
  const cy = Math.max(0, Math.min(h - 1, y));
  return grid[cy * w + cx];
}

function sobelMagOrient(lattice) {
  const { width: w, height: h, L, mask } = lattice;
  const mags = [];
  const orients = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      const gx =
        -clampGet(L, w, h, x - 1, y - 1) + clampGet(L, w, h, x + 1, y - 1)
        - 2 * clampGet(L, w, h, x - 1, y) + 2 * clampGet(L, w, h, x + 1, y)
        - clampGet(L, w, h, x - 1, y + 1) + clampGet(L, w, h, x + 1, y + 1);
      const gy =
        -clampGet(L, w, h, x - 1, y - 1) - 2 * clampGet(L, w, h, x, y - 1) - clampGet(L, w, h, x + 1, y - 1)
        + clampGet(L, w, h, x - 1, y + 1) + 2 * clampGet(L, w, h, x, y + 1) + clampGet(L, w, h, x + 1, y + 1);
      const mag = Math.hypot(gx, gy);
      mags.push(mag);
      orients.push(Math.atan2(gy, gx));
    }
  }
  return { mags, orients };
}

function entropy(hist) {
  const total = hist.reduce((s, v) => s + v, 0);
  if (total <= 0) return 0;
  let e = 0;
  for (const v of hist) {
    if (v <= 0) continue;
    const p = v / total;
    e -= p * Math.log2(p);
  }
  const maxE = Math.log2(hist.length) || 1;
  return e / maxE;
}

function pearson(a, b) {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  let sx = 0; let sy = 0;
  for (let i = 0; i < n; i++) { sx += a[i]; sy += b[i]; }
  const mx = sx / n; const my = sy / n;
  let num = 0; let dx = 0; let dy = 0;
  for (let i = 0; i < n; i++) {
    const vx = a[i] - mx;
    const vy = b[i] - my;
    num += vx * vy;
    dx += vx * vx;
    dy += vy * vy;
  }
  const den = Math.sqrt(dx * dy);
  return den < 1e-12 ? 0 : num / den;
}

function boxCountFractal(mask, w, h, bbox) {
  if (bbox.w <= 0 || bbox.h <= 0) return null;
  const sizes = [];
  const counts = [];
  let size = Math.min(bbox.w, bbox.h);
  while (size >= 1) {
    let count = 0;
    for (let y = bbox.y; y < bbox.y + bbox.h; y += size) {
      for (let x = bbox.x; x < bbox.x + bbox.w; x += size) {
        let hit = false;
        for (let yy = y; yy < Math.min(y + size, bbox.y + bbox.h) && !hit; yy++) {
          for (let xx = x; xx < Math.min(x + size, bbox.x + bbox.w); xx++) {
            if (mask[yy * w + xx]) { hit = true; break; }
          }
        }
        if (hit) count++;
      }
    }
    sizes.push(size);
    counts.push(count);
    size = Math.floor(size / 2);
  }
  if (sizes.length < 2) return null;
  // log N vs log (1/s) slope
  const xs = sizes.map((s) => Math.log(1 / s));
  const ys = counts.map((c) => Math.log(Math.max(1, c)));
  const n = xs.length;
  let sx = 0; let sy = 0; let sxx = 0; let sxy = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i]; sy += ys[i]; sxx += xs[i] * xs[i]; sxy += xs[i] * ys[i];
  }
  const den = n * sxx - sx * sx;
  if (Math.abs(den) < 1e-12) return null;
  const slope = (n * sxy - sx * sy) / den;
  // normalize typical 1–2 range into [0,1]
  return Math.max(0, Math.min(1, (slope - 1) / 1));
}

function frequencySlope(lattice) {
  const { width: w, height: h, L, mask, occupiedCount } = lattice;
  if (w < 16 || h < 16 || occupiedCount === 0) return { value: null, reason: 'frequencySlope-requires-min-16' };

  // Radial mean of |FFT| via naive DFT on occupied L samples projected to grid (small canvases only)
  const maxR = Math.floor(Math.min(w, h) / 2);
  const bins = new Array(maxR).fill(0);
  const binN = new Array(maxR).fill(0);
  // Sample limited frequencies for determinism/perf
  const step = Math.max(1, Math.floor(Math.min(w, h) / 32));
  for (let v = 0; v < h; v += step) {
    for (let u = 0; u < w; u += step) {
      if (u === 0 && v === 0) continue;
      let re = 0; let im = 0;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (!mask[y * w + x]) continue;
          const ang = (-2 * Math.PI * (u * x / w + v * y / h));
          re += L[y * w + x] * Math.cos(ang);
          im += L[y * w + x] * Math.sin(ang);
        }
      }
      const power = re * re + im * im;
      const fx = Math.min(u, w - u) / w;
      const fy = Math.min(v, h - v) / h;
      const r = Math.floor(Math.hypot(fx, fy) * maxR);
      if (r > 0 && r < maxR) {
        bins[r] += power;
        binN[r] += 1;
      }
    }
  }
  const xs = []; const ys = [];
  for (let r = 1; r < maxR; r++) {
    if (binN[r] === 0) continue;
    const p = bins[r] / binN[r];
    if (p <= 1e-12) continue;
    xs.push(Math.log(r));
    ys.push(Math.log(p));
  }
  if (xs.length < 2) return { value: null, reason: 'frequencySlope-insufficient-spectrum' };
  let sx = 0; let sy = 0; let sxx = 0; let sxy = 0;
  const n = xs.length;
  for (let i = 0; i < n; i++) {
    sx += xs[i]; sy += ys[i]; sxx += xs[i] * xs[i]; sxy += xs[i] * ys[i];
  }
  const den = n * sxx - sx * sx;
  if (Math.abs(den) < 1e-12) return { value: null, reason: 'frequencySlope-degenerate' };
  const slope = (n * sxy - sx * sy) / den;
  // map typical negative slopes (-4..0) → [0,1]
  const mapped = Math.max(0, Math.min(1, (-slope) / 4));
  return { value: mapped, reason: null };
}

/**
 * @param {object} input SpatialField or VixelField
 * @param {{ genePalette?: Array<{L,a,b}|string>, targetSize?: number, modeHint?: string }} [options]
 */
export function encodePerceptualFeatures(input, options = {}) {
  const lattice = toLabLattice(input, { targetSize: options.targetSize });
  const reasons = [...lattice.reasons];
  const { width: w, height: h, occupied, bbox, mask, L, a, b, mode } = lattice;

  if (occupied.length === 0) {
    const empty = {
      schema: FEATURE_SCHEMA,
      preprocessing: lattice.preprocessing,
      features: {
        paletteDistance: null,
        luminanceHierarchy: null,
        edgeDensity: null,
        orientationEntropy: null,
        bilateralSymmetry: null,
        radialSymmetry: null,
        visualCenter: null,
        massBalance: null,
        selfSimilarity: null,
        spatialComplexity: null,
        frequencySlope: null,
        fractalDimension: null,
      },
      reasons: Object.freeze([...reasons, 'empty-occupied']),
      featureHash: '',
      mode,
    };
    empty.featureHash = contentHash(empty.features);
    return deepFreeze(empty);
  }

  // paletteDistance
  let paletteDistance = 0;
  if (options.genePalette && options.genePalette.length > 0) {
    const refs = options.genePalette.map((p) => {
      if (typeof p === 'string') {
        // handled as hex via occupied mean later — store as null marker
        return null;
      }
      return p;
    }).filter(Boolean);
    if (refs.length === 0) {
      // use scene median as self-distance ≈ 0 quality of spread
      const Ls = occupied.map((c) => c.L).sort((x, y) => x - y);
      const med = Ls[Math.floor(Ls.length / 2)];
      paletteDistance = occupied.reduce((s, c) => s + Math.abs(c.L - med), 0) / occupied.length / 100;
    } else {
      let sum = 0;
      for (const c of occupied) {
        let best = Infinity;
        for (const ref of refs) best = Math.min(best, deltaE76(c, ref));
        sum += best;
      }
      paletteDistance = Math.min(1, (sum / occupied.length) / 100);
    }
  } else {
    const Ls = occupied.map((c) => c.L).sort((x, y) => x - y);
    const med = Ls[Math.floor(Ls.length / 2)];
    paletteDistance = Math.min(1, occupied.reduce((s, c) => s + Math.abs(c.L - med), 0) / occupied.length / 50);
  }

  // luminanceHierarchy — histogram entropy + step clarity
  const hist = new Array(16).fill(0);
  for (const c of occupied) {
    const bin = Math.max(0, Math.min(15, Math.floor((c.L / 100) * 16)));
    hist[bin]++;
  }
  const lumEntropy = entropy(hist);
  let steps = 0;
  for (let i = 1; i < 16; i++) {
    if (hist[i] > 0 && hist[i - 1] > 0) steps++;
  }
  const stepClarity = steps / 15;
  const luminanceHierarchy = (lumEntropy + stepClarity) / 2;

  const { mags, orients } = sobelMagOrient(lattice);
  const area = Math.max(1, occupied.length);
  const edgeDensity = Math.min(1, (mags.reduce((s, v) => s + v, 0) / area) / 200);

  const oHist = new Array(8).fill(0);
  for (const o of orients) {
    let ang = o;
    if (ang < 0) ang += Math.PI;
    const bin = Math.min(7, Math.floor((ang / Math.PI) * 8));
    oHist[bin]++;
  }
  const orientationEntropy = entropy(oHist);

  // bilateral symmetry about bbox center
  const cx = bbox.x + bbox.w / 2;
  const left = []; const right = [];
  for (const c of occupied) {
    const dx = c.x - cx;
    if (dx < 0) left.push(c.L);
    else right.push(c.L);
  }
  // mirror sample correlation via paired nearest
  const pairL = []; const pairR = [];
  for (const c of occupied) {
    const mx = Math.round(2 * cx - c.x);
    const my = c.y;
    if (mx >= 0 && mx < w && mask[my * w + mx]) {
      pairL.push(c.L);
      pairR.push(L[my * w + mx]);
    }
  }
  const bilateralSymmetry = Math.max(0, Math.min(1, (pearson(pairL, pairR) + 1) / 2));

  // radial symmetry
  const cy = bbox.y + bbox.h / 2;
  const nAng = 12;
  const radialBins = Array.from({ length: nAng }, () => []);
  for (const c of occupied) {
    const ang = Math.atan2(c.y - cy, c.x - cx);
    let t = (ang + Math.PI) / (2 * Math.PI);
    const bin = Math.min(nAng - 1, Math.floor(t * nAng));
    radialBins[bin].push(c.L);
  }
  const means = radialBins.map((arr) => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0));
  const half = Math.floor(nAng / 2);
  const a1 = means.slice(0, half);
  const a2 = means.slice(half, half * 2).reverse();
  const radialSymmetry = Math.max(0, Math.min(1, (pearson(a1, a2) + 1) / 2));

  // visual center (normalized COM of L*-weighted mass)
  let m = 0; let mx = 0; let my = 0;
  for (const c of occupied) {
    const wt = Math.max(0.01, c.L);
    m += wt;
    mx += c.x * wt;
    my += c.y * wt;
  }
  const visualCenter = [
    quantize6(mx / m / Math.max(1, w - 1)),
    quantize6(my / m / Math.max(1, h - 1)),
  ];

  // massBalance torque
  let leftM = 0; let rightM = 0; let upM = 0; let downM = 0;
  for (const c of occupied) {
    const wt = Math.max(0.01, c.L);
    if (c.x < cx) leftM += wt * (cx - c.x);
    else rightM += wt * (c.x - cx);
    if (c.y < cy) upM += wt * (cy - c.y);
    else downM += wt * (c.y - cy);
  }
  const lrDen = leftM + rightM || 1;
  const udDen = upM + downM || 1;
  const massBalance = {
    leftRight: quantize6((rightM - leftM) / lrDen),
    upperLower: quantize6((downM - upM) / udDen),
  };

  // selfSimilarity — block NCC at ½ scale
  const minBlock = mode === 'vixel' ? 4 : 8;
  let selfSimilarity = null;
  if (bbox.w >= minBlock * 2 && bbox.h >= minBlock * 2) {
    const bw = Math.max(minBlock, Math.floor(bbox.w / 2));
    const bh = Math.max(minBlock, Math.floor(bbox.h / 2));
    const blockA = [];
    const blockB = [];
    for (let y = 0; y < bh; y++) {
      for (let x = 0; x < bw; x++) {
        const x0 = bbox.x + x;
        const y0 = bbox.y + y;
        const x1 = bbox.x + Math.min(bbox.w - 1, x + bw);
        const y1 = bbox.y + Math.min(bbox.h - 1, y + bh);
        blockA.push(mask[y0 * w + x0] ? L[y0 * w + x0] : 0);
        blockB.push(mask[y1 * w + x1] ? L[y1 * w + x1] : 0);
      }
    }
    selfSimilarity = Math.max(0, Math.min(1, (pearson(blockA, blockB) + 1) / 2));
  } else {
    reasons.push('selfSimilarity-bbox-too-small');
  }

  // spatialComplexity — boundary length / sqrt(area)
  let boundary = 0;
  for (const c of occupied) {
    const n4 = [
      [c.x + 1, c.y], [c.x - 1, c.y], [c.x, c.y + 1], [c.x, c.y - 1],
    ];
    for (const [nx, ny] of n4) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || !mask[ny * w + nx]) boundary++;
    }
  }
  const spatialComplexity = Math.min(1, boundary / (4 * Math.sqrt(area)));

  const freq = frequencySlope(lattice);
  if (freq.reason) reasons.push(freq.reason);

  const fractalRaw = boxCountFractal(mask, w, h, bbox);
  if (fractalRaw === null) reasons.push('fractalDimension-unavailable');

  const features = {
    paletteDistance: quantize6(paletteDistance),
    luminanceHierarchy: quantize6(luminanceHierarchy),
    edgeDensity: quantize6(edgeDensity),
    orientationEntropy: quantize6(orientationEntropy),
    bilateralSymmetry: quantize6(bilateralSymmetry),
    radialSymmetry: quantize6(radialSymmetry),
    visualCenter,
    massBalance,
    selfSimilarity: selfSimilarity === null ? null : quantize6(selfSimilarity),
    spatialComplexity: quantize6(spatialComplexity),
    frequencySlope: freq.value === null ? null : quantize6(freq.value),
    fractalDimension: fractalRaw === null ? null : quantize6(fractalRaw),
  };

  const packet = {
    schema: FEATURE_SCHEMA,
    preprocessing: lattice.preprocessing,
    features,
    reasons: Object.freeze(reasons),
    mode,
    featureHash: contentHash(features),
  };
  return deepFreeze(packet);
}
