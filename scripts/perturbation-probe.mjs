#!/usr/bin/env node
/**
 * PERTURBATION PROBE — a dye with no opinion about meaning.
 *
 * ─── WHY THIS EXISTS, AND WHY THE OBVIOUS VERSION FAILED ────────────────────
 *
 * The first dye was made of MEANING: an English hypothesis, vectorized, scored
 * against every file by resemblance. It could only ever rank by "how much do you
 * look like what I meant" — and a FIX resembles the meaning of its bug more than
 * anything else in the codebase, because it is written about the same subject in
 * the same words. Measured, and recorded in `prion-library.js`: it preferred a
 * correct rethrow at 42.4% to a swallowed catch at 0.1%. It hunted the cure and
 * reported it as the disease.
 *
 * That is not a threshold problem. Resemblance cannot separate a thing from its
 * opposite when both are made of the same words:
 *
 *     catch (e) { }                              the bug
 *     catch (e) { throw new BytecodeError(e); }  the fix
 *
 * This dye carries no vocabulary, no hypothesis, and no opinion. It CHANGES a
 * site and observes whether anything reacts:
 *
 *     delete the bug  -> nothing reacts
 *     delete the fix  -> something fails
 *
 * Identical shape. Opposite reactions. The reagent never had to know what an
 * error is.
 *
 * ─── THE PHOSPHORYLATION MODEL, AND WHY THE FIRST VERSION NEEDED IT ─────────
 *
 * Version one reported three verdicts — SILENT, REACTED, INVALID — and admitted
 * in its own docblock that SILENT was three unrelated findings in one bucket:
 * dead code, unwatched code, or a live prion, with no way to tell which. It also
 * had no control. Run against `phoneme.engine.js` it scored site after site as
 * REACTED on the strength of 27 test failures that were already there before any
 * mutation was applied, crediting the suite with catching things it had never
 * looked at. A mutation probe with no baseline is a false-negative machine.
 *
 * `codex/core/pixelbrain/qbit-phosphorylation.js` had already solved this shape.
 * A kinase never returns a bare false. It checks that a substrate EXISTS before
 * attempting the reaction, names its refusals, scores what it does commit, and
 * commits only above a threshold:
 *
 *     MISSING_SUBSTRATE   there is nothing here to react with
 *     INVALID_REACTION    the reagent produced nonsense
 *     LOW_CONFIDENCE      it reacted, but too weakly to commit
 *     committed           it took
 *
 * Every one of those has an exact meaning here, and together they dissolve the
 * SILENT bucket:
 *
 *   MISSING_SUBSTRATE  the mutated line never executed under any observer, so
 *                      no experiment was possible. Silence was never evidence
 *                      about watching. Measured with v8 coverage, not guessed.
 *   INVALID_REACTION   the mutation does not parse, or a suite failed to load.
 *   REACTED            a test failed that was NOT already failing at baseline.
 *   LOW_CONFIDENCE     reached and unnoticed, but too shallowly to rank.
 *   COMMITTED          reached, mutated, and nobody noticed. A prion candidate.
 *
 * And `confidence = 0.5 + 0.5 * depth` carries over literally. In the pixel
 * kinase, depth is how far inside the shape a cell sits; the rim scores 0.5 and
 * COLLAPSE_THRESHOLD 0.51 excludes it. Here depth is how deeply the site sits
 * inside the EXECUTED region — a line that forty tests run and none of them
 * notice is a far stronger signal than a line one test grazes. Same law: the rim
 * does not commit.
 *
 * ─── WHAT A COMMITTED SITE STILL DOES NOT PROVE ─────────────────────────────
 *
 * That it ran, changed, and no test complained. It is not automatically a bug —
 * the behaviour may be genuinely unobservable, or observed only in production.
 * THE PROBE REPORTS; A HUMAN JUDGES — the same law as `autoFixAvailable: false`.
 *
 * ─── IT NEVER TOUCHES YOUR TREE ─────────────────────────────────────────────
 *
 * Mutations are applied inside a throwaway git worktree, never in place. The
 * first version rewrote the real file and restored it in a `finally`, which is
 * fine until the process is killed — and when that happened, it left
 * `phoneme.engine.js` mutated on disk. An instrument that can corrupt the tree
 * when interrupted is not safe to run, whatever its finally block promises.
 *
 * Usage:
 *   node scripts/perturbation-probe.mjs --file <path> --tests <vitest path> [--limit N] [--out report.json]
 *   node scripts/perturbation-probe.mjs --file <path> --tests <a> --tests <b> --only 54,77,91
 *
 * `--tests` may be repeated: a site commits only if NO named observer reacts.
 * `--only` re-probes named lines, which is how you widen the observer on the
 * committed sites of an earlier run.
 * `--threshold` raises the bar for committing (default 0.51, the rim).
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';

const traverse = typeof _traverse === 'function' ? _traverse : _traverse.default;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The rim. Mirrors COLLAPSE_THRESHOLD in `qbit-phosphorylation.js`: confidence
 * runs [0.5, 1.0], and 0.51 excludes only the shallowest possible site. Raise it
 * to reject sites that are barely executed.
 */
