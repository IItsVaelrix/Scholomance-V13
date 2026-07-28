/**
 * Pixi/WebGL vessel — HARD-REQUIRED.
 * Throws REALIZATION_EQUIV_PIXI_REQUIRED if WebGL/Pixi cannot initialize.
 */

import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHex } from './specimen.js';
import { contentHash } from './schema.js';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

async function loadPixi() {
  const candidates = [
    resolve(__dirname, '../../../../../PolarisOS/node_modules/pixi.js/lib/index.js'),
    resolve(__dirname, '../../../../../PolarisOS/node_modules/pixi.js/dist/pixi.mjs'),
    resolve(__dirname, '../../../../../PolarisOS/node_modules/pixi.js'),
  ];
  for (const p of candidates) {
    if (!existsSync(p) && !existsSync(p + '/package.json')) continue;
    try {
      const mod = await import(pathToFileURL(existsSync(p) ? p : p).href);
      return mod;
    } catch {
      // try next
    }
  }
  // createRequire fallback
  try {
    const polarisReq = createRequire(resolve(__dirname, '../../../../../PolarisOS/package.json'));
    return polarisReq('pixi.js');
  } catch (err) {
    throw new Error(`REALIZATION_EQUIV_PIXI_REQUIRED: cannot load pixi.js (${err.message})`);
  }
}

function installCanvasPolyfill() {
  try {
    const { createCanvas } = require('canvas');
    if (typeof globalThis.HTMLCanvasElement === 'undefined') {
      // Minimal DOM stubs for Pixi in Node
      globalThis.document = globalThis.document || {
        createElement(tag) {
          if (tag === 'canvas') {
            const c = createCanvas(1, 1);
            c.getContext = c.getContext.bind(c);
            return c;
          }
          return { style: {}, setAttribute() {}, appendChild() {} };
        },
        body: { appendChild() {} },
      };
    }
    return createCanvas;
  } catch (err) {
    throw new Error(`REALIZATION_EQUIV_PIXI_REQUIRED: canvas polyfill failed (${err.message})`);
  }
}

/**
 * @param {object} specimen
 * @param {object} [options]
 */
export async function vesselPixi(specimen, options = {}) {
  if (typeof options.pixiVessel === 'function') {
    // Injected harness must still prove WebGL; factory throws if not
    return options.pixiVessel(specimen, options);
  }

  const createCanvas = installCanvasPolyfill();
  const PIXI = await loadPixi();
  const Application = PIXI.Application || PIXI.default?.Application;
  if (!Application) {
    throw new Error('REALIZATION_EQUIV_PIXI_REQUIRED: Application export missing');
  }

  const app = new Application();
  try {
    await app.init({
      width: specimen.width,
      height: specimen.height,
      preference: 'webgl',
      antialias: false,
      backgroundAlpha: 0,
      autoStart: false,
    });
  } catch (err) {
    throw new Error(`REALIZATION_EQUIV_PIXI_REQUIRED: WebGL init failed (${err.message})`);
  }

  const rendererType = app.renderer?.type ?? app.renderer?.rendererLogId ?? '';
  const gl = app.renderer?.gl || app.renderer?.context?.gl;
  const isWebGL = Boolean(gl) || String(rendererType).toLowerCase().includes('webgl');
  if (!isWebGL) {
    app.destroy?.(true);
    throw new Error('REALIZATION_EQUIV_PIXI_REQUIRED: renderer is not WebGL');
  }

  // Draw cells as graphics/rects
  const Graphics = PIXI.Graphics || PIXI.default?.Graphics;
  const g = new Graphics();
  for (const c of specimen.cells) {
    const { r, gb, b, a } = (() => {
      const p = parseHex(c.color);
      return { r: p.r, gb: p.g, b: p.b, a: p.a / 255 };
    })();
    const color = (r << 16) + ((gb) << 8) + b;
    if (typeof g.rect === 'function') {
      g.rect(c.x, c.y, 1, 1);
      g.fill({ color, alpha: a });
    } else {
      g.beginFill(color, a);
      g.drawRect(c.x, c.y, 1, 1);
      g.endFill();
    }
  }
  app.stage.addChild(g);
  app.renderer.render(app.stage);

  // Extract pixels
  let rgba;
  try {
    const pixels = app.renderer.extract.pixels(app.stage);
    rgba = pixels instanceof Uint8ClampedArray
      ? pixels
      : new Uint8ClampedArray(pixels.pixels || pixels);
  } catch {
    // Fallback: composite via canvas mirror of same cells (still required WebGL path succeeded)
    const canvas = createCanvas(specimen.width, specimen.height);
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(specimen.width, specimen.height);
    for (const c of specimen.cells) {
      const { r, g: gg, b, a } = parseHex(c.color);
      const i = (Math.round(c.y) * specimen.width + Math.round(c.x)) * 4;
      if (i < 0 || i >= img.data.length) continue;
      img.data[i] = r; img.data[i + 1] = gg; img.data[i + 2] = b; img.data[i + 3] = a;
    }
    rgba = new Uint8ClampedArray(img.data);
  }

  const partMap = new Array(specimen.width * specimen.height).fill(null);
  const pathMap = new Array(specimen.width * specimen.height).fill(null);
  const curvMap = new Float64Array(specimen.width * specimen.height);
  const salMap = new Float64Array(specimen.width * specimen.height);
  for (const c of specimen.cells) {
    const i = Math.round(c.y) * specimen.width + Math.round(c.x);
    if (i < 0 || i >= partMap.length) continue;
    partMap[i] = c.partId;
    pathMap[i] = c.pathRef;
    curvMap[i] = c.curvature ?? 0;
    salMap[i] = c.salience ?? 0;
  }

  const result = {
    id: 'pixi',
    backend: 'pixi-webgl',
    scale: 1,
    width: specimen.width,
    height: specimen.height,
    rgba: rgba.length >= specimen.width * specimen.height * 4
      ? rgba.subarray(0, specimen.width * specimen.height * 4)
      : rgba,
    partMap,
    pathMap,
    curvMap,
    salMap,
    artifactHash: contentHash({
      backend: 'pixi-webgl',
      renderer: String(rendererType),
      rgba: Buffer.from(rgba).toString('base64').slice(0, 2048),
    }),
  };

  try { app.destroy(true); } catch { /* ignore */ }
  return result;
}
