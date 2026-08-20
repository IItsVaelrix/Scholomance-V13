#!/usr/bin/env node
/**
 * F1 — POPULARITY FALSIFIER (degree-preserving KIND shuffle)
 *
 * semantic-chemistry-skill §5: "Shuffle the participating structures while preserving
 * degree/count. If it performs no better than the shuffled control, it is not carrying
 * structure." §17: interpret against a MATCHED control, and report R_excess.
 *
 * The original falsifier 1 offered as evidence: "254 modules have zero direct tests yet
 * are TRANSITIVELY_EXERCISED, not deficient." That cannot fail — `transitiveTest` is
 * DEFINED as `testReach && directTest === 0`. It restates the state machine.
 *
 * The real question is whether module state is a function of inbound DEGREE (popularity)
 * or of consumer KIND (the cell's actual claim). So: hold the import graph and every
 * node's degree EXACTLY fixed, and permute which files are TEST / PRODUCTION / RESEARCH /
 * DIAGNOSTIC, preserving the count of each. Also permute which files are production
 * seeds, preserving that count. Then rebuild every state.
 *
 * If the state distribution survives the shuffle, the cell reads shape, not kind.
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
const SEEDS = Number(process.env.SHUFFLE_SEEDS || 20);
const BASE_SEED = Number(process.env.BASE_SEED || 20260819);

function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function shuffle(arr, r) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

function walk(dir, out) {
  let entries; try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) { if (SKIP_DIRS.has(e.name)) continue; const full = path.join(dir, e.name); if (e.isDirectory()) walk(full, out); else if (e.isFile() && LOGIC_EXT.test(e.name)) out.push(full); }
}
const absFiles = []; for (const top of ['codex', 'src', 'tests', 'scripts']) walk(path.join(ROOT, top), absFiles);
const ALL = absFiles.map(a => path.relative(ROOT, a).replace(/\\/g, '/'));
const fileSet = new Set(ALL);

const TEST_RE = /(\.test\.|\.spec\.)/;
const DIAG_RE = /(^|\/)_diag|codex\/core\/diagnostic/;
const RESEARCH_RE = /(^|\/)_shot|(^|\/)scripts\/.*(census|simulation|observe|probe|ablation|sweep|experiment|harness|waterfall|rebuild|calibrat)/i;
function trueKind(p) {
  if (TEST_RE.test(p) || p.startsWith('tests/')) return 'TEST';
  if (DIAG_RE.test(p)) return 'DIAGNOSTIC';
  if (p.startsWith('scripts/') || RESEARCH_RE.test(p)) return 'RESEARCH';
  if (p.startsWith('codex/') || p.startsWith('src/')) return 'PRODUCTION';
  return 'OTHER';
}
function resolveSpec(fromFile, spec) {
  if (!spec.startsWith('.')) return null;
  const cand = path.normalize(path.join(path.dirname(fromFile), spec)).replace(/\\/g, '/');
  for (const t of [cand, cand + '.js', cand + '.jsx', cand + '.ts', cand + '.tsx', cand + '.mjs', cand + '/index.js', cand + '/index.jsx', cand + '/index.ts']) if (fileSet.has(t)) return t;
  return null;
}
const IMPORT_RE = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|require\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s*['"]([^'"]+)['"]/g;
const edges = new Map();
for (const f of ALL) {
  let s = ''; try { s = fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch { continue; }
  const outs = new Set(); let m; IMPORT_RE.lastIndex = 0;
  while ((m = IMPORT_RE.exec(s)) !== null) { const spec = m[1] || m[2] || m[3] || m[4]; if (!spec) continue; const to = resolveSpec(f, spec); if (to && to !== f) outs.add(to); }
  edges.set(f, outs);
}
function forwardReach(seeds) { const seen = new Set(); const st = [...seeds]; while (st.length) { const f = st.pop(); if (seen.has(f)) continue; seen.add(f); for (const t of (edges.get(f) || [])) if (!seen.has(t)) st.push(t); } return seen; }

let dirtySet = new Set();
try {
  for (const line of execSync('git status --porcelain', { cwd: ROOT, maxBuffer: 64e6 }).toString().split('\n')) {
    const mm = line.match(/^..\s+(.+)$/); if (mm) { let p = mm[1].trim(); if (p.includes(' -> ')) p = p.split(' -> ')[1]; dirtySet.add(p.replace(/^"|"$/g, '')); }
  }
} catch { /* git unavailable */ }

