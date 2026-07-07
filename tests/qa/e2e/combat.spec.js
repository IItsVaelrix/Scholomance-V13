import { expect, test } from "@playwright/test";
import { emitCombatBridgeEvent, installCombatMocks } from "./support/mocks.js";

test.describe("Combat rite", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await installCombatMocks(page);
  });

  test("casts a spell, reveals the authoritative breakdown, and resets after victory", async ({ page }) => {
    await page.goto("/combat");
    const combatPage = page.locator(".battle-page-root");

    await emitCombatBridgeEvent(page, "state:update", {
      state: "PLAYER_TURN",
      playerHP: 100,
      opponentHP: 100,
      playerMP: 50,
    });

    await expect(combatPage).toHaveAttribute("data-state", "PLAYER_TURN", { timeout: 15000 });
    await emitCombatBridgeEvent(page, "action:inscribe", {});
    await expect(combatPage).toHaveAttribute("data-state", "CASTING", { timeout: 15000 });

    await page.getByLabel(/Verse input/i).fill("Echoes fracture the hush");
    await page.getByLabel(/Weave input/i).fill("Mend the lattice");
    await expect(page.getByLabel(/Syntactic integrity/i)).toContainText("BRIDGE STABLE");

    const castButton = page.getByRole("button", { name: "Cast this spell" });
    await expect(castButton).toBeEnabled();
    await castButton.click();
    await expect(combatPage).toHaveAttribute("data-state", "SPELL_FLYING", { timeout: 15000 });

    await emitCombatBridgeEvent(page, "anim:player:done", {});
    await expect(combatPage).toHaveAttribute("data-state", "SCORE_REVEAL", { timeout: 15000 });

    const breakdown = page.getByRole("region", { name: "Spell score breakdown" });
    await expect(breakdown).toBeVisible();
    await expect(breakdown).toContainText("VERSE AFTERMATH");
    await expect(breakdown).toContainText("TOTAL DAMAGE");
    await expect(page.locator(".battle-log")).toContainText("A mock resonance tears through the chamber.");

    const claimVictoryButton = page.getByRole("button", { name: "Claim victory" });
    await expect(claimVictoryButton).toBeVisible();
    await claimVictoryButton.click();
    await expect(combatPage).toHaveAttribute("data-state", "VICTORY", { timeout: 15000 });

    await expect(page.getByRole("dialog", { name: "Victory" })).toBeVisible();
    await expect(page.getByText("THE RITE IS COMPLETE")).toBeVisible();

    await page.getByRole("button", { name: "Begin a new combat rite" }).click();
    await expect(combatPage).toHaveAttribute("data-state", "PLAYER_TURN", { timeout: 15000 });
  });
});
