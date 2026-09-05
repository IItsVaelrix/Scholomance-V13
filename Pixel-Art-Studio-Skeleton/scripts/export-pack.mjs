import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { generateGrass, defaultParams } from "../src/lib/grass/engine.ts";
import { PALETTES } from "../src/lib/grass/palettes.ts";
import { writePng, scaleNearest } from "./dump-grass.mjs";

function fieldToRgba(field, palette, w, h) {
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i += 1) {
    const [r, g, b] = palette[field[i] ?? 0];
    rgba[i * 4] = r;
    rgba[i * 4 + 1] = g;
    rgba[i * 4 + 2] = b;
    rgba[i * 4 + 3] = 255;
  }
  return rgba;
}

const outDir = "/workspace/artifacts/sward-grass-tiles";
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const seed = 0x5a17;
const offsets = [0, 19, 47, 83];

const readme = `Sward grass tiles
=================
Seed: ${seed} (0x${seed.toString(16)})
Size: 32×32, seamless (wraps on every edge)
Scale: nearest-neighbor only — never bilinear

Per palette
-----------
  {name}-32.png        native tile, drop into a game
  {name}-32-8x.png     same tile, 8× (256×256)
  {name}-field.png     8×8 repeat at 4× (proof it tiles)
  {name}-set.png       four sibling variants, 2×2 sheet at 8×

Palettes: meadow, understory, lawn, spring, marsh, prairie, dusk, worn.
Tiles are gravity + NW light — not rotation-safe.
`;

writeFileSync(join(outDir, "README.txt"), readme);

for (const pal of PALETTES) {
  const params = {
    ...defaultParams(),
    seed,
    paletteId: pal.id,
    palette: pal.colors,
    width: 32,
    height: 32,
  };
  const result = generateGrass(params);
  const rgba = fieldToRgba(result.field, pal.colors, 32, 32);
  const folder = join(outDir, pal.id);
  mkdirSync(folder, { recursive: true });

  const native = scaleNearest(rgba, 32, 32, 1, 1, 1);
  writePng(join(folder, `${pal.id}-32.png`), native.width, native.height, native.rgba);

  const x8 = scaleNearest(rgba, 32, 32, 8, 1, 1);
  writePng(join(folder, `${pal.id}-32-8x.png`), x8.width, x8.height, x8.rgba);

  const field = scaleNearest(rgba, 32, 32, 4, 8, 8);
  writePng(join(folder, `${pal.id}-field.png`), field.width, field.height, field.rgba);

  const variants = offsets.map((off) =>
    generateGrass({ ...params, seed: (seed + off) >>> 0 }),
  );
  const cell = 32 * 8;
  const sheetW = cell * 2;
  const sheetH = cell * 2;
  const sheet = new Uint8ClampedArray(sheetW * sheetH * 4);
  variants.forEach((v, i) => {
    const vr = fieldToRgba(v.field, pal.colors, 32, 32);
    const scaled = scaleNearest(vr, 32, 32, 8, 1, 1);
    const ox = (i % 2) * cell;
    const oy = Math.floor(i / 2) * cell;
    for (let y = 0; y < cell; y += 1) {
      for (let x = 0; x < cell; x += 1) {
        const si = (y * cell + x) * 4;
        const di = ((oy + y) * sheetW + (ox + x)) * 4;
        sheet[di] = scaled.rgba[si];
        sheet[di + 1] = scaled.rgba[si + 1];
        sheet[di + 2] = scaled.rgba[si + 2];
        sheet[di + 3] = 255;
      }
    }
  });
  writePng(join(folder, `${pal.id}-set.png`), sheetW, sheetH, sheet);
  console.log("packed", pal.id);
}

const zipPath = "/workspace/artifacts/sward-grass-tiles.zip";
const z = spawnSync(
  "python3",
  [
    "-c",
    `
import zipfile, os
root = ${JSON.stringify(outDir)}
zip_path = ${JSON.stringify(zipPath)}
with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
    for dirpath, _, files in os.walk(root):
        for name in files:
            full = os.path.join(dirpath, name)
            arc = os.path.relpath(full, root)
            z.write(full, arc)
print(zip_path, os.path.getsize(zip_path))
`,
  ],
  { encoding: "utf8" },
);
process.stdout.write(z.stdout || "");
process.stderr.write(z.stderr || "");
if (z.status) process.exit(z.status);
