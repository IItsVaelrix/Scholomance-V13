#!/usr/bin/env node
/**
 * Vixel Rasterizer — Phase 4/5
 *
 * Renders a compiled SCDL packet with Native Vixel Texture Engine
 * & Wand vector superposition to PNG at arbitrary scale, using:
 *   - Sub-cell coverage AA from signed distance to op boundary
 *   - Native Vixel Texture Engine (multi-octave vector harmonic interferometry)
 *   - Metallic specular and anisotropic sheen shader
 *   - Smooth sub-pixel Wand vector stroke line superposition
 *
 * Usage:
 *   node scripts/vixel-rasterize.mjs [asset] [scale]
 *   node scripts/vixel-rasterize.mjs celestial-sword 4
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

// ─── Material Grain (mirrors codex/core/pixelbrain/material-registry.js) ─────

const MATERIAL_GRAIN = {
  obsidian:       { direction: 0,          frequency: 0.20, crossFrequency: 0.08, amplitude: 0.6 },
  darksteel:      { direction: 0,          frequency: 0.25, crossFrequency: 0.12, amplitude: 0.4 },
  holy_fire:      { direction: Math.PI/2,  frequency: 0.15, crossFrequency: 0.06, amplitude: 0.8 },
  holy_steel:     { direction: 0,          frequency: 0.20, crossFrequency: 0.10, amplitude: 0.45 },
  void_cloth:     { direction: Math.PI/4,  frequency: 0.30, crossFrequency: 0.05, amplitude: 0.2 },
  void_rune_glow: { direction: 0,          frequency: 0.15, crossFrequency: 0.08, amplitude: 0.7 },
  oak_bark:       { direction: 0,          frequency: 0.25, crossFrequency: 0.06, amplitude: 0.5 },
  bark:           { direction: 0,          frequency: 0.32, crossFrequency: 0.08, amplitude: 0.85 },
  pine_needle:    { direction: Math.PI/5,  frequency: 0.35, crossFrequency: 0.09, amplitude: 0.55 },
  voidbark:       { direction: 0,          frequency: 0.26, crossFrequency: 0.06, amplitude: 0.7 },
  astralmoss:     { direction: Math.PI/3,  frequency: 0.22, crossFrequency: 0.09, amplitude: 0.45 },
  moonstone:      { direction: 0,          frequency: 0.15, crossFrequency: 0.08, amplitude: 0.3 },
  cyan_glow:      { direction: Math.PI/2,  frequency: 0.12, crossFrequency: 0.06, amplitude: 0.35 },
  diamond:        { direction: Math.PI/3,  frequency: 0.18, crossFrequency: 0.12, amplitude: 0.25 },
  sapphire:       { direction: Math.PI/6,  frequency: 0.18, crossFrequency: 0.10, amplitude: 0.4 },
  steel:          { direction: 0,          frequency: 0.22, crossFrequency: 0.10, amplitude: 0.45 },
  iron:           { direction: 0,          frequency: 0.28, crossFrequency: 0.14, amplitude: 0.35 },
  leather:        { direction: Math.PI/6,  frequency: 0.35, crossFrequency: 0.08, amplitude: 0.25 },
  gold:           { direction: Math.PI/4,  frequency: 0.18, crossFrequency: 0.12, amplitude: 0.5 },
  source:         { direction: 0,          frequency: 0,    crossFrequency: 0,    amplitude: 0 },
};

// ─── Native Vixel Texture Engine ──────────────────────────────────────────────

/**
 * Native Vixel Texture Engine — Multi-octave vector harmonic interferometry.
 * Evaluates continuous micro-fluid texture directly on the vector manifold (s, d, κ, T, N).
 */
