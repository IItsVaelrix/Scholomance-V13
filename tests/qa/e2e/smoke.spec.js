import { expect, test } from "@playwright/test";
import { installReadPageMocks } from "./support/mocks.js";

test.describe("Scholomance shell and scribe rite", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await installReadPageMocks(page);
  });

  test("routes through the shell and reaches the signal chamber", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Enter Scholomance" }).click();
    await expect(page).toHaveURL(/\/read$/, { timeout: 15000 });
    await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Watch" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Listen" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Scribe" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Visualizer" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Blog" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();

    await page.getByRole("button", { name: "Open all chambers" }).click();
    await expect(page.getByRole("link", { name: "Portal" })).toBeVisible();
    await page.locator(".rail-menu-btn").click();

    await page.getByRole("link", { name: "Listen" }).click();
    await expect(page).toHaveURL(/\/listen$/);
    await expect(page.getByRole("heading", { name: "Scholomance Signal Chamber" })).toBeVisible();
    await expect(page.locator(".signal-chamber-shell")).toBeVisible();
  });

  test("saves a scroll and reloads persisted content", async ({ page }) => {
    const uniqueTitle = `Smoke Scroll ${Date.now()}`;

    await page.goto("/read");

    await page.getByLabel("Scroll Title").fill(uniqueTitle);
    const editor = page.locator(".lexical-content-editable");
    await editor.click();
    await page.keyboard.type("Echo ember");
    await expect(page.getByRole("button", { name: "Save Scroll" })).toBeEnabled();
    await page.getByRole("button", { name: "Save Scroll" }).click();

    await expect(page.locator(".scroll-list")).toContainText(uniqueTitle);

    await page.reload();

    await expect(page.locator(".scroll-list")).toContainText(uniqueTitle);
    await page.getByRole("button", { name: new RegExp(uniqueTitle) }).click();
    await expect(page.locator(".editor-body")).toContainText("Echo ember");
  });
});
