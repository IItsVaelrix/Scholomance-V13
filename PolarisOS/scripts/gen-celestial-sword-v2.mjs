#!/usr/bin/env node
/**
 * Celestial Sword V2 — Analytic SDF Atelier
 *
 * Authors the celestial sword as pure mathematics: a kit of signed-distance
 * primitives (tapered blade profiles, quadratic-Bézier wing capsules, rings,
 * 4-point stars, rounded boxes) sampled onto a 32×128 vixel lattice.
 *
 * Every emitted cell carries full vector identity (signedDistance, normal,
 * tangent, curvature, arc-length parameter) derived numerically from the
 * analytic fields — ready for the Native Vixel Texture Engine.
 *
 * Orientation matches the concept sheet: Pommel of Origin at the top,
 * Guardian Cross in the middle, radiant blade tip at the bottom.
 *
 * Output:
 *   worldpacks/shrine-demo/scdl/celestial-sword-v2-json.json
 *   worldpacks/shrine-demo/wand/celestial-sword-v2.wand.json
 *
 * Usage:
 *   node scripts/gen-celestial-sword-v2.mjs
 */

import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const W = 32;
const H = 128;
const AXIS = 16;

// ─── Palette (vixel-optimized, mirrors the concept sheet) ────────────────────
const C = {
  stardust: '#FFF8E7',
  flareGold: '#E6AA4E',
  brightGold: '#D4AF37',
  bronzeGold: '#99752A',
  frostBlue: '#9BB8D8',
  cosmicBlue: '#5A7FC2',
  deepViolet: '#2E2954',
  voidBlack: '#12101F',
  cyanGlow: '#80FFFF',
};

const ahex = (a) => Math.max(0, Math.min(255, Math.round(a))).toString(16).padStart(2, '0').toUpperCase();

// ─── SDF primitive kit ───────────────────────────────────────────────────────

const sdDisc = (cx, cy, r) => (x, y) => Math.hypot(x - cx, y - cy) - r;

const sdRing = (cx, cy, r, halfBand) => (x, y) => Math.abs(Math.hypot(x - cx, y - cy) - r) - halfBand;

/** Four-point star: polar radius modulated between r (tips) and r*inner (waist). */
const sdStar4 = (cx, cy, r, inner = 0.42) => (x, y) => {
  const dx = x - cx, dy = y - cy;
  const rho = Math.hypot(dx, dy);
  const theta = Math.atan2(dy, dx);
  const rt = r * (inner + (1 - inner) * Math.pow(Math.abs(Math.cos(2 * theta)), 0.65));
  return (rho - rt) * 0.78; // compression factor approximates true distance
};

