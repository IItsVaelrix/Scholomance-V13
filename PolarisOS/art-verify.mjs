import { chromium } from "@playwright/test";

const URL = "http://localhost:5173/";
const out = [];
const consoleErrors = [];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));

await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(4000);

async function canvasInfo() {
  return page.evaluate(() => {
    const c = document.querySelector("#polaris-scene-altar\\2e host canvas, canvas");
    if (!c) return { present: false };
    const ctx = c.getContext("webgl2") || c.getContext("webgl");
    let avg = null;
    try {
      const gl = c.__gl;
    } catch {}
    return {
      present: true,
      width: c.width,
      height: c.height,
      visible: c.offsetParent !== null,
      style_w: c.style.width,
    };
  });
}

async function shot(name) {
  await page.screenshot({ path: `art-verify-${name}.png`, fullPage: false });
  const info = await canvasInfo();
  out.push({ name, info });
}

// Initial spawn room (forest_path, moonlight)
await shot("01-forest");

// Helper to run a command in the conduit
async function cmd(text) {
  await page.fill("#polaris-command-input", text);
  await page.press("#polaris-command-input", "Enter");
  await page.waitForTimeout(1500);
}

// Try to navigate to the shrine and light the brazier (warm mood)
await cmd("go east");
await shot("02-after-east");
await cmd("light brazier");
await shot("03-after-light");

// Sample actual canvas pixels via 2D readback of a screenshot crop is complex;
// instead report the chronicle log text to see what happened.
const chronicle = await page.evaluate(() => {
  const log = document.querySelector("#polaris-chronicle-log");
  return log ? log.innerText.split("\n").slice(-8) : [];
});
out.push({ chronicle });

console.log(JSON.stringify({ consoleErrors, out }, null, 2));
await browser.close();
