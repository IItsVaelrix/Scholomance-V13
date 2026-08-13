#!/usr/bin/env node
/**
 * GENE EVIDENCE SWEEP — let the codebase vote on what a gene claims.
 *
 * An SCDNA gene carries a lifecycle built for exactly this:
 *
 *     contradictionCount   0
 *     degradationFactor    0.85     lose 15% of confidence when contradicted
 *     recoveryIncrement    0.02     earn it back slowly when confirmed
 *     deprecationThreshold 0.45     below this, retire
 *
 * Nothing has ever filled it. All 13 genes sit at `contradictionCount: 0`,
 * because the only thing that can contradict a gene today is ANOTHER GENE —
 * genes argue with each other and never with the repository.
 *
 * So `BUGPATTERN_COLOR_DRAGON_FRONTEND_FALLBACK` held confidence 0.98 while the
 * bug it names was live and undetected, and holds 0.98 now that the bug is
 * fixed. The number was a declaration, not a measurement.
 *
 * This counts what the gene actually describes. A gene whose pattern is present
 * is confirmed and speaks louder; a gene whose pattern is gone everywhere has
 * nothing left to warn about and fades; if the pattern returns, so does the gene.
 *
 * ─── WHAT THIS DELIBERATELY DOES NOT DO ─────────────────────────────────────
 *
 * Only genes naming a COUNTABLE code pattern are scored. `SEMANTIC_KIND_PROBE_
 * READONLY` is a policy about intent, not a shape with an occurrence count, and
 * scoring it would be inventing a measurement — the failure the Gutenberg
 * Tribunal was convened for. Unscored genes are reported as `unscored`, never as
 * zero, because absent evidence is not evidence of absence.
 *
 * Usage:
 *   node scripts/gene-evidence-sweep.mjs            # human summary
 *   node scripts/gene-evidence-sweep.mjs --json     # for the Python lifecycle
 */

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanInnate } from '../codex/core/immunity/innate.scanner.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Which checks stand as evidence for which gene.
 *
 * A gene is scored ONLY when a deterministic check can count its pattern. The
 * link is declared here rather than inferred, so that adding a gene cannot
 * silently start scoring it against a check that means something else.
 */
export const GENE_EVIDENCE = Object.freeze({
  BUGPATTERN_COLOR_DRAGON_FRONTEND_FALLBACK: {
    rules: ['ARCH-0F0E'],
    claim: 'the UI recomputes phoneme truth instead of consuming the backend',
  },
  ARCH_RULE_BACKEND_TRUTH_AUTHORITY: {
    rules: ['ARCH-0F0D', 'ARCH-0F0E'],
    claim: 'an authority is derived in the wrong runtime, or degraded silently',
  },
});

function sourceFiles() {
  return execSync("git ls-files '*.js' '*.jsx' '*.ts' '*.tsx' '*.mjs'", { encoding: 'utf8', cwd: ROOT })
    .split('\n')
    .filter(Boolean);
}

/** Occurrences of every rule named by any gene, across the tracked tree. */
export function sweepRuleOccurrences(files = sourceFiles()) {
  const wanted = new Set(Object.values(GENE_EVIDENCE).flatMap(entry => entry.rules));
  const counts = Object.fromEntries([...wanted].map(rule => [rule, 0]));
  const sites = Object.fromEntries([...wanted].map(rule => [rule, []]));
  let scanned = 0;

  for (const file of files) {
    let content;
    try {
      content = readFileSync(path.join(ROOT, file), 'utf8');
    } catch {
      continue;   // unreadable, and reported as such by the caller's file count
    }
    scanned += 1;
    for (const violation of scanInnate(content, file)) {
      if (!wanted.has(violation.ruleId)) continue;
      counts[violation.ruleId] += 1;
      sites[violation.ruleId].push(file);
    }
  }
  return { scanned, counts, sites };
}

/**
 * A verdict per gene: CONFIRMED when its pattern is present, CONTRADICTED when
 * it is absent everywhere, UNSCORED when no check can count it.
 */
export function judgeGenes(occurrences) {
  const verdicts = {};
  for (const [geneId, entry] of Object.entries(GENE_EVIDENCE)) {
    const total = entry.rules.reduce((sum, rule) => sum + (occurrences.counts[rule] ?? 0), 0);
    verdicts[geneId] = {
      claim: entry.claim,
      rules: entry.rules,
      occurrences: total,
      // A gene warning about a pattern that no longer occurs is not WRONG — it
      // is unemployed. Decay is how the system stops shouting about a fixed bug,
      // and recovery is how it starts again the moment the bug returns.
      verdict: total > 0 ? 'CONFIRMED' : 'CONTRADICTED',
      sites: entry.rules.flatMap(rule => occurrences.sites[rule] ?? []),
    };
  }
  return verdicts;
}

function main() {
  const occurrences = sweepRuleOccurrences();
  const verdicts = judgeGenes(occurrences);

  if (process.argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify({
      scannedFiles: occurrences.scanned,
      ruleCounts: occurrences.counts,
      genes: verdicts,
    }, null, 2)}\n`);
    return;
  }

  console.log(`scanned ${occurrences.scanned} tracked source files\n`);
  for (const [geneId, verdict] of Object.entries(verdicts)) {
    console.log(`${verdict.verdict === 'CONFIRMED' ? '✓ CONFIRMED  ' : '· CONTRADICTED'} ${geneId}`);
    console.log(`    claim: ${verdict.claim}`);
    console.log(`    ${verdict.rules.join(', ')} found ${verdict.occurrences} occurrence(s)`);
    for (const site of verdict.sites.slice(0, 5)) console.log(`      ${site}`);
  }
  const unscored = 13 - Object.keys(verdicts).length;
  console.log(`\n${unscored} gene(s) are UNSCORED: no deterministic check counts what they claim.`);
  console.log('Unscored is not zero. A policy about intent has no occurrence count,');
  console.log('and scoring one anyway would be inventing a measurement.');
}

if (import.meta.url === `file://${process.argv[1]}`) main();