const sdRoundBox = (cx, cy, hw, hh, rad) => (x, y) => {
  const qx = Math.abs(x - cx) - (hw - rad);
  const qy = Math.abs(y - cy) - (hh - rad);
  const ox = Math.max(qx, 0), oy = Math.max(qy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - rad;
};

/** Blade silhouette: symmetric about AXIS, flat shoulder at y0, power-curve point at y1. */
const BLADE = { y0: 40, y1: 124 };
function bladeHalfWidth(y) {
  if (y <= 50) return 3.9;
  if (y <= 86) { const u = (y - 50) / 36; return 3.15 + 0.75 * Math.cos((u * Math.PI) / 2); }
  const u = Math.min(1, (y - 86) / 38);
  return 3.15 * (1 - Math.pow(u, 1.7));
}
function bladeHalfWidthDeriv(y) {
  const e = 0.05;
  return (bladeHalfWidth(y + e) - bladeHalfWidth(y - e)) / (2 * e);
}
const sdBladeBase = (x, y) => {
  const ax = Math.abs(x - AXIS);
  if (y < BLADE.y0) return Math.max(BLADE.y0 - y, ax - bladeHalfWidth(BLADE.y0));
  if (y > BLADE.y1) return Math.hypot(x - AXIS, y - BLADE.y1);
  const w = bladeHalfWidth(y);
  const wp = bladeHalfWidthDeriv(y);
  return (ax - w) / Math.hypot(1, wp);
};
const sdBlade = (inset) => (x, y) => sdBladeBase(x, y) + inset;

/** Central fuller channel: slim at the guard, breathing wider mid-blade, dying into the point. */
const FULLER = { y0: 42, y1: 119 };
function fullerHalfWidth(y) {
  if (y <= 112) return 0.7 + 0.6 * Math.sin((Math.PI * (y - FULLER.y0)) / 76);
  const u = Math.min(1, (y - 112) / (FULLER.y1 - 112));
  return 0.7 * (1 - Math.pow(u, 1.5));
}
const sdFullerBase = (x, y) => {
  const ax = Math.abs(x - AXIS);
  if (y < FULLER.y0) return Math.max(FULLER.y0 - y, ax - fullerHalfWidth(FULLER.y0));
  if (y > FULLER.y1) return Math.hypot(x - AXIS, y - FULLER.y1);
  return ax - fullerHalfWidth(y);
};
const sdFuller = (inset) => (x, y) => sdFullerBase(x, y) + inset;

/** Tapered capsule along a quadratic Bézier spine (crossguard wings & claws). */
function makeTaperCurve(p0, p1, p2, r0, r1) {
  const P = (t) => {
    const u = 1 - t;
    return [u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
            u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]];
  };
  // Pre-compute arc length
  let arcLen = 0, prev = P(0);
  for (let i = 1; i <= 64; i++) { const q = P(i / 64); arcLen += Math.hypot(q[0] - prev[0], q[1] - prev[1]); prev = q; }

  const query = (x, y) => {
    let bestT = 0, bestD = Infinity;
    for (let i = 0; i <= 64; i++) {
      const t = i / 64, q = P(t);
      const d = (q[0] - x) ** 2 + (q[1] - y) ** 2;
      if (d < bestD) { bestD = d; bestT = t; }
    }
    // Parabolic refinement around best sample
    const h = 1 / 64;
    const f = (t) => { const q = P(Math.max(0, Math.min(1, t))); return (q[0] - x) ** 2 + (q[1] - y) ** 2; };
    const dm = f(bestT - h), d0 = f(bestT), dp = f(bestT + h);
    const denom = dm - 2 * d0 + dp;
    if (Math.abs(denom) > 1e-9) {
      const tRef = bestT + 0.5 * h * (dm - dp) / denom;
      if (tRef > bestT - h && tRef < bestT + h) { bestT = Math.max(0, Math.min(1, tRef)); bestD = f(bestT); }
    }
    const r = r0 + (r1 - r0) * bestT;
    return { sd: Math.sqrt(bestD) - r, t: bestT, arcLen };
  };
  return query;
}

// ─── Numeric differential geometry (normals, tangents, curvature) ────────────
function diffGeom(sdFn, x, y) {
  const e = 0.02;
  const grad = (X, Y) => {
    const gx = (sdFn(X + e, Y) - sdFn(X - e, Y)) / (2 * e);
    const gy = (sdFn(X, Y + e) - sdFn(X, Y - e)) / (2 * e);
    const l = Math.hypot(gx, gy) || 1;
    return [gx / l, gy / l];
  };
  const [nx, ny] = grad(x, y);
  const [nxp] = grad(x + e, y), [nxm] = grad(x - e, y);
  const [, nyp] = grad(x, y + e), [, nym] = grad(x, y - e);
  const kappa = (nxp - nxm) / (2 * e) + (nyp - nym) / (2 * e);
  return { normal: [nx, ny], tangent: [-ny, nx], curvature: kappa };
}

// ─── Structural part definitions (paint order = array order, last wins) ──────
const wingL = makeTaperCurve([16, 35.5], [9, 37.5], [2.6, 32.4], 2.7, 0.35);
const clawL = makeTaperCurve([12.8, 36.5], [10.3, 39.5], [10.8, 43.5], 1.5, 0.3);
// Right side = exact mirror wrapper (guarantees MirrorDelta = 0 at the lattice level)
const mirrorQ = (q) => (x, y) => q(32 - x, y);
const wingR = mirrorQ(wingL);
const clawR = mirrorQ(clawL);

const circleParam = (cx, cy, r) => (x, y) => ({
  t: ((Math.atan2(y - cy, x - cx) / (2 * Math.PI)) + 1) % 1,
  arcLen: 2 * Math.PI * r,
});
const bladeParam = (x, y) => ({
  t: Math.max(0, Math.min(1, (y - BLADE.y0) / (BLADE.y1 - BLADE.y0))),
  arcLen: (BLADE.y1 - BLADE.y0) * 1.02,
});
const spanParam = (y0, y1) => (x, y) => ({
  t: Math.max(0, Math.min(1, (y - y0) / (y1 - y0))),
  arcLen: Math.abs(y1 - y0),
});

