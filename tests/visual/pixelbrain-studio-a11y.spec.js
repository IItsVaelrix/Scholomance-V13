import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

for (const tab of ['canvas', 'blueprint', 'foundry', 'amps', 'mutations', 'finish', 'mentor', 'library', 'diagnostics']) {
  test(`PixelBrain Studio ${tab} has no serious accessibility violations`, async ({ page }) => {
    await page.goto(`/pixelbrain/studio/${tab}`);
    await expect(page.locator('.pb-studio')).toBeVisible();
    const results = await new AxeBuilder({ page }).include('.pb-studio').analyze();
    const blocking = results.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact));
    expect(blocking).toEqual([]);
  });
}
