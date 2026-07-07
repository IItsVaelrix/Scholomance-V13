import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { analyzeImageToFormula } from './codex/core/pixelbrain/image-to-bytecode-formula.js';
import { compileBytecodeToSCDL } from './codex/core/pixelbrain/bytecode-to-scdl-bridge.js';

async function testBytecodePipeline() {
  const imagePath = './docs/references/void_forest_grass_tile.jpg';
  
  if (!fs.existsSync(imagePath)) {
    console.error(`Image not found: ${imagePath}`);
    return;
  }

  console.log(`Processing ${imagePath} into Bytecode Formula...`);
  
  // 1. Read Image with sharp, heavily downscale to extract structural vectors quickly
  const image = sharp(imagePath);
  const metadata = await image.metadata();
  
  // Ensure RGBA and resize for mathematical extraction (prevent O(N^2) loop hanging)
  const rawData = await image.resize(128, 128, { kernel: 'lanczos3' }).ensureAlpha().raw().toBuffer();

  // 2. Build imageAnalysis object
  const imageAnalysis = {
    pixelData: new Uint8ClampedArray(rawData),
    dimensions: { width: 128, height: 128 },
    colors: [
      { hex: '#161018' }, { hex: '#255940' }, { hex: '#3bb37a' } // Mock colors extracted
    ],
    composition: {
      edgeDensity: 0.2,
      hasSymmetry: false
    }
  };

  // 3. Extrapolate Mathematical Bytecode Formula
  console.log('Generating pure mathematical bytecode formula...');
  const formula = analyzeImageToFormula(imageAnalysis);
  
  console.log(`Detected Formula Type: ${formula.formulaType}`);
  
  // 4. Bridge Bytecode to SCDL
  console.log('Bridging Bytecode to SCDL...');
  // Force template size to be 1024x1024 so scaling works correctly
  formula.template = { gridWidth: metadata.width, gridHeight: metadata.height };
  const scdlText = compileBytecodeToSCDL(formula, 'void_forest_grass_tile');
  
  const scdlPath = './docs/references/void_forest_grass_tile_bytecode.scdl';
  fs.writeFileSync(scdlPath, scdlText);
  
  console.log(`Saved extrapolated SCDL to ${scdlPath}`);
  
  // 5. Optionally, we could compile it with the CLI
}

testBytecodePipeline().catch(console.error);
