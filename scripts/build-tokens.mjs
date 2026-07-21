#!/usr/bin/env node
/**
 * Build Design Tokens - DTCG to CSS/JS/TS
 * 
 * Reads DTCG-format tokens from tokens/compose/ and generates:
 * - dist/tokens/tokens.css (CSS custom properties)
 * - dist/tokens/tokens.js (JavaScript constants)
 * - dist/tokens/tokens.d.ts (TypeScript declarations)
 * 
 * Usage: npm run build:tokens
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  generateCSS,
  generateJS,
  generateTSDeclarations,
} from '../src/core/compose/tokens/style-dictionary.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname, '..');
const TOKENS_DIR = path.join(ROOT, 'tokens', 'compose');
const OUTPUT_DIR = path.join(ROOT, 'dist', 'tokens');

/**
 * Load all DTCG token files from the tokens directory
 */
function loadTokens() {
  const tokens = {};

  if (!fs.existsSync(TOKENS_DIR)) {
    console.warn(`Warning: Tokens directory not found: ${TOKENS_DIR}`);
    return tokens;
  }

  // Theme suites live in tokens/compose/themes/ and are emitted by
  // scripts/generate-compose-themes.mjs — do not merge them into dist/tokens.
  const files = fs.readdirSync(TOKENS_DIR).filter(f => f.endsWith('.json'));

  for (const file of files) {
    const filePath = path.join(TOKENS_DIR, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content);
    
    // Merge into tokens object
    Object.assign(tokens, data);
  }

  return tokens;
}

/**
 * Build tokens and write output files
 */
function buildTokens() {
  console.log('🎨 Building design tokens...');
  console.log(`   Source: ${TOKENS_DIR}`);
  console.log(`   Output: ${OUTPUT_DIR}`);

  // Load tokens
  const tokens = loadTokens();
  const tokenCount = countTokens(tokens);
  console.log(`   Found ${tokenCount} tokens`);

  if (tokenCount === 0) {
    console.warn('⚠️  No tokens found. Skipping build.');
    return;
  }

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Generate CSS
  const css = generateCSS(tokens);
  const cssPath = path.join(OUTPUT_DIR, 'tokens.css');
  fs.writeFileSync(cssPath, css, 'utf-8');
  console.log(`   ✓ Generated ${cssPath}`);

  // Generate JavaScript
  const js = generateJS(tokens);
  const jsPath = path.join(OUTPUT_DIR, 'tokens.js');
  fs.writeFileSync(jsPath, js, 'utf-8');
  console.log(`   ✓ Generated ${jsPath}`);

  // Generate TypeScript declarations
  const ts = generateTSDeclarations(tokens);
  const tsPath = path.join(OUTPUT_DIR, 'tokens.d.ts');
  fs.writeFileSync(tsPath, ts, 'utf-8');
  console.log(`   ✓ Generated ${tsPath}`);

  console.log('✅ Token build complete!');
}

/**
 * Count the number of tokens in a dictionary
 */
function countTokens(obj, depth = 0) {
  let count = 0;

  for (const value of Object.values(obj)) {
    if (value && typeof value === 'object') {
      if ('$value' in value) {
        // It's a token
        count++;
      } else {
        // It's a group - recurse
        count += countTokens(value, depth + 1);
      }
    }
  }

  return count;
}

// Run the build
buildTokens();
