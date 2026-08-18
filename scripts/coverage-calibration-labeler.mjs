#!/usr/bin/env node
/**
 * INDEPENDENT CALIBRATION LABELER
 *
 * Deliberately DIFFERENT implementation from consumer-coverage-graph.mjs so the
 * comparison is not circular:
 *   - Test detection: BACKWARD grep of every test file for an import of the
 *     target module (string search), not forward edge resolution.
 *   - Live-path: forward BFS using ONLY static `import ... from` statements
 *     (no require / no dynamic import), a stricter, independent parser.
 *   - Git state: read from git status --porcelain directly.
 *
 * It labels a stratified sample, then compares against the cell's labels.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOGIC_EXT = /\.(m?[jt]sx?|cjs)$/;
const SKIP_DIRS = new Set(['node_modules', '.git', 'venv', '.venv', '.worktrees', 'dist', 'build', '.next', 'coverage', 'nlp_chatbot', 'Archive']);

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
for (const top of ['codex', 'src', 'tests', 'scripts']) walk(path.join(ROOT, top), abs);
const ALL = abs.map(a => path.relative(ROOT, a).replace(/\\/g, '/'));
const fileSet = new Set(ALL);
const src = new Map();
for (const f of ALL) { try { src.set(f, fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch { src.set(f, ''); } }

// git dirty
const dirty = new Set();
for (const line of execSync('git status --porcelain', { cwd: ROOT, maxBuffer: 64e6 }).toString().split('\n')) {
  const m = line.match(/^..\s+(.+)$/);
  if (m) { let p = m[1].trim(); if (p.includes(' -> ')) p = p.split(' -> ')[1]; dirty.add(p.replace(/^"|"$/g, '')); }
}

// test files
const TEST_RE = /(\.test\.|\.spec\.)/;
const testFiles = ALL.filter(f => TEST_RE.test(f) || f.startsWith('tests/'));

// INDEPENDENT backward test detection: which test files mention this module path?
function directTestFiles(target) {
  const base = path.basename(target).replace(/\.[^.]+$/, '');
  const hits = [];
  for (const tf of testFiles) {
    const s = src.get(tf) || '';
    // does the test import a path that resolves to target? match the relative tail
    if (s.includes(target)) { hits.push(tf); continue; }
    // match basename in an import of a path ending in /target-base.js
    const re = new RegExp(`from\\s+['"][^'"]*\\/${base}\\.(m?[jt]sx?)['"]`);
    if (re.test(s)) hits.push(tf);
  }
  return hits;
}

// INDEPENDENT live-path BFS: static imports only
const STATIC_IMPORT = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]/g;
function resolveOnly(fromFile, spec) {
  if (!spec.startsWith('.')) return null;
  const base = path.dirname(fromFile);
  let cand = path.normalize(path.join(base, spec)).replace(/\\/g, '/');
  for (const t of [cand, cand + '.js', cand + '.jsx', cand + '.ts', cand + '/index.js']) if (fileSet.has(t)) return t;
  return null;
}
const staticEdges = new Map();
for (const f of ALL) {
  const outs = new Set();
  let m; STATIC_IMPORT.lastIndex = 0;
  const s = src.get(f) || '';
  while ((m = STATIC_IMPORT.exec(s)) !== null) { const to = resolveOnly(f, m[1]); if (to && to !== f) outs.add(to); }
  staticEdges.set(f, outs);
}
function reach(seeds) {
  const seen = new Set(); const st = [...seeds];
  while (st.length) { const f = st.pop(); if (seen.has(f)) continue; seen.add(f); for (const t of (staticEdges.get(f) || [])) if (!seen.has(t)) st.push(t); }
  return seen;
}
const liveSeeds = ALL.filter(f => f.startsWith('codex/server/') || f.startsWith('codex/runtime/') || f.startsWith('src/pages/') || f.startsWith('src/hooks/') || /^src\/(App|main|index)\./.test(f));
const live = reach(liveSeeds);
// test-exercised: forward from test files over static edges
const exercised = reach(testFiles);

// INDEPENDENT label
function independentLabel(p) {
  if (dirty.has(p)) return 'WIP';
  const dt = directTestFiles(p);
  const isLive = live.has(p);
  const isEx = exercised.has(p);
  if (dt.length > 0) return isLive ? 'DIRECTLY_PINNED' : 'EXPERIMENTAL_UNDECLARED';
  if (isEx) return 'TRANSITIVELY_EXERCISED';
  if (isLive) return 'PRODUCTION_UNTESTED';
  return 'STRANDED_OR_NONPROD';
}

// ---- stratified sample ----
const ledger = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/superpowers/evidence/consumer-coverage-ledger.json'), 'utf8')).ledger;
const byState = {};
for (const r of ledger) (byState[r.state] = byState[r.state] || []).push(r);
const sample = [];
const quota = { DIRECTLY_PINNED: 8, TRANSITIVELY_EXERCISED: 8, EXPERIMENTAL_UNDECLARED: 7, STRANDED: 7, WIP: 6, RESEARCH_ONLY: 3, PRODUCTION_UNTESTED: 2 };
// deterministic pick: spread by index
for (const [st, n] of Object.entries(quota)) {
  const arr = byState[st] || [];
  for (let i = 0; i < n && i < arr.length; i++) {
    const idx = Math.floor(i * arr.length / n);
    sample.push(arr[idx]);
  }
}

const rows = [];
let agree = 0;
for (const r of sample) {
  const indep = independentLabel(r.module);
  const cell = r.state;
  // normalize STRANDED vs STRANDED_OR_NONPROD for comparison
  const indepNorm = indep === 'STRANDED_OR_NONPROD' ? 'STRANDED' : indep;
  const match = indepNorm === cell;
  if (match) agree++;
  rows.push({ module: r.module, cell, indep, match });
}

console.log(JSON.stringify({
  sampleSize: sample.length,
  agreement: agree,
  precision: (agree / sample.length).toFixed(3),
  disagreements: rows.filter(r => !r.match),
  all: rows,
}, null, 2));
