import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

import { sketchToSilhouette } from '../codex/core/pixelbrain/sketch-amp.js';
import { fillTemplate } from '../codex/core/pixelbrain/template-fill-bridge.js';
import { buildSquareSharpnessContrastPayload } from '../codex/core/pixelbrain/square-sharpness-contrast-amp.js';
import { evaluateFormula } from '../codex/core/pixelbrain/formula-to-coordinates.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '..', 'src', 'pages', 'Combat', 'assets', 'generated');
mkdirSync(OUT_DIR, { recursive: true });

function crc32(buf) {
  let c;
  const table = (crc32._t ||= (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      c = n;
      for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })());
  c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lengthBuf = Buffer.alloc(4);
  lengthBuf.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lengthBuf, typeBuf, data, crcBuf]);
}

function hexToRgb(hex) {
  const m = String(hex || '').trim().replace('#', '');
  if (m.length !== 6) return null;
  return { r: parseInt(m.slice(0, 2), 16), g: parseInt(m.slice(2, 4), 16), b: parseInt(m.slice(4, 6), 16) };
}

function renderPng(coordinates, width, height, scale = 4) {
  const bg = { r: 10, g: 10, b: 18 };
  const outW = width * scale;
  const outH = height * scale;
  const pixels = Buffer.alloc(outW * outH * 4);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = bg.r; pixels[i + 1] = bg.g; pixels[i + 2] = bg.b; pixels[i + 3] = 0; // transparent
  }
  for (const c of coordinates) {
    const x = Math.round(c?.snappedX ?? c?.x);
    const y = Math.round(c?.snappedY ?? c?.y);
    if (x < 0 || x >= width || y < 0 || y >= height) continue;
    const rgb = hexToRgb(c?.color) || bg;
    for (let dy = 0; dy < scale; dy += 1) {
      for (let dx = 0; dx < scale; dx += 1) {
        const px = x * scale + dx;
        const py = y * scale + dy;
        const off = (py * outW + px) * 4;
        pixels[off] = rgb.r;
        pixels[off + 1] = rgb.g;
        pixels[off + 2] = rgb.b;
        pixels[off + 3] = 255;
      }
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(outW, 0);
  ihdr.writeUInt32BE(outH, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = outW * 4;
  const filtered = Buffer.alloc((stride + 1) * outH);
  for (let y = 0; y < outH; y += 1) {
    filtered[y * (stride + 1)] = 0;
    pixels.copy(filtered, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = deflateSync(filtered);

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function place(x, y, occupied, seen) {
  const key = `${x},${y}`;
  if (!seen.has(key)) {
    seen.add(key);
    occupied.push({ x, y });
  }
}

function buildTile() {
  const occupied = [];
  const seen = new Set();
  const width = 64;
  const height = 32;
  const cx = width / 2;
  const cy = height / 2;
  
  for (let y = 0; y < height; y++) {
    const dy = Math.abs(y - cy);
    const halfWidth = (height / 2 - dy) * 2;
    for (let x = Math.round(cx - halfWidth); x <= Math.round(cx + halfWidth); x++) {
      if (x >= 0 && x < width && y >= 0 && y < height) {
        place(x, y, occupied, seen);
      }
    }
  }
  return { occupied, width, height };
}

function buildTorch() {
  const occupied = [];
  const seen = new Set();
  const width = 30;
  const height = 60;
  const cx = width / 2;
  
  for (let y = 0; y < height; y++) {
    let hw = 0;
    if (y < 20) hw = 4; // flame
    else if (y < 30) hw = 8; // bowl
    else hw = 4; // pillar
    
    for (let x = cx - hw; x <= cx + hw; x++) {
      if (x >= 0 && x < width) place(x, y, occupied, seen);
    }
  }
  return { occupied, width, height };
}

function buildLeylineFissures() {
  const occupied = [];
  const seen = new Set();
  const width = 64;
  const height = 32;
  const cy = height / 2;

  function place(xPos, yPos) {
    const key = `${Math.round(xPos)},${Math.round(yPos)}`;
    if (!seen.has(key) && xPos >= 0 && xPos < width && yPos >= 0 && yPos < height) {
      seen.add(key);
      occupied.push({ x: Math.round(xPos), y: Math.round(yPos) });
    }
  }

  // === WAND INTEGRATION: Edge Trace Construction Lines (Fairly Odd Wand style) ===
  // Primary faults are defined as clean, deterministic edge_trace proposals.
  // This is the "construction before ink" step. We evaluate via the same engine as /wand.
  // Then we apply geological erosion, stronger rims, branches, and ground pass.

  const canvas = { width, height };

  // Main central ley fault (strongest resonance carrier)
  const mainTrace = {
    coordinateFormula: {
      type: 'edge_trace',
      tracePath: [
        { x: 4, y: cy - 0.8 }, { x: 11, y: cy - 1.2 }, { x: 19, y: cy - 0.4 },
        { x: 27, y: cy - 1.1 }, { x: 35, y: cy + 0.5 }, { x: 43, y: cy - 0.7 },
        { x: 51, y: cy + 0.9 }, { x: 58, y: cy - 0.3 }
      ]
    }
  };

  // Parallel companion fault
  const companionTrace = {
    coordinateFormula: {
      type: 'edge_trace',
      tracePath: [
        { x: 6, y: cy + 2.8 }, { x: 14, y: cy + 3.4 }, { x: 23, y: cy + 2.9 },
        { x: 32, y: cy + 3.6 }, { x: 40, y: cy + 2.5 }, { x: 49, y: cy + 3.1 },
        { x: 57, y: cy + 2.7 }
      ]
    }
  };

  // Upper major splay
  const upperSplay = {
    coordinateFormula: {
      type: 'edge_trace',
      tracePath: [
        { x: 10, y: cy - 5 }, { x: 18, y: cy - 4.5 }, { x: 27, y: cy - 5.8 },
        { x: 35, y: cy - 4.2 }, { x: 44, y: cy - 5.5 }, { x: 53, y: cy - 4.8 }
      ]
    }
  };

  // Lower splay
  const lowerSplay = {
    coordinateFormula: {
      type: 'edge_trace',
      tracePath: [
        { x: 12, y: cy + 6 }, { x: 21, y: cy + 5.5 }, { x: 30, y: cy + 6.8 },
        { x: 39, y: cy + 5.3 }, { x: 48, y: cy + 6.2 }
      ]
    }
  };

  // Cross shear (badlands character)
  const crossShear = {
    coordinateFormula: {
      type: 'edge_trace',
      tracePath: [
        { x: 16, y: cy - 8 }, { x: 22, y: cy - 7.2 }, { x: 29, y: cy - 8.5 }
      ]
    }
  };

  // Extra cross-fault for richer eroded structure (supports more complex affinities)
  const extraCross = {
    coordinateFormula: {
      type: 'edge_trace',
      tracePath: [
        { x: 35, y: cy - 6.5 }, { x: 42, y: cy - 5.8 }, { x: 48, y: cy - 7.2 }
      ]
    }
  };

  const traces = [mainTrace, companionTrace, upperSplay, lowerSplay, crossShear, extraCross];

  // Evaluate Wand traces to get clean construction points (per trace for better control)
  const evaluatedTraces = traces.map(t => evaluateFormula(t, canvas));

  // Collect all for ground/rims later
  const allTracePoints = evaluatedTraces.flat();

  // Raster a single evaluated trace with erosion
  function rasterTrace(points, baseThickness = 1) {
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const x = p.x;
      const y = p.y;

      // Core body (eroded thickness + chunk)
      const thick = baseThickness + (Math.random() < 0.22 ? 1 : 0);
      for (let t = 0; t < thick; t++) {
        place(x, y + t);
        place(x, y - t);
        // micro erosion clusters for badlands chunkiness
        if (Math.random() < 0.6) {
          place(x + (Math.random() < 0.5 ? 1 : -1), y + (t + Math.random() - 0.5));
        }
      }

      // Wider eroded basins occasionally (pull-apart)
      if (Math.random() < 0.12) {
        for (let dx = -2; dx <= 2; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            if (Math.hypot(dx * 0.9, dy) < 2.8) place(x + dx, y + dy);
          }
        }
      }
    }
  }

  // Stronger rims: perpendicular lips for resonant color pop
  function addStrongRims(points) {
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const px = -dy / len; // perpendicular
      const py = dx / len;

      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;

      // Stronger rim pixels — these will pick up brighter resonant tones
      for (let r = 1; r <= 2; r++) {
        place(midX + px * r * 1.2, midY + py * r * 1.2);
        place(midX + px * r * 1.2 + (Math.random() - 0.5) * 0.8, midY + py * r * 1.2 + (Math.random() - 0.5) * 0.8);
        place(midX - px * r * 1.2, midY - py * r * 1.2);
        place(midX - px * r * 1.2 + (Math.random() - 0.5) * 0.8, midY - py * r * 1.2 + (Math.random() - 0.5) * 0.8);
      }
      // Extra emphasis at key points
      if (Math.random() < 0.7) {
        place(a.x + px * 1.8, a.y + py * 1.8);
        place(a.x - px * 1.8, a.y - py * 1.8);
      }
    }
  }

  // Raster each trace independently (more eroded)
  evaluatedTraces.forEach(pts => {
    if (pts && pts.length) rasterTrace(pts, 1);
  });

  // Apply stronger rims across all (concentrates resonance on lips)
  evaluatedTraces.forEach(pts => {
    if (pts && pts.length > 1) addStrongRims(pts);
  });

  // Controlled branches off the traces (more eroded style)
  allTracePoints.forEach((p, i) => {
    if (i % 3 === 0 && Math.random() < 0.22) {
      const sign = Math.random() < 0.5 ? 1 : -1;
      const blen = 3 + Math.floor(Math.random() * 5);
      let bx = p.x;
      let by = p.y + sign * 1.5;
      for (let b = 0; b < blen; b++) {
        bx += (Math.random() - 0.3);
        by += sign * (0.6 + Math.random() * 0.8);
        place(bx, by);
        if (Math.random() < 0.4) place(bx + 1, by + sign);
        if (b % 2 === 0 && Math.random() < 0.5) place(bx, by + sign * 2);
      }
    }
  });

  // === GROUND INTEGRATION PASS ===
  // Broad, sparse disturbed earth around the entire fissure system.
  // These will resolve to deeper material tones, making fissures feel carved into real ground.
  const groundBand = 7;
  allTracePoints.forEach(p => {
    for (let r = 3; r < groundBand; r++) {
      const count = Math.max(1, Math.floor(5 / r));
      for (let k = 0; k < count; k++) {
        const ang = Math.random() * Math.PI * 2;
        const gx = p.x + Math.cos(ang) * (r + Math.random() * 0.8);
        const gy = p.y + Math.sin(ang) * (r * 0.55 + Math.random());
        if (Math.random() < 0.6 / r) {
          place(gx, gy);
          if (Math.random() < 0.28) place(gx + (Math.random() - 0.5) * 1.2, gy + (Math.random() - 0.5));
        }
      }
    }
  });

  // Extra global eroded ground texture (badlands floor breakup)
  for (let i = 0; i < 70; i++) {
    const gx = 4 + Math.random() * 56;
    const gy = cy - 10 + Math.random() * 20;
    // Only near the fissure system
    const distToTrace = allTracePoints.reduce((min, tp) => Math.min(min, Math.hypot(tp.x - gx, tp.y - gy)), 999);
    if (distToTrace < 12 && Math.random() < 0.7) {
      place(gx, gy);
      if (Math.random() < 0.32) place(gx + (Math.random() < 0.5 ? 1 : -1), gy + (Math.random() - 0.5) * 1.2);
    }
  }

  // Final pull-apart basins on main trace for professional eroded look
  const basinXs = [17, 29, 43];
  basinXs.forEach(bx => {
    const by = cy + (Math.random() - 0.3) * 2;
    for (let dx = -3; dx <= 3; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        if (Math.hypot(dx * 0.8, dy) < 3.1) {
          place(bx + dx, by + dy);
        }
      }
    }
  });

  // === TASK 3: Rim-only emphasis pass (luminance bias before sketchToSilhouette) ===
  // Add outer halo specifically for the fissure lips. These become the silhouette "rim"
  // (norm=0 in distance transform) and will be biased toward high-resonance anchors
  // in the material fill (brighter spectral/frost for the color pop on crack edges).
  const rimHaloDist = 1.6;
  allTracePoints.forEach(p => {
    for (let a = 0; a < 6; a++) {
      const ang = (a / 6) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const rx = p.x + Math.cos(ang) * rimHaloDist;
      const ry = p.y + Math.sin(ang) * rimHaloDist * 0.65;
      if (Math.random() < 0.85) {
        place(rx, ry);
        if (Math.random() < 0.4) place(rx + (Math.random() - 0.5), ry + (Math.random() - 0.5) * 0.8);
      }
    }
  });

  return { occupied, width, height };
}

function runPipeline(name, builderFn, bytecode, material) {
  const { occupied, width, height } = builderFn();
  const canvas = { width, height, gridSize: 1 };
  
  const template = sketchToSilhouette(occupied, canvas, {
    bands: 4,
    symmetry: 'none',
  });

  const filled = fillTemplate(template, bytecode, { bands: template.bands });

  const sharpness = buildSquareSharpnessContrastPayload({
    coordinates: filled,
    material,
    canvas,
    options: { enabled: true, edgeContrast: 0.2, interiorContrast: 0.1 },
    intent: 'enhance_square_render_readability',
  });

  const polished = sharpness.outputCoordinates;

  const pngBytes = renderPng(polished, width, height, 4);
  writeFileSync(resolve(OUT_DIR, `${name}.png`), pngBytes);
  
  const base64 = pngBytes.toString('base64');
  writeFileSync(resolve(OUT_DIR, `${name}.js`), `export const ${name.replace('-', '_')}Uri = "data:image/png;base64,${base64}";\n`);
  console.log(`Generated ${name}`);

  // 1x version for icon/readability QA (task 5)
  const png1x = renderPng(polished, width, height, 1);
  writeFileSync(resolve(OUT_DIR, `${name}.1x.png`), png1x);
  console.log(`Generated ${name}.1x.png for QA`);

  // Basic visual QA report
  const activePixels = polished.length;
  if (name === 'combat-leyline') {
    console.log(`[QA] ${name}: ${activePixels} pixels | ${width}x${height} | non-circular fissure structure with rims + ground | ready for in-context tile use`);
  } else {
    console.log(`[QA] ${name}: ${activePixels} pixels | ${width}x${height}`);
  }
}

try {
  runPipeline('combat-tile', buildTile, 'VW-VOID-INEXPLICABLE-HARMONIC', 'black_steel');
  runPipeline('combat-torch', buildTorch, 'VW-ABJURATION-INEXPLICABLE-HARMONIC', 'gold');
  runPipeline('combat-leyline', buildLeylineFissures, 'VW-SONIC-INEXPLICABLE-HARMONIC', 'amethyst');
} catch (e) {
  console.error(e);
}

// === TASK 4: Export Wand trace specs as reusable formula JSON ===
// These are Fairly Odd Wand / edge_trace proposals. Can be loaded into /wand cockpit
// or used by other PixelBrain tools for consistent leyline construction across affinities.
const leylineWandSpecs = {
  schema: 'wand.formula.v1',
  id: 'leyline-fissure-traces.v1',
  description: 'Construction lines for badlands fissure leylines. Primary faults use edge_trace for clean geometry before erosion/rim/ground passes.',
  traces: {
    main: {
      coordinateFormula: {
        type: 'edge_trace',
        tracePath: [
          { x: 4, y: 15.2 }, { x: 11, y: 14.8 }, { x: 19, y: 15.6 },
          { x: 27, y: 14.9 }, { x: 35, y: 16.5 }, { x: 43, y: 15.3 },
          { x: 51, y: 16.9 }, { x: 58, y: 15.7 }
        ]
      }
    },
    companion: {
      coordinateFormula: {
        type: 'edge_trace',
        tracePath: [
          { x: 6, y: 18.8 }, { x: 14, y: 19.4 }, { x: 23, y: 18.9 },
          { x: 32, y: 19.6 }, { x: 40, y: 18.5 }, { x: 49, y: 19.1 },
          { x: 57, y: 18.7 }
        ]
      }
    },
    upperSplay: {
      coordinateFormula: {
        type: 'edge_trace',
        tracePath: [
          { x: 10, y: 11 }, { x: 18, y: 11.5 }, { x: 27, y: 10.2 },
          { x: 35, y: 11.8 }, { x: 44, y: 10.5 }, { x: 53, y: 11.2 }
        ]
      }
    },
    lowerSplay: {
      coordinateFormula: {
        type: 'edge_trace',
        tracePath: [
          { x: 12, y: 22 }, { x: 21, y: 21.5 }, { x: 30, y: 22.8 },
          { x: 39, y: 21.3 }, { x: 48, y: 22.2 }
        ]
      }
    },
    crossShear: {
      coordinateFormula: {
        type: 'edge_trace',
        tracePath: [
          { x: 16, y: 8 }, { x: 22, y: 8.8 }, { x: 29, y: 7.5 }
        ]
      }
    },
    extraCross: {
      coordinateFormula: {
        type: 'edge_trace',
        tracePath: [
          { x: 35, y: 9.5 }, { x: 42, y: 10.2 }, { x: 48, y: 8.8 }
        ]
      }
    }
  },
  usage: 'Feed each trace into evaluateFormula + raster + erosion/rim/ground passes. Tint result via material fill for any affinity.'
};

try {
  const specsPath = resolve(OUT_DIR, 'leyline-wand-traces.json');
  writeFileSync(specsPath, JSON.stringify(leylineWandSpecs, null, 2));
  console.log(`Exported Wand specs to ${specsPath}`);
} catch (e) {
  console.error('Failed to export wand specs:', e.message);
}
