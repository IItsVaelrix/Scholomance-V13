import { createCanvas, loadImage } from 'canvas';
import { writeFileSync } from 'node:fs';

async function main() {
  const inputPath = '/home/deck/Downloads/Scholomance-V12-main/docs/references/BARREL_SYMMETRIC.png';
  const outputPath = '/home/deck/Downloads/Scholomance-V12-main/docs/references/BARREL_REFINED.png';
  
  const image = await loadImage(inputPath);
  const scale = 8;
  const width = Math.floor(image.width / scale);
  const height = Math.floor(image.height / scale);
  
  const downCanvas = createCanvas(width, height);
  const downCtx = downCanvas.getContext('2d');
  // Disable smoothing for pixel art
  downCtx.imageSmoothingEnabled = false;
  downCtx.drawImage(image, 0, 0, width, height);
  
  const imgData = downCtx.getImageData(0, 0, width, height);
  const data = imgData.data;

  // Convert to 2D grid for easier manipulation
  let grid = Array.from({ length: height }, () => Array(width).fill(null));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      grid[y][x] = {
        r: data[idx],
        g: data[idx+1],
        b: data[idx+2],
        a: data[idx+3]
      };
    }
  }

  const isColor = (c, r, g, b) => c && c.a > 0 && Math.abs(c.r - r) < 15 && Math.abs(c.g - g) < 15 && Math.abs(c.b - b) < 15;
  const isHoop = (c) => isColor(c, 105, 106, 106); // #696a6a

  // 1. Hoops: Highlights and Shadows
  // Top edge gets highlight #9f9ea1, bottom edge gets shadow #000000
  const HOOP_HL = { r: 159, g: 158, b: 161, a: 255 };
  const HOOP_SH = { r: 0, g: 0, b: 0, a: 255 };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (isHoop(grid[y][x])) {
        if (y > 0 && !isHoop(grid[y-1][x]) && grid[y-1][x].a > 0) {
          grid[y][x] = { ...HOOP_HL };
        } else if (y < height - 1 && !isHoop(grid[y+1][x]) && grid[y+1][x].a > 0) {
          grid[y][x] = { ...HOOP_SH };
        }
      }
    }
  }

  // 2. Shape & Bulge
  // Find barrel bounds
  let minY = height, maxY = 0, minX = width, maxX = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (grid[y][x].a > 0) {
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
  }
  
  const midY = (minY + maxY) / 2;
  const barrelH = maxY - minY;
  const midX = (minX + maxX) / 2;
  
  let newGrid = Array.from({ length: height }, () => Array(width).fill({r:0,g:0,b:0,a:0}));
  for (let y = 0; y < height; y++) {
    const distY = Math.abs(y - midY) / (barrelH / 2);
    let shift = 0;
    if (distY < 0.25) shift = 2;
    else if (distY < 0.55) shift = 1;
    
    if (shift > 0 && y >= minY && y <= maxY) {
      // Stretch row outwards
      for (let x = 0; x < width; x++) {
        if (grid[y][x].a > 0) {
          const distX = x - midX;
          // Apply outward shift proportionally
          const shiftAmount = Math.sign(distX) * Math.round((Math.abs(distX) / (maxX - midX)) * shift);
          let newX = x + shiftAmount;
          if (newX >= 0 && newX < width) {
            newGrid[y][newX] = grid[y][x];
            // Fill gaps caused by stretching
            if (Math.abs(shiftAmount) > 0 && (newX - Math.sign(shiftAmount)) >= 0 && (newX - Math.sign(shiftAmount)) < width) {
                if (newGrid[y][newX - Math.sign(shiftAmount)].a === 0) {
                    newGrid[y][newX - Math.sign(shiftAmount)] = grid[y][x];
                }
            }
          }
        }
      }
    } else {
      // No shift
      for (let x = 0; x < width; x++) {
        newGrid[y][x] = grid[y][x];
      }
    }
  }
  
  // 3. Write back and upscale
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      data[idx] = newGrid[y][x].r;
      data[idx+1] = newGrid[y][x].g;
      data[idx+2] = newGrid[y][x].b;
      data[idx+3] = newGrid[y][x].a;
    }
  }
  downCtx.putImageData(imgData, 0, 0);

  const upCanvas = createCanvas(image.width, image.height);
  const upCtx = upCanvas.getContext('2d');
  upCtx.imageSmoothingEnabled = false;
  upCtx.drawImage(downCanvas, 0, 0, image.width, image.height);
  
  writeFileSync(outputPath, upCanvas.toBuffer('image/png'));
  console.log(`Saved refined barrel to ${outputPath}`);
}

main().catch(console.error);
