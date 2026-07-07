#!/usr/bin/env node
/**
 * POC: Create a Chibi sprite using Wand vectorized art.
 * 
 * Uses the new forgeCharacterFromWandVector to generate vector paths
 * from Wand formulas (edge_trace for head/hair, mathematical_stroke for body/limbs).
 * Then rasterizes via the PixelBrain pipeline to produce PNG.
 * 
 * This proves Wand can drive full character models with vectorized construction.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { forgeCharacterFromWandVector } from '../codex/core/pixelbrain/character-foundry.js';
import { rasterizeCells } from '../codex/core/pixelbrain/character-foundry.js';  // re-exported? use internal if needed

const OUT_DIR = resolve('output/pixelbrain/vaelrix1');
mkdirSync(OUT_DIR, { recursive: true });

// Brand new Vaelrix1 Chibi using Wand vectorized art.
// Head: edge_trace for rounded head
// Body: mathematical_stroke for torso
// Hair: edge_trace for SOLID hairstyle (smooth cap, minimal spikes for solid look)
// Arms/Legs: strokes
// Nose: small mathematical_stroke for emphasized nose bridge/tip

const W = 48, H = 48;
const wandProposal = {
  coordinateFormula: {
    type: 'composite',
    children: [
      {
        role: 'head',
        formula: {
          type: 'edge_trace',
          tracePath: [
            { x: 14, y: 6 }, { x: 24, y: 4 }, { x: 34, y: 6 },
            { x: 36, y: 14 }, { x: 34, y: 22 }, { x: 24, y: 24 },
            { x: 14, y: 22 }, { x: 12, y: 14 }
          ]
        }
      },
      {
        role: 'body',
        formula: {
          type: 'mathematical_stroke',
          parameters: {
            cx: 24, cy: 30, length: 14, angle: 90,
            baseWidth: 10, widthVariation: 0.2, frequency: 0.3,
            density: 1.5, n: 32
          }
        }
      },
      {
        role: 'hair',
        formula: {
          type: 'edge_trace',
          tracePath: [
            { x: 24, y: 0 }, { x: 27, y: 6 }, { x: 35, y: 1 }, { x: 31, y: 8 }, { x: 40, y: 5 },
            { x: 33, y: 11 }, { x: 40, y: 14 }, { x: 34, y: 16 }, { x: 38, y: 22 }, { x: 30, y: 19 },
            { x: 33, y: 27 }, { x: 27, y: 20 }, { x: 24, y: 25 }, { x: 21, y: 20 }, { x: 15, y: 27 },
            { x: 18, y: 19 }, { x: 10, y: 22 }, { x: 14, y: 16 }, { x: 10, y: 14 }, { x: 15, y: 11 },
            { x: 10, y: 5 }, { x: 17, y: 8 }, { x: 13, y: 1 }, { x: 21, y: 6 }
          ]
        }
      },
      {
        role: 'nose',
        formula: {
          type: 'edge_trace',
          tracePath: [
            { x: 24, y: 16 }, { x: 27, y: 20 }, { x: 21, y: 20 }, { x: 24, y: 16 }
          ]
        }
      },
      {
        role: 'leftArm',
        formula: {
          type: 'edge_trace',
          tracePath: [
            { x: 15, y: 26 }, { x: 10, y: 32 }, { x: 6, y: 38 }
          ]
        }
      },
      {
        role: 'rightArm',
        formula: {
          type: 'edge_trace',
          tracePath: [
            { x: 33, y: 26 }, { x: 38, y: 32 }, { x: 42, y: 38 }
          ]
        }
      },
      {
        role: 'leftLeg',
        formula: {
          type: 'mathematical_stroke',
          parameters: {
            cx: 18, cy: 40, length: 8, angle: -15,
            baseWidth: 4, widthVariation: 0.1, frequency: 0.2, n: 16
          }
        }
      },
      {
        role: 'rightLeg',
        formula: {
          type: 'mathematical_stroke',
          parameters: {
            cx: 30, cy: 40, length: 8, angle: 15,
            baseWidth: 4, widthVariation: 0.1, frequency: 0.2, n: 16
          }
        }
      }
    ]
  }
};

const baseSpec = {
  contract: 'CHARACTER-SPEC-v1',
  id: 'vaelrix1.chibi.wand-vector.v1',
  class: 'character',
  archetype: 'chibi',
  canvas: { width: 48, height: 48, gridSize: 1 },
  materials: { skin: 'skin_light', hair: 'hair_violet' },
  presentation: { gender: 'androgynous', heightClass: 'short', buildClass: 'slender' }
};

console.log('Generating brand new Vaelrix1 Chibi sprite with Wand vectorized art...');

const model = forgeCharacterFromWandVector(wandProposal, baseSpec, { direction: 'south' });

console.log('Vector paths:', model.vectorPaths?.length);
console.log('Cells:', model.fills?.coordinates?.length || 0);
console.log('Roles:', model.vectorPaths?.map(p => p.role).join(', '));

// Rasterize the fills to PNG using sharp (like other generators)
const canvas = model.canvas || { width: 48, height: 48 };
const coords = model.fills?.coordinates || [];
const scale = 4;
const sw = canvas.width * scale;
const sh = canvas.height * scale;

const buf = Buffer.alloc(sw * sh * 4, 0); // transparent

const hexToRgb = (hex) => {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};

for (const c of coords) {
  if (!c.color) continue;
  const [r, g, b] = hexToRgb(c.color);
  const px = (c.x * scale);
  const py = (c.y * scale);
  for (let sy = 0; sy < scale; sy++) {
    for (let sx = 0; sx < scale; sx++) {
      const idx = ((py + sy) * sw + (px + sx)) * 4;
      buf[idx] = r;
      buf[idx + 1] = g;
      buf[idx + 2] = b;
      buf[idx + 3] = 255;
    }
  }
}

const pngPath = resolve(OUT_DIR, 'vaelrix1.png');
await sharp(buf, { raw: { width: sw, height: sh, channels: 4 } })
  .png()
  .toFile(pngPath);

const jsonPath = resolve(OUT_DIR, 'vaelrix1.json');
writeFileSync(jsonPath, JSON.stringify({
  vectorPaths: model.vectorPaths,
  cells: coords,
  spec: model.spec,
  diagnostics: model.diagnostics
}, null, 2));

console.log('Created:');
console.log('  PNG :', pngPath);
console.log('  JSON:', jsonPath);
console.log('Brand new Vaelrix1 Chibi sprite generated via Wand vectorized art.');