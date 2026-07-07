import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--ignore-gpu-blocklist','--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.addInitScript(() => {
  window.__inc = [];
  window.addEventListener('incantation-state', (e) => { window.__inc.push(e.detail); });
});
await page.goto('http://localhost:5173/combat', { waitUntil: 'load', timeout: 60000 });
const panel = page.locator('div').filter({ hasText: /MP\s*\d+\/\d+/ }).first();
await panel.waitFor({ timeout: 45000 });

const ta = page.locator('textarea').first();
console.log('textarea count:', await page.locator('textarea').count());
console.log('events before fill:', JSON.stringify(await page.evaluate(() => window.__inc)));
await ta.fill('The searing flames incinerate my foes');
await page.waitForTimeout(300);
console.log('textarea value after fill:', await ta.inputValue());
console.log('events after fill:', JSON.stringify(await page.evaluate(() => window.__inc)));
await browser.close();