const COLLAPSE_THRESHOLD = 0.51;

const argOf = (flag, fallback = null) => {
  const index = process.argv.indexOf(flag);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
};

/** Every occurrence of a repeatable flag, in order. */
const argsOf = (flag) =>
  process.argv.reduce((values, token, index) => {
    if (token === flag && process.argv[index + 1]) values.push(process.argv[index + 1]);
    return values;
  }, []);

/**
 * The operators. Each is a small, reversible lie told to one site.
 *
 * They are chosen for THIS repository's signature disease — silent fallback and
 * checks that cannot fail — not for general mutation coverage. `returnNull` asks
 * "what if this answered nothing?"; `invertGuard` asks "what if this branch went
 * the other way?" A codebase that notices neither is not being watched.
 */
const OPERATORS = Object.freeze({
  returnNull: {
    describe: () => 'return null',
    collect(ast) {
      const sites = [];
      traverse(ast, {
        ReturnStatement(nodePath) {
          const argument = nodePath.node.argument;
          if (!argument) return;                                   // `return;` is already nothing
          if (argument.type === 'NullLiteral') return;             // already null
          sites.push({ start: argument.start, end: argument.end, line: argument.loc.start.line });
        },
      });
      return sites;
    },
    apply: (source, site) => `${source.slice(0, site.start)}null${source.slice(site.end)}`,
  },
  invertGuard: {
    describe: () => 'invert the condition',
    collect(ast) {
      const sites = [];
      traverse(ast, {
        IfStatement(nodePath) {
          const test = nodePath.node.test;
          sites.push({ start: test.start, end: test.end, line: test.loc.start.line });
        },
      });
      return sites;
    },
    apply: (source, site) =>
      `${source.slice(0, site.start)}!(${source.slice(site.start, site.end)})${source.slice(site.end)}`,
  },
});

function parseSource(source) {
  return parse(source, {
    sourceType: 'unambiguous',
    plugins: ['typescript', 'jsx', 'classProperties', 'optionalChaining', 'topLevelAwait', 'decorators-legacy'],
  });
}

/**
 * Runs one observer and returns the SET of failing tests by full name.
 *
 * Names rather than counts, because a mutation that breaks one test while
 * happening to fix another leaves the count unchanged, and a probe that reads
 * that as silence is lying about the one it broke.
 */
