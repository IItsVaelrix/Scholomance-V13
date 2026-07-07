import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const files = process.argv.slice(2);
const OUT = '/tmp/claude-1000/-home-deck-Downloads-Scholomance-V12-main/90eb51aa-ed2e-4955-abf8-402825447b36/scratchpad';
const imgs = files.map(f => {
  const b64 = readFileSync(f).toString('base64');
  return `<img src="data:image/png;base64,${b64}" style="width:256px;height:auto;image-rendering:pixelated;background:#0b0a12;margin:4px">`;
});
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 256 * Math.min(files.length,4) + 40, height: 340 } });
await page.setContent(`<body style="margin:0;background:#0b0a12;display:flex;flex-wrap:wrap">${imgs.join('')}</body>`);
await page.waitForTimeout(150);
await page.screenshot({ path: `${OUT}/view.png` });
await browser.close();
console.log('viewed', files.length);
