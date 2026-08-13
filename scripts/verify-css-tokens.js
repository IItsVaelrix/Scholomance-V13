#!/usr/bin/env node
/**
 * Verifies that JS constants stay in sync with their CSS variable counterparts.
 * Exits non-zero on mismatch. Wire into build or pre-commit.
 *
 * TOKEN MAP: add entries here whenever a new manual-sync constraint is introduced.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const TOKEN_MAP = [
  {
    label: 'LIST_ROW_HEIGHT',
    cssFile: 'src/pages/Read/IDE.css',
    cssPattern: /--scroll-list-row-height:\s*(\d+(?:\.\d+)?)px/,
    jsFile: 'src/pages/Read/ScrollList.jsx',
    jsPattern: /LIST_ROW_HEIGHT\s*=\s*(\d+(?:\.\d+)?)/,
  },
];

let failed = false;

for (const token of TOKEN_MAP) {
  const css = readFileSync(join(root, token.cssFile), 'utf8');
  const js  = readFileSync(join(root, token.jsFile), 'utf8');

  const cssMatch = css.match(token.cssPattern);
  const jsMatch  = js.match(token.jsPattern);

  if (!cssMatch) {
    console.error(`FAIL [${token.label}]: pattern not found in ${token.cssFile}`);
    failed = true;
    continue;
  }
  if (!jsMatch) {
    console.error(`FAIL [${token.label}]: pattern not found in ${token.jsFile}`);
    failed = true;
    continue;
  }
  if (cssMatch[1] !== jsMatch[1]) {
    console.error(
      `FAIL [${token.label}]: JS=${jsMatch[1]} !== CSS=${cssMatch[1]}\n` +
      `  JS:  ${token.jsFile}\n` +
      `  CSS: ${token.cssFile}`
    );
    failed = true;
    continue;
  }

  console.log(`OK   [${token.label}] = ${jsMatch[1]}px`);
}

/**
 * ─── LAW-ZIDX-010 / LAW-REG-001: the page-local stacking charter ───────────
 *
 * `src/index.css` charters the ConstellationOS `--cos-z-*` scale and declares an
 * INVARIANT: every value stays below `--z-above`, so page content can never rise
 * over the global overlay and system layers. That invariant was prose. Nothing
 * read it, nothing could fail on it, and the next `--cos-z-modal: 50` would have
 * satisfied the charter's letter while breaking the only thing it was protecting.
 *
 * This checks both halves of the law the repair actually made:
 *   1. every `--cos-z-*` value is below `--z-above`;
 *   2. no literal `z-index` above 1 survives in the page stylesheet — every
 *      stacking decision above the base band goes through a named token.
 */
const Z_PAGE = 'src/pages/Constellation/ConstellationPage.css';
try {
  const registry = readFileSync(join(root, 'src/index.css'), 'utf8');
  const page = readFileSync(join(root, Z_PAGE), 'utf8');

  const above = registry.match(/--z-above:\s*(\d+)/);
  if (!above) {
    console.error('FAIL [cos-z charter]: --z-above not found in src/index.css');
    failed = true;
  } else {
    const ceiling = Number(above[1]);
    const declared = [...page.matchAll(/(--cos-z-[a-z-]+):\s*(-?\d+)\s*;/g)];
    if (declared.length === 0) {
      console.error(`FAIL [cos-z charter]: no --cos-z-* tokens found in ${Z_PAGE}`);
      failed = true;
    }
    for (const [, name, value] of declared) {
      if (Number(value) >= ceiling) {
        console.error(
          `FAIL [cos-z charter]: ${name}: ${value} is not below --z-above (${ceiling})\n`
          + `  ${Z_PAGE}`,
        );
        failed = true;
      }
    }

    // Strip declarations and comments first: `--cos-z-brand: 3` is a token
    // definition, not a hardcoded stacking decision, and the charter comment
    // itself contains the words it is warning about.
    const usages = page
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/--cos-z-[a-z-]+:\s*-?\d+\s*;/g, '');
    for (const [, literal] of usages.matchAll(/z-index:\s*(-?\d+)\s*;/g)) {
      if (Number(literal) > 1) {
        console.error(
          `FAIL [cos-z charter]: hardcoded z-index: ${literal} — use a --cos-z-* token\n`
          + `  ${Z_PAGE}`,
        );
        failed = true;
      }
    }

    if (!failed) {
      console.log(`OK   [cos-z charter] ${declared.length} tokens, all < --z-above (${ceiling}), no literals > 1`);
    }
  }
} catch (err) {
  console.error(`FAIL [cos-z charter]: unable to read stylesheets (${err.message})`);
  failed = true;
}

const composeThemesPath = join(root, 'src/lib/css/generated/compose-themes.css');
try {
  const composeThemes = readFileSync(composeThemesPath, 'utf8');
  if (!composeThemes.includes("[data-theme='light']")) {
    console.error(`FAIL [compose-themes.css]: missing [data-theme='light'] in ${composeThemesPath}`);
    failed = true;
  } else if (!composeThemes.includes('--compose-color-surface-bg')) {
    console.error(`FAIL [compose-themes.css]: missing --compose-color-surface-bg in ${composeThemesPath}`);
    failed = true;
  } else {
    console.log('OK   [compose-themes.css] light selector + surface-bg present');
  }
} catch (err) {
  console.error(`FAIL [compose-themes.css]: unable to read ${composeThemesPath} (${err.message})`);
  failed = true;
}

process.exit(failed ? 1 : 0);
