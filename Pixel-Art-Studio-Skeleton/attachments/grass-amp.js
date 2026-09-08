/**
 * GRASS-AMP.js
 * Form-first grass tile generator: geometry is decided completely before any
 * color exists, and color is a simple lookup applied to the finished form.
 *
 * Three prior approaches were tried and rejected this session, in order:
 *   1. Per-pixel noise dithering — read as static, or (once smoothed) as
 *      flat "paint," never as grass.
 *   2. Vector blade polygons — didn't tile, and let bright "tip" color
 *      sprawl across ~15% of the tile instead of reading as sparse highlight.
 *   3. A color-first "constrained tile sampler" — generated a noise value,
 *      bucketed it DIRECTLY into a color rank, then fought the resulting
 *      histogram with a pixel-shuffling budget-correction loop whenever it
 *      missed a target percentage. This one taught the real lesson: color
 *      was the INDEPENDENT variable and shape was an accident of thresholds,
 *      so every fix was a new way to shuffle pixels after the fact instead
 *      of a reason the shape should look that way.
 *
 * This version: FORM first, color second.
 *   - The ground is a real height field (a genuine "this ground has bumps
 *     and hollows" quantity) — pits are literal depressions carved into it,
 *     not a separately-painted overlay.
 *   - Leaf clumps are grown as real stroke geometry (a path with a root end
 *     and a tip end) — a SEPARATE layer sitting on top of the ground, not a
 *     color bucket.
 *   - Color is applied ONLY after both layers are fully decided: ground
 *     color comes from height rank, clump color comes from position along
 *     the stroke (root end -> mid/leaf, tip end -> bright tip, capped at 1-2
 *     pixels per stroke by construction, not by a percentage budget).
 *   - Gates check FORM validity (seamless tiling, no isolated tip pixels, no
 *     2x2 tip blocks, bounded component sizes) — a failing draw rejects the
 *     whole form and resamples with a new seed. There is no per-color pixel
 *     percentage gate to fight; color follows form, so a reasonable form
 *     produces a reasonable color spread by construction.
 *
 * Determinism (Law 6): a seeded PRNG (mulberry32), never Math.random. The
 * reject/resample loop is itself deterministic — same starting seed always
 * walks the same attempt sequence to the same accepted result.
 *
 * @bytecode PB-GRASS-FIELD-v2
 */

export const GRASS_AMP_ID = 'grass';
export const GRASS_AMP_VERSION = '3.0.0';

function err(msg, ctx) { const e = new Error(`grass-amp: ${msg}`); e.cause = ctx; return e; }
function toFiniteNum(n, d = 0) { const v = Number(n); return Number.isFinite(v) ? v : d; }
function clamp01(v) { return Math.max(0, Math.min(1, v)); }

// ─── seeded PRNG (mulberry32) — deterministic, no Math.random ──────────────
function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function randInt(rng, lo, hi) { return lo + Math.floor(rng() * (hi - lo + 1)); }
function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }

export const DEFAULT_CONFIG = Object.freeze({
  w: 32, h: 32,
  // index = color rank, dark soil (0) -> bright leaf-tip (5). This is now
  // purely an OUTPUT lookup table — nothing generates against it directly.
  palette: [
    [14, 42, 11],   // 0 soil (pit floor)
    [23, 58, 19],   // 1 bed (normal ground height)
    [31, 71, 24],   // 2 dark-mid (locally raised ground texture)
    [40, 85, 31],   // 3 mid (clump root)
    [74, 156, 46],  // 4 leaf (clump body)
    [182, 232, 94], // 5 tip (clump tip — capped by stroke geometry, not budget)
  ],
  light: [-1, -1],  // [dy, dx], top-left — biases clump growth direction
  soilPits: [4, 6],
  pitRadius: [4, 8],
  pitDepth: 0.55,   // how far a pit lowers local height, 0..1
  clumpCount: [10, 16],
  clumpLength: [4, 9],
  maxTipComponent: 3,
  maxC0Components: 15,
  forbidTip2x2: true,
  // Loose SANITY bounds only, not a percentage target to fight for — this
  // is what directly fixes the original complaint (tip sprawl: "lime is
  // 153px") without reintroducing a pixel-shuffling correction loop. A form
  // this far outside sane range gets rejected and resampled whole; nothing
  // patches individual pixels afterward.
  sanity: { 0: [0.03, 0.30], 1: [0.15, 0.55], 5: [0, 0.05] },
  wrap: true,
  maxAttempts: 500,
});

