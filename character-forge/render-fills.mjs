/**
 * Render helper — rasterizes the CORRECT layer of a forged character.
 *
 * The mistake to avoid: rendering `model.vectorPaths[].svgPath` directly. For stroke roles
 * that svgPath is the serialized center+edge+bleed POINT CLOUD — drawing it as a path yields
 * a self-intersecting scribble. `model.fills.coordinates` is the real PixelBrain raster:
 * one flat, cel-shaded, material-colored cell per pixel. Always render that for sprites.
 */
import { writeFileSync } from 'node:fs';

/** Build a crisp, upscaled SVG string from the fills raster (1 rect per cell). */
export function fillsToSVG(model, { bg = '#0b0a12', px = 512 } = {}) {
  const { width: W, height: H } = model.canvas;
  const rects = model.fills.coordinates
    .map(c => `<rect x="${c.x}" y="${c.y}" width="1" height="1" fill="${c.color}"/>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${px}" height="${px}" ` +
    `shape-rendering="crispEdges"><rect width="${W}" height="${H}" fill="${bg}"/>${rects}</svg>`;
}

/** Write the fills SVG, and (if Playwright is present) a PNG next to it. Returns paths. */
export async function renderFills(model, outBase, { bg = '#0b0a12', px = 512 } = {}) {
  const svg = fillsToSVG(model, { bg, px });
  const svgPath = `${outBase}.png.svg`;
  writeFileSync(svgPath, svg);

  let pngPath = null;
  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage({ viewport: { width: px, height: px }, deviceScaleFactor: 2 });
    await page.setContent(`<body style="margin:0;background:${bg}">${svg}</body>`);
    await page.waitForTimeout(200);
    pngPath = `${outBase}.png`;
    await page.screenshot({ path: pngPath });
    await browser.close();
  } catch (e) {
    console.warn(`[render-fills] PNG skipped (${e.message.split('\n')[0]}). SVG written: ${svgPath}`);
  }
  return { svgPath, pngPath };
}
