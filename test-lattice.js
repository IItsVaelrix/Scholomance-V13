import sharp from 'sharp';
import fs from 'fs/promises';
import { exec } from 'child_process';
import util from 'util';
import { ImageLatticeCompiler } from './codex/core/pixelbrain/image-lattice-compiler.js';

const execAsync = util.promisify(exec);

async function processImage(imagePath, name) {
  console.log(`Processing ${name}...`);
  const { data, info } = await sharp(imagePath)
    .normalize() // Maximize dynamic range to preserve contrast
    .sharpen(2.5, 1, 2) // Aggressive pre-sharpening (sigma, flat, jagged) to emphasize edges
    .modulate({ saturation: 1.2 }) // Boost color vibrancy so features survive downsampling
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const compiler = new ImageLatticeCompiler();
  const result = await compiler.compile({ data: data }, {
    width: info.width,
    height: info.height,
    targetWidth: 32,
    targetHeight: 32,
    canvasName: name,
    enableExtrapolation: true,
    quantizeSpec: { maxColors: 12 },
    segmentationSpec: { minRegionSize: 10 }
  });

  const outPath = `./docs/references/${name}.scdl`;
  await fs.writeFile(outPath, result.scdl);
  console.log(`Saved ${name} to ${outPath}`);

  const geomPath = `./docs/references/${name}-geometry.json`;
  await fs.writeFile(geomPath, JSON.stringify(result.geometry, null, 2));
  console.log(`Saved ${name} geometry to ${geomPath}`);

  // Now compile to PNG and Aseprite using the reverse-compiled translatable language
  console.log(`Compiling ${name} to PNG and Aseprite...`);
  try {
    const { stdout, stderr } = await execAsync(`node ./codex/core/pixelbrain/scdl/scdl.cli.js compile ${outPath} --export json,png,aseprite --outdir ./docs/references`);
    if (stderr) console.error(stderr);
    console.log(`Compiled ${name} successfully!\n`);
  } catch (e) {
    console.error(`Failed to compile ${name}:`, e.message);
  }
}

async function main() {
  const tiles = [
    { path: '/home/deck/Downloads/Scholomance-V12-main/docs/references/void_forest_grass_tile.jpg', name: 'void_forest_grass_tile' }
  ];

  for (const tile of tiles) {
    await processImage(tile.path, tile.name);
  }
}

main().catch(console.error);