function rgbToHex([r, g, b]) {
  return `#${[r, g, b].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('')}`;
}
function makeFloatField(w, h, fill = 0) { return new Float64Array(w * h).fill(fill); }
function makeIntField(w, h, fill = -1) { return new Int16Array(w * h).fill(fill); }
function idx(w, x, y) { return y * w + x; }
function wrapCoord(v, n) { return ((v % n) + n) % n; }
function neighbors4(w, h, x, y, wrap) {
  const raw = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
  return raw
    .map(([nx, ny]) => (wrap ? [wrapCoord(nx, w), wrapCoord(ny, h)] : [nx, ny]))
    .filter(([nx, ny]) => nx >= 0 && nx < w && ny >= 0 && ny < h);
}

// ─── FORM layer 1: ground height field ──────────────────────────────────────
// Periodic coarse noise, nearest-upsampled — automatically tileable, no
// interpolation needed. This is a real elevation quantity (0..1), not a
// color bucket: pits SUBTRACT from it below, color is read from it after.
function heightField(cfg, rng) {
  const { w, h } = cfg;
  const CW = 8, CH = 8;
  const coarse = Array.from({ length: CH }, () => Array.from({ length: CW }, () => rng()));
  const field = makeFloatField(w, h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const cx = Math.floor(x / (w / CW)) % CW;
      const cy = Math.floor(y / (h / CH)) % CH;
      field[idx(w, x, y)] = coarse[cy][cx];
    }
  }
  return field;
}

// Pits are literal depressions: height drops toward the center, organically
// (soft falloff, not a hard disc), wrapped so a pit straddling the tile edge
// carves correctly on both sides.
function carvePits(height, cfg, rng) {
  const { w, h } = cfg;
  const n = randInt(rng, cfg.soilPits[0], cfg.soilPits[1]);
  for (let i = 0; i < n; i += 1) {
    const cx = randInt(rng, 0, w - 1), cy = randInt(rng, 0, h - 1);
    const r = randInt(rng, cfg.pitRadius[0], cfg.pitRadius[1]);
    for (let dy = -r; dy <= r; dy += 1) {
      for (let dx = -r; dx <= r; dx += 1) {
        const dist = Math.hypot(dx, dy);
        if (dist > r) continue;
        const falloff = 1 - dist / r; // 1 at center, 0 at rim
        const px = wrapCoord(cx + dx, w), py = wrapCoord(cy + dy, h);
        const i2 = idx(w, px, py);
        height[i2] = Math.max(0, height[i2] - falloff * falloff * cfg.pitDepth);
      }
    }
  }
}

// ─── FORM layer 2: leaf clumps (stroke geometry, no color) ──────────────────
// Each clump is a walked path with a real root (t=0) and tip (t=1) end —
// color is read from `t` later, never decided here.
const LEAN = [[-1, -1], [-1, 0], [0, -1]]; // [dy, dx] toward top-left light
function growClumps(cfg, rng) {
  const { w, h } = cfg;
  const clumpOf = makeIntField(w, h, -1);   // which clump owns this pixel, or -1
  const tOf = makeFloatField(w, h, 0);      // 0 (root) .. 1 (tip) along its clump
  const clumps = [];
  const n = randInt(rng, cfg.clumpCount[0], cfg.clumpCount[1]);
  for (let c = 0; c < n; c += 1) {
    const sx = randInt(rng, 0, w - 1), sy = randInt(rng, 0, h - 1);
    const [dy, dx] = pick(rng, LEAN);
    const length = randInt(rng, cfg.clumpLength[0], cfg.clumpLength[1]);
    const cells = [];
    let x = sx, y = sy;
    for (let step = 0; step < length; step += 1) {
      x = wrapCoord(x + dx, w); y = wrapCoord(y + dy, h);
      cells.push([x, y]);
    }
    for (let step = 0; step < cells.length; step += 1) {
      const [cx, cy] = cells[step];
      const i2 = idx(w, cx, cy);
      clumpOf[i2] = c;
      tOf[i2] = cells.length <= 1 ? 1 : step / (cells.length - 1);
    }
    clumps.push({ id: c, length: cells.length });
  }
  return { clumpOf, tOf, clumps };
}