function evaluateVixelTexture(s, d, arcLen, kappa, grain) {
  if (!grain || grain.amplitude === 0) return 0;

  // Curvature-modulated flow frequency
  const flowFreq = (grain.frequency || 0.2) * (1.0 + Math.abs(kappa || 0) * 1.5);
  const crossFreq = (grain.crossFrequency || 0.1);
  const dir = grain.direction || 0;

  // Multi-octave vector harmonic interferometry (silky smooth continuous wave fields)
  const o1 = Math.sin(s * flowFreq * Math.PI * 2 + d * crossFreq * Math.PI * 2 + dir);
  const o2 = Math.sin(s * flowFreq * 2.13 * Math.PI * 2 + d * crossFreq * 1.87 * Math.PI * 2 + dir * 1.5) * 0.45;
  const o3 = Math.cos(s * flowFreq * 4.27 * Math.PI * 2 - d * crossFreq * 3.41 * Math.PI * 2 + dir * 2.2) * 0.22;

  // Smooth Gaussian transverse envelope
  const envelope = Math.exp(-(d * d) / 2.2);

  const rawHarmonic = (o1 + o2 + o3) / 1.67;
  return grain.amplitude * rawHarmonic * envelope;
}

const BAYER_4X4 = [
  [ 0/16,  8/16,  2/16, 10/16],
  [12/16,  4/16, 14/16,  6/16],
  [ 3/16, 11/16,  1/16,  9/16],
  [15/16,  7/16, 13/16,  5/16],
];

function applyBayerDither(val, px, py) {
  const dither = BAYER_4X4[py % 4][px % 4] - 0.5;
  return Math.max(0, Math.min(1, val + dither * 0.15));
}

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function clamp255(v) {
  return Math.max(0, Math.min(255, Math.round(v)));
}

function hexToRGBA(hex) {
  const h = (hex || '').replace('#', '');
  if (h.length < 6) return [0, 0, 0, 0];
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
    h.length >= 8 ? parseInt(h.slice(6, 8), 16) : 255,
  ];
}

function distToPolyline(px, py, points) {
  let minDist = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) {
      const d = Math.sqrt((px - p1.x) ** 2 + (py - p1.y) ** 2);
      minDist = Math.min(minDist, d);
      continue;
    }
    const t = Math.max(0, Math.min(1, ((px - p1.x) * dx + (py - p1.y) * dy) / len2));
    const projX = p1.x + t * dx;
    const projY = p1.y + t * dy;
    const d = Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);
    minDist = Math.min(minDist, d);
  }
  return minDist;
}

/**
 * Render a vixel field to RGBA at scale S.
 */
