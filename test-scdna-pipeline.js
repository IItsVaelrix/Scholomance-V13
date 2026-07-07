import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { createSCDNAGenePacket, createSCDNAGeneReadyHealthEvent } from './codex/core/pixelbrain/scdna-gene-packet.js';
import { imageToCellGrid } from './codex/core/pixelbrain/image-to-cell-grid.js';

const TILE_WIDTH = 88;
const TILE_HEIGHT = 48;

async function testSCDNAPipeline() {
  const imagePath = '/home/deck/Downloads/Gemini_Generated_Image_4co22e4co22e4co2.png';
  const assetId = 'gemini_white_asset';

  const importDir = path.join('./codex/core/pixelbrain/imports', assetId);
  if (!fs.existsSync(importDir)) {
    fs.mkdirSync(importDir, { recursive: true });
  }

  // 1. Read the FULL 1024x1024 Image and definitively crush the palette BEFORE extraction
  const image = sharp(imagePath);
  const metadata = await image.metadata();
  
  // Quantize to 128 colors with NO dither to preserve pixel art gradients without micro-noise
  const quantizedPng = await image
    .png({ palette: true, colors: 128, dither: 0 })
    .toBuffer();

  const rawData = await sharp(quantizedPng).ensureAlpha().raw().toBuffer();
  
  const imageData = {
    data: rawData,
    width: metadata.width,
    height: metadata.height
  };

  // 2. The Golden Trick: Mode Downscaling
  const grid = imageToCellGrid(imageData, {
    width: metadata.width,
    height: metadata.height,
    targetWidth: TILE_WIDTH,
    targetHeight: TILE_HEIGHT,
    alphaThreshold: 128
  });

  const width = TILE_WIDTH;
  const height = TILE_HEIGHT;

  // 3. Keep all pixels in a single, cohesive array to prevent disjointed fragmentation
  // FILTER: Mathematically erase the solid white background key.
  const rawCells = grid.coordinates
    .filter(c => {
      const hex = c.color.toUpperCase();
      if (hex === '#FFFFFF') return false; // Pure white
      
      // Secondary safety check for near-white in case of compression artifacts
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      if (r > 250 && g > 250 && b > 250) return false;
      
      return true;
    })
    .map(c => ({
      x: c.x,
      y: c.y,
      color: c.color,
      role: 'tile_surface',
      isMotif: false
    }));

  // 4. Create single unified Gene Packet
  const tileGene = createSCDNAGenePacket({
    assetId,
    geneId: 'gene_base_001',
    geneType: 'TILE_SURFACE',
    canvas: { width, height },
    role: 'tile_surface',
    materialHint: 'obsidian',
    paletteRoles: ['base'],
    coordinates: rawCells,
    geometryHints: {
      closed: true,
      preferredPrimitive: 'rect',
      preserveAsMotif: false
    }
  });

  // 5. Save Packet and Emit Manifest Event
  const healthStreamPath = path.join(importDir, 'diagnostic_manifest.json');
  if (fs.existsSync(healthStreamPath)) { fs.unlinkSync(healthStreamPath); }
  console.log(`\n--- DIAGNOSTIC STREAM EMITTED ---`);

  fs.writeFileSync(path.join(importDir, 'gene_base_001.json'), JSON.stringify(tileGene, null, 2));
  console.log(`Saved gene packet to ./codex/core/pixelbrain/imports/gemini_white_asset/gene_base_001.json`);

  const event = createSCDNAGeneReadyHealthEvent(tileGene);
  fs.appendFileSync(healthStreamPath, JSON.stringify(event) + '\n');
  console.log(JSON.stringify(event));
}

testSCDNAPipeline().catch(console.error);
