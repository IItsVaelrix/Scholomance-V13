import { expect, test } from '@playwright/test';

test.describe('PixelBrain SWARD Studio', () => {
  test('desktop shell, Canvas bench, and deep tabs remain stable', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto('/pixelbrain/studio/canvas');
    await expect(page.locator('.pb-studio')).toBeVisible();
    await expect(page.getByRole('tab')).toHaveCount(9);
    await expect(page.getByRole('tab', { name: /canvas & aseprite/i })).toHaveAttribute('aria-selected', 'true');
    await expect(page).toHaveScreenshot('pixelbrain-studio-canvas-desktop.png', { animations: 'disabled', maxDiffPixelRatio: 0.002 });

    await page.getByRole('tab', { name: /amp conveyor/i }).click();
    await expect(page).toHaveURL(/\/pixelbrain\/studio\/amps$/);
    await expect(page.getByRole('heading', { name: 'AMP Conveyor' })).toBeVisible();
    await expect(page.getByText(/39 executable · 5 support/i)).toBeVisible();
  });

  test('grass Foundry preserves SWARD form-first inspection', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto('/pixelbrain/studio/foundry');
    await expect(page.getByRole('heading', { name: 'Grass Foundry' })).toBeVisible();
    await expect(page.getByRole('img', { name: /seamless grass/i })).toBeVisible();
    await page.getByRole('button', { name: '8× repeat' }).click();
    await page.getByRole('button', { name: /grow deterministic variants/i }).click();
    await expect(page.getByRole('button', { name: /use variant seed/i }).first()).toBeVisible();
    await expect(page).toHaveScreenshot('pixelbrain-studio-foundry-desktop.png', { animations: 'disabled', maxDiffPixelRatio: 0.002 });
  });

  test('mobile Studio is a usable single-column surface', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/pixelbrain/studio/mutations');
    await expect(page.getByRole('heading', { name: 'Mutation Lab' })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await expect(page).toHaveScreenshot('pixelbrain-studio-mutation-mobile.png', { animations: 'disabled', maxDiffPixelRatio: 0.002 });
  });
});
