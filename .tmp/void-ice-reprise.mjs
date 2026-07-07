import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { exportFoundryToAsepriteBinary } from '../codex/core/pixelbrain/foundry-aseprite-bridge.js';
import { decodeAsepriteBinary } from '../codex/core/pixelbrain/aseprite-binary-codec.js';
import { interpretInstruction, morphCoordinatesToward } from '../codex/core/pixelbrain/nlp-morph-engine.js';
import { createCellSet, getBorderCells, getInteriorCells, cellSetToArray } from '../codex/core/pixelbrain/geometry/index.js';

const INPUT = '/home/deck/Downloads/sunflower5.aseprite';
const OUT_ASE = '/home/deck/Downloads/Scholomance-V12-main/docs/references/Void-Ice-Reprise.aseprite';
const OUT_PNG = '/home/deck/Downloads/Scholomance-V12-main/docs/references/Void-Ice-Reprise.png';

function hexToRgb(hex) {
  const m = String(hex || '').trim().replace('#', '');
  if (m.length !== 6) return null;
  return { r: parseInt(m.slice(0, 2), 16), g: parseInt(m.slice(2, 4), 16), b: parseInt(m.slice(4, 6), 16) };
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(x => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('').toUpperCase();
}

function clampByte(v) { return Math.max(0, Math.min(255, Math.round(v))); }

function getPixel(rgba, width, height, x, y) {
  if (x < 0 || y < 0 || x >= width || y >= height) return null;
  const idx = (y * width + x) * 4;
  const a = rgba[idx + 3];
  if (!a) return null;
  return { r: rgba[idx], g: rgba[idx + 1], b: rgba[idx + 2], a, idx };
}

function setPixel(rgba, idx, r, g, b, a = 255) {
  rgba[idx] = clampByte(r);
  rgba[idx + 1] = clampByte(g);
  rgba[idx + 2] = clampByte(b);
  rgba[idx + 3] = clampByte(a);
}

// Uses the new geometry kernel to generate a crisp outline mask
function applyGeometryDepthAndPolish(rgba, width, height, coordinates) {
  let minX = width, maxX = 0, minY = height, maxY = 0;
  coordinates.forEach(c => {
    minX = Math.min(minX, c.x);
    maxX = Math.max(maxX, c.x);
    minY = Math.min(minY, c.y);
    maxY = Math.max(maxY, c.y);
  });
  
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const maxDist = Math.max(maxX - minX, maxY - minY) / 2;

  // Utilize the new Geometry Kernel to mathematically identify exact border cells!
  const shapeSet = createCellSet(coordinates);
  const borders = createCellSet(getBorderCells(shapeSet));
  const interiors = createCellSet(getInteriorCells(shapeSet));
  
  const orig = Buffer.from(rgba);
  const lightDirX = -0.707;
  const lightDirY = -0.707;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const px = getPixel(orig, width, height, x, y);
      if (!px) continue;

      let { r, g, b } = px;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const distNorm = dist / maxDist;

      const nx = dx / (dist || 1);
      const ny = dy / (dist || 1);
      const dot = nx * lightDirX + ny * lightDirY; 

      if (distNorm < 0.45) {
        const concaveDot = -dot;
        const coreDepth = 1.0 - (distNorm / 0.45); 
        
        r = r * (0.6 - coreDepth * 0.4) + (concaveDot > 0 ? concaveDot * 40 : 0);
        g = g * (0.6 - coreDepth * 0.4) + (concaveDot > 0 ? concaveDot * 30 : 0);
        b = b * (0.8 - coreDepth * 0.2) + (concaveDot > 0 ? concaveDot * 60 : 0); 

        if (Math.random() < (coreDepth * 0.15)) {
          r = 180 + Math.random() * 50;
          g = 160 + Math.random() * 40;
          b = 255;
        }
      } else {
        const specular = Math.pow(Math.max(0, dot), 3);
        const diffuse = dot * 0.5 + 0.5;
        
        r = r * (0.6 + diffuse * 0.5) + specular * 110;
        g = g * (0.6 + diffuse * 0.5) + specular * 110;
        b = b * (0.6 + diffuse * 0.5) + specular * 140;
        
        // NEW GEOMETRY FEATURE: Math-perfect outline darkening instead of 3x3 loop guessing!
        const key = `${x},${y}`;
        if (borders.has(key)) {
          r *= 0.4; g *= 0.4; b *= 0.6; // Deep, crisp void ice border
        } else if (interiors.has(key) && distNorm > 0.45) {
          // Internal ice volume boost
          r = Math.min(255, r + 20);
          g = Math.min(255, g + 20);
          b = Math.min(255, b + 40);
        }
      }
      
      setPixel(rgba, px.idx, r, g, b, 255);
    }
  }
}

async function main() {
  const buffer = readFileSync(INPUT);
  const decoded = decodeAsepriteBinary(buffer);
  
  const flowerLayer = decoded.frames[0].layers[1];
  
  if (!flowerLayer || !flowerLayer.cells || flowerLayer.cells.length === 0) {
    console.error('Flower layer not found or empty.');
    process.exit(1);
  }

  // Morph ONLY the flower layer
  const target = interpretInstruction('void ice sunflower');
  const morphed = morphCoordinatesToward(flowerLayer.cells, target, 1.0);

  const width = decoded.width || 80;
  const height = decoded.height || 80;
  const rgba = Buffer.alloc(width * height * 4);
  
  for (const c of morphed) {
    const x = Math.round(c.x);
    const y = Math.round(c.y);
    if (x < 0 || x >= width || y < 0 || y >= height) continue;
    const rgb = hexToRgb(c.color);
    if (!rgb) continue;
    const idx = (y * width + x) * 4;
    rgba[idx] = rgb.r;
    rgba[idx+1] = rgb.g;
    rgba[idx+2] = rgb.b;
    rgba[idx+3] = 255;
  }

  // Apply Enhancements ONLY to the flower utilizing the new geometry kernel
  applyGeometryDepthAndPolish(rgba, width, height, morphed);

  // Read back into coords for export
  const newCoords = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      if (rgba[idx+3] > 0) {
        newCoords.push({
          x, y,
          color: rgbToHex(rgba[idx], rgba[idx+1], rgba[idx+2])
        });
      }
    }
  }

  // Save PNG
  await sharp(rgba, { raw: { width, height, channels: 4 } }).png().toFile(OUT_PNG);
  console.log(`Exported Void-Ice-Reprise PNG to ${OUT_PNG}`);

  // Re-export Aseprite
  const polishedFoundry = {
    assetPacket: {
      canvas: { width, height },
      coordinates: newCoords, 
      palettes: []
    }
  };
  const asepriteBinary = exportFoundryToAsepriteBinary(polishedFoundry);
  writeFileSync(OUT_ASE, Buffer.from(asepriteBinary));
  console.log(`Exported Void-Ice-Reprise Aseprite to ${OUT_ASE}`);
}

main().catch(console.error);