function runObserver(testTarget, cwd, { coverageFor = null, scratch }) {
  const reportPath = path.join(scratch, 'report.json');
  const coverageDir = path.join(scratch, 'coverage');
  const args = ['vitest', 'run', testTarget, '--silent', '--reporter=json', `--outputFile=${reportPath}`];
  if (coverageFor) {
    args.push('--coverage', '--coverage.provider=v8', '--coverage.reporter=json',
      `--coverage.include=${coverageFor}`, `--coverage.reportsDirectory=${coverageDir}`);
  }

  let launchError = null;
  try {
    execFileSync('npx', args, { cwd, encoding: 'utf8', stdio: 'pipe', timeout: 900_000 });
  } catch (error) {
    // A non-zero exit is the NORMAL case when tests fail; the report still gets
    // written. Only the absence of a report means the suite never ran.
    launchError = `${error.stdout ?? ''}${error.stderr ?? ''}`;
  }

  if (!existsSync(reportPath)) {
    return { loaded: false, why: `${testTarget}: suite produced no report — invalid experiment`, failed: new Set() };
  }

  let report;
  try {
    report = JSON.parse(readFileSync(reportPath, 'utf8'));
  } catch {
    return { loaded: false, why: `${testTarget}: unreadable report — invalid experiment`, failed: new Set() };
  }

  const failed = new Set();
  for (const suite of report.testResults ?? []) {
    for (const assertion of suite.assertionResults ?? []) {
      if (assertion.status === 'failed') failed.add(`${testTarget} :: ${assertion.fullName}`);
    }
  }

  // A suite that collapsed on import reports zero tests, which would otherwise
  // read as a clean pass and make every later silence look meaningful.
  if ((report.numTotalTests ?? 0) === 0) {
    return { loaded: false, why: `${testTarget}: ran zero tests — invalid experiment`, failed, launchError };
  }

  const coverage = coverageFor ? readCoverage(coverageDir, coverageFor) : null;
  return { loaded: true, failed, total: report.numTotalTests, coverage };
}

/** Per-line execution counts for the probed file, from the v8 coverage report. */
function readCoverage(coverageDir, relativeFile) {
  const finalPath = path.join(coverageDir, 'coverage-final.json');
  if (!existsSync(finalPath)) return null;
  const map = JSON.parse(readFileSync(finalPath, 'utf8'));
  const key = Object.keys(map).find(candidate => candidate.endsWith(relativeFile));
  if (!key) return null;

  const lineHits = new Map();
  const entry = map[key];
  for (const [id, location] of Object.entries(entry.statementMap ?? {})) {
    const hits = entry.s?.[id] ?? 0;
    const line = location.start.line;
    lineHits.set(line, Math.max(lineHits.get(line) ?? 0, hits));
  }
  return lineHits;
}

/**
 * THE SUBSTRATE CHECK — run before a single mutation is applied.
 *
 * `phosphorylate()` evaluates the SDF and refuses with MISSING_SUBSTRATE before
 * it ever calls the kinase. This is that step: it establishes which tests
 * already fail (so their failure is never counted as a reaction) and which lines
 * actually execute (so an unreached line is never counted as unwatched).
 */
function measureSubstrate(testTargets, cwd, file, scratch) {
  const baseline = new Set();
  const lineHits = new Map();
  const coverageByObserver = new Map();
  const cost = new Map();
  const usable = [];
  const unusable = [];

  for (const target of testTargets) {
    const startedAt = Date.now();
    const result = runObserver(target, cwd, { coverageFor: file, scratch });
    if (!result.loaded) {
      unusable.push(result.why);
      continue;
    }
    usable.push(target);
    // Coverage is kept PER OBSERVER, not merged. An observer that never
    // executes a line cannot react to a change there, so running it would buy a
    // guaranteed silence and then count it as agreement — the same error as
    // treating an unreached line as unwatched, one level up.
    coverageByObserver.set(target, result.coverage ?? new Map());
    cost.set(target, Date.now() - startedAt);
    for (const name of result.failed) baseline.add(name);
    for (const [line, hits] of result.coverage ?? []) {
      lineHits.set(line, Math.max(lineHits.get(line) ?? 0, hits));
    }
    console.log(`  baseline  ${target}: ${result.total} tests, ${result.failed.size} already failing ` +
      `(${((Date.now() - startedAt) / 1000).toFixed(0)}s, ${result.coverage?.size ?? 0} lines reached)`);
  }

  // Cheapest first, so a reaction is found for the least money.
  usable.sort((a, b) => (cost.get(a) ?? 0) - (cost.get(b) ?? 0));

  const unmeasured = usable.filter(target => (coverageByObserver.get(target)?.size ?? 0) === 0);
  const maxHits = Math.max(1, ...lineHits.values());
  return { baseline, lineHits, coverageByObserver, maxHits, usable, unusable, unmeasured };
}

/**
 * The observers that actually execute this line, cheapest first.
 *
 * FAIL-SAFE: an observer that produced no coverage data at all is not gated. It
 * is run for every site, because "we could not measure what this suite touches"
 * and "this suite touches nothing" are different facts, and collapsing them
 * would quietly delete a witness and inflate every COMMITTED verdict.
 *
 * vitest writes no coverage report when a suite has failing tests, so this is
 * the ordinary case for any observer that is not green — not an exotic one.
 */
