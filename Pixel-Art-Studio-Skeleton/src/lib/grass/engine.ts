/**
 * Sward grass engine — form first, color second.
 *
 * Geometry (height field, wrapped pits, tuft stamps, scatter blades) is
 * decided completely before any color exists. Color is a rank lookup on the
 * finished form. Same seed always walks the same attempt sequence.
 */
import { PALETTES, rgbToHex } from "./palettes.ts";
import {
  WIND_VECTORS,
  type GrassParams,
  type GrassResult,
  type RGB,
  type WindDir,
} from "./types.ts";

function toFiniteNum(n: unknown, d = 0): number {
  const v = Number(n);
  return Number.isFinite(v) ? v : d;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randInt(rng: () => number, lo: number, hi: number): number {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

function idx(w: number, x: number, y: number): number {
  return y * w + x;
}

function wrap(v: number, n: number): number {
  return ((v % n) + n) % n;
}

function wrapDist(x1: number, y1: number, x2: number, y2: number, w: number, h: number): number {
  const dx = Math.min(Math.abs(x1 - x2), w - Math.abs(x1 - x2));
  const dy = Math.min(Math.abs(y1 - y2), h - Math.abs(y1 - y2));
  return Math.hypot(dx, dy);
}

function fade(t: number): number {
  return t * t * (3 - 2 * t);
}

function hash01(x: number, y: number, seed: number): number {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n >>> 0) % 1000) / 1000;
}

function neighbors4(
  w: number,
  h: number,
  x: number,
  y: number,
): Array<[number, number]> {
  return [
    [wrap(x + 1, w), y],
    [wrap(x - 1, w), y],
    [x, wrap(y + 1, h)],
    [x, wrap(y - 1, h)],
  ];
}

/** Periodic value noise. x=0 is a neighbor of x=w-1 by construction. */
function valueNoise(
  w: number,
  h: number,
  gw: number,
  gh: number,
  rng: () => number,
): Float64Array {
  const grid = new Float64Array(gw * gh);
  for (let i = 0; i < grid.length; i += 1) grid[i] = rng();
  const field = new Float64Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const fx = (x / w) * gw;
      const fy = (y / h) * gh;
      const x0 = Math.floor(fx) % gw;
      const y0 = Math.floor(fy) % gh;
      const x1 = (x0 + 1) % gw;
      const y1 = (y0 + 1) % gh;
      const tx = fade(fx - Math.floor(fx));
      const ty = fade(fy - Math.floor(fy));
      const v00 = grid[y0 * gw + x0]!;
      const v10 = grid[y0 * gw + x1]!;
      const v01 = grid[y1 * gw + x0]!;
      const v11 = grid[y1 * gw + x1]!;
      const v0 = v00 + (v10 - v00) * tx;
      const v1 = v01 + (v11 - v01) * tx;
      field[idx(w, x, y)] = v0 + (v1 - v0) * ty;
    }
  }
  return field;
}

function buildHeight(w: number, h: number, rng: () => number): Float64Array {
  const coarse = Math.max(4, Math.round(w / 5));
  const fine = Math.max(6, Math.round(w / 2.6));
  const grain = Math.max(8, Math.round(w / 1.6));
  const a = valueNoise(w, h, coarse, coarse, rng);
  const b = valueNoise(w, h, fine, fine, rng);
  const c = valueNoise(w, h, grain, grain, rng);
  const field = new Float64Array(w * h);
  for (let i = 0; i < field.length; i += 1) {
    const mixed = a[i]! * 0.28 + b[i]! * 0.42 + c[i]! * 0.3;
    // Compress low-frequency contrast so tiled meadows don't checkerboard.
    field[i] = 0.5 + (mixed - 0.5) * 0.7;
  }
  return field;
}

