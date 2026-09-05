// Emits the literal SWARD engine's separate blade-rank layer as SCDL cells.
// Regenerate via this script; never hand-edit the resulting .scdl output.
import { writeFileSync } from 'node:fs';
import { GrassAMP } from '../../../grass-amp.js';
import { loadRelevanceRecordsSync } from '../../../amp-substrate/load-relevance-records-sync.js';
import { selectActiveAmps } from '../../../amp-substrate/amp-selector.js';

const W = 32;
const H = 32;
const terrainSpec = { class: 'terrain', archetype: 'void_grove_grass' };
const records = loadRelevanceRecordsSync();
const { activated, skipped } = selectActiveAmps('terrain', terrainSpec, records);
console.log(`[terrain] spec ${JSON.stringify(terrainSpec)} -> activated: [${activated.join(', ')}]`);
for (const entry of skipped) console.log(`[terrain]   skipped ${entry.ampId}: ${entry.reason}`);

if (!activated.includes('grass-amp')) {
  throw new Error('grass-amp did not activate for the void_grove_grass terrain spec');
}

const { blades, palette, width, height, diagnostics } = GrassAMP({
  width: W,
  height: H,
  seed: 20260905,
});
const colorNames = ['shadow', 'bed', 'lit', 'root', 'leaf', 'tip'];
const lines = [
  '# void_grove_grass_blades — SWARD blade-rank layer; -1 is transparent.',
  '# Regenerate via generate-grass-blades.mjs, never hand-edit.',
  `asset void_grove_grass_blades canvas ${width}x${height}`,
  '',
  'palette {',
];
palette.forEach((hex, index) => lines.push(`  ${colorNames[index]} = ${hex}`));
lines.push('}', '', 'part blades material astralmoss {');
for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) {
    const rank = blades[y * width + x];
    if (rank >= 0) lines.push(`  cell ${x} ${y} ${colorNames[rank]}`);
  }
}
lines.push('}', '');

const path = process.argv[2];
if (!path) throw new Error('output path is required');
writeFileSync(path, `${lines.join('\n')}\n`);
console.log(`wrote ${path} — ${diagnostics.tuftCount} tufts / ${diagnostics.fillCount} blade cells`);
