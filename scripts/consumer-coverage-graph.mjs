#!/usr/bin/env node
/**
 * CONSUMER-GRAPH COVERAGE CELL (Arm B)
 *
 * Replaces the filename/basename heuristic with a consumer-kind import graph.
 * For every module in the coverage denominator it classifies inbound edges by
 * KIND (test / production / research / diagnostic) and derives a lifecycle
 * state instead of a boolean "has test file".
 *
 * Consumer KIND matters: a test inbound edge does NOT make a module
 * production-wired, and a diagnostic inbound edge does NOT either.
 *
 * Research/diagnostic only. Reads files, emits a ledger. Modifies nothing.
 *
 * Prereg: docs/superpowers/evidence/2026-08-18-PREREG-atlas-coverage-calibration.md
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOGIC_EXT = /\.(m?[jt]sx?|cjs)$/;
const SKIP_DIRS = new Set(['node_modules', '.git', 'venv', '.venv', '.worktrees', 'dist', 'build', '.next', 'coverage', 'nlp_chatbot', 'Archive']);

// ---------- Phase 1: walk ----------
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
const absFiles = [];
for (const top of ['codex', 'src', 'tests', 'scripts']) walk(path.join(ROOT, top), absFiles);
const ALL = absFiles.map(a => path.relative(ROOT, a).replace(/\\/g, '/'));

// ---------- Phase 2: classify every file by consumer KIND ----------
const TEST_RE = /(\.test\.|\.spec\.)/;
const DIAG_RE = /(^|\/)_diag|codex\/core\/diagnostic/;
const RESEARCH_RE = /(^|\/)_shot|(^|\/)scripts\/.*(census|simulation|observe|probe|ablation|sweep|experiment|harness|waterfall|rebuild|calibrat)/i;

function kindOf(p) {
  if (TEST_RE.test(p) || p.startsWith('tests/')) return 'TEST';
  if (DIAG_RE.test(p)) return 'DIAGNOSTIC';
  if (p.startsWith('scripts/') || RESEARCH_RE.test(p)) return 'RESEARCH';
  if (p.startsWith('codex/') || p.startsWith('src/')) return 'PRODUCTION';
  return 'OTHER';
}

// ---------- Phase 3: extract + resolve imports ----------
const IMPORT_RE = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|require\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s*['"]([^'"]+)['"]/g;

function resolveSpec(fromFile, spec) {
  if (!spec.startsWith('.')) return null; // bare specifier = external
  const base = path.dirname(fromFile);
  let cand = path.normalize(path.join(base, spec)).replace(/\\/g, '/');
  const tries = [cand, cand + '.js', cand + '.jsx', cand + '.ts', cand + '.tsx', cand + '.mjs',
    cand + '/index.js', cand + '/index.jsx', cand + '/index.ts'];
  for (const t of tries) if (fileSet.has(t)) return t;
  return null;
}

const fileSet = new Set(ALL);
const edges = new Map(); // from -> Set(to)
for (const f of ALL) {
  let src = '';
  try { src = fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch { continue; }
  const outs = new Set();
  let m;
  IMPORT_RE.lastIndex = 0;
  while ((m = IMPORT_RE.exec(src)) !== null) {
    const spec = m[1] || m[2] || m[3] || m[4];
    if (!spec) continue;
    const to = resolveSpec(f, spec);
    if (to && to !== f) outs.add(to);
  }
  edges.set(f, outs);
}

// ---------- Phase 4: reverse index (to -> inbound [from,kind]) ----------
const inbound = new Map(); // to -> Map(from -> kind)
for (const [from, tos] of edges) {
  const k = kindOf(from);
  for (const to of tos) {
    if (!inbound.has(to)) inbound.set(to, new Map());
    inbound.get(to).set(from, k);
  }
}

// ---------- Phase 5: forward reachability ----------
function forwardReach(seeds) {
  const reach = new Set();
  const stack = [...seeds];
  while (stack.length) {
    const f = stack.pop();
    if (reach.has(f)) continue;
    reach.add(f);
    for (const to of (edges.get(f) || [])) if (!reach.has(to)) stack.push(to);
  }
  return reach;
}

// TEST reach: forward from every test file (what tests exercise)
const testSeeds = ALL.filter(f => kindOf(f) === 'TEST');
const testReach = forwardReach(testSeeds);

// PRODUCTION reach: forward from shipped-surface entry points
const prodSeeds = ALL.filter(f =>
  f.startsWith('codex/server/') || f.startsWith('codex/runtime/') ||
  f.startsWith('src/pages/') || f.startsWith('src/hooks/') ||
  /^src\/(App|main|index)\./.test(f)
);
const prodReach = forwardReach(prodSeeds);

// ---------- Phase 6: WIP detection via git ----------
import { execSync } from 'node:child_process';
let dirtySet = new Set();
try {
  const out = execSync('git status --porcelain', { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }).toString();
  for (const line of out.split('\n')) {
    const mm = line.match(/^..\s+(.+)$/);
    if (mm) {
      let p = mm[1].trim();
      if (p.includes(' -> ')) p = p.split(' -> ')[1];
      p = p.replace(/^"|"$/g, '');
      dirtySet.add(p);
    }
  }
} catch { /* git unavailable */ }