function carveValleys(
  height: Float64Array,
  w: number,
  h: number,
  soil: number,
  rng: () => number,
): void {
  const n = randInt(
    rng,
    Math.max(2, Math.round(2 + soil * 5)),
    Math.max(3, Math.round(4 + soil * 8)),
  );
  const rLo = 2;
  const rHi = Math.max(3, Math.round(w / 9));
  const depth = 0.12 + soil * 0.28;
  for (let i = 0; i < n; i += 1) {
    const cx = randInt(rng, 0, w - 1);
    const cy = randInt(rng, 0, h - 1);
    const r = randInt(rng, rLo, rHi);
    const stretch = 0.65 + rng() * 0.7;
    const ang = rng() * Math.PI;
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    for (let dy = -r; dy <= r; dy += 1) {
      for (let dx = -r; dx <= r; dx += 1) {
        const rx = dx * c + dy * s;
        const ry = (-dx * s + dy * c) * stretch;
        const dist = Math.hypot(rx, ry);
        if (dist > r) continue;
        const falloff = 1 - dist / r;
        const px = wrap(cx + dx, w);
        const py = wrap(cy + dy, h);
        const i2 = idx(w, px, py);
        height[i2] = Math.max(0, height[i2]! - falloff * falloff * depth);
      }
    }
  }
}

/** part: 0 root, 1 body, 2 tip. Authored growing "up" (−y). */
type Cell = readonly [dx: number, dy: number, part: 0 | 1 | 2];

const STAMPS: Cell[][] = [
  [
    [0, 0, 0],
    [0, -1, 1],
    [0, -2, 1],
    [0, -3, 2],
  ],
  [
    [0, 0, 0],
    [0, -1, 1],
    [0, -2, 2],
  ],
  [
    [0, 0, 0],
    [0, -1, 1],
    [-1, -1, 1],
    [0, -2, 1],
    [-1, -2, 2],
  ],
  [
    [0, 0, 0],
    [0, -1, 1],
    [1, -1, 1],
    [0, -2, 1],
    [1, -2, 1],
    [1, -3, 2],
  ],
  [
    [0, 0, 0],
    [1, 0, 0],
    [0, -1, 1],
    [1, -1, 1],
    [0, -2, 2],
    [1, -2, 1],
  ],
  [
    [0, 0, 0],
    [0, -1, 1],
    [-1, -1, 2],
  ],
  [
    [0, 0, 0],
    [-1, 0, 0],
    [0, -1, 1],
    [-1, -1, 1],
    [0, -2, 2],
  ],
  [
    [0, 0, 0],
    [0, -1, 1],
    [1, -2, 1],
    [0, -2, 1],
    [1, -3, 2],
  ],
  [
    [0, 0, 0],
    [-1, 0, 0],
    [1, 0, 0],
    [0, -1, 1],
    [-1, -1, 1],
    [1, -1, 1],
    [0, -2, 2],
  ],
];

function stampExtent(stamp: Cell[]): number {
  let m = 0;
  for (const [dx, dy] of stamp) m = Math.max(m, Math.abs(dx), Math.abs(dy));
  return m;
}

function transformCell(
  dx: number,
  dy: number,
  windDx: number,
  windDy: number,
): [number, number] {
  const tx = windDx;
  const ty = windDy;
  const px = -windDy;
  const py = windDx;
  return [dx * px + -dy * tx, dx * py + -dy * ty];
}

function heightToRank(v: number, dither: number): number {
  const t = v + (dither - 0.5) * 0.07;
  if (t < 0.28) return 0;
  if (t < 0.58) return 1;
  return 2;
}

function partToRank(part: 0 | 1 | 2): number {
  if (part === 0) return 3;
  if (part === 1) return 4;
  return 5;
}

function wouldMakeTipBlock(
  blades: Int8Array,
  w: number,
  h: number,
  x: number,
  y: number,
): boolean {
  const at = (px: number, py: number) =>
    blades[idx(w, wrap(px, w), wrap(py, h))] === 5;
  // Would (x,y) complete any 2×2 of tips?
  for (const ox of [-1, 0]) {
    for (const oy of [-1, 0]) {
      const cells = [
        [x + ox, y + oy],
        [x + ox + 1, y + oy],
        [x + ox, y + oy + 1],
        [x + ox + 1, y + oy + 1],
      ];
      let tips = 0;
      for (const [cx, cy] of cells) {
        if (cx === x && cy === y) {
          tips += 1;
          continue;
        }
        if (at(cx!, cy!)) tips += 1;
      }
      if (tips === 4) return true;
    }
  }
  return false;
}

