import { expect, test } from "@playwright/test";
import { installCombatMocks } from "./support/mocks.js";

test.describe("Combat rite", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await installCombatMocks(page);
  });

  test("casts a spell through the live spellweave HUD and logs parser feedback", async ({ page }) => {
    test.setTimeout(60_000);

    await page.goto("/combat");
    await expect(page.locator(".combat-page-shell")).toBeVisible({ timeout: 15000 });

    const verseInput = page.getByLabel(/Verse input/i);
    await verseInput.click();
    await verseInput.evaluate((el, text) => {
      el.textContent = text;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }, "Echoes fracture the hush");

    await page.getByLabel(/Weave input/i).fill("MEND FLESH");
    await expect(page.getByLabel(/Syntactic integrity/i)).toContainText("BRIDGE STABLE");

    const castButton = page.getByRole("button", { name: "Cast this spell" });
    await expect(castButton).toBeEnabled({ timeout: 15000 });
    await castButton.click();

    const terminal = page.locator(".combat-terminal__log");
    await expect(terminal).toContainText("[CAST]", { timeout: 30000 });
    await expect(terminal).toContainText("MEND FLESH");
    await expect(terminal).not.toContainText("SYNTACTIC COLLAPSE");
  });
});