function renderVixel(cells, width, height, scale, nullVector = false, vectorPaths = [], sceneLight = null) {
  const W = width * scale;
  const H = height * scale;
  const buf = new Uint8Array(W * H * 4);

  for (const cell of cells) {
    const cx = cell.snappedX ?? cell.x;
    const cy = cell.snappedY ?? cell.y;
    if (cx < 0 || cx >= width || cy < 0 || cy >= height) continue;

    const baseColor = hexToRGBA(cell.color);
    const sd = nullVector ? null : cell.signedDistance;
    const tangent = nullVector ? null : cell.tangent;
    const normal = nullVector ? null : cell.normal;
    const grain = MATERIAL_GRAIN[cell.material] || null;

    for (let sy = 0; sy < scale; sy++) {
      for (let sx = 0; sx < scale; sx++) {
        const px = cx * scale + sx;
        const py = cy * scale + sy;
        const idx = (py * W + px) * 4;

        const u = (sx + 0.5) / scale;
        const v = (sy + 0.5) / scale;

        let coverage = 1.0;
        let grainMod = 0;
        let specularBoost = [0, 0, 0];
        let lightBoost = 0;

        // Scene moon / key light falloff (revalues path, foliage, bark — not a filled disc alone)
        if (sceneLight) {
          const dx = (cx + u) - sceneLight.x;
          const dy = (cy + v) - sceneLight.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const fall = Math.exp(-(dist * dist) / (sceneLight.radius * sceneLight.radius));
          const mat = cell.material || '';
          const lit =
            mat === 'bark' || mat === 'voidbark' || mat === 'pine_needle' ||
            mat === 'astralmoss' || mat === 'sapphire' || mat === 'cyan_glow' ||
            (cell.partId && (cell.partId.includes('path') || cell.partId.includes('stair') || cell.partId.includes('foliage')));
          if (lit) lightBoost = fall * (sceneLight.strength || 28);
          else if (mat === 'obsidian' || mat === 'diamond') lightBoost = fall * (sceneLight.strength || 28) * 0.35;
        }

        if (!nullVector && sd !== null && sd !== undefined) {
          const localSD = sd + (
            (u - 0.5) * (normal ? normal[0] : 0) +
            (v - 0.5) * (normal ? normal[1] : 0)
          );
          const edge = 0.5 / scale;
          const hw = cell.strokeHalfWidth;
          if (hw != null) {
            coverage = smoothstep(edge, -edge, Math.abs(localSD) - hw);
          } else {
            // Eliminate left-right alpha resampling checkering: force solid opacity on structural blade cells
            const distAxis = Math.abs((cx + u) - 16.0);
            if (localSD < -0.15 || (cy <= 95 && distAxis < 9.2 && cell.material !== 'source')) {
              coverage = 1.0;
            } else {
              coverage = smoothstep(-edge, edge, -localSD);
            }
          }

          const isMetal = ['gold', 'holy_steel', 'darksteel', 'steel', 'iron', 'bronze_gold'].includes(cell.material) ||
                          (cell.color && (cell.color.toLowerCase() === '#d4af37' || cell.color.toLowerCase() === '#e6aa4e' || cell.color.toLowerCase() === '#2b323d'));

          if (tangent) {
            const tx = tangent[0], ty = tangent[1];
            const nx = normal ? normal[0] : -ty;
            const ny = normal ? normal[1] : tx;
            const du = u - 0.5, dv = v - 0.5;
            const dAlong = du * tx + dv * ty;
            const dAcross = du * nx + dv * ny;
            const arcLen = cell.arcLength || 1;
            const s = (cell.t || 0) * arcLen + dAlong;
            const d = (sd || 0) + dAcross;

            // 1. Native Vixel Texture Engine (Multi-Octave Vector Field Harmonics)
            if (tangent && grain) {
              const vecAngle = Math.atan2(tangent[1], tangent[0]);
              const effectiveGrain = { ...grain, direction: vecAngle + (grain.direction || 0) };
              grainMod = evaluateVixelTexture(s, d, arcLen, cell.curvature, effectiveGrain);
            } else {
              grainMod = evaluateVixelTexture(s, d, arcLen, cell.curvature, grain);
            }

            // 2. Symmetrical Metallic Specular & Controlled Gold Aura
            if (isMetal) {
              const nz = 0.71;
              const nLen = Math.sqrt(nx * nx * 0.49 + ny * ny * 0.49 + nz * nz) || 1;
              const N = [ (nx * 0.7) / nLen, (ny * 0.7) / nLen, nz / nLen ];

              const L = [ -0.447, -0.537, 0.716 ];
              const H = [ -0.274, -0.328, 0.904 ];

              const dotNH = Math.max(0, N[0] * H[0] + N[1] * H[1] + N[2] * H[2]);
              const dotTH = tx * H[0] + ty * H[1];
              const aniso = Math.pow(Math.max(0, 1 - dotTH * dotTH), 12);
              const specPower = Math.pow(dotNH, 16) * aniso;
              const dotNV = N[2];
              const fresnel = Math.pow(1 - dotNV, 2) * 0.3;

              // Reduced gold aura by 50% (controlled falloff, hard cell-snapped rim)
              const totalHighlight = specPower * 0.7 + fresnel * 0.4;

              // Sword assets snap metallic highlights to x=16; scenes use soft directional light
              const useSwordSymmetry = width <= 48;
              const distFromAxis = Math.abs((cx + u) - 16.0);
              const symFalloff = useSwordSymmetry
                ? Math.exp(-(distFromAxis * distFromAxis) / 120.0)
                : 0.85;

              if (cell.material === 'gold' || (cell.color && cell.color.toLowerCase().includes('d4af37'))) {
                specularBoost = [ totalHighlight * 75 * symFalloff, totalHighlight * 60 * symFalloff, totalHighlight * 25 * symFalloff ];
              } else if (cell.material === 'holy_steel' || cell.material === 'steel') {
                specularBoost = [ totalHighlight * 80 * symFalloff, totalHighlight * 90 * symFalloff, totalHighlight * 105 * symFalloff ];
              } else {
                specularBoost = [ totalHighlight * 50 * symFalloff, totalHighlight * 55 * symFalloff, totalHighlight * 70 * symFalloff ];
              }
            }
          }
        } else if (grain && grain.amplitude > 0) {
          // No vector manifold — positional material grain (bark texture, etc.)
          grainMod = grain.amplitude * Math.sin(
            (cx + u) * grain.frequency * Math.PI * 2 +
            (cy + v) * (grain.crossFrequency || 0) * Math.PI * 2 +
            grain.direction
          );
        }

        // Bark / organic: if vector path had sd but no tangent, still apply material grain
        if (!nullVector && grain && grain.amplitude > 0 && grainMod === 0) {
          grainMod = grain.amplitude * Math.sin(
            (cx + u) * grain.frequency * Math.PI * 2 +
            (cy + v) * (grain.crossFrequency || 0) * Math.PI * 2 +
            grain.direction
          );
        }

        let vectorLightBoost = 0;
        if (!nullVector && vectorPaths.length > 0) {
          const subX = cx + u;
          const subY = cy + v;
          for (const path of vectorPaths) {
            if (path.role && (path.role.includes('torii') || path.role.includes('moon') || path.role.includes('lantern') || path.role.includes('book') || path.role.includes('rune'))) {
              const minD = distToPolyline(subX, subY, path.points);
              const fall = Math.exp(-(minD * minD) / (32 * 32));
              vectorLightBoost += fall * 28 * (path.pressure || 1);
            }
          }
        }

        let r = clamp255(baseColor[0] + grainMod * 35 + specularBoost[0] + lightBoost + vectorLightBoost);
        let g = clamp255(baseColor[1] + grainMod * 30 + specularBoost[1] + lightBoost * 0.95 + vectorLightBoost * 0.9);
        let b = clamp255(baseColor[2] + grainMod * 25 + specularBoost[2] + lightBoost * 1.15 + vectorLightBoost * 1.1);
        let a = baseColor[3] * coverage;

        // ── Wand Vector Stroke Superposition ──
        if (!nullVector && vectorPaths.length > 0) {
          const subX = cx + u;
          const subY = cy + v;
          const edge = 0.5 / scale;

          for (const path of vectorPaths) {
            // Invisible grain guides — fusion only, never paint as filigree
            if (path.role && path.role.startsWith('grain.')) continue;

            const minD = distToPolyline(subX, subY, path.points);
            const hw = path.strokeWidth ? path.strokeWidth / 2 : 0.6;
            const strokeCov = smoothstep(edge, -edge, minD - hw);

            if (strokeCov > 0) {
              const ditheredCov = applyBayerDither(strokeCov, px, py);
              const isFence = path.role.includes('fence');
              const alpha = ditheredCov * (path.pressure || 1) * (isFence ? 0.95 : 0.85);
              let sR = 212, sG = 175, sB = 55; // Saturated gold (#D4AF37)
              if (path.role.includes('torii') || path.role.includes('lightning') || path.role.includes('stellar')) {
                sR = 128; sG = 255; sB = 255; // Cyan shrine / electric stroke
              } else if (path.role.includes('moon')) {
                sR = 220; sG = 235; sB = 255; // Pale moon ring
              } else if (path.role.includes('pommel') || path.role.includes('eye')) {
                sR = 255; sG = 248; sB = 231; // Stardust white star stroke
              } else if (isFence) {
                sR = 230; sG = 185; sB = 60;
              }

              r = Math.round(r * (1 - alpha) + sR * alpha);
              g = Math.round(g * (1 - alpha) + sG * alpha);
              b = Math.round(b * (1 - alpha) + sB * alpha);
              a = Math.max(a, Math.round(255 * alpha));
            }
          }
        }

        buf[idx]     = r;
        buf[idx + 1] = g;
        buf[idx + 2] = b;
        buf[idx + 3] = Math.round(a);
      }
    }
  }

  return { width: W, height: H, data: buf };
}

