import { GraphicForgeMicroprocessor } from '../graphic-forge.microprocessor.js';
import fs from 'fs';
import path from 'path';

export class SCDLExporterMicroprocessor extends GraphicForgeMicroprocessor {
  constructor() {
    super({ id: 'gf.micro.scdl.exporter', version: '1.0.0' });
  }

  run({ intent, input, context }) {
    const { width, height, pixels } = input;
    const { scdlOutputPath, assetName = 'ai_void_tile' } = intent;

    if (!scdlOutputPath) {
      throw new Error("SCDLExporterMicroprocessor: Missing scdlOutputPath in intent.");
    }

    const palette = [
      { name: 'void_pitch', color: [2, 2, 5] },
      { name: 'void_deep', color: [10, 10, 20] },
      { name: 'void_crust', color: [22, 22, 38] },
      { name: 'void_edge', color: [42, 42, 64] },
      { name: 'sickly_green_dark', color: [13, 31, 16] },
      { name: 'sickly_green_mid', color: [26, 56, 29] },
      { name: 'corrupt_cyan_deep', color: [6, 59, 69] },
      { name: 'corrupt_cyan_mid', color: [10, 118, 138] },
      { name: 'corrupt_cyan_bright', color: [27, 212, 245] },
      { name: 'neon_magenta_deep', color: [74, 0, 74] },
      { name: 'neon_magenta_mid', color: [168, 0, 168] },
      { name: 'neon_magenta_bright', color: [255, 0, 255] },
      { name: 'decay_gold_deep', color: [69, 50, 5] },
      { name: 'decay_gold_mid', color: [138, 101, 10] },
      { name: 'decay_gold_bright', color: [255, 213, 0] },
      { name: 'shadow_purple', color: [24, 5, 36] }
    ];

    const colorDistance = (c1, c2) => {
      const dr = c1[0] - c2[0];
      const dg = c1[1] - c2[1];
      const db = c1[2] - c2[2];
      return Math.sqrt(dr*dr + dg*dg + db*db);
    };

    const snapToPalette = (r, g, b) => {
      let closest = palette[0];
      let minDiff = Infinity;
      for (const p of palette) {
        const d = colorDistance([r, g, b], p.color);
        if (d < minDiff) {
          minDiff = d;
          closest = p;
        }
      }
      return closest.name;
    };

    let scdl = `asset ${assetName} canvas ${width}x${height}\n\n`;

    scdl += `palette {\n`;
    scdl += `  void_pitch = #020205\n`;
    scdl += `  void_deep = #0a0a14\n`;
    scdl += `  void_crust = #161626\n`;
    scdl += `  void_edge = #2a2a40\n`;
    scdl += `  sickly_green_dark = #0d1f10\n`;
    scdl += `  sickly_green_mid = #1a381d\n`;
    scdl += `  corrupt_cyan_deep = #063b45\n`;
    scdl += `  corrupt_cyan_mid = #0a768a\n`;
    scdl += `  corrupt_cyan_bright = #1bd4f5\n`;
    scdl += `  neon_magenta_deep = #4a004a\n`;
    scdl += `  neon_magenta_mid = #a800a8\n`;
    scdl += `  neon_magenta_bright = #ff00ff\n`;
    scdl += `  decay_gold_deep = #453205\n`;
    scdl += `  decay_gold_mid = #8a650a\n`;
    scdl += `  decay_gold_bright = #ffd500\n`;
    scdl += `  shadow_purple = #180524\n`;
    scdl += `}\n\n`;

    scdl += `part tile_base material black_steel {\n`;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const r = pixels[idx];
        const g = pixels[idx + 1];
        const b = pixels[idx + 2];
        
        const matName = snapToPalette(r, g, b);
        
        if (matName !== 'void_pitch') {
          scdl += `  cell ${x} ${y} ${matName}\n`;
        }
      }
    }

    scdl += `}\n\n`;
    scdl += `export json png aseprite\n`;

    fs.writeFileSync(scdlOutputPath, scdl);

    return {
      ...input,
      scdlOutputPath
    };
  }
}
