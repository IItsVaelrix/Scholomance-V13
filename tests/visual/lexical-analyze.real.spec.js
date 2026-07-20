import { test, expect } from '@playwright/test';

test('Read Analyze ranks the live lemma lattice only after explicit scoped submits', async ({ page }) => {
  const analyzeRequests = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/lexical/analyze') analyzeRequests.push(request);
  });

  await page.goto('/read', { waitUntil: 'networkidle' });
  await expect(page.locator('.ide-layout-wrapper')).toBeVisible();

  await page.getByRole('button', { name: 'HEX TOOLS' }).click();
  await page.locator('button[title="Reveal phonemic coloring"]').click();
  await page.locator('.console-seg', { hasText: 'Leximancy' }).click();

  const panel = page.locator('.az-panel');
  const input = panel.getByLabel('Leximancy query');
  await expect(panel).toBeVisible();

  await panel.locator('label[for="az-scope-word"]').click();
  await input.fill('saw');
  await expect.poll(() => analyzeRequests.length).toBe(0);
  await input.press('Enter');
  await expect.poll(() => analyzeRequests.length).toBe(1);

  await expect(panel.getByRole('tablist', { name: 'Lemma candidates' })).toBeVisible();
  const candidateTabs = panel.getByRole('tab');
  const candidateCount = await candidateTabs.count();
  expect(candidateCount).toBeGreaterThanOrEqual(2);
  await expect(panel.getByRole('status')).toContainText(/Ambiguous|Clear lead/);
  for (let index = 0; index < candidateCount; index += 1) {
    await candidateTabs.nth(index).click();
    // The `has` locator is re-scoped inside each candidate group, so it must be
    // a single-segment selector — a panel-rooted chain can never match here.
    const meaning = panel.locator('.az-group').filter({
      has: page.locator('.az-group__title', { hasText: /^Meaning / }),
    });
    await meaning.locator('.az-item').first().scrollIntoViewIfNeeded();
    await expect(meaning.locator('.az-item').first()).toBeVisible();
  }
  await panel.getByRole('button', { name: 'Ranking evidence' }).click();
  await expect(panel.locator('.az-evidence li strong', { hasText: 'semantics' })).toHaveCount(0);
  await expect(panel.locator('.az-evidence li strong', { hasText: 'pos' })).toHaveCount(0);
  await page.screenshot({ path: 'scratchpad/analyze-word-candidates.png', fullPage: true });

  const editor = page.locator('[contenteditable="true"]').first();
  await editor.fill('I saw the aurora with my eyes');
  await editor.press('End');
  await panel.locator('label[for="az-scope-line"]').click();
  await input.fill('saw');
  await expect.poll(() => analyzeRequests.length).toBe(1);
  await panel.getByRole('button', { name: 'Search' }).click();
  await expect.poll(() => analyzeRequests.length).toBe(2);

  expect(await panel.getByRole('tab').count()).toBeGreaterThanOrEqual(2);
  await expect(panel.locator('.az-group')).toHaveCount(8);
  await panel.getByRole('button', { name: 'Ranking evidence' }).click();
  await expect(panel.locator('.az-evidence li strong', { hasText: 'semantics' })).toHaveCount(1);
  await expect(panel.locator('.az-evidence li strong', { hasText: 'pos' })).toHaveCount(1);
  await page.screenshot({ path: 'scratchpad/analyze-line-candidates.png', fullPage: true });
});
