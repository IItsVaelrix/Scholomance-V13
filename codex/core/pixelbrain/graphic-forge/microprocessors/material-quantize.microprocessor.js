import { GraphicForgeMicroprocessor } from '../graphic-forge.microprocessor.js';

export class MaterialQuantizeMicroprocessor extends GraphicForgeMicroprocessor {
  constructor() {
    super({ id: 'gf.micro.material.quantize', version: '1.0.0' });
  }

  run({ intent, input, context }) {
    const { width, height, field } = input;
    
    const pixels = new Uint8ClampedArray(width * height * 4);
    
    // 4x4 Bayer matrix for ordered dithering
    const bayer4x4 = [
      [ 0,  8,  2, 10],
      [12,  4, 14,  6],
      [ 3, 11,  1,  9],
      [15,  7, 13,  5]
    ];
    
    // Convert bayer matrix to a threshold adjustment map (-0.5 to 0.5 roughly)
    // Actually standard threshold is (value / 16) - 0.5
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const rawEnergy = field.energyAt(x, y, 0);
        
        // Ordered Dithering factor
        const bayerVal = bayer4x4[y % 4][x % 4] / 16.0;
        const ditherOffset = (bayerVal - 0.5) * 0.4; // +/- 0.2 spread
        
        const e = Math.max(0, Math.min(1, rawEnergy + ditherOffset));
        
        let r = 0, g = 0, b = 0, a = 0;
        
        // Very sharp thresholds for retro feel (no smooth blending, rely on dithering)
        if (e > 0.8) {
          // Core: Glowing Gold
          r = 255; g = 213; b = 0; a = 255;
        } else if (e > 0.6) {
          // Core transition: Magenta
          r = 255; g = 0; b = 255; a = 255;
        } else if (e > 0.4) {
          // Mid: Sickly Teal
          r = 10; g = 118; b = 138; a = 255;
        } else if (e > 0.2) {
          // Dark edge: Deep Corrupt Cyan
          r = 6; g = 59; b = 69; a = 255;
        } else if (e > 0.1) {
          // Void Crust: Dark Purple
          r = 22; g = 22; b = 38; a = 255;
        } else {
          // Pitch Black Void
          r = 2; g = 2; b = 5; a = 255;
        }
        
        // Let's add a "rim" highlight effect if the gradient is extremely steep
        const gradient = field.gradientAt(x, y, 0);
        const gradMag = Math.sqrt(gradient.gx * gradient.gx + gradient.gy * gradient.gy);
        if (gradMag > 0.15 && e > 0.1 && e < 0.6) {
           r = 27; g = 212; b = 245; // Corrupt cyan bright edge
        }

        const idx = (y * width + x) * 4;
        pixels[idx] = r;
        pixels[idx + 1] = g;
        pixels[idx + 2] = b;
        pixels[idx + 3] = a;
      }
    }
    
    return {
      ...input,
      pixels
    };
  }
}
