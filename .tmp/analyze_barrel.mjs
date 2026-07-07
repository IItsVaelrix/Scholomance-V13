import { createCanvas, loadImage } from 'canvas';

async function main() {
  const inputPath = '/home/deck/Downloads/Scholomance-V12-main/docs/references/BARREL_SYMMETRIC.png';
  const image = await loadImage(inputPath);
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);

  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;

  const colors = new Set();
  const colorCounts = {};

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    if (a > 0) {
      const hex = `#${[r, g, b].map(x => x.toString(16).padStart(2, '0')).join('')}`;
      colors.add(hex);
      colorCounts[hex] = (colorCounts[hex] || 0) + 1;
    }
  }

  console.log(`Image size: ${image.width}x${image.height}`);
  console.log(`Unique colors (${colors.size}):`);
  
  // Sort colors by frequency
  const sortedColors = Array.from(colors).sort((a, b) => colorCounts[b] - colorCounts[a]);
  for (const hex of sortedColors) {
    console.log(`${hex}: ${colorCounts[hex]} pixels`);
  }
}

main().catch(console.error);