const structuralParts = [
  // ── Blade (layered: gold edge → cosmic body → frost halo around the fuller → cyan fuller → white heart)
  { id: 'blade_edge',   color: C.brightGold, material: 'gold',           sd: sdBlade(0),    param: bladeParam },
  { id: 'blade_core',   color: C.cosmicBlue, material: 'sapphire',       sd: sdBlade(1.0),  param: bladeParam },
  { id: 'blade_frost',  color: C.frostBlue,  material: 'diamond',        sd: sdFuller(-0.95), param: spanParam(FULLER.y0, FULLER.y1) },
  { id: 'fuller_glow',  color: C.cyanGlow,   material: 'void_rune_glow', sd: sdFuller(0),   param: spanParam(FULLER.y0, FULLER.y1) },
  { id: 'fuller_heart', color: C.stardust,   material: 'source',         sd: sdFuller(0.5), param: spanParam(FULLER.y0, FULLER.y1) },

  // ── Guardian Cross (collar, wings, claws, setting, star-sapphire gem)
  { id: 'guard_collar', color: C.flareGold,  material: 'gold', sd: sdRoundBox(16, 40.3, 5.1, 1.5, 0.7), param: spanParam(38.8, 41.8) },
  { id: 'guard_wing_l', color: C.brightGold, material: 'gold', sd: (x, y) => wingL(x, y).sd, param: (x, y) => ({ t: wingL(x, y).t, arcLen: wingL(x, y).arcLen }) },
  { id: 'guard_wing_r', color: C.brightGold, material: 'gold', sd: (x, y) => wingR(x, y).sd, param: (x, y) => ({ t: wingR(x, y).t, arcLen: wingR(x, y).arcLen }) },
  { id: 'guard_claw_l', color: C.brightGold, material: 'gold', sd: (x, y) => clawL(x, y).sd, param: (x, y) => ({ t: clawL(x, y).t, arcLen: clawL(x, y).arcLen }) },
  { id: 'guard_claw_r', color: C.brightGold, material: 'gold', sd: (x, y) => clawR(x, y).sd, param: (x, y) => ({ t: clawR(x, y).t, arcLen: clawR(x, y).arcLen }) },
  { id: 'guard_setting',color: C.flareGold,  material: 'gold', sd: sdRing(16, 35, 3.35, 1.0), param: circleParam(16, 35, 3.35) },
  { id: 'guardian_gem', color: C.deepViolet, material: 'sapphire', sd: sdStar4(16, 35, 2.6, 0.45), param: circleParam(16, 35, 2.6) },
  { id: 'gem_glint',    color: C.cyanGlow,   material: 'source',   sd: sdDisc(16, 35, 1.2), param: circleParam(16, 35, 1.2) },
  { id: 'gem_core',     color: C.stardust,   material: 'source',   sd: sdDisc(16, 35, 0.55), param: circleParam(16, 35, 0.55) },

  // ── Grip (wrapped handle, gold bands, gold ferrules)
  { id: 'grip_body',    color: C.deepViolet, material: 'void_cloth', sd: sdRoundBox(16, 22.8, 2.2, 7.6, 0.9), param: spanParam(15.2, 30.4) },
  { id: 'grip_band_1',  color: C.flareGold,  material: 'gold', sd: sdRoundBox(16, 18.8, 2.25, 0.7, 0.35), param: spanParam(18, 19.6) },
  { id: 'grip_band_2',  color: C.flareGold,  material: 'gold', sd: sdRoundBox(16, 22.8, 2.25, 0.7, 0.35), param: spanParam(22, 23.6) },
  { id: 'grip_band_3',  color: C.flareGold,  material: 'gold', sd: sdRoundBox(16, 26.8, 2.25, 0.7, 0.35), param: spanParam(26, 27.6) },
  { id: 'ferrule_top',  color: C.brightGold, material: 'gold', sd: sdRoundBox(16, 16.0, 2.75, 1.2, 0.7), param: spanParam(14.8, 17.2) },
  { id: 'ferrule_bot',  color: C.brightGold, material: 'gold', sd: sdRoundBox(16, 30.1, 2.9, 1.3, 0.7), param: spanParam(28.8, 31.4) },

  // ── Pommel of Origin (gold ring cradling a void-sky disc with a radiant star)
  { id: 'pommel_ring',  color: C.brightGold, material: 'gold',      sd: sdRing(16, 9, 4.6, 1.15), param: circleParam(16, 9, 4.6) },
  { id: 'pommel_sky',   color: C.voidBlack,  material: 'moonstone', sd: sdDisc(16, 9, 3.05), param: circleParam(16, 9, 3.05) },
  { id: 'pommel_star',  color: C.stardust,   material: 'source',    sd: sdStar4(16, 9, 2.9, 0.45), param: circleParam(16, 9, 2.9) },
  { id: 'pommel_glint', color: C.cyanGlow,   material: 'source',    sd: sdDisc(16, 9, 1.15), param: circleParam(16, 9, 1.15) },
  { id: 'pommel_finial',color: C.flareGold,  material: 'gold',      sd: sdStar4(16, 2.6, 1.7, 0.5), param: circleParam(16, 2.6, 1.7) },
];

