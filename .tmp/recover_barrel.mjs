import { createCanvas, loadImage } from 'canvas';
import { writeFileSync } from 'node:fs';

async function main() {
  const inputPath = '/home/deck/Downloads/Scholomance-V12-main/docs/references/BARREL2.png';
  const outputPath = '/home/deck/Downloads/Scholomance-V12-main/docs/references/BARREL_SYMMETRIC.png';

  const image = await loadImage(inputPath);
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);

  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;

  // We will do a simple vertical mirror: left side mirrors to right side.
  // Assuming the left side is the "good" side.
  const midX = Math.floor(canvas.width / 2);
  
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < midX; x++) {
      const leftIndex = (y * canvas.width + x) * 4;
      const rightX = canvas.width - 1 - x;
      const rightIndex = (y * canvas.width + rightX) * 4;
      
      // Copy left pixel to right pixel
      data[rightIndex] = data[leftIndex];
      data[rightIndex + 1] = data[leftIndex + 1];
      data[rightIndex + 2] = data[leftIndex + 2];
      data[rightIndex + 3] = data[leftIndex + 3];
    }
  }

  ctx.putImageData(imgData, 0, 0);
  
  const buffer = canvas.toBuffer('image/png');
  writeFileSync(outputPath, buffer);
  console.log(`Saved symmetric barrel to ${outputPath}`);
}

main().catch(console.error);
