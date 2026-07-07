import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcDir = path.join(__dirname, '../public/assets/items');

async function processIcons() {
  const files = fs.readdirSync(srcDir).filter(f => f.endsWith('-f0-png.png'));
  for (const file of files) {
    const inputPath = path.join(srcDir, file);
    const outputPath = path.join(srcDir, file.replace('-f0-png.png', '-icon.png'));
    
    await sharp(inputPath)
      .trim() // Automatically crops away transparent pixels
      .toFile(outputPath);
    console.log(`Generated icon: ${outputPath}`);
  }
}

processIcons().catch(console.error);