// ─── Glow passes (material 'source'; all falloff encoded in color alpha) ─────
function auraCandidate(x, y) {
  const cands = [];
  const dB = sdBladeBase(x, y);
  if (dB > 0 && dB < 3.0) cands.push({ a: 46 * (1 - dB / 3.0), c: C.cyanGlow });
  const rTip = Math.hypot(x - AXIS, y - 123.2);
  if (rTip < 7) cands.push({ a: 95 * (1 - rTip / 7), c: C.stardust });
  const rPom = Math.hypot(x - AXIS, y - 9);
  if (rPom > 5.4 && rPom < 8.6) cands.push({ a: 38 * (1 - (rPom - 5.4) / 3.2), c: C.stardust });
  const dG = Math.min(wingL(x, y).sd, wingR(x, y).sd, clawL(x, y).sd, clawR(x, y).sd);
  if (dG > 0 && dG < 1.6) cands.push({ a: 30 * (1 - dG / 1.6), c: C.flareGold });
  if (!cands.length) return null;
  cands.sort((a, b) => b.a - a.a);
  const best = cands[0];
  if (best.a < 6) return null;
  return { color: best.c + ahex(best.a), material: 'source' };
}

// ─── Celestial sparkles (curated constellation, deterministic) ───────────────
const sparkles = [];
function addSparkle(cx, cy, color, alpha, plus = false) {
  sparkles.push({ cx, cy, color: color + ahex(alpha) });
  if (plus) {
    const arm = ahex(alpha * 0.62);
    sparkles.push({ cx: cx + 1, cy, color: color + arm });
    sparkles.push({ cx: cx - 1, cy, color: color + arm });
    sparkles.push({ cx, cy: cy + 1, color: color + arm });
    sparkles.push({ cx, cy: cy - 1, color: color + arm });
  }
}
// Embedded blade stars (painted over the blade — a constellation trapped in steel)
addSparkle(13, 57, C.stardust, 232);
addSparkle(18, 71, C.cyanGlow, 220);
addSparkle(13, 80, C.stardust, 235, true);
addSparkle(14, 96, C.stardust, 225);
addSparkle(17, 109, C.cyanGlow, 215);
// Floating field stars around the sword
addSparkle(5, 20, C.stardust, 205);
addSparkle(27, 18, C.cyanGlow, 195);
addSparkle(24, 7, C.flareGold, 190);
addSparkle(8, 8, C.cyanGlow, 185);
addSparkle(3, 49, C.flareGold, 200);
addSparkle(24, 36, C.stardust, 225, true);
addSparkle(28, 55, C.stardust, 195);
addSparkle(6, 64, C.cyanGlow, 190);
addSparkle(7, 90, C.cyanGlow, 215, true);
addSparkle(26, 84, C.flareGold, 190);
addSparkle(4, 101, C.stardust, 195);
addSparkle(27, 113, C.cyanGlow, 185);
addSparkle(9, 120, C.stardust, 190);
// Radiant burst where the tip meets the summoning circle
addSparkle(16, 122, C.stardust, 240, true);

// ─── Rasterize the lattice ───────────────────────────────────────────────────
const cells = [];
const owned = new Map(); // "cx,cy" -> true if structural

const r4 = (v) => Math.round(v * 10000) / 10000;