// ---------- Phase 7: coverage denominator ----------
function inDenominator(p) {
  if (!LOGIC_EXT.test(p)) return false;
  if (TEST_RE.test(p)) return false;
  if (p.startsWith('.tmp/') || /(^|\/)\.tmp\//.test(p)) return false;
  if (/(^|\/)_shot/.test(p) || /(^|\/)_diag/.test(p)) return false;
  return p.startsWith('codex/core/') || p.startsWith('codex/runtime/') ||
    /^src\/hooks\/constellation/.test(p) ||
    (p.startsWith('codex/server/') && /constellation/i.test(p));
}

// ---------- Phase 8: derive state ----------
function deriveState(p) {
  if (dirtySet.has(p)) return 'WIP';
  const ib = inbound.get(p) || new Map();
  const kinds = [...ib.values()];
  const directTest = [...ib.entries()].some(([from, k]) => k === 'TEST');
  const prod = prodReach.has(p);
  const tested = testReach.has(p);
  const onlyResearch = kinds.length > 0 && kinds.every(k => k === 'RESEARCH');
  const onlyDiag = kinds.length > 0 && kinds.every(k => k === 'DIAGNOSTIC');
  const noInbound = kinds.length === 0;

  if (directTest) return prod ? 'DIRECTLY_PINNED' : 'EXPERIMENTAL_UNDECLARED';
  if (tested) return 'TRANSITIVELY_EXERCISED';
  if (prod) return 'PRODUCTION_UNTESTED';
  if (onlyResearch) return 'RESEARCH_ONLY';
  if (onlyDiag) return 'DIAGNOSTIC_ONLY';
  if (noInbound) return 'STRANDED';
  return 'STRANDED';
}

function layerOf(p) {
  if (p.startsWith('codex/core/')) return 'Core';
  if (p.startsWith('codex/runtime/')) return 'Runtime';
  if (p.startsWith('codex/server/')) return 'Server';
  if (p.startsWith('src/hooks/')) return 'Hooks';
  if (p.startsWith('src/')) return 'UI';
  return 'Unknown';
}

// ---------- Phase 9: build ledger ----------
const denom = ALL.filter(inDenominator);
const ledger = [];
for (const p of denom) {
  const ib = inbound.get(p) || new Map();
  const count = k => [...ib.values()].filter(v => v === k).length;
  const directTestFiles = [...ib.entries()].filter(([f, k]) => k === 'TEST').map(([f]) => f);
  ledger.push({
    module: p,
    layer: layerOf(p),
    git: dirtySet.has(p) ? 'DIRTY' : 'clean',
    production: prodReach.has(p),
    directTest: directTestFiles.length,
    transitiveTest: testReach.has(p) && directTestFiles.length === 0,
    productionInbound: count('PRODUCTION'),
    researchInbound: count('RESEARCH'),
    diagnosticInbound: count('DIAGNOSTIC'),
    state: deriveState(p),
  });
}

const byState = {};
for (const r of ledger) byState[r.state] = (byState[r.state] || 0) + 1;

const report = {
  frozenHead: execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim(),
  denominatorModules: denom.length,
  testSeedFiles: testSeeds.length,
  prodSeedFiles: prodSeeds.length,
  testReachSize: testReach.size,
  prodReachSize: prodReach.size,
  stateDistribution: byState,
  ledger,
};

const outPath = path.join(ROOT, 'docs/superpowers/evidence/consumer-coverage-ledger.json');
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, ledger: `[${ledger.length} rows -> ${outPath}]` }, null, 2));
