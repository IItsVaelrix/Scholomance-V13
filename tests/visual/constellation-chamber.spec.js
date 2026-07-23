import { test, expect } from '@playwright/test';

test.describe('ConstellationOS chamber smoke', () => {
  test('idle exposes brand and search measure target', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/constellation');
    await expect(page.getByRole('heading', { name: 'ConstellationOS' })).toBeVisible();
    await expect(page.locator('#constellation-search')).toBeVisible();
    await expect(page.locator('#constellation-result-shell')).toHaveCount(0);
  });

  test('submit mounts result shell measure target', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/constellation');
    await page.getByLabel(/search the literary sky/i).fill('the bright wound of morning');
    await page.getByLabel(/search the literary sky/i).press('Enter');
    await expect(page.locator('#constellation-stage')).toHaveAttribute('data-mode', 'submitted');
    await expect(page.locator('#constellation-result-shell')).toBeVisible();
    await expect(page.getByRole('heading', { name: /phrase identity/i })).toBeVisible();
  });
});
