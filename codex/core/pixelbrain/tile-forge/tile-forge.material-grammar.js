/**
 * Tile Forge — Material Grammars
 *
 * Implements the Material Readability Invariant:
 * Dedicated procedural synthesis grammars for FOLIAGE, WOOD, STONE, WATER, and EARTH.
 *
 * Rules:
 * - Anti-Vector Invariant: Discrete 1x integer pixel cells.
 * - Anti-Grid Invariant: No repeating diamond lattice patterns.
 * - Controlled Detail Invariant: Restful negative space with focused structural detail.
 */

import {
  hexToRgb,
  getBayerOffset,
  sampleRampColor,
} from './tile-forge.palette-engine.js';

/**
 * Renders an organic volumetric foliage cloud lobe.
 * Uses spherical normals to create deep volumetric light falloff and occlusion.
 *
 * @param {Object} buffer Canvas buffer with setPixel(x, y, rgb, a)
 * @param {number} cx Center X
 * @param {number} cy Center Y
 * @param {number} rx Radius X
 * @param {number} ry Radius Y
 * @param {string[]} ramp 8-stop palette ramp
 * @param {Function} prng Deterministic RNG
 * @param {Object} [options]
 */
export function renderVolumetricFoliageLobe(
  buffer,
  cx,
  cy,
  rx,
  ry,
  ramp,
  prng,
  options = {}
) {
  const isBackground = options.isBackground || false;
  const sunlitBoost = options.sunlitBoost || 0;
  const minStop = isBackground ? 0 : 1;
  const maxStop = isBackground ? 5 : 7;

  for (let dy = -ry - 2; dy <= ry + 2; dy += 1) {
    for (let dx = -rx - 2; dx <= rx + 2; dx += 1) {
      const px = Math.round(cx + dx);
      const py = Math.round(cy + dy);

      // Normalized coordinates within lobe
      const nx = dx / (rx || 1);
      const ny = dy / (ry || 1);
      const distSq = nx * nx + ny * ny;

      // Controlled organic edge break
      const angle = Math.atan2(ny, nx);
      const edgeNotch = Math.sin(angle * 7 + (px + py) * 0.4) * 0.12;

      if (distSq <= (1.0 + edgeNotch) * (1.0 + edgeNotch)) {
        // Spherical normal estimation
        const nz = Math.sqrt(Math.max(0, 1.0 - Math.min(1.0, distSq)));

        // Upper-left key light: L = [-0.65, -0.75, 0.5]
        const lx = -0.58;
        const ly = -0.68;
        const lz = 0.45;
        const dot = nx * lx + ny * ly + nz * lz; // [-1, 1]

        const bayer = getBayerOffset(px, py, 0.18);
        const bladeGrain = (prng() - 0.5) * 0.12;

        let shade = (dot + 1.0) * 0.5 + bayer + bladeGrain + sunlitBoost;
        shade = Math.max(0, Math.min(1, shade));

        const color = sampleRampColor(ramp, shade, minStop, maxStop);

        // Sunlit crest highlights on top-left apex
        if (nx < -0.2 && ny < -0.3 && distSq > 0.4 && distSq < 0.95 && prng() > 0.75 && !isBackground) {
          buffer.setPixel(px, py, hexToRgb(ramp[7]), 255);
        } else {
          buffer.setPixel(px, py, color, 255);
        }
      }
    }
  }
}

function clusterUnit(ix, iy, seed) {
  let value = (seed ^ Math.imul(ix, 0x27D4EB2D) ^ Math.imul(iy, 0x165667B1)) >>> 0;
  value = Math.imul(value ^ (value >>> 15), 0x85EBCA6B) >>> 0;
  value = Math.imul(value ^ (value >>> 13), 0xC2B2AE35) >>> 0;
  return ((value ^ (value >>> 16)) >>> 0) / 0xFFFFFFFF;
}

/**
 * Renders a foliage mass as deliberate pixel CLUSTERS rather than a smooth
 * spherical gradient (Foliage Hierarchy: macro mass → secondary clumps →
 * limited highlight / breakup clusters).
 *
 * The silhouette boundary is wobbled per-lobe so no two lobes share an outline,
 * and tone bands are broken by low-frequency cluster noise so the mass reads as
 * layered leaf clumps under a single upper-left key light.
 *
 * @param {Object} buffer Canvas buffer with setPixel(x, y, rgb, a)
 * @param {number} cx Center X
 * @param {number} cy Center Y
 * @param {number} rx Radius X
 * @param {number} ry Radius Y
 * @param {string[]} ramp 8-stop palette ramp
 * @param {Function} prng Deterministic RNG
 * @param {Object} [options]
 */
