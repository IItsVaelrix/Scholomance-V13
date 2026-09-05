import { expect, test } from "playwright/test";

test("four-tab Studio executes a real AMP and retains its evidence", async ({ page }, testInfo) => {
  const uncaught = [];
  page.on("pageerror", (error) => uncaught.push(error.message));

  await page.goto("/");
  await expect(page).toHaveURL(/\/studio\/foundry$/);
  const tabs = page.getByRole("tab");
  await expect(tabs).toHaveCount(4);
  await expect(tabs).toHaveText(["01Foundry", "02AMP Conveyor", "03Mutation Lab", "04Diagnostics"]);
  await expect(page.getByTestId("grass-dimensions")).toContainText("32×32");
  await expect(page.getByRole("img", { name: /seamless grass final preview/i })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("studio-foundry.png"), fullPage: true });

  await tabs.nth(1).click();
  await expect(page).toHaveURL(/\/studio\/amps$/);
  await page.getByRole("checkbox", { name: "grass" }).check();
  await page.getByRole("button", { name: /preview selected amp/i }).click();
  await expect(page.getByRole("status")).toContainText("Preview ready · grass");
  await expect(page.getByText("studio-output1:", { exact: false }).last()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("studio-amps.png"), fullPage: true });

  await tabs.nth(2).click();
  await expect(page.getByRole("button", { name: /reject candidate/i })).toBeDisabled();
  await expect(page.getByRole("button", { name: /accept candidate/i })).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath("studio-mutations.png"), fullPage: true });
  await page.getByRole("button", { name: /generate isolated candidate/i }).click();
  await expect(page.getByRole("status")).toContainText("Candidate ready");
  await expect(page.getByRole("button", { name: /reject candidate/i })).toBeEnabled();
  await page.getByRole("button", { name: /reject candidate/i }).click();
  await expect(page.getByRole("status")).toContainText("baseline checksum is unchanged");

  await tabs.nth(2).press("End");
  await expect(page).toHaveURL(/\/studio\/diagnostics$/);
  await expect(page.getByTestId("adapter-coverage")).toHaveText("54 / 54 covered");
  await expect(page.getByText("Receipt ledger · 2 / 20")).toBeVisible();
  await expect(page.getByText("grass", { exact: true })).toBeVisible();
  await expect(page.getByText("Fault / rejection ledger · 1 / 20")).toBeVisible();
  await expect(page.getByText(/Rejected coord-symmetry-amp/)).toBeVisible();
  await expect(page.locator("html")).toHaveJSProperty(
    "scrollWidth",
    await page.locator("html").evaluate((node) => node.clientWidth),
  );
  expect(uncaught).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("studio-diagnostics.png"), fullPage: true });
});

test("invalid Studio tab returns to Foundry without horizontal overflow", async ({
  page,
}, testInfo) => {
  await page.goto("/studio/canvas");
  await expect(page).toHaveURL(/\/studio\/foundry$/);
  await expect(page.getByRole("heading", { name: "Grass Foundry" })).toBeVisible();
  const dimensions = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client);
  await page.screenshot({ path: testInfo.outputPath("studio-foundry.png"), fullPage: true });
});
