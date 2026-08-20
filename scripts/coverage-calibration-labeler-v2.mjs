#!/usr/bin/env node
/**
 * INDEPENDENT CALIBRATION LABELER v2 — circularity repair
 *
 * v1 (`coverage-calibration-labeler.mjs`) shared its production seed list, character
 * for character, with the cell it was validating. Per semantic-chemistry-skill §22/§27.3
 * that is circular validation: generator and validator using the same feature yields
 * fake confidence. v1 is left untouched so its 0.854 stays auditable.
 *
 * v2 runs a 2x2 so the shared feature is ISOLATED rather than merely replaced:
 *
 *              seed = PREFIX (cell's)      seed = EXECUTION (orthogonal)
 *   test =
 *   FORWARD    reproduces v1's axis        F2: attributes disagreement to the seed alone
 *   BACKWARD   independent test detection  fully orthogonal validator (§22)
 *
 * EXECUTION seeds are derived from evidence of how the app is actually started —
 * index.html script srcs and package.json launch scripts — never a directory prefix.
 *
 * Also repairs, per prereg 2026-08-19:
 *   §12  RESEARCH_ONLY is a real label here, not folded into STRANDED.
 *   §33  reports `agreement`, not `precision`. No ground truth exists; there is no
 *        positive class; "precision" was a borrowed word with no definition.
 *   §26  directory-clustered bootstrap CI — `codex/core/animation/amp/*` is 7
 *        near-identical modules and is not 7 independent observations.
 *   Adds a RANDOM POPULATION sample alongside the stratified one. The stratified
 *   sample is drawn from the cell's own labels and its agreement does not transfer
 *   to the population.
 *
 * Research/diagnostic. Reads files, prints JSON. Modifies nothing.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOGIC_EXT = /\.(m?[jt]sx?|cjs)$/;
const SKIP_DIRS = new Set(['node_modules', '.git', 'venv', '.venv', '.worktrees', 'dist', 'build', '.next', 'coverage', 'nlp_chatbot', 'Archive']);
const SEED = Number(process.env.CALIB_SEED || 20260819);

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

// deterministic PRNG (mulberry32) — seed is printed (§25)
function rng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

const dirty = new Set();
for (const line of execSync('git status --porcelain', { cwd: ROOT, maxBuffer: 64e6 }).toString().split('\n')) {
  const m = line.match(/^..\s+(.+)$/);
  if (m) { let p = m[1].trim(); if (p.includes(' -> ')) p = p.split(' -> ')[1]; dirty.add(p.replace(/^"|"$/g, '')); }
}

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
const testFiles = ALL.filter(f => kindOf(f) === 'TEST');

// ---------- edges ----------
function resolveSpec(fromFile, spec) {
  if (!spec.startsWith('.')) return null;
  const base = path.dirname(fromFile);
  const cand = path.normalize(path.join(base, spec)).replace(/\\/g, '/');
  for (const t of [cand, cand + '.js', cand + '.jsx', cand + '.ts', cand + '.tsx', cand + '.mjs', cand + '/index.js', cand + '/index.jsx', cand + '/index.ts']) {
    if (fileSet.has(t)) return t;
  }
  return null;
}
const IMPORT_RE = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|require\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s*['"]([^'"]+)['"]/g;
const edges = new Map();
for (const f of ALL) {
  const outs = new Set();
  const s = src.get(f) || '';
  let m; IMPORT_RE.lastIndex = 0;
  while ((m = IMPORT_RE.exec(s)) !== null) {
    const spec = m[1] || m[2] || m[3] || m[4];
    if (!spec) continue;
    const to = resolveSpec(f, spec);
    if (to && to !== f) outs.add(to);
  }
  edges.set(f, outs);
}
function forwardReach(seeds) {
  const seen = new Set(); const st = [...seeds];
  while (st.length) { const f = st.pop(); if (seen.has(f)) continue; seen.add(f); for (const t of (edges.get(f) || [])) if (!seen.has(t)) st.push(t); }
  return seen;
}

// ---------- SEED REGIME A: the cell's prefix list (the shared feature) ----------
const seedsPrefix = ALL.filter(f =>
  f.startsWith('codex/server/') || f.startsWith('codex/runtime/') ||
  f.startsWith('src/pages/') || f.startsWith('src/hooks/') ||
  /^src\/(App|main|index)\./.test(f));

// ---------- SEED REGIME B: execution evidence (orthogonal) ----------
// Nothing here names a source directory. Entries are read off how the app boots.
const execProvenance = [];
const seedsExecSet = new Set();
function addSeed(p, why) { if (p && fileSet.has(p) && !seedsExecSet.has(p)) { seedsExecSet.add(p); execProvenance.push({ file: p, evidence: why }); } }
// (a) browser entry: <script src="..."> in every root html
for (const html of fs.readdirSync(ROOT).filter(f => f.endsWith('.html'))) {
  const s = fs.readFileSync(path.join(ROOT, html), 'utf8');
  for (const m of s.matchAll(/<script[^>]*\ssrc\s*=\s*["']([^"']+)["']/g)) {
    const rel = m[1].replace(/^\//, '');
    for (const t of [rel, rel + '.js', rel + '.jsx']) if (fileSet.has(t)) addSeed(t, `${html} <script src>`);
  }
}
// (b) server/runtime entry: files a launch script executes
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const LAUNCH = /^(dev|start|serve|preview)(:|$)/;
for (const [name, cmd] of Object.entries(pkg.scripts || {})) {
  if (!LAUNCH.test(name)) continue;
  for (const m of String(cmd).matchAll(/\b(?:node|tsx|ts-node)\s+((?:--[^\s]+\s+)*)([\w./@-]+\.(?:m?[jt]sx?|cjs))/g)) {
    addSeed(m[2].replace(/^\.\//, ''), `package.json scripts.${name}`);
  }
}
const seedsExec = [...seedsExecSet];

const reachPrefix = forwardReach(seedsPrefix);
const reachExec = forwardReach(seedsExec);
const testReach = forwardReach(testFiles);

// ---------- TEST DETECTION A: forward (cell's) ----------
const directTestFwd = new Set();
for (const tf of testFiles) for (const to of (edges.get(tf) || [])) directTestFwd.add(to);

// ---------- TEST DETECTION B: backward grep, IMPORT CONTEXT REQUIRED ----------
// v1 used `source.includes(targetPath)`, which matched a bare string literal:
// tests/pb-sani/classify.test.js:193 passes 'codex/core/combat.session.js' as an
// ARGUMENT to classifySymbol. That is test data, not an import. Requiring import
// context keeps the method independent (text search, not resolution) without the bug.
const importCtxCache = new Map();
function directTestBwd(target) {
  if (importCtxCache.has(target)) return importCtxCache.get(target);
  const base = path.basename(target).replace(/\.[^.]+$/, '');
  const reFull = new RegExp(`(?:from|import|require\\s*\\()\\s*['"][^'"]*${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`);
  const reBase = new RegExp(`(?:from|import|require\\s*\\()\\s*['"][^'"]*\\/${base}\\.(?:m?[jt]sx?|cjs)['"]`);
  let hit = false;
  for (const tf of testFiles) {
    const s = src.get(tf) || '';
    if (!s.includes(base)) continue;
    if (reFull.test(s) || reBase.test(s)) { hit = true; break; }
  }
  importCtxCache.set(target, hit);
  return hit;
}

// ---------- label ----------
const inboundKinds = new Map();
for (const [from, tos] of edges) { const k = kindOf(from); for (const to of tos) { if (!inboundKinds.has(to)) inboundKinds.set(to, new Set()); inboundKinds.get(to).add(k); } }

function label(p, { seedReach, hasDirectTest }) {
  if (dirty.has(p)) return 'WIP';
  const kinds = inboundKinds.get(p) || new Set();
  const prod = seedReach.has(p);
  if (hasDirectTest) return prod ? 'DIRECTLY_PINNED' : 'EXPERIMENTAL_UNDECLARED';
  if (testReach.has(p)) return 'TRANSITIVELY_EXERCISED';
  if (prod) return 'PRODUCTION_UNTESTED';
  if (kinds.size > 0 && [...kinds].every(k => k === 'RESEARCH')) return 'RESEARCH_ONLY';   // §12
  if (kinds.size > 0 && [...kinds].every(k => k === 'DIAGNOSTIC')) return 'DIAGNOSTIC_ONLY';
  return 'STRANDED';
}

const ledger = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/superpowers/evidence/consumer-coverage-ledger.json'), 'utf8')).ledger;
const cellOf = new Map(ledger.map(r => [r.module, r.state]));

// ---------- samples ----------
const byState = {};
for (const r of ledger) (byState[r.state] = byState[r.state] || []).push(r);
const quota = { DIRECTLY_PINNED: 8, TRANSITIVELY_EXERCISED: 8, EXPERIMENTAL_UNDECLARED: 7, STRANDED: 7, WIP: 6, RESEARCH_ONLY: 3, PRODUCTION_UNTESTED: 2 };
const stratified = [];
for (const [st, n] of Object.entries(quota)) {
  const arr = byState[st] || [];
  for (let i = 0; i < n && i < arr.length; i++) stratified.push(arr[Math.floor(i * arr.length / n)]);
}
const rnd = rng(SEED);
const shuffled = ledger.slice();
for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
const population = shuffled.slice(0, 120);

const ARMS = {
  'prefix+forward':  { seedReach: reachPrefix, direct: m => directTestFwd.has(m) },
  'exec+forward':    { seedReach: reachExec,   direct: m => directTestFwd.has(m) },
  'prefix+backward': { seedReach: reachPrefix, direct: m => directTestBwd(m) },
  'exec+backward':   { seedReach: reachExec,   direct: m => directTestBwd(m) },
};

function evaluate(sample, armName) {
  const arm = ARMS[armName];
  const rows = sample.map(r => {
    const indep = label(r.module, { seedReach: arm.seedReach, hasDirectTest: arm.direct(r.module) });
    return { module: r.module, dir: path.dirname(r.module), cell: r.state, indep, match: indep === r.state };
  });
  const agree = rows.filter(r => r.match).length;
  // §26 cluster bootstrap by directory
  const dirs = [...new Set(rows.map(r => r.dir))];
  const byDir = new Map(dirs.map(d => [d, rows.filter(r => r.dir === d)]));
  const br = rng(SEED + 7);
  const boots = [];
  for (let b = 0; b < 2000; b++) {
    let n = 0, k = 0;
    for (let i = 0; i < dirs.length; i++) { const pick = byDir.get(dirs[Math.floor(br() * dirs.length)]); n += pick.length; k += pick.filter(r => r.match).length; }
    boots.push(k / n);
  }
  boots.sort((a, b) => a - b);
  return {
    n: rows.length, agree,
    agreement: Number((agree / rows.length).toFixed(3)),
    clusters: dirs.length,
    clusteredCI95: [Number(boots[50].toFixed(3)), Number(boots[1949].toFixed(3))],
    disagreements: rows.filter(r => !r.match).map(({ module, cell, indep }) => ({ module, cell, indep })),
  };
}

// production-axis-only agreement (F2): does the module land on the live path?
function prodAxis(sample, seedReach) {
  let agree = 0;
  for (const r of sample) {
    const cellProd = ledger.find(x => x.module === r.module).production;
    if (seedReach.has(r.module) === cellProd) agree++;
  }
  return { n: sample.length, agree, agreement: Number((agree / sample.length).toFixed(3)) };
}

const out = {
  seed: SEED,
  frozenHead: execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim(),
  denominator: ledger.length,
  seedRegimes: {
    prefix: { n: seedsPrefix.length, reach: reachPrefix.size, note: "the cell's own list — shared feature, NOT independent" },
    execution: { n: seedsExec.length, reach: reachExec.size, provenance: execProvenance },
  },
  stratifiedSample: Object.fromEntries(Object.keys(ARMS).map(a => [a, evaluate(stratified, a)])),
  populationSample: Object.fromEntries(Object.keys(ARMS).map(a => [a, evaluate(population, a)])),
  F2_productionAxisOnly: {
    prefixSeeds: prodAxis(population, reachPrefix),
    execSeeds: prodAxis(population, reachExec),
  },
  F3_audition: ALL.filter(f => /constellation\/audition\//.test(f) && cellOf.has(f))
    .map(f => ({ module: f, cellProduction: ledger.find(x => x.module === f).production, execReachLive: reachExec.has(f) })),
  checksum: null,
};
out.checksum = crypto.createHash('sha256').update(JSON.stringify(out)).digest('hex').slice(0, 16);
console.log(JSON.stringify(out, null, 2));