function paintBladePixel(
  blades: Int8Array,
  w: number,
  h: number,
  x: number,
  y: number,
  rank: number,
): void {
  const i = idx(w, x, y);
  if (rank === 5 && wouldMakeTipBlock(blades, w, h, x, y)) {
    rank = 4;
  }
  const cur = blades[i]!;
  // Keep an existing tip if the new write is body/root on the same pixel.
  if (cur === 5 && rank < 5) return;
  if (rank >= cur) blades[i] = rank;
}

function growOrganicTuft(
  blades: Int8Array,
  w: number,
  h: number,
  rx: number,
  ry: number,
  wx: number,
  wy: number,
  bladeScale: number,
  rng: () => number,
): void {
  const px = -wy;
  const py = wx;
  const nBlades = randInt(rng, 2, bladeScale > 0.55 ? 4 : 3);
  const maxLen = 2 + Math.round(bladeScale * 3);
  for (let b = 0; b < nBlades; b += 1) {
    const spread = b - (nBlades - 1) / 2;
    let x = wrap(rx + Math.round(spread * px * 0.9), w);
    let y = wrap(ry + Math.round(spread * py * 0.9), h);
    const len = randInt(rng, 2, Math.max(2, maxLen));
    paintBladePixel(blades, w, h, x, y, 3);
    for (let step = 1; step <= len; step += 1) {
      let sx = wx;
      let sy = wy;
      if (rng() < 0.28) {
        sx += rng() < 0.5 ? px : -px;
        sy += rng() < 0.5 ? py : -py;
        if (sx < -1) sx = -1;
        if (sx > 1) sx = 1;
        if (sy < -1) sy = -1;
        if (sy > 1) sy = 1;
      }
      x = wrap(x + sx, w);
      y = wrap(y + sy, h);
      const isTip = step === len && len >= 3 && rng() < 0.55;
      const rank = isTip ? 5 : step === 1 ? 3 : 4;
      paintBladePixel(blades, w, h, x, y, rank);
    }
  }
}

function placeTufts(
  blades: Int8Array,
  w: number,
  h: number,
  params: { density: number; bladeScale: number; wind: WindDir },
  rng: () => number,
): { tuftCount: number; fillCount: number } {
  const [wy, wx] = WIND_VECTORS[params.wind];
  const area = w * h;
  const scale = area / 1024;
  const tuftTarget = Math.round((11 + params.density * 20) * scale);
  const minDist = w <= 16 ? 2.0 : w <= 32 ? 2.6 : 3.4;
  const maxExtent = w <= 16 ? 3 : 4;
  const usable = STAMPS.filter((s) => stampExtent(s) <= maxExtent);
  const source = usable.length ? usable : STAMPS;

  const roots: Array<[number, number]> = [];
  let guard = 0;
  while (roots.length < tuftTarget && guard < tuftTarget * 22) {
    guard += 1;
    const x = randInt(rng, 0, w - 1);
    const y = randInt(rng, 0, h - 1);
    if (roots.some(([rx, ry]) => wrapDist(x, y, rx, ry, w, h) < minDist)) continue;
    roots.push([x, y]);
  }

  for (const [rx, ry] of roots) {
    if (rng() < 0.62) {
      growOrganicTuft(blades, w, h, rx, ry, wx, wy, params.bladeScale, rng);
      continue;
    }
    const stamp = pick(rng, source);
    for (const [dx, dy, part] of stamp) {
      const [sx, sy] = transformCell(dx, dy, wx, wy);
      let rank = partToRank(part);
      if (params.bladeScale < 0.4 && part === 2 && stampExtent(stamp) >= 3) rank = 4;
      paintBladePixel(blades, w, h, wrap(rx + sx, w), wrap(ry + sy, h), rank);
    }
  }

  const fillTarget = Math.round((18 + params.density * 36) * scale);
  let fillCount = 0;
  for (let f = 0; f < fillTarget; f += 1) {
    let x = randInt(rng, 0, w - 1);
    let y = randInt(rng, 0, h - 1);
    const len = randInt(rng, 2, params.bladeScale > 0.65 ? 4 : 3);
    const [dy0, dx0] =
      rng() < 0.75
        ? [wy, wx]
        : pick(rng, [WIND_VECTORS.N, WIND_VECTORS.NW, WIND_VECTORS.NE]);
    for (let step = 0; step < len; step += 1) {
      let dx = dx0;
      let dy = dy0;
      if (rng() < 0.3 && step === 1) dx += rng() < 0.5 ? -1 : 1;
      if (dx < -1) dx = -1;
      if (dx > 1) dx = 1;
      x = wrap(x + dx, w);
      y = wrap(y + dy, h);
      const t = len <= 1 ? 1 : step / (len - 1);
      let rank = 3;
      if (t >= 0.99 && len >= 3 && rng() < 0.4) rank = 5;
      else if (t >= 0.35) rank = 4;
      paintBladePixel(blades, w, h, x, y, rank);
    }
    fillCount += 1;
  }

  return { tuftCount: roots.length, fillCount };
}

