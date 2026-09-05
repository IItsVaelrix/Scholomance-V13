/**
 * DETERMINISTIC-NOISE.js
 * Pure, seeded, stateless coherent noise for PixelBrain (per SDF+Noise PDR).
 * All functions are deterministic given seed + coords.
 * Used by NoiseFillAMP to modulate intensities without affecting required cell counts.
 */
import { hashString } from './shared.js';

const PERM_SIZE = 256;

function makePermutation(seed) {
  const perm = new Array(PERM_SIZE * 2);
  const p = new Array(PERM_SIZE);
  for (let i = 0; i < PERM_SIZE; i++) p[i] = i;
  let s = (seed >>> 0) || 0x811c9dc5;
  for (let i = PERM_SIZE - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < PERM_SIZE * 2; i++) perm[i] = p[i % PERM_SIZE];
  return perm;
}

function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
function lerp(t, a, b) { return a + t * (b - a); }

function grad(hash, x, y) {
  const h = hash & 3;
  const u = h & 1 ? -x : x;
  const v = h & 2 ? -y : y;
  return u + v;
}

export function createDeterministicNoise(noiseDesc = {}) {
  const seed = (noiseDesc.seed || 0) >>> 0;
  const perm = makePermutation(seed);
  const type = String(noiseDesc.type || 'value');
  const octaves = Math.max(1, Math.floor(noiseDesc.octaves || 1));
  const lacunarity = noiseDesc.lacunarity || 2.0;
  const gain = noiseDesc.gain || 0.5;
  const freq = noiseDesc.frequency || 0.1;
  const amp = noiseDesc.amplitude || 1.0;
  const warp = noiseDesc.domainWarp || { type: 'none', strength: 0 };
  const outMin = Array.isArray(noiseDesc.outputRange) ? noiseDesc.outputRange[0] : -1;
  const outMax = Array.isArray(noiseDesc.outputRange) ? noiseDesc.outputRange[1] : 1;

  function valueNoise(x, y) {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const u = fade(xf);
    const v = fade(yf);
    const aa = perm[X + perm[Y]];
    const ab = perm[X + perm[Y + 1]];
    const ba = perm[X + 1 + perm[Y]];
    const bb = perm[X + 1 + perm[Y + 1]];
    const x1 = lerp(u, grad(aa, xf, yf), grad(ba, xf - 1, yf));
    const x2 = lerp(u, grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1));
    return (lerp(v, x1, x2) + 1) * 0.5; // 0..1
  }

  function fbm(x, y) {
    let total = 0;
    let amplitude = amp;
    let frequency = freq;
    let max = 0;
    for (let i = 0; i < octaves; i++) {
      let n = valueNoise(x * frequency, y * frequency);
      // domain warp if requested (simple)
      if (warp.type === 'simple' && warp.strength > 0) {
        const wx = valueNoise(x * frequency * 0.5 + 13, y * frequency * 0.5 + 37) * 2 - 1;
        const wy = valueNoise(x * frequency * 0.5 + 71, y * frequency * 0.5 + 19) * 2 - 1;
        n = valueNoise((x + wx * warp.strength) * frequency, (y + wy * warp.strength) * frequency);
      }
      total += n * amplitude;
      max += amplitude;
      amplitude *= gain;
      frequency *= lacunarity;
    }
    return total / max;
  }

  function noise(x, y) {
    let v;
    switch (type) {
      case 'perlin':
      case 'simplex':
      case 'value':
      default:
        v = fbm(x, y);
        break;
      case 'fbm':
        v = fbm(x, y);
        break;
      case 'worley': {
        // Simple worley (cell) noise, deterministic
        const xi = Math.floor(x), yi = Math.floor(y);
        let minDist = 1e9;
        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            const hx = xi + dx, hy = yi + dy;
            const h = (hx * 374761393 + hy * 668265263 + seed) >>> 0;
            const fx = (h & 0xffff) / 0xffff;
            const fy = ((h >>> 16) & 0xffff) / 0xffff;
            const dist = Math.hypot((dx + fx) - (x - xi), (dy + fy) - (y - yi));
            if (dist < minDist) minDist = dist;
          }
        }
        v = Math.max(0, Math.min(1, minDist));
        break;
      }
    }
    // quantize and map to outputRange
    const q = Math.floor(v * 1000) / 1000;
    const range = outMax - outMin;
    return outMin + q * range;
  }

  return { noise, raw: (x,y) => valueNoise(x*freq, y*freq) };
}

export function deterministicNoise(x, y, desc = {}) {
  const impl = createDeterministicNoise(desc);
  return impl.noise(x, y);
}

export default { createDeterministicNoise, deterministicNoise };
