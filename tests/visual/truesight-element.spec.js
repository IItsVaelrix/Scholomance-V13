import { test, expect } from '@playwright/test';

/**
 * Element stacking probe — uses the same immune harness as other TrueSight
 * visual specs (Playwright webServer on PW_VISUAL_PORT, default 4173).
 */
test('inspect element stacking', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/__immune/truesight?mode=read&content=short&width=820', { waitUntil: 'load' });
  await page.waitForSelector('.word-background-layer', { state: 'attached', timeout: 15000 });
  await page.waitForSelector('body[data-immune-ready="true"]', { timeout: 15000 });
  await page.waitForSelector('.truesight-word-shell', { state: 'attached', timeout: 15000 });
  await page.evaluate(() => document.fonts.ready);

  const results = await page.evaluate(() => {
    const shells = Array.from(document.querySelectorAll('.truesight-word-shell')).slice(0, 5);
    return shells.map((shell) => {
      const rect = shell.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const elementsFromPoint = document.elementsFromPoint(centerX, centerY);

      return {
        text: shell.getAttribute('aria-label') || shell.innerText || 'no-text',
        left: rect.left,
        width: rect.width,
        top: rect.top,
        height: rect.height,
        hitElements: elementsFromPoint.map((e) => e.className || e.tagName),
        shellInHitStack: elementsFromPoint.includes(shell),
      };
    });
  });

  console.log('BROWSER_RESULTS:', JSON.stringify(results, null, 2));

  expect(results.length, 'expected TrueSight word shells in the immune harness').toBeGreaterThan(0);
  for (const r of results) {
    expect(r.width, `"${r.text}" shell has zero width`).toBeGreaterThan(0);
    expect(r.height, `"${r.text}" shell has zero height`).toBeGreaterThan(0);
    expect(r.shellInHitStack, `"${r.text}" shell missing from elementsFromPoint stack`).toBe(true);
  }
});
