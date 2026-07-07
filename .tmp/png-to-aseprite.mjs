import { createCanvas, loadImage } from 'canvas';
import { writeFileSync } from 'node:fs';
import { exportFoundryToAsepriteBinary } from '../codex/core/pixelbrain/foundry-aseprite-bridge.js';

async function main() {
  const inputPath = '/home/deck/Downloads/Scholomance-V12-main/docs/references/BARREL2.png';
  const outputPath = '/home/deck/Downloads/Scholomance-V12-main/docs/references/BARREL.aseprite';
  
  const image = await loadImage(inputPath);
  const scale = 8;
  const width = Math.floor(image.width / scale);
  const height = Math.floor(image.height / scale);
  
  const downCanvas = createCanvas(width, height);
  const downCtx = downCanvas.getContext('2d');
  downCtx.imageSmoothingEnabled = false;
  downCtx.drawImage(image, 0, 0, width, height);
  
  const imgData = downCtx.getImageData(0, 0, width, height);
  const data = imgData.data;

  const coordinates = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx+1];
      const b = data[idx+2];
      const a = data[idx+3];
      
      if (a > 0) {
        const hex = `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`;
        coordinates.push({
          x, y,
          color: hex,
          emphasis: 1,
          partId: 'barrel'
        });
      }
    }
  }

  const foundryBundle = {
    canvas: { width, height, cellSize: 1 },
    coordinates
  };
  
  const asepriteBinary = exportFoundryToAsepriteBinary(foundryBundle, { layerBy: 'single', layerName: 'Layer 1' });
  writeFileSync(outputPath, Buffer.from(asepriteBinary));
  console.log(`Recreated ${outputPath} natively as an 80x45 pixel art file from BARREL2.png`);
}

main().catch(console.error);
