// Emits a real SCDL grass tile from grass-amp.js's form-first field: a real
// height field (soil pits are literal depressions) plus real clump stroke
// geometry (root->tip), with color as a pure lookup over the finished form.
// Regenerate via this script; never hand-edit the .scdl output.
import { writeFileSync } from 'node:fs';
import { GrassAMP } from '../../../grass-amp.js';
import { loadRelevanceRecordsSync } from '../../../amp-substrate/load-relevance-records-sync.js';
import { selectActiveAmps } from '../../../amp-substrate/amp-selector.js';

const W = 32, H = 32;

// Real activation decision, not a direct unconditional call — this IS the
// terrain pipeline's first real caller (see the seed script's honesty note
// on this record: the gate below is designed, not measured, since there was
// no pre-existing scattered `if` to transcribe).
const terrainSpec = { class: 'terrain', archetype: 'void_grove_grass' };
const records = loadRelevanceRecordsSync();
const { activated, skipped } = selectActiveAmps('terrain', terrainSpec, records);
console.log(`[terrain] spec ${JSON.stringify(terrainSpec)} -> activated: [${activated.join(', ')}]`);
for (const s of skipped) console.log(`[terrain]   skipped ${s.ampId}: ${s.reason}`);

if (!activated.includes('grass-amp')) {
  throw new Error('grass-amp did not activate for this terrain spec — check the pilot-relevance/terrain/grass-amp.json gate against terrainSpec above');
}

const { field, palette, width, height, diagnostics } = GrassAMP({
  width: W, height: H, seed: 20260905,
});

console.log(`[grass-amp] attempts=${diagnostics.attempts} counts=${JSON.stringify(diagnostics.counts)}`);

const COLOR_NAMES = ['soil', 'bed', 'raised', 'root', 'leaf', 'tip'];

const lines = [];
lines.push('# void_grove_grass_field — form-first field from grass-amp.js: a real');
lines.push('# height field (pits are literal depressions) plus real clump stroke');
lines.push('# geometry (root->tip); color is a lookup over the finished form, not a');
lines.push('# noise threshold or a hand-placed blade vector.');
lines.push('# Regenerate via generate-grass-field.mjs, never hand-edit.');
lines.push(`asset void_grove_grass_field canvas ${width}x${height}`);
lines.push('');
lines.push('palette {');
palette.forEach((hex, i) => lines.push(`  ${COLOR_NAMES[i]} = ${hex}`));
lines.push('}');
lines.push('');
lines.push('part ground material voidsoil {');
for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) {
    const v = field[y * width + x];
    lines.push(`  cell ${x} ${y} ${COLOR_NAMES[v]}`);
  }
}
lines.push('}');
lines.push('');

const out = lines.join('\n') + '\n';
const path = process.argv[2];
writeFileSync(path, out);
console.log(`wrote ${path} — ${width}x${height}, ${diagnostics.attempts} attempt(s) to converge`);
