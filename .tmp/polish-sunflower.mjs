import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { importAsepriteBinaryToFoundryAsset, exportFoundryToAsepriteBinary } from '../codex/core/pixelbrain/foundry-aseprite-bridge.js';
import { interpretInstruction, morphCoordinatesToward } from '../codex/core/pixelbrain/nlp-morph-engine.js';

const INPUT = '/home/deck/Downloads/sunflower5.aseprite';
const OUT_ASE = '/home/deck/Downloads/Scholomance-V12-main/docs/references/VoidIceSunflower.aseprite';
const OUT_PNG = '/home/deck/Downloads/Scholomance-V12-main/docs/references/VoidIceSunflower.png';

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

function applyDepthAndPolish(rgba, width, height) {
  let minX = width, maxX = 0, minY = height, maxY = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (getPixel(rgba, width, height, x, y)) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
  }
  
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const maxDist = Math.max(maxX - minX, maxY - minY) / 2;

  // Clone rgba for reading while writing
  const orig = Buffer.from(rgba);

  // Lighting Direction (Top-Left)
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

      let neighborCount = 0;
      for (let ny2 = -1; ny2 <= 1; ny2++) {
        for (let nx2 = -1; nx2 <= 1; nx2++) {
          if (getPixel(orig, width, height, x + nx2, y + ny2)) neighborCount++;
        }
      }

      if (distNorm < 0.45) {
        // CORE: Darker, deeper void (concave)
        const concaveDot = -dot;
        const coreDepth = 1.0 - (distNorm / 0.45); 
        
        r = r * (0.6 - coreDepth * 0.4) + (concaveDot > 0 ? concaveDot * 40 : 0);
        g = g * (0.6 - coreDepth * 0.4) + (concaveDot > 0 ? concaveDot * 30 : 0);
        b = b * (0.8 - coreDepth * 0.2) + (concaveDot > 0 ? concaveDot * 60 : 0); 

        // Void Sparkles
        if (Math.random() < (coreDepth * 0.15)) {
          r = 180 + Math.random() * 50;
          g = 160 + Math.random() * 40;
          b = 255;
        }
      } else {
        // PETALS: Crystalline / Ice structure (convex)
        const specular = Math.pow(Math.max(0, dot), 3);
        const diffuse = dot * 0.5 + 0.5;
        
        r = r * (0.6 + diffuse * 0.5) + specular * 110;
        g = g * (0.6 + diffuse * 0.5) + specular * 110;
        b = b * (0.6 + diffuse * 0.5) + specular * 140;

        if (neighborCount < 8) {
          r *= 0.6; g *= 0.6; b *= 0.7; // Outline shadowing
        }
      }
      
      setPixel(rgba, px.idx, r, g, b, 255);
    }
  }
}

async function main() {
  const buffer = readFileSync(INPUT);
  const foundryAsset = importAsepriteBinaryToFoundryAsset(buffer);
  
  const allCoords = foundryAsset.assetPacket.geometry.coordinates || [];
  if (allCoords.length === 0) {
    console.error('No coordinates found in input asset.');
    process.exit(1);
  }

  // Apply NLP semantic morph to turn into "void ice sunflower" colors
  const target = interpretInstruction('void ice sunflower');
  const morphed = morphCoordinatesToward(allCoords, target, 1.0);

  const { width, height } = foundryAsset.assetPacket.canvas;

  // Convert morphed coords to RGBA buffer
  const rgba = Buffer.alloc(width * height * 4);
  for (const c of morphed) {
    const x = Math.round(c.x);
    const y = Math.round(c.y);
    if (x < 0 || x >= width || y < 0 || y >= height) continue;
    const rgb = hexToRgb(c.color);
    if (!rgb) continue;
    const idx = (y * width + x) * 4;
    // Layer compositing (last layer overrides if drawn at same coordinate)
    rgba[idx] = rgb.r;
    rgba[idx+1] = rgb.g;
    rgba[idx+2] = rgb.b;
    rgba[idx+3] = 255;
  }

  // Apply Enhancements (Depth, Shading, Polish)
  applyDepthAndPolish(rgba, width, height);

  // Read back into coords
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
  console.log(`Exported polished PNG to ${OUT_PNG}`);

  // Re-export Aseprite
  const polishedFoundry = {
    assetPacket: {
      canvas: foundryAsset.assetPacket.canvas,
      coordinates: newCoords, 
      palettes: foundryAsset.assetPacket.palettes
    }
  };
  const asepriteBinary = exportFoundryToAsepriteBinary(polishedFoundry);
  writeFileSync(OUT_ASE, Buffer.from(asepriteBinary));
  console.log(`Exported polished Aseprite to ${OUT_ASE}`);
}

main().catch(console.error);
