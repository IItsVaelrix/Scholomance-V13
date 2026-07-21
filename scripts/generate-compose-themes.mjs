#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateThemeCSS } from '../src/core/compose/tokens/theme-css.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outPath = path.join(ROOT, 'src/lib/css/generated/compose-themes.css');

const dark = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'tokens/compose/themes/dark.json'), 'utf8'),
);
const light = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'tokens/compose/themes/light.json'), 'utf8'),
);

const css = generateThemeCSS(dark, light);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, css, 'utf8');
console.log(`Wrote ${outPath}`);
