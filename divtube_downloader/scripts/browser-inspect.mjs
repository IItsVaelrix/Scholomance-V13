#!/usr/bin/env node
/**
 * DivTube browser_inspect — headless Playwright snapshot for local app URLs.
 *
 * Usage:
 *   node browser-inspect.mjs --url http://127.0.0.1:5173/ --json
 *
 * Safety: only localhost / 127.0.0.1 / [::1] (and optional file:// under project).
 * Outputs one JSON object to stdout.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../..');

function parseArgs(argv) {
  const out = { flags: {}, _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq !== -1) {
        out.flags[a.slice(2, eq)] = a.slice(eq + 1);
      } else {
        const key = a.slice(2);
        const next = argv[i + 1];
        if (next && !next.startsWith('--')) {
          out.flags[key] = next;
          i++;
        } else {
          out.flags[key] = true;
        }
      }
    } else {
      out._.push(a);
    }
  }
  return out;
}

function isAllowedUrl(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, error: `Invalid URL: ${raw}` };
  }
  if (u.protocol === 'file:') {
    const filePath = decodeURIComponent(u.pathname);
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(PROJECT_ROOT + path.sep) && resolved !== PROJECT_ROOT) {
      return { ok: false, error: 'file:// URLs must stay under the project root' };
    }
    return { ok: true, url: u.href };
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return { ok: false, error: `Unsupported protocol: ${u.protocol}` };
  }
  const host = (u.hostname || '').toLowerCase();
  const local =
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host === '[::1]' ||
    host === '::1';
  if (!local) {
    return {
      ok: false,
      error: `Refusing non-local host '${host}'. browser_inspect is localhost-only.`,
    };
  }
  return { ok: true, url: u.href };
}

async function collectTree(page) {
  return page.evaluate(() => {
    const clip = (s, n = 120) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
    const pick = (sel, map, limit = 40) =>
      [...document.querySelectorAll(sel)].slice(0, limit).map(map);
    return {
      title: document.title,
      headings: pick('h1,h2,h3,h4', (el) => ({
        tag: el.tagName.toLowerCase(),
        text: clip(el.textContent),
      })),
      buttons: pick(
        'button, [role="button"], input[type="button"], input[type="submit"]',
        (el) =>
          clip(
            el.textContent ||
              el.value ||
              el.getAttribute('aria-label') ||
              el.getAttribute('title') ||
              '',
          ),
      ).filter(Boolean),
      links: pick('a[href]', (el) => ({
        text: clip(el.textContent, 80),
        href: el.getAttribute('href') || '',
      })),
      inputs: pick('input, textarea, select', (el) => ({
        tag: el.tagName.toLowerCase(),
        type: el.getAttribute('type') || '',
        name: el.getAttribute('name') || '',
        id: el.id || '',
        placeholder: el.getAttribute('placeholder') || '',
        aria: el.getAttribute('aria-label') || '',
      })),
      landmarks: pick(
        'main, nav, aside, header, footer, [role="main"], [role="navigation"]',
        (el) => ({
          tag: el.tagName.toLowerCase(),
          role: el.getAttribute('role') || '',
          label: clip(el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || ''),
        }),
        20,
      ),
    };
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const urlRaw = args.flags.url || args._[0];
  if (!urlRaw || args.flags.help) {
    process.stdout.write(
      JSON.stringify(
        {
          error: 'Usage: browser-inspect.mjs --url http://127.0.0.1:5173/ [--selector css] [--wait-ms N] [--screenshot relpath]',
        },
        null,
        2,
      ) + '\n',
    );
    process.exit(urlRaw ? 0 : 2);
  }

  const allowed = isAllowedUrl(String(urlRaw));
  if (!allowed.ok) {
    process.stdout.write(JSON.stringify({ ok: false, error: allowed.error }, null, 2) + '\n');
    process.exit(2);
  }

  const waitMs = Math.max(0, parseInt(args.flags['wait-ms'] || args.flags.waitMs || '0', 10) || 0);
  const selector = args.flags.selector || null;
  const screenshotRel = args.flags.screenshot || null;
  const consoleLogs = [];
  const pageErrors = [];

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    page.on('console', (msg) => {
      consoleLogs.push({ type: msg.type(), text: msg.text().slice(0, 500) });
    });
    page.on('pageerror', (err) => {
      pageErrors.push(String(err?.message || err).slice(0, 500));
    });

    const response = await page.goto(allowed.url, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    if (waitMs) await page.waitForTimeout(waitMs); // intentional pause for SPA paint
    if (selector) {
      await page.waitForSelector(selector, { timeout: 10000 }).catch(() => null);
    }

    let aria = null;
    try {
      if (typeof page.locator('body').ariaSnapshot === 'function') {
        aria = await page.locator('body').ariaSnapshot();
      }
    } catch {
      aria = null;
    }

    const tree = await collectTree(page);
    let screenshotPath = null;
    if (screenshotRel) {
      const abs = path.resolve(PROJECT_ROOT, String(screenshotRel));
      if (!abs.startsWith(PROJECT_ROOT + path.sep)) {
        throw new Error('screenshot path escapes project root');
      }
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      await page.screenshot({ path: abs, fullPage: true });
      screenshotPath = path.relative(PROJECT_ROOT, abs);
    }

    const result = {
      ok: true,
      url: page.url(),
      requestedUrl: allowed.url,
      status: response ? response.status() : null,
      title: tree.title,
      tree,
      ariaSnapshot: aria,
      console: consoleLogs.slice(0, 40),
      pageErrors: pageErrors.slice(0, 20),
      screenshot: screenshotPath,
    };
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } catch (err) {
    process.stdout.write(
      JSON.stringify(
        {
          ok: false,
          error: err.message || String(err),
          hint:
            /Executable doesn't exist|browserType\.launch/i.test(String(err.message || err))
              ? 'Run: npx playwright install chromium'
              : undefined,
        },
        null,
        2,
      ) + '\n',
    );
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

main();
