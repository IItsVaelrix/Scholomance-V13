import { expect, test } from "@playwright/test";

test("straight RGBA avoids a dark halo over a contrasting background", async ({
  page,
}) => {
  await page.goto("/tests/browser/pixelbrain-alpha.html");
  await expect.poll(
    () => page.locator("body").getAttribute("data-status"),
  ).toBe("ready");

  const encoded = await page.locator("body").getAttribute("data-pixel");
  expect(encoded).not.toBeNull();
  const [red, green, blue, alpha] = JSON.parse(encoded!) as number[];

  expect(red).toBeGreaterThanOrEqual(126);
  expect(red).toBeLessThanOrEqual(129);
  expect(green).toBeLessThanOrEqual(1);
  expect(blue).toBeGreaterThanOrEqual(126);
  expect(blue).toBeLessThanOrEqual(129);
  expect(alpha).toBe(255);
});
