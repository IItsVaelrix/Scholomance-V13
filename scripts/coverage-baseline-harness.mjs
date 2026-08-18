#!/usr/bin/env node
/**
 * BASELINE HARNESS — runs the existing filename-heuristic coverage cell
 * (test-coverage.cell.js) over the real repo tree at the frozen HEAD and
 * reports the exact numbers the prereg requires.
 *
 * Research/diagnostic only. Reads files, runs the cell, prints a report.
 * Does NOT modify anything.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as coverageCell from '../codex/core/diagnostic/cells/test-coverage.cell.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const LOGIC_EXT = /\.(m?[jt]sx?|cjs)$/;
const SKIP_DIRS = new Set(['node_modules', '.git', 'venv', '.venv', '.worktrees', 'dist', 'build', '.next', 'coverage']);

function walk(dir, out) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (e.isFile() && LOGIC_EXT.test(e.name)) out.push(full);
  }
}

const abs = [];
walk(ROOT, abs);
const files = [];
for (const a of abs) {
  const rel = path.relative(ROOT, a).replace(/\\/g, '/');
  let content = '';
  try { content = fs.readFileSync(a, 'utf8'); } catch { content = ''; }
  files.push({ path: rel, content });
}

const snapshot = { files };
const result = await coverageCell.scan(snapshot, files);

const errors = result.errors || [];
const violations = errors.map(e => e?.context?.sourceFile || e?.details?.sourceFile || e?.sourceFile || '');

// Categorize
const isConstellation = p => /constellation/i.test(p);
const isScratch = p => /(^|\/)\.tmp\//.test(p) || /(^|\/)_shot/.test(p) || /(^|\/)_diag/.test(p);
const isAudition = p => /constellation\/audition\//.test(p);

const constV = violations.filter(isConstellation);
const scratchV = violations.filter(isScratch);
const auditionV = violations.filter(isAudition);

// Find the coverage-summary health signal
const summary = (result.health || []).find(h => {
  const s = JSON.stringify(h);
  return s.includes('coverage-summary');
});

const report = {
  totalSourceModulesScanned: files.filter(f => LOGIC_EXT.test(f.path)).length,
  totalViolations: violations.length,
  constellationViolations: constV.length,
  scratchViolations: scratchV.length,
  auditionViolationsDetected: auditionV.length,
  auditionViolationPaths: auditionV.slice(0, 20),
  coverageSummary: summary || null,
  sampleConstellation: constV.slice(0, 30),
};
console.log(JSON.stringify(report, null, 2));
