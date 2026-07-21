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
