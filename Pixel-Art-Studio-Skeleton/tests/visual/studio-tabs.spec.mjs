import { expect, test } from "playwright/test";

const TAB_LABELS = [
  "01Canvas & Aseprite",
  "02Blueprint",
  "03Foundry",
  "04AMP Conveyor",
  "05Mutation Lab",
  "06Material & Finish",
  "07Mentor & Reference",
  "08Library & Export",
  "09Diagnostics",
];

test("nine-tab Studio opens on Canvas and completes an authoring loop", async ({ page }, testInfo) => {
  const uncaught = [];
  page.on("pageerror", (error) => uncaught.push(error.message));

  await page.goto("/");
  await expect(page).toHaveURL(/\/studio\/canvas$/);
  const tabs = page.getByRole("tab");
  await expect(tabs).toHaveCount(9);
  await expect(tabs).toHaveText(TAB_LABELS);
  await expect(page.getByTestId("pixel-canvas")).toBeVisible();
  await expect(page.getByTestId("canvas-status")).toContainText("160×144");
  await expect(page.getByTestId("pixel-canvas")).toHaveAccessibleDescription(/160\s*×\s*144/);
  await expect(page.getByTestId("pixel-canvas")).toHaveAccessibleDescription(/Pencil/);
  await expect(page.getByTestId("pixel-canvas")).toHaveAccessibleDescription(/Structure/);
  const canvas = page.getByTestId("pixel-canvas");
  await expect(canvas).not.toHaveAttribute("data-pan-x", "0");
  const panX = Number(await canvas.getAttribute("data-pan-x"));
  const panY = Number(await canvas.getAttribute("data-pan-y"));
  const zoom = Number(await canvas.getAttribute("data-zoom"));
  await canvas.click({ position: { x: panX + zoom * 8 + zoom / 2, y: panY + zoom * 8 + zoom / 2 } });
  await canvas.click({ position: { x: panX + zoom * 12 + zoom / 2, y: panY + zoom * 10 + zoom / 2 } });
  await expect(page.getByTestId("canvas-status")).not.toContainText("0 cells");
  await page.screenshot({ path: testInfo.outputPath("studio-canvas.png"), fullPage: true });

  await tabs.nth(2).click();
  await expect(page).toHaveURL(/\/studio\/foundry$/);
  await expect(page.getByTestId("grass-dimensions")).toContainText("32×32");
  await expect(page.getByRole("img", { name: /seamless grass final preview/i })).toBeVisible();
  await page.getByRole("button", { name: /use in canvas/i }).click();
  await page.screenshot({ path: testInfo.outputPath("studio-foundry.png"), fullPage: true });

  await tabs.nth(3).click();
  await expect(page).toHaveURL(/\/studio\/amps$/);
  await page.getByRole("checkbox", { name: "grass" }).check();
  await page.getByRole("button", { name: /preview selected amp/i }).click();
  await expect(page.getByRole("status")).toContainText("Preview ready · grass");
  await page.screenshot({ path: testInfo.outputPath("studio-amps.png"), fullPage: true });

  await tabs.nth(4).click();
  await expect(page.getByRole("button", { name: /reject candidate/i })).toBeDisabled();
  await page.getByRole("button", { name: /generate isolated candidate/i }).click();
  await expect(page.getByRole("status")).toContainText("Candidate ready");
  await page.getByRole("button", { name: /reject candidate/i }).click();
  await expect(page.getByRole("status")).toContainText("baseline checksum is unchanged");
  await page.screenshot({ path: testInfo.outputPath("studio-mutations.png"), fullPage: true });

  await tabs.nth(4).press("End");
  await expect(page).toHaveURL(/\/studio\/diagnostics$/);
  await expect(page.getByTestId("adapter-coverage")).toHaveText("54 / 54 covered");
  await expect(page.getByText(/Fault \/ rejection ledger/)).toBeVisible();
  await expect(page.locator("html")).toHaveJSProperty(
    "scrollWidth",
    await page.locator("html").evaluate((node) => node.clientWidth),
  );
  expect(uncaught).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("studio-diagnostics.png"), fullPage: true });
});

test("remaining authoring tabs render without crashing the shell", async ({ page }) => {
  const uncaught = [];
  page.on("pageerror", (error) => uncaught.push(error.message));
  await page.goto("/studio/blueprint");
  await expect(page.getByRole("heading", { name: "Blueprint" })).toBeVisible();
  await expect(page.getByTestId("forge-gate-verdict")).toContainText("FAIL");
  await page.getByTestId("forge-gate-run").click();
  await expect(page.getByTestId("forge-gate-verdict")).toContainText("FAIL");
  await page.goto("/studio/finish");
  await expect(page.getByRole("heading", { name: "Material & Finish" })).toBeVisible();
  await expect(page.getByTestId("finish-webgl")).toContainText(/WebGL preview ready|WEBGL-UNAVAILABLE/i);
  await page.goto("/studio/mentor");
  await expect(page.getByRole("heading", { name: "Mentor & Reference" })).toBeVisible();
  await expect(page.getByText(/never calls a remote model/i)).toBeVisible();
  await page.goto("/studio/library");
  await expect(page.getByRole("heading", { name: "Library & Export" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Keep locally" })).toBeVisible();
  expect(uncaught).toEqual([]);
});

test("invalid Studio tab returns to Canvas without horizontal overflow", async ({ page }, testInfo) => {
  await page.goto("/studio/nope");
  await expect(page).toHaveURL(/\/studio\/canvas$/);
  await expect(page.getByRole("heading", { name: "Canvas & Aseprite" })).toBeVisible();
  const dimensions = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client);
  await page.screenshot({ path: testInfo.outputPath("studio-canvas.png"), fullPage: true });
});
