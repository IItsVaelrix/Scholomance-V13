import fs from 'node:fs';
import path from 'node:path';

function generateSCDL() {
  const basePath = path.resolve('codex/core/pixelbrain/imports/gemini_white_asset/gene_base_001.json');
  const baseGene = JSON.parse(fs.readFileSync(basePath, 'utf8'));

  let scdl = `asset gemini_white_asset canvas 88x48\n\n`;
  
  const palette = new Map();
  let colorCounter = 1;
  
  function getPaletteName(hex) {
    if (!palette.has(hex)) {
      palette.set(hex, `color_${colorCounter++}`);
    }
    return palette.get(hex);
  }

  baseGene.coordinates.forEach(c => getPaletteName(c.color));

  scdl += `palette {\n`;
  for (const [hex, name] of palette.entries()) {
    scdl += `  ${name} = ${hex}\n`;
  }
  scdl += `}\n\n`;

  scdl += `part tile_surface material obsidian {\n`;
  baseGene.coordinates.forEach(c => {
    scdl += `  cell ${c.x} ${c.y} ${getPaletteName(c.color)}\n`;
  });
  scdl += `}\n\n`;

  scdl += `export png\n`;

  const outPath = path.resolve('docs/references/gemini_white_asset_crisp.scdl');
  fs.writeFileSync(outPath, scdl, 'utf8');
  console.log(`Generated crispy SCDL at ${outPath}`);
}

generateSCDL();
