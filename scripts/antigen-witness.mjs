#!/usr/bin/env node
/**
 * ANTIGEN WITNESS — the edge that makes a hunted antigen provable.
 *
 * `antigen-sweep` reports that cleri-probe *believes* a site is sick. Belief is
 * the same currency that produced a 16/16 mutation score against a self-authored
 * mutant set, and that number measured nothing but its author's imagination.
 *
 * A witness is the currency that is not belief: break the cited line, run the
 * tests that cover it, and let the suite answer. Nobody's judgement is consulted.
 *
 *   WITNESSED   — baseline green, and the tests still pass with the site broken.
 *                 The surviving mutant IS the witness: a concrete artifact the
 *                 repair must kill. Hand it to an agent as raw material.
 *   PROTECTED   — every mutant died. The finding is already covered; the antigen
 *                 is a scar, not a wound. This is the arm that disproves.
 *   INCONCLUSIVE— no test covers the file, nothing was mutable, the baseline was
 *                 already red, or a run blew up. NEVER read this as clean.
 *
 * The last line is the whole discipline, inherited from antigen-sweep: a sweep
 * that cannot prove it looked does not get to say it found nothing. A verdict is
 * only allowed to read as "fine" when a green baseline killed a real mutant.
 *
 * The mutations are deliberately syntactic. They understand nothing about the
 * code, which is the point — a meaning-agnostic rewrite cannot share the blind
 * spot of whoever wrote the rule, and cannot be argued with afterwards.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '../..');

export const VERDICT = {
  WITNESSED: 'WITNESSED',
  PROTECTED: 'PROTECTED',
  INCONCLUSIVE: 'INCONCLUSIVE',
};

/** Index of the `)` closing the `(` at `open`, or -1. */
function matchParen(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '(') depth += 1;
    else if (text[i] === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

const JS_EXT = /\.(m?js|cjs|ts|jsx|tsx)$/;
const PY_EXT = /\.py$/;

/**
 * Which mutation arm a file belongs to, or null when it belongs to neither.
 *
 * Returning null matters: a target this module cannot mutate must reach
 * `adjudicate` as INCONCLUSIVE, never as a quiet PROTECTED. A verdict is only
 * allowed to read as fine when a green baseline killed a real mutant, and a
 * language nobody wrote mutations for cannot produce one.
 */
export function languageOf(path) {
  if (PY_EXT.test(path)) return 'python';
  if (JS_EXT.test(path)) return 'javascript';
  return null;
}

/**
 * Python rewrites. Same discipline as the JS arm and deliberately the same four
 * families — neutralize a guard, delete a rejection, widen a predicate, flip a
 * comparison — so a verdict means the same thing in both languages.
 *
 * A mutant that fails to parse is a mutant that dies, which pushes a verdict
 * toward PROTECTED. That is the safe direction: this module may under-report an
 * unprotected site, but it must never report a protected one it never broke.
 */
function pythonMutations(line, lineNumber) {
  const out = [];
  const indent = line.match(/^\s*/)[0];
  const push = (label, mutated) => {
    if (mutated !== line && mutated.startsWith(indent)) out.push({ label, mutated, line: lineNumber });
  };

  // 1. Neutralize a guard. Non-greedy to the first colon: a dict literal in the
  //    condition would mis-split, and the mutant then fails to parse and dies.
  const guard = line.match(/^(\s*)(if|elif)\s+(.+?):(.*)$/);
  if (guard) push('guard-never-fires', `${guard[1]}${guard[2]} False:${guard[4]}`);

  // 2. Delete a rejection path.
  if (/^\s*raise\b/.test(line)) push('raise-removed', `${indent}pass`);

  // 3. Make a predicate accept everything. A bare `return` carries no
  //    expression, so it is left alone rather than given one.
  if (/^\s*return\s+\S/.test(line)) push('predicate-accepts-all', `${indent}return True`);

  // 4. Flip a comparison.
  for (const [from, to] of [['==', '!='], ['!=', '=='], ['>=', '<'], ['<=', '>']]) {
    if (line.includes(from)) { push(`flip ${from}`, line.replace(from, to)); break; }
  }

  return out;
}

/**
 * Deterministic single-line rewrites. Returns `[]` rather than inventing a
 * mutation it cannot justify — a fabricated witness is worse than none.
 */
export function mutationsFor(line, lineNumber, lang = 'javascript') {
  if (lang === 'python') return pythonMutations(line, lineNumber);
  const out = [];
  const indent = line.match(/^\s*/)[0];
  const push = (label, mutated) => {
    if (mutated !== line && mutated.startsWith(indent)) out.push({ label, mutated, line: lineNumber });
  };

  // 1. Neutralize a guard: whatever it protects can now never fire.
  const ifAt = line.search(/\bif\s*\(/);
  if (ifAt !== -1) {
    const open = line.indexOf('(', ifAt);
    const close = matchParen(line, open);
    if (close !== -1) push('guard-never-fires', `${line.slice(0, open + 1)}false${line.slice(close)}`);
  }

  // 2. Delete a rejection path.
  if (/\bthrow\b/.test(line)) push('throw-removed', line.replace(/\bthrow\b[^;]*/, 'void 0'));

  // 3. Make a predicate accept everything. `return;` carries no expression, so
  //    it is left alone rather than given one.
  if (/\breturn\s+[^;]+;/.test(line)) push('predicate-accepts-all', line.replace(/\breturn\s+[^;]+;/, 'return true;'));

  // 4. Flip a comparison.
  for (const [from, to] of [['===', '!=='], ['!==', '==='], ['>=', '<'], ['<=', '>']]) {
    if (line.includes(from)) { push(`flip ${from}`, line.replace(from, to)); break; }
  }

  return out;
}

/**
 * Turn run results into a verdict. Structured so that PROTECTED is unreachable
 * without a green baseline AND at least one killed mutant.
 */
export function adjudicate({ baseline, mutants = [] }) {
  if (!baseline?.passed) {
    return { verdict: VERDICT.INCONCLUSIVE, why: 'baseline was already red — the control failed, so nothing downstream means anything' };
  }
  if (mutants.length === 0) {
    return { verdict: VERDICT.INCONCLUSIVE, why: 'nothing at the cited line could be mutated — never asked, not clean' };
  }
  const survivor = mutants.find((m) => m.result?.passed);
  if (survivor) {
    return { verdict: VERDICT.WITNESSED, witness: survivor, why: `tests pass with the site broken (${survivor.label})` };
  }
  return { verdict: VERDICT.PROTECTED, killed: mutants.length, why: `all ${mutants.length} mutants died — the site is covered` };
}

/** Every directory named `tests`, so a package's suite is found where it lives. */
function testRoots(root) {
  const found = [];
  const walk = (dir, depth) => {
    if (depth > 3) return;
    let entries;
    try { entries = readdirSync(dir); } catch { return; }
    for (const name of entries) {
      if (name === 'node_modules' || name.startsWith('.')) continue;
      const full = join(dir, name);
      let st;
      try { st = statSync(full); } catch { continue; }
      if (!st.isDirectory()) continue;
      if (name === 'tests') found.push(full);
      else walk(full, depth + 1);
    }
  };
  if (existsSync(join(root, 'tests'))) found.push(join(root, 'tests'));
  walk(root, 0);
  return [...new Set(found)];
}

/** Test files that import the module under test, by specifier basename. */
export function selectTests(path, root = ROOT) {
  const lang = languageOf(path);
  if (!lang) return [];
  const target = basename(path).replace(JS_EXT, '').replace(PY_EXT, '');
  const isTestFile = lang === 'python'
    ? (name) => /^test_.*\.py$/.test(name)
    : (name) => /\.(test|spec)\.(m?js|ts|jsx|tsx)$/.test(name);
  // Python imports by dotted module name, JS by path specifier. Matching the
  // wrong shape is how a suite that covers the target reads as "no test file".
  const importsTarget = lang === 'python'
    ? (text) => new RegExp(`\\b${target}\\b`).test(text)
    : (text) => text.includes(`/${target}.`) || text.includes(`/${target}'`) || text.includes(`/${target}"`);

  const hits = [];
  for (const dir of testRoots(root)) {
    const walk = (d) => {
      let entries;
      try { entries = readdirSync(d); } catch { return; }
      for (const name of entries) {
        const full = join(d, name);
        let st;
        try { st = statSync(full); } catch { continue; }
        if (st.isDirectory()) { if (name !== 'node_modules' && name !== '__pycache__') walk(full); continue; }
        if (!isTestFile(name)) continue;
        let text;
        try { text = readFileSync(full, 'utf8'); } catch { continue; }
        if (importsTarget(text)) hits.push(relative(root, full));
      }
    };
    walk(dir);
  }
  return [...new Set(hits)].sort();
}

/**
 * The interpreter that can actually import the suite. divtube keeps its own
 * venv and the system python has no pytest, so running the wrong one turns a
 * covered module into a red baseline — INCONCLUSIVE for a reason that is about
 * this machine rather than about the code.
 */
function pythonBin(root, cwd) {
  for (const candidate of [join(cwd, '.venv/bin/python'), join(root, '.venv/bin/python')]) {
    if (existsSync(candidate)) return candidate;
  }
  return 'python3';
}

/**
 * pytest resolves imports from its working directory, so a suite under
 * `<pkg>/tests/` must run from `<pkg>`, not from the repo root.
 */
function pytestCwd(root, tests) {
  const first = tests[0] ?? '';
  const idx = first.indexOf('/tests/');
  return idx === -1 ? root : join(root, first.slice(0, idx));
}

/** Run the suite. Any non-zero exit is a red run, in either language. */
export function runTests(tests, _kind, { root = ROOT, timeout = 240_000, lang = 'javascript' } = {}) {
  try {
    if (lang === 'python') {
      const cwd = pytestCwd(root, tests);
      const rel = tests.map((t) => relative(cwd, join(root, t)));
      execFileSync(pythonBin(root, cwd), ['-m', 'pytest', '-q', ...rel],
        { cwd, encoding: 'utf8', timeout, stdio: 'ignore' });
      return { passed: true };
    }
    execFileSync('npx', ['vitest', 'run', ...tests, '--maxWorkers=2'],
      { cwd: root, encoding: 'utf8', timeout, stdio: 'ignore' });
    return { passed: true };
  } catch (error) {
    return { passed: false, signal: error.signal ?? null };
  }
}

/**
 * Witness one finding. Every dependency is injected so the adjudication logic is
 * testable without spawning a suite — and so the restore path can be proven.
 */
export async function witnessFinding(finding, deps = {}) {
  const {
    readSource = (p) => readFileSync(join(ROOT, p), 'utf8'),
    writeSource = (p, text) => writeFileSync(join(ROOT, p), text),
    selectTests: pick = selectTests,
    runTests: run = runTests,
  } = deps;

  const lang = languageOf(finding.path);
  if (!lang) {
    return { ...finding, verdict: VERDICT.INCONCLUSIVE, why: `no mutation arm for ${finding.path} — never asked, not clean` };
  }

  const tests = pick(finding.path);
  if (!tests || tests.length === 0) {
    return { ...finding, verdict: VERDICT.INCONCLUSIVE, why: 'no test file imports this module — unprotected or untestable, cannot tell which' };
  }

  const baseline = await run(tests, 'baseline', { lang });
  if (!baseline?.passed) return { ...finding, tests, ...adjudicate({ baseline, mutants: [] }) };

  const original = readSource(finding.path);
  const lines = original.split('\n');
  const target = lines[finding.line - 1];
  const candidates = target === undefined ? [] : mutationsFor(target, finding.line, lang);
  if (candidates.length === 0) {
    return { ...finding, tests, ...adjudicate({ baseline, mutants: [] }) };
  }

  const mutants = [];
  try {
    for (const candidate of candidates) {
      const patched = [...lines];
      patched[finding.line - 1] = candidate.mutated;
      writeSource(finding.path, patched.join('\n'));
      let result;
      try { result = await run(tests, 'mutant', { lang }); }
      catch (error) { result = { passed: false, error: String(error.message).slice(0, 80) }; }
      mutants.push({ ...candidate, result });
      if (result?.passed) break; // one surviving mutant is a sufficient witness
    }
  } finally {
    writeSource(finding.path, original);
  }

  return { ...finding, lang, tests, ...adjudicate({ baseline, mutants }) };
}

/** Witness a whole sweep summary in place, returning a tallied copy. */
export async function witnessSweep(summary, deps = {}) {
  const tally = { [VERDICT.WITNESSED]: 0, [VERDICT.PROTECTED]: 0, [VERDICT.INCONCLUSIVE]: 0 };
  const results = [];
  for (const entry of summary.results ?? []) {
    const findings = [];
    for (const finding of entry.findings ?? []) {
      if (!finding.path || !finding.line) {
        tally[VERDICT.INCONCLUSIVE] += 1;
        findings.push({ ...finding, verdict: VERDICT.INCONCLUSIVE, why: 'finding carries no path/line to break' });
        continue;
      }
      const judged = await witnessFinding(finding, deps);
      tally[judged.verdict] += 1;
      findings.push(judged);
    }
    results.push({ ...entry, findings });
  }
  return { ...summary, results, witnessTally: tally };
}

async function main() {
  const inIndex = process.argv.indexOf('--sweep');
  if (inIndex === -1) {
    console.error('usage: antigen-witness.mjs --sweep <sweep.json> [--output <out.json>]');
    process.exit(2);
  }
  const summary = JSON.parse(readFileSync(process.argv[inIndex + 1], 'utf8'));
  const judged = await witnessSweep(summary);

  console.log('\n════ ANTIGEN WITNESS ════');
  console.log(`WITNESSED    : ${judged.witnessTally.WITNESSED}  (broken on purpose, suite did not notice — raw material for a rule)`);
  console.log(`PROTECTED    : ${judged.witnessTally.PROTECTED}  (mutants died; the finding is already covered)`);
  console.log(`INCONCLUSIVE : ${judged.witnessTally.INCONCLUSIVE}  (never asked — NOT clean)`);

  const outIndex = process.argv.indexOf('--output');
  if (outIndex !== -1 && process.argv[outIndex + 1]) {
    writeFileSync(process.argv[outIndex + 1], `${JSON.stringify(judged, null, 2)}\n`);
    console.log(`written → ${process.argv[outIndex + 1]}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
