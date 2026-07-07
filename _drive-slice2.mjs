import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--ignore-gpu-blocklist','--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.addInitScript(() => { window.__forceEnchant = 1; }); // deterministic enchant success
page.on('pageerror', (e) => console.log('[PAGEERROR]', e.message));
await page.goto('http://localhost:5173/combat', { waitUntil: 'load', timeout: 60000 });
const panel = page.locator('div').filter({ hasText: /MP\s*\d+\/\d+/ }).first();
await panel.waitFor({ timeout: 45000 });
const hud = async () => (await panel.innerText()).replace(/\s+/g, ' ').split(' Attack')[0].trim();
const canvas = page.locator('canvas').first();
const move = async (k) => { await canvas.click({ position: { x: 60, y: 60 } }).catch(()=>{}); await page.keyboard.press(k); await page.waitForTimeout(650); };
const out = [];

out.push('INITIAL => ' + await hud());
// Write a fire incantation into the verse box.
await page.locator('textarea').first().fill('The searing flames of judgment incinerate my enemies where they stand');
await page.waitForTimeout(200);
// Move adjacent to dummy (player 4,6 -> 4,5).
await move('ArrowRight');
out.push('AFTER 1 MOVE => ' + await hud());
// Attack (forced enchant success -> fire + burn).
await page.getByRole('button', { name: /Attack/ }).click();
await page.waitForTimeout(700);
out.push('AFTER FIRE ATTACK (dummy ~90, burn active) => ' + await hud());
// End turn: burn ticks 3 each.
await page.getByRole('button', { name: /End Turn/ }).click();
await page.waitForTimeout(500);
out.push('AFTER END TURN 1 (burn tick) => ' + await hud());
await page.getByRole('button', { name: /End Turn/ }).click();
await page.waitForTimeout(500);
out.push('AFTER END TURN 2 (burn tick) => ' + await hud());
await page.getByRole('button', { name: /End Turn/ }).click();
await page.waitForTimeout(500);
out.push('AFTER END TURN 3 (burn tick, last) => ' + await hud());
await page.getByRole('button', { name: /End Turn/ }).click();
await page.waitForTimeout(500);
out.push('AFTER END TURN 4 (burn expired, no change) => ' + await hud());
await page.screenshot({ path: './_slice2-verify.png' });
await browser.close();
console.log(out.join('\n'));
