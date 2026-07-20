import { expect, test } from '@playwright/test';

test.describe('Landing twin-gate', () => {
  test('desktop shows balanced gates; enter still reaches /read', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');

    const portal = page.getByRole('button', { name: 'Enter Scholomance' });
    const ledger = page.getByRole('region', { name: 'Scholomance Update Ledger' });
    await expect(portal).toBeVisible();
    await expect(ledger).toBeVisible();

    const portalBox = await portal.boundingBox();
    const ledgerBox = await ledger.boundingBox();
    expect(portalBox).toBeTruthy();
    expect(ledgerBox).toBeTruthy();
    expect(portalBox.x + portalBox.width).toBeLessThan(ledgerBox.x);
    expect(Math.abs(portalBox.y + portalBox.height / 2 - (ledgerBox.y + ledgerBox.height / 2))).toBeLessThan(120);

    await portal.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/read/, { timeout: 15000 });
  });

  test('narrow stacks portal above ledger', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');

    const portal = page.getByRole('button', { name: 'Enter Scholomance' });
    const ledger = page.getByRole('region', { name: 'Scholomance Update Ledger' });
    const portalBox = await portal.boundingBox();
    const ledgerBox = await ledger.boundingBox();
    expect(portalBox.y).toBeLessThan(ledgerBox.y);
  });

  test('ledger scroll surface is keyboard-focusable without navigating', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    const ledger = page.getByRole('region', { name: 'Scholomance Update Ledger' });
    const entries = ledger.getByRole('list');
    await entries.focus();
    await expect(entries).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/?$/);
  });
});