function inDenominator(p) {
  if (!LOGIC_EXT.test(p) || TEST_RE.test(p)) return false;
  if (/(^|\/)\.tmp\//.test(p) || /(^|\/)_shot/.test(p) || /(^|\/)_diag/.test(p)) return false;
  return p.startsWith('codex/core/') || p.startsWith('codex/runtime/') ||
    /^src\/hooks\/constellation/.test(p) || (p.startsWith('codex/server/') && /constellation/i.test(p));
}
const DENOM = ALL.filter(inDenominator);

const PROD_SEED_PRED = f => f.startsWith('codex/server/') || f.startsWith('codex/runtime/') || f.startsWith('src/pages/') || f.startsWith('src/hooks/') || /^src\/(App|main|index)\./.test(f);

/** Rebuild every state from a kind assignment + a production seed set. */
function statesUnder(kindFn, prodSeeds) {
  const inbound = new Map();
  for (const [from, tos] of edges) { const k = kindFn(from); for (const to of tos) { if (!inbound.has(to)) inbound.set(to, new Map()); inbound.get(to).set(from, k); } }
  const testReach = forwardReach(ALL.filter(f => kindFn(f) === 'TEST'));
  const prodReach = forwardReach(prodSeeds);
  const dist = {}; let directTested = 0, pinned = 0, expUndecl = 0;
  for (const p of DENOM) {
    let st;
    if (dirtySet.has(p)) st = 'WIP';
    else {
      const ib = inbound.get(p) || new Map();
      const kinds = [...ib.values()];
      const directTest = kinds.some(k => k === 'TEST');
      const prod = prodReach.has(p);
      if (directTest) { st = prod ? 'DIRECTLY_PINNED' : 'EXPERIMENTAL_UNDECLARED'; directTested++; prod ? pinned++ : expUndecl++; }
      else if (testReach.has(p)) st = 'TRANSITIVELY_EXERCISED';
      else if (prod) st = 'PRODUCTION_UNTESTED';
      else if (kinds.length && kinds.every(k => k === 'RESEARCH')) st = 'RESEARCH_ONLY';
      else if (kinds.length && kinds.every(k => k === 'DIAGNOSTIC')) st = 'DIAGNOSTIC_ONLY';
      else st = 'STRANDED';
    }
    dist[st] = (dist[st] || 0) + 1;
  }
  return { dist, directTested, pinned, expUndecl, wiredFraction: directTested ? pinned / directTested : 0 };
}

// ---- observed ----
const observed = statesUnder(trueKind, ALL.filter(PROD_SEED_PRED));

// ---- degree audit: is inbound degree unchanged by the shuffle? (it must be) ----
const degreeOf = new Map();
for (const [, tos] of edges) for (const to of tos) degreeOf.set(to, (degreeOf.get(to) || 0) + 1);
const degreeChecksum = crypto.createHash('sha256').update(DENOM.map(p => `${p}:${degreeOf.get(p) || 0}`).join('\n')).digest('hex').slice(0, 16);

// ---- shuffled controls ----
const kindCounts = {};
for (const f of ALL) kindCounts[trueKind(f)] = (kindCounts[trueKind(f)] || 0) + 1;
const prodSeedCount = ALL.filter(PROD_SEED_PRED).length;

const runs = [];
for (let s = 0; s < SEEDS; s++) {
  const r = rng(BASE_SEED + s * 1013);
  const perm = shuffle(ALL, r);
  const assign = new Map();
  let i = 0;
  for (const [k, n] of Object.entries(kindCounts)) for (let j = 0; j < n; j++) assign.set(perm[i++], k);
  const seedPerm = shuffle(ALL, rng(BASE_SEED + s * 1013 + 5)).slice(0, prodSeedCount);
  runs.push(statesUnder(f => assign.get(f) || 'OTHER', seedPerm));
}
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
const sd = a => { const m = mean(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1 || 1)); };

const states = [...new Set([...Object.keys(observed.dist), ...runs.flatMap(r => Object.keys(r.dist))])];
const perState = {};
for (const st of states) {
  const vals = runs.map(r => r.dist[st] || 0);
  const m = mean(vals), s = sd(vals), o = observed.dist[st] || 0;
  perState[st] = { observed: o, shuffledMean: Number(m.toFixed(1)), shuffledSD: Number(s.toFixed(2)), R_excess: Number((o - m).toFixed(1)), z: s > 1e-9 ? Number(((o - m) / s).toFixed(2)) : null };
}
const wf = runs.map(r => r.wiredFraction);
const wfM = mean(wf), wfS = sd(wf);

const out = {
  falsifier: 'F1 — is module state a function of inbound degree (popularity) or consumer kind?',
  control: 'degree-preserving KIND shuffle: import graph and every inbound degree held EXACTLY fixed; file->kind and file->prodSeed assignments permuted with counts preserved',
  seeds: SEEDS, baseSeed: BASE_SEED,
  denominator: DENOM.length,
  kindCounts, prodSeedCount,
  inboundDegreeChecksum_identicalAcrossAllArms: degreeChecksum,
  perState,
  wiredFraction_DP_over_directTested: {
    observed: Number(observed.wiredFraction.toFixed(4)),
    shuffledMean: Number(wfM.toFixed(4)), shuffledSD: Number(wfS.toFixed(4)),
    R_excess: Number((observed.wiredFraction - wfM).toFixed(4)),
    z: wfS > 1e-9 ? Number(((observed.wiredFraction - wfM) / wfS).toFixed(2)) : null,
  },
  verdict_threshold: 'prereg: |z| > 3 on the DP/EU split for F1 to survive',
};
console.log(JSON.stringify(out, null, 2));
