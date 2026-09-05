import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { generateGrass, defaultParams } from "../src/lib/grass/engine.ts";
import { PALETTES, rgbToHex } from "../src/lib/grass/palettes.ts";
import { writePng, scaleNearest } from "./dump-grass.mjs";
import type { GrassParams } from "../src/lib/grass/types.ts";

function fieldToRgba(field: ArrayLike<number>, palette: readonly (readonly [number, number, number])[], w: number, h: number) {
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i += 1) {
    const [r, g, b] = palette[field[i] ?? 0] ?? palette[0]!;
    const o = i * 4;
    rgba[o] = r;
    rgba[o + 1] = g;
    rgba[o + 2] = b;
    rgba[o + 3] = 255;
  }
  return rgba;
}

const outDir = "/workspace/artifacts/grass-preview";
mkdirSync(outDir, { recursive: true });

const seeds = [0x5a17, 0x1c0de, 0x77aa, 0x31415, 0x9f3b];
const sizes = [32] as const;

for (const pal of PALETTES) {
  for (const seed of seeds.slice(0, 2)) {
    const params: GrassParams = {
      ...defaultParams(),
      seed,
      paletteId: pal.id,
      palette: pal.colors,
      width: 32,
      height: 32,
    };
    const result = generateGrass(params);
    const rgba = fieldToRgba(result.field, pal.colors, 32, 32);
    const tile = scaleNearest(rgba, 32, 32, 12, 1, 1);
    writePng(join(outDir, `${pal.id}-${seed.toString(16)}-tile.png`), tile.width, tile.height, tile.rgba);
    const meadow = scaleNearest(rgba, 32, 32, 4, 6, 6);
    writePng(join(outDir, `${pal.id}-${seed.toString(16)}-meadow.png`), meadow.width, meadow.height, meadow.rgba);
    const quad = scaleNearest(rgba, 32, 32, 8, 2, 2);
    writePng(join(outDir, `${pal.id}-${seed.toString(16)}-quad.png`), quad.width, quad.height, quad.rgba);
    console.log(
      pal.id,
      seed.toString(16),
      "attempts",
      result.diagnostics.attempts,
      "accepted",
      result.diagnostics.accepted,
      "frac",
      Object.entries(result.diagnostics.fractions)
        .map(([k, v]) => `${k}:${(v * 100).toFixed(1)}`)
        .join(" "),
      result.diagnostics.warnings.join(";"),
    );
  }
}

console.log("wrote", outDir);
