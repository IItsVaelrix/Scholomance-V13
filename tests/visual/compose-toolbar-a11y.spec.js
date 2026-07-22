/**
 * Phase 11 — Playwright axe + visual snapshot for compose TopBar swap.
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Compose toolbar accessibility (Phase 11)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.__COMPOSE_FLAGS__ = {
        'compose:migrate:toolbar': true,
      };
    });
    await page.goto('/read');
    await page.waitForSelector('.ide-topbar', { timeout: 15000 });
    await page.waitForSelector('[data-testid="compose-topbar-actions"]', {
      timeout: 15000,
    });
  });

  test('compose TopBar actions: no critical/serious axe violations', async ({ page }) => {
    const results = await new AxeBuilder({ page })
      .include('[data-testid="compose-topbar-actions"]')
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    const blocking = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(blocking).toEqual([]);
  });

  test('compose TopBar actions visual snapshot', async ({ page }) => {
    const cluster = page.locator('[data-testid="compose-topbar-actions"]');
    await expect(cluster).toBeVisible();
    await expect(cluster).toHaveScreenshot('compose-topbar-actions.png', {
      animations: 'disabled',
      caret: 'hide',
    });
  });
});
