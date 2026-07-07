import { GraphicForgeMicroprocessor } from '../graphic-forge.microprocessor.js';
import fs from 'fs';
import jpeg from 'jpeg-js';

export class ImageReceiverMicroprocessor extends GraphicForgeMicroprocessor {
  constructor() {
    super({ id: 'gf.micro.image.receiver', version: '1.0.0' });
  }

  run({ intent, input, context }) {
    const { aiImagePath } = intent;
    if (!aiImagePath || !fs.existsSync(aiImagePath)) {
      throw new Error(`ImageReceiverMicroprocessor: Valid AI image path required. Got: ${aiImagePath}`);
    }

    const targetWidth = input.width || 64;
    const targetHeight = input.height || 64;

    // Load and decode JPEG
    const rawData = fs.readFileSync(aiImagePath);
    const img = jpeg.decode(rawData, { useTArray: true });
    
    // We will build a 'field' representation using RGB values as energy layers,
    // but for now, we will just output an RGBA pixel array directly matching the target size.
    const pixels = new Uint8ClampedArray(targetWidth * targetHeight * 4);

    // Map source image into exactly targetWidth x targetHeight
    for (let y = 0; y < targetHeight; y++) {
      for (let x = 0; x < targetWidth; x++) {
        // Map target pixel to source pixel range
        const srcX1 = (x / targetWidth) * img.width;
        const srcX2 = ((x + 1) / targetWidth) * img.width;
        const srcY1 = (y / targetHeight) * img.height;
        const srcY2 = ((y + 1) / targetHeight) * img.height;
        
        let rSum = 0, gSum = 0, bSum = 0, count = 0;
        
        // Sample all source pixels overlapping this target pixel
        for (let sy = Math.floor(srcY1); sy < Math.ceil(srcY2); sy++) {
          for (let sx = Math.floor(srcX1); sx < Math.ceil(srcX2); sx++) {
            if (sx >= 0 && sx < img.width && sy >= 0 && sy < img.height) {
              const idx = (sy * img.width + sx) * 4;
              rSum += img.data[idx];
              gSum += img.data[idx + 1];
              bSum += img.data[idx + 2];
              count++;
            }
          }
        }
        
        const r = count > 0 ? rSum / count : 0;
        const g = count > 0 ? gSum / count : 0;
        const b = count > 0 ? bSum / count : 0;
        
        const targetIdx = (y * targetWidth + x) * 4;
        pixels[targetIdx] = r;
        pixels[targetIdx + 1] = g;
        pixels[targetIdx + 2] = b;
        pixels[targetIdx + 3] = 255; // fully opaque
      }
    }

    return {
      ...input,
      pixels // Bypass the QBIT field and directly set the pixel intent from the image
    };
  }
}
