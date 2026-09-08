#!/usr/bin/env node
/**
 * Sync Studio Compiler & Parity Verification Gate
 *
 * Enforces bit-for-bit parity between the root SCDL compiler in
 * `codex/core/pixelbrain/scdl/` and the sandbox copy in
 * `Pixel-Art-Studio-Skeleton/src/lib/pixelbrain/scdl/`.
 *
 * Usage:
 *   node scripts/sync-studio-compiler.mjs --check   # Verify parity without mutating (exit 1 on drift)
 *   node scripts/sync-studio-compiler.mjs --sync    # Synchronize compiler files to Studio
 */

import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { resolve, join, relative, dirname } from 'node:path';

const ROOT = resolve(process.cwd());
const SOURCE_DIR = join(ROOT, 'codex/core/pixelbrain/scdl');
const TARGET_DIR = join(ROOT, 'Pixel-Art-Studio-Skeleton/src/lib/pixelbrain/scdl');

const EXCLUDED_PATTERNS = [
  /fixtures/,
  /\.test\.js$/,
  /scdl\.cli\.js$/,
  /tiles\.png$/,
];

function shouldInclude(relPath) {
  for (const pattern of EXCLUDED_PATTERNS) {
    if (pattern.test(relPath)) return false;
  }
  return true;
}

function collectFiles(dir, baseDir = dir) {
  const results = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    const relPath = relative(baseDir, fullPath);
    if (entry.isDirectory()) {
      if (shouldInclude(relPath)) {
        results.push(...collectFiles(fullPath, baseDir));
      }
    } else if (entry.isFile()) {
      if (shouldInclude(relPath)) {
        results.push(relPath);
      }
    }
  }
  return results;
}

const isCheck = process.argv.includes('--check');

const sourceFiles = collectFiles(SOURCE_DIR);
let driftCount = 0;
const diffs = [];

for (const rel of sourceFiles) {
  const srcPath = join(SOURCE_DIR, rel);
  const tgtPath = join(TARGET_DIR, rel);
  const srcBuf = readFileSync(srcPath);

  let tgtBuf = null;
  try {
    tgtBuf = readFileSync(tgtPath);
  } catch {
    tgtBuf = null;
  }

  if (!tgtBuf || !srcBuf.equals(tgtBuf)) {
    driftCount += 1;
    diffs.push(rel);
    if (!isCheck) {
      mkdirSync(dirname(tgtPath), { recursive: true });
      writeFileSync(tgtPath, srcBuf);
    }
  }
}

if (isCheck) {
  if (driftCount > 0) {
    console.error(`[SYNC-STUDIO] Drift detected in ${driftCount} file(s):`);
    for (const f of diffs) {
      console.error(`  - ${f}`);
    }
    console.error(`Run 'node scripts/sync-studio-compiler.mjs --sync' to synchronize.`);
    process.exit(1);
  } else {
    console.log(`[SYNC-STUDIO] Bit-for-bit parity verified across all ${sourceFiles.length} compiler files.`);
    process.exit(0);
  }
} else {
  console.log(`[SYNC-STUDIO] Synchronized ${driftCount} updated/added file(s) to Studio compiler.`);
  console.log(`[SYNC-STUDIO] Total ${sourceFiles.length} compiler files now at 100% bit-for-bit parity.`);
  process.exit(0);
}