export function renderClusteredFoliageLobe(
  buffer,
  cx,
  cy,
  rx,
  ry,
  ramp,
  prng,
  options = {}
) {
  const isBackground = options.isBackground || false;
  const sunlitBoost = options.sunlitBoost || 0;
  const rgb = ramp.map(hexToRgb);

  // Per-lobe silhouette wobble (fixed for the lobe => coherent, not per-pixel).
  const wobbleSteps = 12;
  const wobble = [];
  for (let i = 0; i < wobbleSteps; i += 1) {
    wobble.push(0.84 + prng() * 0.3);
  }
  const boundaryAt = (angle) => {
    const t = ((angle / (Math.PI * 2)) + 1) % 1;
    const f = t * wobbleSteps;
    const i0 = Math.floor(f) % wobbleSteps;
    const i1 = (i0 + 1) % wobbleSteps;
    const ft = f - Math.floor(f);
    return wobble[i0] + (wobble[i1] - wobble[i0]) * ft;
  };

  const bandFor = (nx, ny, px, py) => {
    const light = -0.6 * nx - 0.7 * ny + sunlitBoost;
    const cluster = clusterUnit(px >> 2, py >> 2, 0x5EED1234);
    let band;
    if (light > 0.34) band = 5;
    else if (light > -0.05) band = 3;
    else band = 1;
    if (cluster > 0.72) band += 1;
    else if (cluster < 0.2) band -= 1;
    if (isBackground) band = Math.min(4, band - 1);
    return Math.max(0, Math.min(ramp.length - 1, band));
  };

  // 1. Macro mass: irregular silhouette filled with clustered tone bands.
  for (let dy = -ry - 2; dy <= ry + 2; dy += 1) {
    for (let dx = -rx - 2; dx <= rx + 2; dx += 1) {
      const nx = dx / (rx || 1);
      const ny = dy / (ry || 1);
      const r = Math.sqrt(nx * nx + ny * ny);
      if (r > 1) continue;
      const boundary = boundaryAt(Math.atan2(ny, nx));
      if (r > boundary) continue;
      const px = Math.round(cx + dx);
      const py = Math.round(cy + dy);
      buffer.setPixel(px, py, rgb[bandFor(nx, ny, px, py)], 255);
    }
  }

  // 2. Secondary clumps: small overlapping leaf masses that break the flat band.
  const clumpCount = Math.max(3, Math.round((rx + ry) / 6));
  for (let i = 0; i < clumpCount; i += 1) {
    const angle = prng() * Math.PI * 2;
    const dist = prng() * 0.62;
    const ccx = cx + Math.cos(angle) * dist * rx;
    const ccy = cy + Math.sin(angle) * dist * ry;
    const crx = 3 + prng() * Math.max(2, rx * 0.22);
    const cry = 2 + prng() * Math.max(2, ry * 0.2);
    const nx = (ccx - cx) / (rx || 1);
    const ny = (ccy - cy) / (ry || 1);
    const lit = -0.6 * nx - 0.7 * ny + sunlitBoost > 0;
    const base = bandFor(nx, ny, Math.round(ccx), Math.round(ccy));
    const tone = Math.max(0, Math.min(ramp.length - 1, base + (lit ? 1 : -1)));
    for (let dy = -cry; dy <= cry; dy += 1) {
      for (let dx = -crx; dx <= crx; dx += 1) {
        if ((dx * dx) / (crx * crx) + (dy * dy) / (cry * cry) > 1) continue;
        const px = Math.round(ccx + dx);
        const py = Math.round(ccy + dy);
        const gnx = (px - cx) / (rx || 1);
        const gny = (py - cy) / (ry || 1);
        if (gnx * gnx + gny * gny > boundaryAt(Math.atan2(gny, gnx)) ** 2) continue;
        buffer.setPixel(px, py, rgb[tone], 255);
      }
    }
  }

  // 3. Limited highlight clusters pinned to the sunlit (upper-left) rim.
  if (!isBackground) {
    const crestCount = Math.max(2, Math.round(rx / 8));
    for (let i = 0; i < crestCount; i += 1) {
      const angle = Math.PI * (1.05 + prng() * 0.5); // upper-left arc
      const dist = 0.62 + prng() * 0.3;
      const hx = Math.round(cx + Math.cos(angle) * dist * rx);
      const hy = Math.round(cy + Math.sin(angle) * dist * ry);
      const tone = rgb[Math.min(ramp.length - 1, 6 + (prng() > 0.6 ? 1 : 0))];
      buffer.setPixel(hx, hy, tone, 255);
      buffer.setPixel(hx + 1, hy, tone, 255);
      buffer.setPixel(hx, hy + 1, rgb[Math.min(ramp.length - 1, 5)], 255);
    }
  }

}