function colorGround(
  height: Float64Array,
  w: number,
  h: number,
  seed: number,
): Int8Array {
  const ground = new Int8Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const d = hash01(x, y, seed);
      ground[idx(w, x, y)] = heightToRank(height[idx(w, x, y)]!, d);
    }
  }
  return ground;
}

function compose(ground: Int8Array, blades: Int8Array): Int8Array {
  const field = new Int8Array(ground.length);
  for (let i = 0; i < field.length; i += 1) {
    field[i] = blades[i]! >= 0 ? blades[i]! : ground[i]!;
  }
  return field;
}

function breakLargeShadows(field: Int8Array, w: number, h: number): void {
  const seen = new Uint8Array(w * h);
  const maxSize = Math.max(12, Math.round((w * h) / 48));
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const start = idx(w, x, y);
      if (field[start] !== 0 || seen[start]) continue;
      const cells: number[] = [];
      const stack = [start];
      seen[start] = 1;
      while (stack.length) {
        const i = stack.pop()!;
        cells.push(i);
        const cx = i % w;
        const cy = Math.floor(i / w);
        for (const [nx, ny] of neighbors4(w, h, cx, cy)) {
          const ni = idx(w, nx, ny);
          if (field[ni] === 0 && !seen[ni]) {
            seen[ni] = 1;
            stack.push(ni);
          }
        }
      }
      if (cells.length <= maxSize) continue;
      for (let k = 0; k < cells.length; k += 1) {
        if ((k * 17 + cells[k]!) % 5 !== 0) continue;
        field[cells[k]!] = 1;
      }
    }
  }
}

function cleanup(field: Int8Array, w: number, h: number): void {
  breakLargeShadows(field, w, h);
  const next = Int8Array.from(field);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = idx(w, x, y);
      const v = field[i]!;
      const ns = neighbors4(w, h, x, y).map(([nx, ny]) => field[idx(w, nx, ny)]!);

      if (v === 5) {
        const hasLeaf = ns.some((n) => n === 4 || n === 3);
        if (!hasLeaf) next[i] = 4;
        continue;
      }

      if (v === 0) {
        const bedish = ns.filter((n) => n === 1 || n === 2).length;
        if (bedish === 4) next[i] = 1;
      }
    }
  }
  // Break remaining 2×2 tip blocks.
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const at = (px: number, py: number) =>
        next[idx(w, wrap(px, w), wrap(py, h))] === 5;
      if (at(x, y) && at(x + 1, y) && at(x, y + 1) && at(x + 1, y + 1)) {
        next[idx(w, wrap(x + 1, w), wrap(y + 1, h))] = 4;
      }
    }
  }
  field.set(next);
}

function countColors(field: Int8Array): Record<number, number> {
  const counts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const v of field) counts[v] = (counts[v] ?? 0) + 1;
  return counts;
}

