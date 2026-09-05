/**
 * Arena Visual Tick Processor
 *
 * Offloads the per-frame visual computations for the combat arena scene:
 *   1. Doom fire algorithm (32x48) → palette-mapped RGBA buffer
 *   2. Torch glow flicker parameters (shadow / ambient)
 *   3. Plasma resonance lerp
 *
 * Runs in the Microprocessor WebWorker via processorBridge. Uses a
 * deterministic mulberry32 PRNG seeded per-frame so jitter values are
 * reproducible (Math.random() cannot be shared across the postMessage // EXEMPT
 * boundary).
 *
 * Pure: takes the current fire intensity buffer in, returns the new
 * intensity buffer + the final RGBA buffer for direct putImageData.
 */

function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Indigo palette (matches the original scene definition)
const INDIGO_PALETTE = (() => {
  const p = new Array(36);
  p[0] = { r: 0, g: 0, b: 0, a: 0 };
  for (let i = 1; i < 36; i++) {
    const t = i / 35;
    let r, g, b;
    if (t < 0.2) {
      r = 0; g = 0; b = t * 5 * 255;
    } else if (t < 0.5) {
      const t2 = (t - 0.2) / 0.3;
      r = t2 * 120; g = 0; b = 255;
    } else if (t < 0.8) {
      const t2 = (t - 0.5) / 0.3;
      r = 120 - t2 * 120; g = t2 * 255; b = 255;
    } else {
      const t2 = (t - 0.8) / 0.2;
      r = t2 * 255; g = 255; b = 255;
    }
    p[i] = { r: Math.floor(r), g: Math.floor(g), b: Math.floor(b), a: 255 };
  }
  return p;
})();

function doomFireStep(input, w, h, rng) {
  const output = new Float32Array(w * h);
  const cx = w / 2;
  const radius = w / 2 - 2;

  // Seed bottom row
  for (let x = 0; x < w; x++) {
    const dist = Math.abs(x - cx);
    let base = 0;
    if (dist <= radius) {
      const normalized = dist / radius;
      base = Math.sqrt(1 - normalized * normalized) * 50;
    }
    if (base > 0) {
      base -= Math.floor(rng() * 5);
    }
    output[(h - 1) * w + x] = Math.max(0, base);
  }

  // Teardrop step — double-buffered (reads input, writes output)
  for (let x = 0; x < w; x++) {
    for (let y = 1; y < h; y++) {
      const src = y * w + x;
      const pixel = input[src];
      if (pixel === 0) {
        output[src - w] = 0;
      } else {
        const rand = Math.floor(rng() * 3);
        const drift = rand - 1;
        const dstX = x + drift;
        if (dstX >= 0 && dstX < w) {
          const dst = (y - 1) * w + dstX;
          let cooling = rand & 1;
          const heightPercent = 1.0 - y / h;
          const distFromCenter = Math.abs(dstX - cx);
          const allowedWidth = radius * (1 - Math.pow(heightPercent, 1.5));
          if (distFromCenter > allowedWidth) cooling += 2;
          output[dst] = Math.max(0, pixel - cooling);
        }
      }
    }
  }

  return output;
}

function mapToRgba(intensities) {
  const len = intensities.length;
  const rgba = new Uint8Array(len * 4);
  for (let i = 0; i < len; i++) {
    const intensity = Math.max(0, Math.min(35, Math.floor(intensities[i])));
    const color = INDIGO_PALETTE[intensity];
    const idx = i * 4;
    rgba[idx] = color.r;
    rgba[idx + 1] = color.g;
    rgba[idx + 2] = color.b;
    rgba[idx + 3] = color.a;
  }
  return rgba;
}

export async function arenaTickProcessor(payload, _context) {
  const {
    firePixels,
    fireW,
    fireH,
    seed,
    torcheffects = [],
    plasma,
  } = payload;

  const rng = mulberry32((seed | 0) >>> 0);

  // 1. Doom fire + palette mapping (the heavy work)
  const firePixelsNext = doomFireStep(firePixels, fireW, fireH, rng);
  const fireRgba = mapToRgba(firePixelsNext);

  // 2. Torch glow flicker parameters
  const torchData = torcheffects.map(() => {
    const flicker = rng();
    return {
      flicker,
      shadowScale: 0.96 + flicker * 0.08,
      ambientAlpha: 0.3 + flicker * 0.5,
      ambientScale: 0.95 + flicker * 0.1,
    };
  });

  // 3. Plasma resonance lerp
  const plasmaSmooth = plasma
    ? plasma.current + (plasma.target - plasma.current) * plasma.rate
    : 0;

  return {
    fireRgba,
    firePixelsNext,
    torchData,
    plasma: { smooth: plasmaSmooth },
  };
}
