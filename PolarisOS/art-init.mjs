import { chromium } from "@playwright/test";
import { execSync } from "node:child_process";

const URL = "http://localhost:5173/";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => {
  const log = document.querySelector("#polaris-chronicle-log");
  return log !== null && /enters the room/.test(log.innerText);
}, { timeout: 20000 });

const canvas = page.locator("canvas").first();
const delays = [800, 2500, 5000];
let prev = 0;
for (const d of delays) {
  await page.waitForTimeout(d - prev);
  prev = d;
  await canvas.screenshot({ path: `init-t${d}.png` });
}
await browser.close();
console.log("done");