// ─── color: a lookup applied to the finished form, nothing else ────────────
function heightToColor(v) {
  // v is LOCAL height after pit-carving: low = pit floor, mid = normal bed,
  // high = a locally raised bit of ground texture. Three ranks only — the
  // ground never needs more than soil/bed/dark-mid.
  if (v < 0.30) return 0;
  if (v < 0.62) return 1;
  return 2;
}
function clumpTToColor(t) {
  // Root end reads as mid-tone, most of the body as leaf, and only the
  // FINAL step of a stroke can ever be tip — capped by geometry (one clump
  // contributes at most one tip pixel), never by a percentage budget.
  if (t < 0.55) return 3;
  if (t < 0.999) return 4;
  return 5;
}

function renderColors(height, clumpOf, tOf, cfg) {
  const { w, h } = cfg;
  const field = new Int8Array(w * h);
  for (let i = 0; i < field.length; i += 1) {
    field[i] = clumpOf[i] >= 0 ? clumpTToColor(tOf[i]) : heightToColor(height[i]);
  }
  return field;
}

// ─── seams: exact copy, so tiling holds by construction ────────────────────
function wrapSeams(field, cfg, band = 2) {
  const { w, h } = cfg;
  for (let b = 0; b < band; b += 1) {
    for (let y = 0; y < h; y += 1) field[idx(w, w - 1 - b, y)] = field[idx(w, b, y)];
  }
  for (let b = 0; b < band; b += 1) {
    for (let x = 0; x < w; x += 1) field[idx(w, x, h - 1 - b)] = field[idx(w, x, b)];
  }
}

// ─── connected components (toroidal 4-connectivity) ────────────────────────
function findComponents(field, cfg, color) {
  const { w, h } = cfg;
  const seen = new Uint8Array(w * h);
  const sizes = [];
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = idx(w, x, y);
      if (field[i] !== color || seen[i]) continue;
      let size = 0;
      const stack = [[x, y]];
      seen[i] = 1;
      while (stack.length) {
        const [cx, cy] = stack.pop();
        size += 1;
        for (const [nx, ny] of neighbors4(w, h, cx, cy, cfg.wrap)) {
          const ni = idx(w, nx, ny);
          if (field[ni] === color && !seen[ni]) { seen[ni] = 1; stack.push([nx, ny]); }
        }
      }
      sizes.push(size);
    }
  }
  return sizes;
}
function countColors(field) {
  const counts = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const v of field) counts[v] = (counts[v] ?? 0) + 1;
  return counts;
}

