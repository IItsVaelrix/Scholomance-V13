#!/usr/bin/env node
/**
 * PERTURBATION SCREEN — stage one, in process, no test runner.
 *
 * ─── WHAT THIS IS FOR ───────────────────────────────────────────────────────
 *
 * `perturbation-probe.mjs` asks vitest whether anything reacted to a mutation.
 * That costs ~9 seconds MINIMUM per site — measured, and not tunable: it is
 * process start, module transform and jsdom construction, not test execution.
 * `--no-isolate` and thread pools change it by under a second. 217 sites is an
 * hour.
 *
 * But a test run answers two questions and only one of them is expensive:
 *
 *     did the behaviour change?   cheap  — call the functions and compare
 *     did anyone NOTICE?          costly — needs the suites
 *
 * This answers the cheap one for every site, at ~400ms, so the expensive one is
 * only ever asked about sites whose behaviour actually moved.
 *
 * ─── THIS IS A SCREEN, NOT A PROOF ──────────────────────────────────────────
 *
 * "The fingerprint did not move" implies "no test can notice" ONLY IF the
 * harness corpus exercises everything the suites exercise. It does not, and
 * pretending otherwise would make this an instrument that cannot fail.
 *
 * So the screen reports MOVED / UNMOVED, and UNMOVED is a DEPRIORITISATION, not
 * a verdict. Its false-negative rate against the full probe is a measurable
 * number and belongs in any report that uses this to skip work — never an
 * assumption. `--verify-against <probe-report.json>` computes it.
 *
 * One such miss has already been found and fixed rather than argued away: the
 * first harness called only `analyzeWord`/`analyzeDeep`, and reported the whole
 * authority-override subsystem as inert because it never entered it.
 *
 * Usage:
 *   node scripts/perturbation-screen.mjs --file <path> [--out screen.json]
 *   node scripts/perturbation-screen.mjs --file <path> --verify-against report.json
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { fingerprint, compare } from './lib/behavioural-fingerprint.mjs';

const require = createRequire(import.meta.url);
const { parse } = require('@babel/parser');
const traverseModule = require('@babel/traverse');
const traverse = typeof traverseModule === 'function' ? traverseModule : traverseModule.default;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const argOf = (flag, fallback = null) => {
  const index = process.argv.indexOf(flag);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
};

const OPERATORS = {
  returnNull: {
    describe: 'return null',
    apply: (source, site) => `${source.slice(0, site.start)}null${source.slice(site.end)}`,
  },
  invertGuard: {
    describe: 'invert the condition',
    apply: (source, site) =>
      `${source.slice(0, site.start)}!(${source.slice(site.start, site.end)})${source.slice(site.end)}`,
  },
};

function parseSource(source) {
  return parse(source, {
    sourceType: 'unambiguous',
    plugins: ['typescript', 'jsx', 'classProperties', 'optionalChaining', 'topLevelAwait', 'decorators-legacy'],
  });
}

function collectSites(ast) {
  const sites = [];
  traverse(ast, {
    ReturnStatement(nodePath) {
      const argument = nodePath.node.argument;
      if (!argument || argument.type === 'NullLiteral') return;
      sites.push({ start: argument.start, end: argument.end, line: argument.loc.start.line, operator: 'returnNull' });
    },
    IfStatement(nodePath) {
      const test = nodePath.node.test;
      sites.push({ start: test.start, end: test.end, line: test.loc.start.line, operator: 'invertGuard' });
    },
  });
  return sites.sort((a, b) => a.line - b.line || a.start - b.start);
}

function setupWorktree(worktree) {
  // The working tree, not HEAD — see the note in perturbation-probe.mjs.
  const snapshot = execFileSync('git', ['stash', 'create'], { cwd: ROOT, encoding: 'utf8' }).trim();
  execFileSync('git', ['worktree', 'add', '--detach', worktree, snapshot || 'HEAD'], { cwd: ROOT, stdio: 'pipe' });
  for (const shared of ['node_modules', 'cache', 'scholomance_dict.sqlite', 'scholomance_corpus.sqlite']) {
    try {
      execFileSync('ln', ['-sfn', path.join(ROOT, shared), path.join(worktree, shared)], { stdio: 'pipe' });
    } catch { /* optional artifact */ }
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
 * Compares this screen against a full probe report and reports the number that
 * decides whether the screen may be trusted to skip work: how often it called a
 * site UNMOVED that the probe found a test reacting to.
 */
