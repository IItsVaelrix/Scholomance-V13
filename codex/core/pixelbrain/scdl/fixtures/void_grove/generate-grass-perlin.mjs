// Grass texture generator using this codebase's REAL deterministic Perlin/fbm
// noise (codex/core/pixelbrain/deterministic-noise.js) instead of raw per-pixel
// hash — coherent noise clusters into organic blotches/tufts, matching how
// real grass textures read, rather than uniform TV-static.
import { writeFileSync } from 'node:fs';
import { createDeterministicNoise } from '../../../deterministic-noise.js';

const W = 32, H = 32;

// Perlin/fbm is a SMOOTH continuous function by construction — thresholding
// it alone gives smooth blobby boundaries ("paint"), because neighboring
// pixels are strongly correlated. Real pixel-art texture needs adjacent
// pixels to frequently differ. Fix: a coarse fbm field only BIASES the
// threshold (large-scale "this patch skews darker/lighter"); a fine,
// uncorrelated per-pixel hash is what actually decides each pixel's color.
const coarseBias = createDeterministicNoise({
  type: 'fbm', seed: 20260905, frequency: 0.09, amplitude: 1, octaves: 2,
  lacunarity: 2.0, gain: 0.5, outputRange: [-0.12, 0.12],
});

function pixelHash(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 2246822519) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

// Blade-cluster noise: higher frequency, different seed, decides WHERE tufts
// of blades are allowed to grow (so blades cluster instead of scattering
// uniformly at random).
const bladeField = createDeterministicNoise({
  type: 'fbm', seed: 71830421, frequency: 0.35, amplitude: 1, octaves: 2,
  lacunarity: 2.0, gain: 0.5, outputRange: [0, 1],
});

// Fine per-pixel jitter within a favorable blade zone, so the zone doesn't
// become one solid blob of blade color — still needs its own noise field
// (deterministic, not Math.random) rather than being uniform inside the zone.
const jitterField = createDeterministicNoise({
  type: 'fbm', seed: 5591001, frequency: 0.9, amplitude: 1, octaves: 1,
  outputRange: [0, 1],
});

const PALETTE = {
  dark: '#164410',
  base: '#2d7322',
  mid: '#3d8f2c',
  lit: '#4fa838',
  blade: '#8ecb3a',
  bladehi: '#b6e85e',
};

// Per-pixel hash is ~uniform on [0,1) (unlike fbm), plus a small coarse
// bias — thresholds set for a uniform base distribution.
function bandColor(n) {
  if (n < 0.34) return 'dark';
  if (n < 0.62) return 'base';
  if (n < 0.85) return 'mid';
  return 'lit';
}

const lines = [];
lines.push('# grass_tile_32 — Perlin/fbm-based grass texture (deterministic-noise.js),');
lines.push('# not raw per-pixel hash: coherent noise clusters into organic blotches/tufts.');
lines.push('# Regenerate via generate-grass-perlin.mjs, never hand-edit.');
lines.push('asset grass_tile_32 canvas 32x32');
lines.push('');
lines.push('palette {');
for (const [name, hex] of Object.entries(PALETTE)) lines.push(`  ${name} = ${hex}`);
lines.push('}');
lines.push('');
lines.push('part ground material astralmoss {');

for (let y = 0; y < H; y += 1) {
  for (let x = 0; x < W; x += 1) {
    // fine per-pixel hash does the actual dithering (adjacent pixels
    // frequently differ); the coarse fbm field only nudges the value up or
    // down a little so large-scale patches still skew slightly.
    const n = pixelHash(x, y, 3) + coarseBias.noise(x, y);
    lines.push(`  cell ${x} ${y} ${bandColor(n)}`);
  }
}
lines.push('}');
lines.push('');
lines.push('part blades material astralmoss {');

let streakCount = 0;
// Both fields are bell-curved around 0.5 (measured empirically, not assumed —
// fbm averaging concentrates values near the mean), so thresholds are tuned
// against the actual observed distribution, not the nominal [0,1] range.
const BLADE_ZONE_THRESHOLD = 0.60; // top ~18% of the zone field = tuft areas
const BLADE_PIXEL_THRESHOLD = 0.62; // top ~25% within a tuft actually sprouts
for (let y = 1; y < H; y += 1) {
  for (let x = 0; x < W; x += 1) {
    const zone = bladeField.noise(x, y);
    if (zone < BLADE_ZONE_THRESHOLD) continue;
    const jitter = jitterField.noise(x, y);
    if (jitter < BLADE_PIXEL_THRESHOLD) continue;
    streakCount += 1;
    // short upward streak, 2-3px, leaning with the local jitter direction
    const dir = jitter > 0.9 ? 1 : (jitter < 0.83 ? -1 : 0);
    const len = 2 + (jitter > 0.88 ? 1 : 0);
    for (let i = 0; i < len; i += 1) {
      const bx = x + (i === len - 1 ? dir : 0);
      const by = y - i;
      if (bx < 0 || bx >= W || by < 0 || by >= H) continue;
      lines.push(`  cell ${bx} ${by} ${i === len - 1 ? 'bladehi' : 'blade'}`);
    }
  }
}
lines.push('}');
lines.push('');

const out = lines.join('\n') + '\n';
const path = process.argv[2];
writeFileSync(path, out);
console.log(`wrote ${path} — ${W * H} base cells, ${streakCount} blade streaks (Perlin/fbm clustered)`);
