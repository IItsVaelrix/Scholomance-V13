import { createCanvas, loadImage } from 'canvas';
import { writeFileSync } from 'node:fs';

// Helper to calculate distance from center [-1.0 to 1.0]
function getCylindricalFactor(x, minX, maxX) {
  const midX = (minX + maxX) / 2;
  const radius = (maxX - minX) / 2;
  return (x - midX) / radius; // -1 at far left, 1 at far right
}

async function main() {
  const inputPath = '/home/deck/Downloads/Scholomance-V12-main/docs/references/BARREL_REFINED.png';
  const outputPath = '/home/deck/Downloads/Scholomance-V12-main/docs/references/BARREL_POLISHED_03.png';
  
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

  // 2D grid
  let grid = Array.from({ length: height }, () => Array(width).fill(null));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      grid[y][x] = { r: data[idx], g: data[idx+1], b: data[idx+2], a: data[idx+3] };
    }
  }

  const isColor = (c, r, g, b) => c && c.a > 0 && Math.abs(c.r - r) < 15 && Math.abs(c.g - g) < 15 && Math.abs(c.b - b) < 15;
  const isHoop = (c) => isColor(c, 105, 106, 106) || isColor(c, 159, 158, 161) || (c && c.a > 0 && c.r === c.g && c.g === c.b && c.r < 170); // Grays
  
  // Known wood colors
  const WOOD_DARKEST = { r: 58, g: 32, b: 13, a: 255 };  // #3a200d
  const WOOD_DARK = { r: 94, g: 51, b: 19, a: 255 };     // #5e3313
  const WOOD_MID = { r: 152, g: 85, b: 33, a: 255 };     // #985521
  const WOOD_LIGHT = { r: 206, g: 132, b: 62, a: 255 };  // #ce843e
  
  const isWood = (c) => c && c.a > 0 && !isHoop(c) && c.r > c.g && c.g > c.b; // brownish
  
  // Find barrel bounds
  let minX = width, maxX = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (grid[y][x].a > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
  }

  // Pass 1: Shading
  for (let y = 0; y < height; y++) {
    let rowMinX = width, rowMaxX = 0;
    for (let x = 0; x < width; x++) {
      if (grid[y][x].a > 0) {
        if (x < rowMinX) rowMinX = x;
        if (x > rowMaxX) rowMaxX = x;
      }
    }
    
    for (let x = 0; x < width; x++) {
      const c = grid[y][x];
      if (c.a === 0) continue;
      
      const factor = getCylindricalFactor(x, rowMinX, rowMaxX); // -1 (left) to 1 (right)
      
      if (isWood(c)) {
        // Cylindrical shading for wood
        if (factor > 0.5) {
          // Far right: Darkest
          grid[y][x] = { ...WOOD_DARKEST };
        } else if (factor > 0.1) {
          // Mid right: Dark
          grid[y][x] = { ...WOOD_DARK };
        } else if (factor > -0.3) {
          // Center-ish: Mid
          grid[y][x] = { ...WOOD_MID };
        } else if (factor > -0.7) {
          // Mid left: Light highlight
          grid[y][x] = { ...WOOD_LIGHT };
        } else {
          // Far left: Mid or Dark (rim light/edge)
          grid[y][x] = { ...WOOD_MID };
        }
      } else if (isHoop(c)) {
        // Cylindrical shading / color shift for metal
        // Cooler gray on the sides
        if (Math.abs(factor) > 0.6) {
           // Blend with a slight cool blue
           c.b = Math.min(255, c.b + 15);
           c.r = Math.max(0, c.r - 10);
        }
        
        // Ensure 1px bright highlight on top edge of hoops
        if (y > 0 && !isHoop(grid[y-1][x]) && grid[y-1][x].a > 0) {
          grid[y][x] = { r: 180, g: 180, b: 190, a: 255 }; // Bright cool highlight
        } 
        // Shadow on bottom edge
        else if (y < height - 1 && !isHoop(grid[y+1][x]) && grid[y+1][x].a > 0) {
          grid[y][x] = { r: 20, g: 20, b: 25, a: 255 }; // Dark shadow
        }
      }
    }
  }

  // 4. Curve cleanup / anti-aliasing (Very basic edge cleanup)
  // We won't do too much to avoid destroying the shape, but we can smooth the top/bottom caps.
  
  // Write back
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      data[idx] = grid[y][x].r;
      data[idx+1] = grid[y][x].g;
      data[idx+2] = grid[y][x].b;
      data[idx+3] = grid[y][x].a;
    }
  }
  downCtx.putImageData(imgData, 0, 0);

  const upCanvas = createCanvas(image.width, image.height);
  const upCtx = upCanvas.getContext('2d');
  upCtx.imageSmoothingEnabled = false;
  upCtx.drawImage(downCanvas, 0, 0, image.width, image.height);
  
  writeFileSync(outputPath, upCanvas.toBuffer('image/png'));
  console.log(`Saved polished barrel to ${outputPath}`);
}

main().catch(console.error);