function witnessesFor(substrate, line) {
  return substrate.usable.filter((target) => {
    const coverage = substrate.coverageByObserver.get(target);
    if (!coverage || coverage.size === 0) return true;          // unmeasured — keep the witness
    return (coverage.get(line) ?? 0) > 0;
  });
}

/**
 * Runs every usable observer against a mutation. A REACTION is a test failing
 * that was not already failing at baseline — shared damage cancels, which is the
 * only reason a dirty suite can still be used as an instrument.
 */
function observe(testTargets, cwd, baseline, scratch) {
  for (const target of testTargets) {
    const result = runObserver(target, cwd, { scratch });
    if (!result.loaded) return { reacted: null, why: result.why };
    const fresh = [...result.failed].filter(name => !baseline.has(name));
    if (fresh.length > 0) {
      return { reacted: true, why: `${fresh.length} new failure(s), e.g. ${fresh[0].slice(0, 90)}` };
    }
  }
  return { reacted: false, why: 'no observer produced a new failure' };
}

function setupWorktree(worktree) {
  // THE WORKING TREE, NOT HEAD.
  //
  // `worktree add --detach <path> HEAD` silently probes the last commit rather
  // than the code on disk, so an uncommitted fix is invisible and the report
  // describes a program you are not running. `git stash create` builds a commit
  // OBJECT from the current working tree and does nothing else — it does not
  // touch the index, the working tree, or the stash list. That makes it the safe
  // primitive here, and the exact opposite of `git stash push`, which would move
  // your changes out from under you.
  //
  // Untracked files are not included; a probe that needs one will say so.
  const snapshot = execFileSync('git', ['stash', 'create'], { cwd: ROOT, encoding: 'utf8' }).trim();
  const base = snapshot || 'HEAD';
  execFileSync('git', ['worktree', 'add', '--detach', worktree, base], { cwd: ROOT, stdio: 'pipe' });
  // The worktree needs the things git does not track but the tests import.
  for (const shared of ['node_modules', 'cache', 'scholomance_dict.sqlite', 'scholomance_corpus.sqlite']) {
    try {
      execFileSync('ln', ['-sfn', path.join(ROOT, shared), path.join(worktree, shared)], { stdio: 'pipe' });
    } catch {
      // A missing optional artifact is not fatal; a test that needs it will say so.
    }
  }
}

function teardownWorktree(worktree) {
  try {
    execFileSync('git', ['worktree', 'remove', '--force', worktree], { cwd: ROOT, stdio: 'pipe' });
  } catch {
    console.error(`could not remove ${worktree}; remove it with: git worktree remove --force ${worktree}`);
  }
}

/**
 * The kinase. Given a site's execution depth and the observers' reaction, names
 * one outcome — and refuses, by name, rather than returning a bare silence.
 */
function phosphorylate({ hits, maxHits, parsed, reaction, threshold, witnessCount, depthMeasured }) {
  // Only an observer we actually measured can prove a line never ran. With an
  // unmeasured observer in the set, zero hits means "not seen by the suites we
  // could measure" — which is not the same claim.
  if (hits === 0 && depthMeasured) {
    return { outcome: 'MISSING_SUBSTRATE', confidence: 0, why: 'the line never executed — no experiment was possible' };
  }
  if (!parsed) {
    return { outcome: 'INVALID_REACTION', confidence: 0, why: 'mutation does not parse' };
  }
  if (reaction.reacted === null) {
    return { outcome: 'INVALID_REACTION', confidence: 0, why: reaction.why };
  }
  if (reaction.reacted === true) {
    return { outcome: 'REACTED', confidence: 0, why: reaction.why };
  }

  if (!depthMeasured) {
    return {
      outcome: 'LOW_CONFIDENCE', confidence: 0.5, hits,
      why: 'unnoticed, but an observer produced no coverage — depth unmeasured, cannot rank',
    };
  }

  // DEPTH IS DIVERGENCE WHEN WE HAVE IT, AND EXECUTION COUNT ONLY AS A FALLBACK.
  //
  // Execution count was the original depth and it is measurably the wrong
  // quantity. Measured on phoneme.engine.js: line 1117 ran 142,435 times and
  // ranked 0.97 — top of the report — while `perturbation-screen.mjs` showed
  // that mutating it changes NO observable output whatsoever. Eight of twelve
  // "nobody noticed" sites were behaviourally inert. Frequency says how often a
  // line is reached; it cannot say whether reaching it matters, so it promoted
  // defensive guards whose fallback branch nothing ever triggers.
  //
  // Divergence answers the question the report is actually asking: how much
  // behaviour moved while nobody noticed. An inert mutation scores 0 and never
  // commits, which is correct — there is nothing there for a test to catch.
  const depth = typeof divergence === 'number'
    ? divergence
    : Math.log1p(hits) / Math.log1p(maxHits);
  const confidence = 0.5 + 0.5 * Math.min(1, depth);
  if (confidence < threshold) {
    return { outcome: 'LOW_CONFIDENCE', confidence, hits, why: `executed ${hits}x — too shallow to rank` };
  }
  return { outcome: 'COMMITTED', confidence, hits, why: `ran ${hits}x, ${witnessCount} observer(s) watched, none noticed` };
}

