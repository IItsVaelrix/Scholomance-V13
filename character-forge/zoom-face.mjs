import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const OUT = '/tmp/claude-1000/-home-deck-Downloads-Scholomance-V12-main/90eb51aa-ed2e-4955-abf8-402825447b36/scratchpad';
const png = process.argv[2];
const b64 = readFileSync(png).toString('base64');
// blow the whole sprite up huge so individual face pixels are readable
const b = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 480, height: 640 } });
await p.setContent(`<body style="margin:0;background:#0b0a12"><img src="data:image/png;base64,${b64}" style="width:480px;image-rendering:pixelated"></body>`);
await p.waitForTimeout(150);
await p.screenshot({ path: `${OUT}/zoom.png` });
await b.close();
console.log('ok');
