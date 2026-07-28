import { chromium } from "@playwright/test";

const URL = "http://localhost:5173/";
const msgs = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("console", (m) => msgs.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => msgs.push(`[pageerror] ${e.message}`));
await page.goto(URL, { waitUntil: "domcontentloaded" });

await page.waitForFunction(() => {
  const log = document.querySelector("#polaris-chronicle-log");
  return log !== null && /enters the room/.test(log.innerText);
}, { timeout: 20000 });

// Poll the canvas: is it empty (#0f0f23) or populated, over time?
async function canvasState() {
  return page.evaluate(async () => {
    const c = document.querySelector("canvas");
    if (!c) return { canvas: false };
    // Draw the webgl canvas into a 2d canvas to read pixels.
    const tmp = document.createElement("canvas");
    tmp.width = c.width; tmp.height = c.height;
    const ctx = tmp.getContext("2d");
    let distinct = 0, avg = null, sample = [];
    try {
      ctx.drawImage(c, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      const set = new Set();
      let r=0,g=0,b=0,n=0;
      for (let i=0;i<d.length;i+=4*97){
        set.add((d[i]>>4)+","+(d[i+1]>>4)+","+(d[i+2]>>4));
        r+=d[i];g+=d[i+1];b+=d[i+2];n++;
      }
      distinct = set.size;
      avg = [Math.round(r/n),Math.round(g/n),Math.round(b/n)];
      sample = [d[0],d[1],d[2]];
    } catch(e) { return { canvas:true, readError:String(e), w:c.width,h:c.height }; }
    return { canvas:true, w:c.width, h:c.height, distinct, avg, sample };
  });
}

for (const wait of [500, 2000, 5000, 9000]) {
  await page.waitForTimeout(wait === 500 ? 500 : wait - (wait===2000?500: (wait===5000?2000:5000)));
  const st = await canvasState();
  console.log(`t~${wait}ms`, JSON.stringify(st));
}

const status = await page.evaluate(() =>
  document.querySelector("#polaris-scene-altar\\.status")?.innerText ?? "(no status)");
console.log("STATUS:", status);
console.log("CONSOLE:", JSON.stringify(msgs.slice(0, 40), null, 1));
await browser.close();
