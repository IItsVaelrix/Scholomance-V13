import { test, expect } from '@playwright/test';

// Guards the editor gutter: centered numeral + symmetric SVG diamond tick line
// markers + per-line syllable bars, wired from the Lexical editor's
// totalLines/syllablesPerLine/currentLine props.
// (The Gutter previously read a mismatched prop API and rendered nothing.)
test('gutter renders numeral + tick line markers and syllable bars', async ({ page }) => {
  await page.goto('/__immune/lexical', { waitUntil: 'load' });
  await page.waitForSelector('.editor-gutter', { timeout: 10000 });

  const nums = await page.locator('.editor-gutter .line-number').allInnerTexts();
  expect(nums[0]).toBe('1');
  expect(nums[1]).toBe('2');

  // Each numbered row carries the symmetric diamond tick marker (CSS span).
  const rows = page.locator('.editor-gutter .gutter-row');
  expect(await rows.nth(0).locator('span.gutter-tick').count()).toBe(1);

  // Harness feeds lineSyllableCounts={[2, 3]}.
  expect(await rows.nth(0).locator('.syllable-bar').count()).toBe(2);
  expect(await rows.nth(1).locator('.syllable-bar').count()).toBe(3);

  // Gutter must sit LEFT of the editor (side-by-side), not stacked above it.
  const g = await page.locator('.editor-gutter').boundingBox();
  const e = await page.locator('.lexical-content-editable').boundingBox();
  expect(e.x).toBeGreaterThanOrEqual(g.x + g.width - 2);
  expect(Math.abs(e.y - g.y)).toBeLessThan(40);
});

// Regression: pressing Enter in an EMPTY scroll must not balloon gutter rows.
// In plain-text Lexical, Enter inserts <br> inside a single <p>, so the
// paragraph's offsetHeight grows with every line. The gutter's per-line height
// must come from the resolved line-height, NOT the whole paragraph, or each row
// (and its diamond tick) grows on every keystroke.
test('gutter rows stay one line tall when pressing Enter in an empty scroll', async ({ page }) => {
  await page.goto('/__immune/lexical', { waitUntil: 'load' });
  await page.waitForSelector('.editor-gutter .gutter-row', { timeout: 10000 });

  const editor = page.locator('.lexical-content-editable');
  await editor.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Delete');
  await page.waitForTimeout(120);

  const rowHeight = () => page.evaluate(() =>
    document.querySelector('.editor-gutter .gutter-row')?.getBoundingClientRect().height ?? 0);

  const baseline = await rowHeight();
  expect(baseline).toBeGreaterThan(0);

  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('Enter');
    await page.waitForTimeout(60);
  }

  // Row height must remain ~one line; it must NOT scale with the line count.
  const after = await rowHeight();
  expect(Math.abs(after - baseline)).toBeLessThan(4);

  // The diamond tick rides the row — it must stay its fixed 8px, not grow.
  const tick = await page.evaluate(() =>
    document.querySelector('.editor-gutter .gutter-tick')?.getBoundingClientRect().height ?? 0);
  expect(tick).toBeLessThan(16);
});