function scoreField(field: Int8Array, w: number, h: number): { score: number; reasons: string[] } {
  const total = w * h;
  const counts = countColors(field);
  const frac = (c: number) => (counts[c] ?? 0) / total;
  const reasons: string[] = [];
  let score = 10;

  const tip = frac(5);
  const soil = frac(0);
  const leaf = frac(4);
  const bed = frac(1);

  if (tip > 0.045) {
    score -= (tip - 0.045) * 80;
    reasons.push(`tip ${tip.toFixed(3)} high`);
  }
  if (tip < 0.004) {
    score -= 1.5;
    reasons.push("tips sparse");
  }
  if (soil > 0.28) {
    score -= (soil - 0.28) * 40;
    reasons.push(`shadow ${soil.toFixed(3)} high`);
  }
  if (soil < 0.02) score -= 0.4;
  if (leaf < 0.08) {
    score -= 2;
    reasons.push("few leaves");
  }
  if (bed < 0.12) score -= 1;

  let tipBlocks = 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const at = (px: number, py: number) =>
        field[idx(w, wrap(px, w), wrap(py, h))] === 5;
      if (at(x, y) && at(x + 1, y) && at(x, y + 1) && at(x + 1, y + 1)) tipBlocks += 1;
    }
  }
  if (tipBlocks) {
    score -= tipBlocks * 3;
    reasons.push("tip block");
  }

  return { score, reasons };
}

function passes(field: Int8Array, w: number, h: number): boolean {
  const { score } = scoreField(field, w, h);
  return score >= 7.5;
}

export function generateGrass(params: GrassParams): GrassResult {
  const w = Math.max(8, Math.min(128, Math.floor(toFiniteNum(params.width, 32)))) as number;
  const h = Math.max(8, Math.min(128, Math.floor(toFiniteNum(params.height, 32)))) as number;
  const baseSeed = toFiniteNum(params.seed, 1) >>> 0;
  const maxAttempts = 80;
  const palette: RGB[] = params.palette;

  let best: {
    field: Int8Array;
    ground: Int8Array;
    blades: Int8Array;
    score: number;
    reasons: string[];
    attempt: number;
    tuftCount: number;
    fillCount: number;
  } | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const rng = makeRng((baseSeed + attempt * 0x9e3779b1) >>> 0);
    const height = buildHeight(w, h, rng);
    carveValleys(height, w, h, clamp01(params.soil), rng);
    const ground = colorGround(height, w, h, baseSeed + attempt);
    const blades = new Int8Array(w * h).fill(-1);
    const { tuftCount, fillCount } = placeTufts(
      blades,
      w,
      h,
      {
        density: clamp01(params.density),
        bladeScale: clamp01(params.bladeScale),
        wind: params.wind,
      },
      rng,
    );
    const field = compose(ground, blades);
    cleanup(field, w, h);
    const { score, reasons } = scoreField(field, w, h);
    if (!best || score > best.score) {
      best = { field, ground, blades, score, reasons, attempt, tuftCount, fillCount };
    }
    if (passes(field, w, h) && attempt >= 0) {
      break;
    }
  }

  if (!best) {
    throw new Error("sward: generator produced no field");
  }

  const counts = countColors(best.field);
  const total = w * h;
  const fractions: Record<number, number> = {};
  for (const [k, v] of Object.entries(counts)) fractions[Number(k)] = v / total;

  return {
    field: best.field,
    ground: best.ground,
    blades: best.blades,
    palette: palette.map(rgbToHex),
    rgb: palette,
    width: w,
    height: h,
    diagnostics: {
      attempts: best.attempt + 1,
      tuftCount: best.tuftCount,
      fillCount: best.fillCount,
      counts,
      fractions,
      seed: baseSeed,
      warnings: best.score < 7.5 ? best.reasons : [],
      accepted: best.score >= 7.5,
    },
  };
}

export function defaultParams(): GrassParams {
  return {
    width: 32,
    height: 32,
    seed: 0x5a17,
    density: 0.58,
    wind: "NW",
    soil: 0.35,
    bladeScale: 0.62,
    paletteId: "meadow",
    palette: PALETTES[0]!.colors,
  };
}