/**
 * Renders a trunk / branch with vertical bark striations and cylindrical
 * upper-left lighting. Grain runs along the branch axis (never diagonal
 * barber-poling) so wood reads as bark, not candy stripe.
 *
 * @param {Object} buffer
 * @param {number} x0 Base X
 * @param {number} y0 Base Y
 * @param {number} x1 Top X
 * @param {number} y1 Top Y
 * @param {number} r0 Base radius
 * @param {number} r1 Top radius
 * @param {Object} woodPalette Wood palette stops { shadow, dark, mid, light, highlight }
 * @param {Function} prng
 */
export function renderBarkTrunk(
  buffer,
  x0,
  y0,
  x1,
  y1,
  r0,
  r1,
  woodPalette,
  prng
) {
  const steps = Math.max(Math.abs(y0 - y1), Math.abs(x0 - x1)) + 1;
  const shadow = hexToRgb(woodPalette.shadow);
  const dark = hexToRgb(woodPalette.dark);
  const mid = hexToRgb(woodPalette.mid);
  const light = hexToRgb(woodPalette.light);
  const highlight = hexToRgb(woodPalette.highlight);

  for (let s = 0; s <= steps; s += 1) {
    const t = s / steps;
    const cx = Math.round(x0 + (x1 - x0) * t);
    const cy = Math.round(y0 + (y1 - y0) * t);
    const currentR = Math.max(1, Math.round(r0 + (r1 - r0) * t));

    for (let dx = -currentR; dx <= currentR; dx += 1) {
      const px = cx + dx;
      const py = cy;
      const u = dx / currentR;

      // Cylindrical normal dot with upper-left light.
      const nz = Math.sqrt(Math.max(0, 1 - u * u));
      const dot = -0.7 * u + 0.7 * nz;

      // Vertical bark striation: varies across the trunk, rare cracks across rows.
      const stripe = clusterUnit(px, Math.floor(py / 7), 0xB4A1123) * 0.12 - 0.06;
      const crack = (py % 13 === 0 && clusterUnit(px, py, 0xC4A1123) > 0.78) ? -0.2 : 0;
      const shade = Math.max(0, Math.min(1, (dot + 1) * 0.5 + stripe + crack));

      let color;
      if (shade > 0.84) color = highlight;
      else if (shade > 0.62) color = light;
      else if (shade > 0.4) color = mid;
      else if (shade > 0.2) color = dark;
      else color = shadow;

      buffer.setPixel(px, py, color, 255);
    }
  }

  void prng;
}

/**
 * Renders a gnarled wooden trunk or branch segment with directional cylindrical shading,
 * vertical grain striations, and buttressed root flares.
 *
 * @param {Object} buffer
 * @param {number} x0 Base X
 * @param {number} y0 Base Y
 * @param {number} x1 Top X
 * @param {number} y1 Top Y
 * @param {number} r0 Base radius
 * @param {number} r1 Top radius
 * @param {Object} woodPalette Wood palette stops { shadow, dark, mid, light, highlight }
 * @param {Function} prng
 */
export function renderGnarledWoodBranch(
  buffer,
  x0,
  y0,
  x1,
  y1,
  r0,
  r1,
  woodPalette,
  prng
) {
  const steps = Math.max(Math.abs(y0 - y1), Math.abs(x0 - x1)) + 1;
  const shadow = hexToRgb(woodPalette.shadow);
  const dark = hexToRgb(woodPalette.dark);
  const mid = hexToRgb(woodPalette.mid);
  const light = hexToRgb(woodPalette.light);
  const highlight = hexToRgb(woodPalette.highlight);

  for (let s = 0; s <= steps; s += 1) {
    const t = s / steps;
    const cx = Math.round(x0 + (x1 - x0) * t);
    const cy = Math.round(y0 + (y1 - y0) * t);
    const currentR = Math.max(1, Math.round(r0 + (r1 - r0) * t));

    for (let dx = -currentR; dx <= currentR; dx += 1) {
      const px = cx + dx;
      const py = cy;
      const u = dx / currentR; // [-1, 1] across trunk width

      // Cylindrical normal dot with upper-left light
      const nz = Math.sqrt(Math.max(0, 1 - u * u));
      const dot = -0.7 * u + 0.7 * nz; // Higher on left, darker on right

      // Vertical bark grain striation
      const grain = Math.sin(py * 0.9 + px * 0.4) * 0.15 + (prng() - 0.5) * 0.1;
      const shade = Math.max(0, Math.min(1, (dot + 1) * 0.5 + grain));

      let color;
      if (shade > 0.82) color = highlight;
      else if (shade > 0.60) color = light;
      else if (shade > 0.38) color = mid;
      else if (shade > 0.18) color = dark;
      else color = shadow;

      buffer.setPixel(px, py, color, 255);
    }
  }
}