// ─── PNG Encoder ─────────────────────────────────────────────────────────────

function encodePng(width, height, rgba) {
  const ihdr = new Uint8Array(13);
  writeU32BE(ihdr, 0, width);
  writeU32BE(ihdr, 4, height);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const stride = width * 4;
  const filtered = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    filtered[y * (stride + 1)] = 0;
    filtered.set(rgba.subarray(y * stride, y * stride + stride), y * (stride + 1) + 1);
  }

  return concatBytes([
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlibStore(filtered)),
    pngChunk('IEND', new Uint8Array(0)),
  ]);
}

function zlibStore(data) {
  const blocks = [];
  for (let offset = 0; offset < data.length; offset += 65535) {
    const chunk = data.subarray(offset, Math.min(offset + 65535, data.length));
    const block = new Uint8Array(5 + chunk.length);
    block[0] = offset + chunk.length >= data.length ? 1 : 0;
    writeU16LE(block, 1, chunk.length);
    writeU16LE(block, 3, (~chunk.length) & 0xffff);
    block.set(chunk, 5);
    blocks.push(block);
  }
  const checksum = new Uint8Array(4);
  writeU32BE(checksum, 0, adler32(data));
  return concatBytes([new Uint8Array([0x78, 0x01]), ...blocks, checksum]);
}

