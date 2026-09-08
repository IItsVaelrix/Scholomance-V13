import { expect, test } from "playwright/test";

const VALID_SCDL = `asset studio_test canvas 8x6
palette {
  ink = #223344
  glow = #88ccff
}
part body material source {
  cell 1 2 ink
  cell 2 2 ink
}
part gleam material source {
  cell 3 1 glow
}`;

async function waitForHydratedCanvas(page) {
  const canvas = page.getByTestId("pixel-canvas");
  await expect(canvas).toBeVisible();
  await expect.poll(() => canvas.getAttribute("data-zoom")).not.toBe("1");
}

test("pasted SCDL compiles into the active Canvas document", async ({ page }) => {
  await page.goto("/studio/canvas");
  await waitForHydratedCanvas(page);
  await page.getByRole("button", { name: "SCDL" }).click();
  const dialog = page.getByRole("dialog", { name: "Ingest SCDL" });
  await expect(dialog).toBeVisible();
  const compileButtonBox = await dialog.getByRole("button", { name: "Compile to Canvas" }).boundingBox();
  expect(compileButtonBox.height).toBeGreaterThanOrEqual(44);
  await dialog.getByLabel("SCDL source").fill(VALID_SCDL);
  await dialog.getByRole("button", { name: "Compile to Canvas" }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByTestId("canvas-status")).toContainText("8×6");
  await expect(page.getByTestId("canvas-status")).toContainText("3 cells");
  await expect(page.getByTestId("canvas-feedback")).toContainText("Compiled studio_test");
});

test("invalid SCDL stays open with navigable compiler diagnostics", async ({ page }) => {
  await page.goto("/studio/canvas");
  await waitForHydratedCanvas(page);
  await page.getByRole("button", { name: "SCDL" }).click();
  const dialog = page.getByRole("dialog", { name: "Ingest SCDL" });
  await dialog.getByLabel("SCDL source").fill("asset broken canvas 8x8\npart ink {\n  mystery 1 2\n}");
  await dialog.getByRole("button", { name: "Compile to Canvas" }).click();

  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("status")).toContainText(/line 3/i);
  await expect(dialog.getByRole("status")).toContainText(/unknown|unsupported/i);
  await expect(page.getByTestId("canvas-status")).toContainText("160×144");
});