/**
 * Renders a planar chiseled stone block with polygonal edge bevels and fissure cracks.
 *
 * @param {Object} buffer
 * @param {number} x Left
 * @param {number} y Top
 * @param {number} w Width
 * @param {number} h Height
 * @param {Object} stonePalette { shadow, dark, mid, light, highlight }
 * @param {Function} prng
 * @param {Object} [options]
 */
export function renderChiseledStoneBlock(
  buffer,
  x,
  y,
  w,
  h,
  stonePalette,
  prng,
  options = {}
) {
  const shadow = hexToRgb(stonePalette.shadow);
  const dark = hexToRgb(stonePalette.dark);
  const mid = hexToRgb(stonePalette.mid);
  const light = hexToRgb(stonePalette.light);
  const highlight = hexToRgb(stonePalette.highlight);
  const mossColor = options.mossColor ? hexToRgb(options.mossColor) : null;

  for (let dy = 0; dy < h; dy += 1) {
    for (let dx = 0; dx < w; dx += 1) {
      const px = x + dx;
      const py = y + dy;

      // Bevel rules: Top and Left edges catch key light; Bottom and Right fall into shadow
      const isTopBevel = dy === 0 && dx > 0 && dx < w - 1;
      const isLeftBevel = dx === 0 && dy > 0 && dy < h - 1;
      const isTopLeftCorner = dx === 0 && dy === 0;
      const isBottomBevel = dy === h - 1;
      const isRightBevel = dx === w - 1;

      // Planar stone surface with subtle mineral noise
      const mineralGrain = (prng() - 0.5) * 0.1;
      const surfaceShade = 0.55 + mineralGrain;

      let color;
      if (isTopLeftCorner || (isTopBevel && dx < w / 2)) {
        color = highlight; // Specular corner rim
      } else if (isTopBevel || isLeftBevel) {
        color = light; // Sunlit bevel
      } else if (isBottomBevel || isRightBevel) {
        color = shadow; // Ambient shadow bevel
      } else {
        color = surfaceShade > 0.52 ? mid : dark;
      }

      // Fissure crack propagation
      if ((dx * 3 + dy * 2) % 17 === 0 && dx > 1 && dx < w - 2 && dy > 1 && dy < h - 2) {
        color = shadow;
      }

      // Moss accumulation on upward-facing surfaces
      if (mossColor && dy < 3 && prng() > 0.65) {
        color = mossColor;
      }

      buffer.setPixel(px, py, color, 255);
    }
  }
}

/**
 * Renders a tranquil water body with depth gradient, shoreline silt falloff, and lily pad accents.
 *
 * @param {Object} buffer
 * @param {number} x
 * @param {number} y
 * @param {number} dist Normalized distance from center [0, 1]
 * @param {string[]} waterRamp 8-stop water ramp
 * @param {Function} prng
 */
export function renderWaterCell(
  buffer,
  x,
  y,
  dist,
  waterRamp,
  prng
) {
  // dist = 0: center/deep, dist = 1: shore edge
  const depth = 1.0 - Math.min(1.0, dist);
  const bayer = getBayerOffset(x, y, 0.15);
  const caustic = Math.sin(x * 0.35 + y * 0.25) * 0.12;

  const shade = Math.max(0, Math.min(1, depth + bayer + caustic));
  const color = sampleRampColor(waterRamp, shade, 1, 6);

  // Shoreline foam fringe near outer perimeter
  if (dist > 0.90 && dist < 0.98 && (x + y) % 3 === 0) {
    buffer.setPixel(x, y, hexToRgb(waterRamp[6]), 240);
  } else if (dist <= 0.88 && prng() > 0.985) {
    // Specular star glint
    buffer.setPixel(x, y, hexToRgb(waterRamp[7]), 255);
  } else {
    buffer.setPixel(x, y, color, 255);
  }
}