function verifyAgainst(results, reportPath) {
  const report = JSON.parse(readFileSync(path.resolve(reportPath), 'utf8'));
  const byKey = new Map(results.map(result => [`${result.line}:${result.operator}`, result]));

  let agree = 0;
  let falseInert = 0;
  let checked = 0;
  const misses = [];

  for (const site of report.results ?? []) {
    const screened = byKey.get(`${site.line}:${site.operator}`);
    if (!screened) continue;
    checked += 1;
    const testsReacted = site.outcome === 'REACTED';
    if (testsReacted && !screened.moved) {
      falseInert += 1;
      misses.push(`${site.line} (${site.operator})`);
    } else {
      agree += 1;
    }
  }

  console.log(`\n─── screen vs full probe, ${checked} shared site(s) ───`);
  console.log(`  agreed: ${agree}`);
  console.log(`  FALSE INERT: ${falseInert}  (screen said nothing moved; a test disagreed)`);
  if (misses.length > 0) {
    console.log(`  missed: ${misses.join(', ')}`);
    console.log('  The harness does not reach these. Widen it before trusting the screen to skip work.');
  } else if (checked > 0) {
    console.log('  No false inerts on this sample. That is evidence, not proof — the');
    console.log('  screen is only ever as wide as its corpus.');
  }
  return { checked, agree, falseInert, misses };
}

async function main() {
  const file = argOf('--file');
  const out = argOf('--out');
  const verify = argOf('--verify-against');
  if (!file) {
    console.error('usage: perturbation-screen.mjs --file <path> [--out screen.json] [--verify-against report.json]');
    process.exitCode = 2;
    return;
  }

  const original = readFileSync(path.join(ROOT, file), 'utf8');
  const sites = collectSites(parseSource(original));
  const worktree = path.resolve(ROOT, argOf('--worktree', '.perturbation-screen'));

  console.log(`${file}: screening ${sites.length} sites in process (no test runner)`);
  setupWorktree(worktree);
  const target = path.join(worktree, file);
  const targetUrl = `file://${target}`;

  const results = [];
  const startedAt = Date.now();
  try {
    const baseline = await fingerprint(`${targetUrl}?v=baseline`);
    console.log(`baseline: ${baseline.corpusSize} probes\n`);

    for (const [index, site] of sites.entries()) {
      const mutated = OPERATORS[site.operator].apply(original, site);
      let outcome;
      try {
        parseSource(mutated);
      } catch {
        results.push({ ...site, moved: false, invalid: true, why: 'mutation does not parse' });
        continue;
      }

      writeFileSync(target, mutated);
      try {
        const probe = await fingerprint(`${targetUrl}?v=${index}-${Date.now()}`);
        outcome = compare(baseline, probe);
      } catch (error) {
        // A mutation that stops the MODULE from loading is a behavioural change
        // of the loudest possible kind, not a failed experiment.
        outcome = { moved: true, changed: baseline.corpusSize, total: baseline.corpusSize,
          divergence: 1, examples: [`module failed to load: ${error.message.slice(0, 60)}`] };
      }
      writeFileSync(target, original);

      results.push({ ...site, ...outcome });
      if (outcome.moved) {
        console.log(`  MOVED   ${String(index + 1).padStart(3)}/${sites.length}  line ${String(site.line).padStart(4)}  ` +
          `${OPERATORS[site.operator].describe.padEnd(20)} ${(outcome.divergence * 100).toFixed(1)}% of corpus  ${outcome.examples.slice(0, 3).join(', ')}`);
      }
    }
  } finally {
    teardownWorktree(worktree);
  }

  const moved = results.filter(result => result.moved);
  const seconds = (Date.now() - startedAt) / 1000;
  console.log(`\n${moved.length} moved   ${results.length - moved.length} unmoved   ` +
    `in ${seconds.toFixed(1)}s (${(seconds / Math.max(1, results.length) * 1000).toFixed(0)}ms/site)`);
  console.log(`\nOnly the ${moved.length} moved site(s) need the test runner.`);
  console.log(`At ~9s each that is ${(moved.length * 9 / 60).toFixed(0)} min instead of ${(results.length * 9 / 60).toFixed(0)} min.`);
  console.log('UNMOVED is a deprioritisation, not a verdict — the screen is only as wide as its corpus.');

  let verification = null;
  if (verify) verification = verifyAgainst(results, verify);

  if (out) {
    writeFileSync(path.resolve(out), `${JSON.stringify({ file, seconds, verification, results }, null, 2)}\n`);
    console.log(`\nwritten → ${out}`);
  }
}

main();