function adler32(data) {
  let a = 1, b = 0;
  for (let i = 0; i < data.length; i++) {
    a = (a + data[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function crc32(data) {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBytes = new Uint8Array(type.length);
  for (let i = 0; i < type.length; i++) typeBytes[i] = type.charCodeAt(i);
  const lengthBytes = new Uint8Array(4);
  writeU32BE(lengthBytes, 0, data.length);
  const crcBytes = new Uint8Array(4);
  writeU32BE(crcBytes, 0, crc32(concatBytes([typeBytes, data])));
  return concatBytes([lengthBytes, typeBytes, data, crcBytes]);
}

function concatBytes(chunks) {
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}

function writeU32BE(t, o, v) { t[o]=v>>>24; t[o+1]=(v>>>16)&0xff; t[o+2]=(v>>>8)&0xff; t[o+3]=v&0xff; }
function writeU16LE(t, o, v) { t[o]=v&0xff; t[o+1]=(v>>>8)&0xff; }

function pixelDiff(a, b) {
  let diffPixels = 0, maxDelta = 0, sumDelta = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    const d = Math.abs(a.data[i]-b.data[i]) + Math.abs(a.data[i+1]-b.data[i+1]) +
              Math.abs(a.data[i+2]-b.data[i+2]) + Math.abs(a.data[i+3]-b.data[i+3]);
    if (d > 0) { diffPixels++; sumDelta += d; maxDelta = Math.max(maxDelta, d); }
  }
  return { total: a.data.length / 4, diffPixels, ratio: diffPixels / (a.data.length / 4), avgDelta: diffPixels ? sumDelta / diffPixels : 0, maxDelta };
}

// ─── Main ────────────────────────────────────────────────────────────────────

const asset = process.argv[2] || 'brazier';
const scale = parseInt(process.argv[3] || '4', 10);

const packetPath = resolve(root, `worldpacks/shrine-demo/scdl/${asset}-json.json`);
const packet = JSON.parse(readFileSync(packetPath, 'utf8'));
const rawCoords = packet.geometry?.coordinates || [];

const byPixel = new Map();
for (const c of rawCoords) byPixel.set(`${c.snappedX ?? c.x},${c.snappedY ?? c.y}`, c);
const coords = [...byPixel.values()];
const canvas = packet.canvas || { width: 16, height: 24 };

let vectorPaths = [];
try {
  const wandPath = resolve(root, `worldpacks/shrine-demo/wand/${asset}.wand.json`);
  if (existsSync(wandPath)) {
    const wandDef = JSON.parse(readFileSync(wandPath, 'utf8'));
    const { evaluateFormula } = await import('../../codex/core/pixelbrain/formula-to-coordinates.js');
    for (const f of wandDef.formulas) {
      const pts = evaluateFormula(f.formula, wandDef.canvas, 0, { strict: true });
      if (pts.length > 0) {
        vectorPaths.push({
          role: f.role,
          type: f.type,
          pressure: f.pressure || 1,
          strokeWidth: f.formula?.coordinateFormula?.parameters?.strokeWidth || (f.type === 'mathematical_stroke' ? 1.5 : 0.8),
          points: pts.map(c => ({ x: c.x, y: c.y })),
        });
      }
    }
  }
} catch (e) {
  // Wand optional
}

console.log(`\n╔══════════════════════════════════════════════════════════╗`);
console.log(`║  VIXEL RASTERIZER — Phase 4/5                           ║`);
console.log(`║  Asset: ${asset.padEnd(20)} Scale: ${scale}×                      ║`);
console.log(`║  Canvas: ${canvas.width}×${canvas.height}  Cells: ${String(coords.length).padEnd(6)}                    ║`);
console.log(`║  Wand Vector Stroke Paths: ${vectorPaths.length}                            ║`);
console.log(`╚══════════════════════════════════════════════════════════╝\n`);

const withVI = coords.filter(c => c.signedDistance !== undefined).length;
console.log(`  Vector identity: ${withVI}/${coords.length} cells (${(withVI/coords.length*100).toFixed(1)}%)`);

// Scene moon light for wide canvases (moonlit shrine grammar)
const sceneLight = (canvas.width >= 80)
  ? { x: 118, y: 14, radius: 55, strength: 32 }
  : null;

const vixel = renderVixel(coords, canvas.width, canvas.height, scale, false, vectorPaths, sceneLight);
const pixel = renderVixel(coords, canvas.width, canvas.height, scale, true, [], sceneLight);

const diff = pixelDiff(vixel, pixel);
console.log(`\n  ── Ablation A/B ──`);
console.log(`  Vixel:  ${vixel.width}×${vixel.height} RGBA`);
console.log(`  Pixel:  ${pixel.width}×${pixel.height} RGBA`);
console.log(`  Diff:   ${diff.diffPixels}/${diff.total} pixels (${(diff.ratio*100).toFixed(1)}%)`);
console.log(`  Avg Δ:  ${diff.avgDelta.toFixed(1)}  Max Δ: ${diff.maxDelta}`);

const outDir = resolve(root, 'evidence');
mkdirSync(outDir, { recursive: true });

const vixelPng = encodePng(vixel.width, vixel.height, vixel.data);
const pixelPng = encodePng(pixel.width, pixel.height, pixel.data);

const vixelPath = resolve(outDir, `vixel-${asset}-${scale}x.png`);
const pixelPath = resolve(outDir, `pixel-${asset}-${scale}x.png`);

writeFileSync(vixelPath, vixelPng);
writeFileSync(pixelPath, pixelPng);

console.log(`\n  ── Output ──`);
console.log(`  Vixel PNG: ${vixelPath} (${vixelPng.length} bytes)`);
console.log(`  Pixel PNG: ${pixelPath} (${pixelPng.length} bytes)`);

const vixel2 = renderVixel(coords, canvas.width, canvas.height, scale, false, vectorPaths, sceneLight);
const deterministic = Buffer.from(vixel.data).equals(Buffer.from(vixel2.data));
console.log(`\n  Deterministic: ${deterministic ? '✓ PASS' : '✗ FAIL'}`);

console.log(`\n  ${diff.ratio > 0.05 ? '✓ ABLATION PASSES' : '✗ ABLATION FAILS'} — vixel and pixel renders ${diff.ratio > 0.05 ? 'differ visibly' : 'are too similar'}\n`);