for (let cy = 0; cy < H; cy++) {
  for (let cx = 0; cx < W; cx++) {
    const px = cx + 0.5, py = cy + 0.5;

    // Structural ownership (last part in paint order wins).
    // Rim rule: inside the blade's outer band (-0.95..0.12) the inner blade
    // layers yield, so the silhouette stays gilded all the way to the point.
    const sdB = sdBladeBase(px, py);
    const inRim = sdB > -0.95 && sdB < 0.12;
    const rimYield = new Set(['blade_core', 'blade_frost', 'fuller_glow', 'fuller_heart']);
    let winner = null;
    for (const part of structuralParts) {
      if (inRim && rimYield.has(part.id)) continue;
      const sd = part.sd(px, py);
      if (sd < 0.12) winner = { part, sd };
    }

    if (winner) {
      const { part, sd } = winner;
      const g = diffGeom(part.sd, px, py);
      const prm = part.param(px, py);
      cells.push({
        x: cx, y: cy, snappedX: cx, snappedY: cy,
        color: part.color, partId: part.id, material: part.material, role: 'explicit',
        signedDistance: r4(sd), t: r4(prm.t),
        tangent: [r4(g.tangent[0]), r4(g.tangent[1])],
        normal: [r4(g.normal[0]), r4(g.normal[1])],
        curvature: r4(g.curvature), arcLength: r4(prm.arcLen),
        z: 0, emphasis: 1,
      });
      owned.set(`${cx},${cy}`, true);
      continue;
    }

    // Glow aura
    const aura = auraCandidate(px, py);
    if (aura) {
      cells.push({
        x: cx, y: cy, snappedX: cx, snappedY: cy,
        color: aura.color, partId: 'celestial_aura', material: 'source', role: 'glow',
        signedDistance: -0.5, t: 0, tangent: [1, 0], normal: [0, 1],
        curvature: 0, arcLength: 1, z: 0, emphasis: 0.6,
      });
    }
  }
}

// Sparkles paint over everything (including the blade)
for (const s of sparkles) {
  if (s.cx < 0 || s.cx >= W || s.cy < 0 || s.cy >= H) continue;
  cells.push({
    x: s.cx, y: s.cy, snappedX: s.cx, snappedY: s.cy,
    color: s.color, partId: 'celestial_spark', material: 'source', role: 'glow',
    signedDistance: -0.5, t: 0, tangent: [1, 0], normal: [0, 1],
    curvature: 0, arcLength: 1, z: 0, emphasis: 1,
  });
}

// ─── SCDL packet ─────────────────────────────────────────────────────────────
const packet = {
  kind: 'pixelbrain.asset.v1',
  id: 'pbasset_celestial_sword_v2',
  schemaVersion: 1,
  source: { kind: 'sdf-atelier', id: 'celestial_sword_v2', label: 'SDF Atelier:celestial_sword_v2', importedAt: null },
  canvas: { width: W, height: H, cellSize: 1, gridSize: 1, transparent: true, background: '#00000000' },
  geometry: {
    mode: 'sdf-analytic',
    bounds: { x: 0, y: 0, width: W, height: H },
    coordinates: cells,
    cells: cells.length,
  },
  palette: {
    sourcePalette: [{
      key: 'sdf-atelier',
      colors: [C.stardust, C.flareGold, C.brightGold, C.bronzeGold, C.frostBlue, C.cosmicBlue, C.deepViolet, C.voidBlack, C.cyanGlow],
      source: 'sdf-atelier', weights: [], byteMap: {},
    }],
  },
  material: { id: 'gold', variant: null, registryVersion: '0.2.0', parameters: {} },
  provenance: {
    createdBy: 'sdf-atelier.v1',
    operations: [
      { op: 'analytic-sdf-model', detail: 'blade profile + bézier wings + rings + stars' },
      { op: 'numeric-differential-geometry', detail: 'FD normals, tangents, curvature' },
      { op: 'lattice-rasterize', detail: `${W}×${H} @ cell centers` },
    ],
  },
  metadata: {
    label: 'Celestial Sword V2 — Pommel of Origin up, radiant tip down',
    orientation: 'pommel-up',
    symmetry: 'mirror-x16',
  },
};

// ─── Wand vector strokes (my own superposition layer) ────────────────────────
const contourPts = [];
for (let y = BLADE.y0; y <= BLADE.y1; y += 2) contourPts.push({ x: r4(AXIS + bladeHalfWidth(y)), y });
contourPts.push({ x: AXIS, y: BLADE.y1 + 0.6 });
for (let y = BLADE.y1; y >= BLADE.y0; y -= 2) contourPts.push({ x: r4(AXIS - bladeHalfWidth(y)), y });
contourPts.push({ x: r4(AXIS + bladeHalfWidth(BLADE.y0)), y: BLADE.y0 });