function main() {
  /**
   * THIS TOOL IS THE HEAVIEST TEST CONSUMER IN THE REPO, so it yields hardest.
   *
   * One mutant is one full `vitest run`, and a real probe is hundreds of them
   * back to back — an hour or more of sustained load. Every other consumer runs
   * a suite and stops; this one never stops. `vite.config.js` already renices
   * each vitest it spawns, but that only takes effect once the child is up:
   * setting it on the probe itself covers the parent, the npx shim, and every
   * child by inheritance, from the first mutant onward.
   *
   * Measured on the dev machine (8-thread shared-TDP APU): an uncapped run took
   * loadavg past 20 and made the desktop unusable while it worked.
   */
  // Says so when it fails. A silent catch here would let an hour-long run take the
  // machine at full priority while the comment above insists it doesn't.
  try {
    os.setPriority(0, 19);
  } catch (error) {
    console.error(`  ! could not lower process priority (${error.message}) — this run will compete with your desktop`);
  }

  const file = argOf('--file');
  const testTargets = argsOf('--tests');
  const limit = Number(argOf('--limit', '40'));
  const threshold = Number(argOf('--threshold', String(COLLAPSE_THRESHOLD)));
  const only = new Set((argOf('--only') ?? '').split(',').filter(Boolean).map(Number));
  const out = argOf('--out');
  if (!file || testTargets.length === 0) {
    console.error('usage: perturbation-probe.mjs --file <path> --tests <vitest path> [--tests <another>] [--limit N] [--only 12,34] [--threshold 0.51] [--out report.json]');
    process.exitCode = 2;
    return;
  }

  const original = readFileSync(path.join(ROOT, file), 'utf8');
  const ast = parseSource(original);
  const sites = [];
  for (const [name, operator] of Object.entries(OPERATORS)) {
    for (const site of operator.collect(ast)) sites.push({ ...site, operator: name });
  }
  sites.sort((a, b) => a.line - b.line || a.start - b.start);

  let chosen;
  if (only.size > 0) {
    chosen = sites.filter(site => only.has(site.line));
    const found = new Set(chosen.map(site => site.line));
    // A requested line that holds no site would otherwise vanish from the
    // report and read as "nothing to say about it", which is not the same fact.
    for (const line of only) {
      if (!found.has(line)) console.error(`  ! line ${line}: no perturbable site here — not probed`);
    }
  } else {
    const stride = Math.max(1, Math.ceil(sites.length / limit));
    chosen = sites.filter((_, index) => index % stride === 0).slice(0, limit);
  }

  const worktree = path.resolve(ROOT, argOf('--worktree', '.perturbation-worktree'));
  const scratch = mkdtempSync(path.join(os.tmpdir(), 'perturb-'));
  console.log(`${file}: ${sites.length} perturbable sites, probing ${chosen.length}`);
  console.log(`observed by: ${testTargets.join(', ')}`);
  console.log(`isolated in: ${path.relative(ROOT, worktree)} (your tree is never written)\n`);

  const results = [];
  let substrate;
  setupWorktree(worktree);
  const target = path.join(worktree, file);
  try {
    console.log('establishing the substrate (unmutated baseline + coverage)...');
    substrate = measureSubstrate(testTargets, worktree, file, scratch);
    for (const why of substrate.unusable) console.error(`  ! ${why}`);
    if (substrate.usable.length === 0) {
      console.error('\nno usable observer — refusing to report silence as evidence.');
      process.exitCode = 1;
      return;
    }
    const reached = [...substrate.lineHits.values()].filter(Boolean).length;
    console.log(`  substrate: ${reached} executed lines, deepest ${substrate.maxHits}x, ` +
      `${substrate.baseline.size} pre-existing failure(s) will be subtracted`);
    if (substrate.unmeasured.length > 0) {
      // vitest emits no coverage report for a suite with failures, so this is
      // the normal consequence of a red observer — and it costs both speed and
      // the ability to rank, which is worth saying out loud rather than burying.
      console.log(`  ! no coverage from: ${substrate.unmeasured.join(', ')} — running them on EVERY site`);
      console.log('    (a red suite writes no coverage report; green the observer to gate and rank)');
    }
    console.log('');

    for (const [index, site] of chosen.entries()) {
      const hits = substrate.lineHits.get(site.line) ?? 0;
      const mutated = OPERATORS[site.operator].apply(original, site);
      let parsed = true;
      try {
        parseSource(mutated);
      } catch {
        parsed = false;
      }

      // Only pay for a test run when there is a substrate AND a valid reagent —
      // and only for the observers that actually execute this line.
      const witnesses = witnessesFor(substrate, site.line);
      let reaction = { reacted: false, why: 'not run' };
      if (hits > 0 && parsed) {
        writeFileSync(target, mutated);
        reaction = observe(witnesses, worktree, substrate.baseline, scratch);
        writeFileSync(target, original);
      }

      const verdict = phosphorylate({
        hits, maxHits: substrate.maxHits, parsed, reaction, threshold,
        witnessCount: witnesses.length,
        depthMeasured: substrate.unmeasured.length === 0,
      });
      results.push({ ...site, ...verdict, witnesses });

      const mark = {
        COMMITTED: '  COMMITTED',
        LOW_CONFIDENCE: '· low-conf ',
        REACTED: '· reacted  ',
        MISSING_SUBSTRATE: '· no-substr',
        INVALID_REACTION: '? invalid  ',
      }[verdict.outcome];
      console.log(`${mark} ${String(index + 1).padStart(3)}/${chosen.length}  line ${String(site.line).padStart(4)}  ` +
        `${OPERATORS[site.operator].describe().padEnd(20)} ${verdict.confidence ? verdict.confidence.toFixed(2) : '    '}  ${verdict.why}`);
    }
  } finally {
    teardownWorktree(worktree);
    rmSync(scratch, { recursive: true, force: true });
  }

  const by = (outcome) => results.filter(result => result.outcome === outcome);
  const committed = by('COMMITTED').sort((a, b) => b.confidence - a.confidence);
  console.log(`\n${committed.length} COMMITTED   ${by('LOW_CONFIDENCE').length} low-confidence   ` +
    `${by('REACTED').length} reacted   ${by('MISSING_SUBSTRATE').length} no substrate   ${by('INVALID_REACTION').length} invalid`);
  console.log('\nno substrate = the line never ran, so silence proved nothing about it.');

  if (committed.length > 0) {
    console.log('\nReached, changed, and nobody noticed (deepest first):');
    for (const site of committed) {
      console.log(`  ${site.confidence.toFixed(2)}  ${file}:${site.line}  ${OPERATORS[site.operator].describe()}  (ran ${site.hits}x)`);
    }
    console.log('\nEach ran under test and no assertion moved. That is not proof of a bug —');
    console.log('the behaviour may be unobservable, or observed only in production.');
  }

  if (out) {
    writeFileSync(path.resolve(out), `${JSON.stringify({
      file, testTargets, threshold,
      sites: sites.length,
      baselineFailures: [...(substrate?.baseline ?? [])],
      unusableObservers: substrate?.unusable ?? [],
      results,
    }, null, 2)}\n`);
    console.log(`\nwritten → ${out}`);
  }
}

main();
