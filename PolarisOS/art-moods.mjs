import { chromium } from "@playwright/test";

const URL = "http://localhost:5173/";
const consoleErrors = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
page.on("pageerror", (e) => consoleErrors.push("pageerror: " + e.message));
await page.goto(URL, { waitUntil: "domcontentloaded" });

// Wait until the world has actually delivered a scene (room-entry chronicle line).
await page.waitForFunction(() => {
  const log = document.querySelector("#polaris-chronicle-log");
  return log !== null && /enters the room/.test(log.innerText);
}, { timeout: 20000 });
// Give the renderer a beat to commit the first illustrated frame + load assets.
await page.waitForTimeout(2500);

const canvas = page.locator("canvas").first();
await canvas.screenshot({ path: "mood-moonlight.png" });

// Light the brazier → warm_firelight mood
await page.fill("#polaris-command-input", "light brazier");
await page.press("#polaris-command-input", "Enter");
await page.waitForFunction(() => {
  const log = document.querySelector("#polaris-chronicle-log");
  return log !== null && /lights the brazier/.test(log.innerText);
}, { timeout: 10000 });
await page.waitForTimeout(2000);
await canvas.screenshot({ path: "mood-warm.png" });

const chronicle = await page.evaluate(() =>
  document.querySelector("#polaris-chronicle-log")?.innerText.split("\n").slice(-6) ?? []);
console.log("chronicle:", JSON.stringify(chronicle));
console.log("consoleErrors:", JSON.stringify(consoleErrors));
await browser.close();
