/**
 * Compile SCDL directions, mirror the west-side facings from the east-side ones,
 * and assemble an 8-direction contact sheet. Mirroring a compiled PNG is standard
 * sprite practice (W = flip(E), NW = flip(NE), SW = flip(SE)).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const DIR = 'generated-assets/battle-poet';
const OUT = '/tmp/claude-1000/-home-deck-Downloads-Scholomance-V12-main/90eb51aa-ed2e-4955-abf8-402825447b36/scratchpad';
const CLI = 'codex/core/pixelbrain/scdl/scdl.cli.js';

// (assetFileBase, pngName) for each authored facing
const authored = process.argv.slice(2); // e.g. south north east
for (const name of authored) {
  execFileSync('node', [CLI, 'compile', `${DIR}/battle-poet-${name}.scdl`, '--export', 'png'], { stdio: 'ignore' });
}

const pngB64 = (name) => readFileSync(`${DIR}/battle-poet-${name}-png.png`).toString('base64');
// grid: NW N NE / W . E / SW S SE  — mirrors reuse east-side sources flipped
const flip = 'transform:scaleX(-1)';
const cellFor = (name, mirror = false) => name
  ? `<img src="data:image/png;base64,${pngB64(name)}" style="width:160px;height:auto;image-rendering:pixelated;${mirror ? flip : ''}">`
  : `<div style="width:160px;height:240px"></div>`;

const grid = [
  ['northeast:m', 'north', 'northeast'],
  ['east:m',      null,    'east'],
  ['southeast:m', 'south', 'southeast'],
];
const labels = ['NW','N','NE','W','·','E','SW','S','SE'];

const cells = grid.flat().map((spec, i) => {
  let inner = '<div style="width:160px;height:240px"></div>';
  if (spec) {
    const [name, m] = spec.split(':');
    try { inner = cellFor(name, m === 'm'); } catch { inner = `<div style="width:160px;height:240px;color:#555">${name}?</div>`; }
  }
  return `<div style="display:flex;flex-direction:column;align-items:center">
    <div style="color:#8a7fd6;font:12px monospace">${labels[i]}</div>${inner}</div>`;
}).join('');

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 3 * 170 + 30, height: 3 * 260 + 40 } });
await page.setContent(`<body style="margin:0;background:#0b0a12"><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;padding:12px">${cells}</div></body>`);
await page.waitForTimeout(200);
await page.screenshot({ path: `${OUT}/contact-sheet.png` });
await browser.close();
console.log('contact sheet →', `${OUT}/contact-sheet.png`);
