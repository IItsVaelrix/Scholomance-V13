import { expect, test } from "@playwright/test";
import { installAuthFlowMocks } from "./support/mocks.js";

test.describe("Portal user journey", () => {
  const testUser = {
    username: `scholar_${Date.now()}`,
    email: `scholar_${Date.now()}@scholomance.ai`,
    password: "Password123!",
  };

  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await installAuthFlowMocks(page, testUser);
  });

  test("registers, logs in, opens the profile, and logs out", async ({ page }) => {
    // Auth journey is not about Landing twin-gate — enter shell directly.
    await page.goto("/auth");
    await expect(page.getByRole("heading", { name: "Synchronize essence" })).toBeVisible();

    await page.getByRole("button", { name: /Register here/i }).click();
    await expect(page.getByRole("heading", { name: "Initialize Identity" })).toBeVisible();

    await page.getByLabel("Initiate Name").fill(testUser.username);
    await page.getByLabel("Aetheric Mail").fill(testUser.email);
    await page.getByLabel("Security Cipher").fill(testUser.password);
    await page.getByLabel("Confirm Cipher").fill(testUser.password);
    await page.getByLabel(/Security Challenge:/i).fill("7");
    await page.getByRole("button", { name: "Initialize" }).click();

    await expect(page.getByText("Registration successful! Check your email to verify your account.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Synchronize essence" })).toBeVisible();

    await page.getByLabel("Initiate Name").fill(testUser.username);
    await page.getByLabel("Security Cipher").fill(testUser.password);
    await page.getByRole("button", { name: "Synchronize" }).click();

    await expect(page).toHaveURL(/\/watch$/);
    await expect(page.getByRole("link", { name: testUser.username })).toBeVisible();

    await page.getByRole("link", { name: testUser.username }).click();
    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.locator(".profile-page")).toBeVisible();
    await expect(page.getByRole("heading", { name: testUser.username })).toBeVisible();
    await expect(page.getByText("School Attunement")).toBeVisible();

    await page.evaluate(() => {
      window.history.pushState({}, "", "/auth");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await expect(page.getByRole("heading", { name: "Aetheric Resonance Identified" })).toBeVisible();
    await page.getByRole("button", { name: /Sever Connection/i }).click();
    await expect(page.getByRole("heading", { name: "Synchronize essence" })).toBeVisible();
  });
});
