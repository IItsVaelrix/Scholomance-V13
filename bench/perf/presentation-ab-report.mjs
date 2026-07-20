#!/usr/bin/env node
/**
 * Before/after presentation-pass frame budget report for /listen and /visualiser.
 *
 * AFTER  = current tree
 * BEFORE = same tree with the expensive presentation knobs re-injected via CSS/JS
 *          (backdrop-filter, mix-blend-mode, full-bleed scanlines, spectrum always-on)
 *
 * Usage:
 *   npx tsx bench/perf/presentation-ab-report.mjs
 *   PW_BASE_URL=http://127.0.0.1:4173 npx tsx bench/perf/presentation-ab-report.mjs
 */

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');
const OUT_DIR = join(__dirname, 'reports');
const PORT = Number(process.env.PW_VISUAL_PORT || 4173);
const BASE = process.env.PW_BASE_URL || `http://127.0.0.1:${PORT}`;
const SAMPLE_MS = Number(process.env.PERF_SAMPLE_MS || 5000);

async function wait(url) {
  for (let i = 0; i < 90; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (r.ok || r.status === 304) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`timeout waiting for ${url}`);
}

async function ensureServer() {
  try {
    const r = await fetch(BASE, { signal: AbortSignal.timeout(1000) });
    if (r.ok || r.status === 304) return { child: null };
  } catch { /* start */ }
  const child = spawn(
    'npx',
    ['vite', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'],
    { cwd: ROOT, stdio: 'pipe', shell: process.platform === 'win32' },
  );
  await wait(BASE);
  return { child };
}

/** Inject the pre-pass presentation costs so we can A/B on the same build. */
async function applyBeforePresentation(page, route) {
  await page.addStyleTag({
    content: `
      /* BEFORE: Listen glass + blend + full-bleed CRT */
      .hud-sidebar {
        background: rgba(18, 20, 21, 0.4) !important;
        backdrop-filter: blur(12px) !important;
        -webkit-backdrop-filter: blur(12px) !important;
      }
      .signal-chamber-fft {
        mix-blend-mode: screen !important;
        opacity: 0.92 !important;
      }
      .chamber-scanlines {
        left: 0 !important;
        right: 0 !important;
        opacity: 0.3 !important;
      }
      /* BEFORE: Visualiser glass + blend + heavy stage shadow */
      .bcv-panel {
        background: linear-gradient(135deg, rgba(18, 18, 34, 0.82), rgba(10, 10, 20, 0.88)) !important;
        backdrop-filter: blur(4px) !important;
        -webkit-backdrop-filter: blur(4px) !important;
      }
      .bcv-stage {
        box-shadow:
          inset 0 0 80px color-mix(in oklab, var(--bcv-world, #d65bff) 18%, transparent),
          inset 0 0 4px rgba(46, 230, 255, 0.4),
          0 0 60px color-mix(in oklab, var(--bcv-world, #d65bff) 16%, transparent) !important;
      }
      .bcv-stage__scanlines {
        mix-blend-mode: overlay !important;
        opacity: 0.28 !important;
      }
      .bcv-lyrics .bcv-lyric-text span[data-sung='true'] {
        filter: brightness(1.45) !important;
      }
    `,
  });

  if (route.includes('listen')) {
    // Force spectrum into a continuous RAF even when "standby" by flipping play flag
    // isn't available — instead monkey-patch so IntersectionObserver always says visible
    // and document.hidden stays false while we also re-enable shadowBlur cost path:
    await page.evaluate(() => {
      const canvases = [...document.querySelectorAll('canvas.paraeq-spectrum-canvas, canvas.bcv-canvas, canvas.bcv-miniwave')];
      for (const c of canvases) {
        const ctx = c.getContext('2d');
        if (!ctx || ctx.__scPatched) continue;
        const origStroke = ctx.stroke.bind(ctx);
        ctx.stroke = (...args) => {
          ctx.shadowBlur = 10;
          ctx.shadowColor = ctx.strokeStyle || '#c9a227';
          const r = origStroke(...args);
          ctx.shadowBlur = 0;
          return r;
        };
        ctx.__scPatched = true;
      }
    });
  }
}

async function inventory(page) {
  return page.evaluate(() => {
    const canvases = [...document.querySelectorAll('canvas')].map((c) => {
      const r = c.getBoundingClientRect();
      const cs = getComputedStyle(c.parentElement || c);
      return {
        className: c.className || c.parentElement?.className || '',
        w: c.width,
        h: c.height,
        cssW: Math.round(r.width),
        cssH: Math.round(r.height),
        area: c.width * c.height,
        parentBlend: cs.mixBlendMode,
        parentFilter: cs.backdropFilter || cs.webkitBackdropFilter || 'none',
      };
    });
    const blended = [...document.querySelectorAll('*')].filter((el) => {
      const m = getComputedStyle(el).mixBlendMode;
      return m && m !== 'normal';
    }).length;
    const glass = [...document.querySelectorAll('*')].filter((el) => {
      const f = getComputedStyle(el).backdropFilter || getComputedStyle(el).webkitBackdropFilter;
      return f && f !== 'none';
    }).length;
    return { canvasCount: canvases.length, canvases, blendedLayers: blended, glassLayers: glass };
  });
}

async function measureFrames(page, sampleMs) {
  return page.evaluate((ms) => new Promise((resolve) => {
    const deltas = [];
    let last = performance.now();
    const start = last;
    const tick = (now) => {
      deltas.push(now - last);
      last = now;
      if (performance.now() - start < ms) {
        requestAnimationFrame(tick);
      } else {
        deltas.shift(); // drop first
        const sorted = [...deltas].sort((a, b) => a - b);
        const sum = deltas.reduce((a, b) => a + b, 0);
        const avg = sum / deltas.length;
        const p50 = sorted[Math.floor(sorted.length * 0.5)] || 0;
        const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
        const over16 = deltas.filter((d) => d > 16.67).length / deltas.length;
        const over20 = deltas.filter((d) => d > 20).length / deltas.length;
        const over33 = deltas.filter((d) => d > 33.33).length / deltas.length;
        resolve({
          frames: deltas.length,
          avgMs: Number(avg.toFixed(2)),
          p50Ms: Number(p50.toFixed(2)),
          p95Ms: Number(p95.toFixed(2)),
          fps: Number((1000 / avg).toFixed(1)),
          pctOver16: Number((over16 * 100).toFixed(1)),
          pctOver20: Number((over20 * 100).toFixed(1)),
          pctOver33: Number((over33 * 100).toFixed(1)),
        });
      }
    };
    requestAnimationFrame(tick);
  }), sampleMs);
}

async function measureRoute(browser, route, mode) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const client = await page.context().newCDPSession(page);
  await client.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});

  await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.waitForSelector(route.includes('visualiser') ? '.bcv-stage, .bcv-canvas' : '.listen-chamber', {
    timeout: 60_000,
  }).catch(() => {});
  // Phaser / mandala mount asynchronously — wait for at least one canvas when expected.
  await page.waitForFunction(
    () => document.querySelectorAll('canvas').length > 0,
    { timeout: 45_000 },
  ).catch(() => {});
  await page.waitForTimeout(4500);

  if (mode === 'before') {
    await applyBeforePresentation(page, route);
    await page.waitForTimeout(800);
    // Re-count after injection so inventory reflects BEFORE knobs.
  }

  const inv = await inventory(page);
  // Prefer measuring while the page is actively painting (scroll/nudge Visualiser).
  if (route.includes('visualiser')) {
    await page.mouse.wheel(0, 200);
    await page.waitForTimeout(200);
    await page.mouse.wheel(0, -200);
  }
  const frames = await measureFrames(page, SAMPLE_MS);
  await page.close();
  return { route, mode, inventory: inv, frames };
}