const wingSpine = (query, mirror) => {
  const pts = [];
  for (let i = 2; i <= 30; i++) {
    const t = i / 32;
    // Walk the spine, lifted slightly toward the upper ridge
    const u = 1 - t;
    const p0 = mirror ? [16, 35.5] : [16, 35.5];
    const p1 = mirror ? [23, 37.5] : [9, 37.5];
    const p2 = mirror ? [29.4, 32.4] : [2.6, 32.4];
    const x = u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0];
    const y = u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1] - 0.7 * (1 - t);
    pts.push({ x: r4(x), y: r4(y) });
  }
  return pts;
};

// Jagged stellar lightning vein down the fuller (single continuous polyline —
// alternating deterministic jitter, amplitude breathing, dying at both ends)
const lightningPts = [];
let jagSeed = 20260728;
const jagRand = () => { jagSeed = (jagSeed * 1103515245 + 12345) & 0x7fffffff; return jagSeed / 0x7fffffff; };
for (let y = 43; y <= 118; y += 1.5) {
  const u = (y - 43) / 75;
  const envelope = Math.sin(u * Math.PI) * 0.85;
  const jx = (jagRand() - 0.5) * 2 * envelope;
  lightningPts.push({ x: r4(AXIS + jx), y: r4(y) });
}

const wand = {
  asset: 'celestial-sword-v2',
  canvas: { width: W, height: H },
  formulas: [
    {
      role: 'celestial-sword-v2.blade_contour',
      type: 'edge_trace',
      description: 'Gilded silhouette trace of the tapered blade',
      formula: { coordinateFormula: { type: 'edge_trace', tracePath: contourPts, parameters: { strokeWidth: 1.0 } } },
      pressure: 0.6,
    },
    {
      role: 'celestial-sword-v2.guardian_wings',
      type: 'edge_trace',
      description: 'Gold ridge gilding along both swept wing spines',
      formula: { coordinateFormula: { type: 'edge_trace', tracePath: [...wingSpine(wingL, false), ...wingSpine(wingR, true).reverse()], parameters: { strokeWidth: 0.9 } } },
      pressure: 0.55,
    },
    {
      role: 'celestial-sword-v2.stellar_lightning',
      type: 'edge_trace',
      description: 'Jagged electric cyan vein running down the fuller',
      formula: { coordinateFormula: { type: 'edge_trace', tracePath: lightningPts, parameters: { strokeWidth: 0.5 } } },
      pressure: 0.75,
    },
    {
      role: 'celestial-sword-v2.guardian_eye_ring',
      type: 'parametric_curve',
      description: 'Stardust ring around the Guardian Cross gem setting',
      formula: { coordinateFormula: { type: 'parametric_curve', parameters: { cx: 16, cy: 35, a: 4.35, n: 56, c: 0, strokeWidth: 0.8 } } },
      pressure: 0.85,
    },
    {
      role: 'celestial-sword-v2.pommel_origin_ring',
      type: 'parametric_curve',
      description: 'Stardust halo orbiting the Pommel of Origin',
      formula: { coordinateFormula: { type: 'parametric_curve', parameters: { cx: 16, cy: 9, a: 6.3, n: 64, c: 0, strokeWidth: 0.9 } } },
      pressure: 0.8,
    },
  ],
};

// ─── Write ───────────────────────────────────────────────────────────────────
const scdlPath = resolve(root, 'worldpacks/shrine-demo/scdl/celestial-sword-v2-json.json');
const wandPath = resolve(root, 'worldpacks/shrine-demo/wand/celestial-sword-v2.wand.json');
writeFileSync(scdlPath, JSON.stringify(packet));
writeFileSync(wandPath, JSON.stringify(wand, null, 2));

const counts = {};
for (const c of cells) counts[c.partId] = (counts[c.partId] || 0) + 1;
console.log(`SDF Atelier — celestial-sword-v2`);
console.log(`  Cells: ${cells.length}`);
console.log(`  Parts: ${JSON.stringify(counts, null, 1)}`);
console.log(`  Packet: ${scdlPath}`);
console.log(`  Wand:   ${wandPath}`);
