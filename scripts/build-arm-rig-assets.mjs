// Derives the armless body + 6 arm-segment SCDL files from IdealHuman.scdl and
// compiles each to PNG via the SCDL CLI. Run: npm run assets:armrig
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { splitArms } from '../src/game/combat/scdlArmSplitter.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'generated-assets', 'IdealHuman');
const cli = join(root, 'codex', 'core', 'pixelbrain', 'scdl', 'scdl.cli.js');

const src = readFileSync(join(dir, 'IdealHuman.scdl'), 'utf8');
const { bodyNoArms, segments } = splitArms(src);

const files = { 'IdealHuman-body-noArms.scdl': bodyNoArms };
for (const [name, text] of Object.entries(segments)) files[`${name}.scdl`] = text;

for (const [fname, text] of Object.entries(files)) {
  const path = join(dir, fname);
  writeFileSync(path, text);
  console.log('[armrig] wrote', fname);
  execFileSync('node', [cli, 'compile', path, '--export', 'png', '--out-dir', dir], { stdio: 'inherit' });
}
console.log('[armrig] done');