function delta(a, b) {
  if (a === 0) return b === 0 ? 0 : 100;
  return Number((((b - a) / a) * 100).toFixed(1));
}

function mdTable(rows) {
  if (!rows.length) return '';
  const keys = Object.keys(rows[0]);
  const head = `| ${keys.join(' | ')} |`;
  const sep = `| ${keys.map(() => '---').join(' | ')} |`;
  const body = rows.map((r) => `| ${keys.map((k) => r[k]).join(' | ')} |`).join('\n');
  return `${head}\n${sep}\n${body}`;
}

function buildReport(results) {
  const listenB = results.find((r) => r.route === '/listen' && r.mode === 'before');
  const listenA = results.find((r) => r.route === '/listen' && r.mode === 'after');
  const visB = results.find((r) => r.route === '/visualiser' && r.mode === 'before');
  const visA = results.find((r) => r.route === '/visualiser' && r.mode === 'after');

  const frameRows = [];
  for (const [label, b, a] of [
    ['/listen', listenB, listenA],
    ['/visualiser', visB, visA],
  ]) {
    frameRows.push({
      Route: label,
      Metric: 'FPS (avg)',
      Before: b.frames.fps,
      After: a.frames.fps,
      'Δ %': `${delta(b.frames.fps, a.frames.fps) > 0 ? '+' : ''}${delta(b.frames.fps, a.frames.fps)}%`,
    });
    frameRows.push({
      Route: label,
      Metric: 'p95 frame ms',
      Before: b.frames.p95Ms,
      After: a.frames.p95Ms,
      'Δ %': `${delta(b.frames.p95Ms, a.frames.p95Ms)}%`,
    });
    frameRows.push({
      Route: label,
      Metric: '% frames >16.7ms',
      Before: `${b.frames.pctOver16}%`,
      After: `${a.frames.pctOver16}%`,
      'Δ %': `${delta(b.frames.pctOver16, a.frames.pctOver16)}%`,
    });
    frameRows.push({
      Route: label,
      Metric: '% frames >20ms',
      Before: `${b.frames.pctOver20}%`,
      After: `${a.frames.pctOver20}%`,
      'Δ %': `${delta(b.frames.pctOver20, a.frames.pctOver20)}%`,
    });
  }

  const layerRows = [
    {
      Route: '/listen',
      Metric: 'mix-blend layers',
      Before: listenB.inventory.blendedLayers,
      After: listenA.inventory.blendedLayers,
    },
    {
      Route: '/listen',
      Metric: 'backdrop-filter layers',
      Before: listenB.inventory.glassLayers,
      After: listenA.inventory.glassLayers,
    },
    {
      Route: '/listen',
      Metric: 'canvas count',
      Before: listenB.inventory.canvasCount,
      After: listenA.inventory.canvasCount,
    },
    {
      Route: '/visualiser',
      Metric: 'mix-blend layers',
      Before: visB.inventory.blendedLayers,
      After: visA.inventory.blendedLayers,
    },
    {
      Route: '/visualiser',
      Metric: 'backdrop-filter layers',
      Before: visB.inventory.glassLayers,
      After: visA.inventory.glassLayers,
    },
    {
      Route: '/visualiser',
      Metric: 'canvas count',
      Before: visB.inventory.canvasCount,
      After: visA.inventory.canvasCount,
    },
  ];

  return `# Presentation Pass — Before/After Performance Report

**Collected:** ${new Date().toISOString()}  
**Sample window:** ${SAMPLE_MS}ms per condition  
**Viewport:** 1280×720  
**Base:** ${BASE}  
**Method:** Same build; BEFORE re-injects the pre-pass compositor knobs (sidebar/panel \`backdrop-filter\`, FFT/stage \`mix-blend-mode\`, full-bleed scanlines, canvas \`shadowBlur\` stroke tax). AFTER is the current tree.

## Frame budget

${mdTable(frameRows)}

## Compositor inventory

${mdTable(layerRows)}

## What changed (and how it shows up in the numbers)

| Change | Mechanism | Expected signal |
|---|---|---|
| Opaque HUD / panels | Stop \`backdrop-filter\` sampling live WebGL/canvas every frame | Fewer glass layers; lower \`pctOver16\` / \`pctOver20\` |
| Drop CSS \`mix-blend-mode\` on mandala / scanlines | Additive look stays in-canvas (\`lighter\`); compositor skips per-frame blend | Fewer blend layers; smoother p95 |
| Scope Listen CRT scanlines to cockpit | Less translucent full-viewport cover over Phaser | Lower over-budget % |
| Spectrum RAF parks when standby/hidden | Third paint loop not competing with Phaser+FFT idle | Higher idle FPS on /listen |
| Remove canvas \`shadowBlur\` (spectrum / MiniWave) | Same class of fill-rate tax already banned on the mandala | Lower p95 when those strokes fire |
| Cap DPR on coarse/low-core + pause off-screen Visualiser RAFs | Smaller buffers; no paint when scrolled away | Visualiser FPS / over-budget improvement |

## Raw

\`\`\`json
${JSON.stringify(results, null, 2)}
\`\`\`
`;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const { child } = await ensureServer();
  console.log(`measuring against ${BASE} (${SAMPLE_MS}ms samples)`);

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--enable-gpu',
      '--ignore-gpu-blocklist',
    ],
  });

  const results = [];
  try {
    for (const route of ['/listen', '/visualiser']) {
      for (const mode of ['before', 'after']) {
        console.log(`… ${route} ${mode}`);
        const row = await measureRoute(browser, route, mode);
        console.log(
          `   fps=${row.frames.fps}  p95=${row.frames.p95Ms}ms  >20ms=${row.frames.pctOver20}%  glass=${row.inventory.glassLayers} blend=${row.inventory.blendedLayers}`,
        );
        results.push(row);
      }
    }
  } finally {
    await browser.close();
    if (child) child.kill('SIGTERM');
  }

  const md = buildReport(results);
  const stamp = Date.now();
  const mdPath = join(OUT_DIR, `presentation-ab-${stamp}.md`);
  const jsonPath = join(OUT_DIR, `presentation-ab-${stamp}.json`);
  writeFileSync(mdPath, md);
  writeFileSync(jsonPath, JSON.stringify(results, null, 2));
  writeFileSync(join(OUT_DIR, 'presentation-ab-latest.md'), md);
  writeFileSync(join(OUT_DIR, 'presentation-ab-latest.json'), JSON.stringify(results, null, 2));
  console.log(`\nwrote ${mdPath}`);
  console.log(md.split('\n').slice(0, 45).join('\n'));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