// ─── gates: FORM validity, not a color percentage to hit ───────────────────
function passesGates(field, cfg) {
  const { w, h } = cfg;
  for (let y = 0; y < h; y += 1) if (field[idx(w, 0, y)] !== field[idx(w, w - 1, y)]) return { ok: false, reason: 'left/right edge mismatch' };
  for (let x = 0; x < w; x += 1) if (field[idx(w, x, 0)] !== field[idx(w, x, h - 1)]) return { ok: false, reason: 'top/bottom edge mismatch' };

  const total = w * h;
  const counts = countColors(field);
  for (const [color, [lo, hi]] of Object.entries(cfg.sanity)) {
    const frac = counts[color] / total;
    if (frac < lo || frac > hi) return { ok: false, reason: `color ${color} fraction ${frac.toFixed(3)} outside sanity range [${lo}, ${hi}]` };
  }

  const c0 = findComponents(field, cfg, 0);
  if (c0.length > cfg.maxC0Components) return { ok: false, reason: `${c0.length} soil components > max ${cfg.maxC0Components}` };

  const c5 = findComponents(field, cfg, 5);
  if (c5.some((s) => s > cfg.maxTipComponent)) return { ok: false, reason: 'a tip component exceeds maxTipComponent' };
  if (c5.some((s) => s === 1)) return { ok: false, reason: 'an isolated (size-1) tip component exists' };

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (field[idx(w, x, y)] !== 5) continue;
      const ns = neighbors4(w, h, x, y, cfg.wrap);
      if (ns.some(([nx, ny]) => { const v = field[idx(w, nx, ny)]; return v === 0 || v === 1; })) {
        return { ok: false, reason: 'a tip touches soil/bed' };
      }
    }
  }

  if (cfg.forbidTip2x2) {
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const at = (px, py) => field[idx(w, wrapCoord(px, w), wrapCoord(py, h))];
        if (at(x, y) === 5 && at(x + 1, y) === 5 && at(x, y + 1) === 5 && at(x + 1, y + 1) === 5) {
          return { ok: false, reason: '2x2 tip block' };
        }
      }
    }
  }

  return { ok: true, reason: null };
}

/**
 * Generate one grass field. Form (ground height + clump strokes) is decided
 * completely before any color exists; color is a lookup over the finished
 * form. Internally tries seed, seed+1, seed+2, ... up to `maxAttempts` until
 * a draw's FORM passes every gate — a failing draw is a bad shape, so the
 * whole form resamples, never a per-pixel color patch.
 *
 * @param {object} [options] - overrides merged onto DEFAULT_CONFIG
 *   (width/height map onto cfg.w/cfg.h for this repo's other AMPs' naming).
 * @returns {{ field: Int8Array, palette: string[], width: number,
 *   height: number, diagnostics: object }}
 */
export function GrassAMP(options = {}) {
  const cfg = {
    ...DEFAULT_CONFIG,
    ...options,
    w: Math.max(1, Math.floor(toFiniteNum(options.width ?? options.w, DEFAULT_CONFIG.w))),
    h: Math.max(1, Math.floor(toFiniteNum(options.height ?? options.h, DEFAULT_CONFIG.h))),
    palette: options.palette ?? DEFAULT_CONFIG.palette,
    sanity: options.sanity ?? DEFAULT_CONFIG.sanity,
  };
  const baseSeed = (toFiniteNum(options.seed, 0)) >>> 0;
  const maxAttempts = Math.max(1, Math.floor(toFiniteNum(cfg.maxAttempts, 500)));

  let lastReason = null;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const rng = makeRng((baseSeed + attempt * 0x9e3779b1) >>> 0);
    const height = heightField(cfg, rng);
    carvePits(height, cfg, rng);
    const { clumpOf, tOf, clumps } = growClumps(cfg, rng);
    const field = renderColors(height, clumpOf, tOf, cfg);
    wrapSeams(field, cfg);
    const gate = passesGates(field, cfg);
    if (gate.ok) {
      return {
        field,
        palette: cfg.palette.map(rgbToHex),
        width: cfg.w,
        height: cfg.h,
        diagnostics: {
          warnings: [], errors: [],
          metrics: { attempts: attempt + 1, clumpCount: clumps.length, counts: countColors(field) },
        },
      };
    }
    lastReason = gate.reason;
  }
  throw err(`no grass field passed all gates within ${maxAttempts} attempts`, { lastReason, cfg });
}

export const GRASS_AMP_SEAM = Object.freeze({
  id: 'grass-v3',
  processor: GRASS_AMP_ID,
  version: GRASS_AMP_VERSION,
  consumes: [],
  emits: ['field', 'palette'],
  mutates: [],
  mergeContract: 'grass-tile-field-form-first-v3',
});

export default { GrassAMP, id: GRASS_AMP_ID, seam: GRASS_AMP_SEAM };
