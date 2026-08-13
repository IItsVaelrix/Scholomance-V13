#!/usr/bin/env node
/**
 * ANTIGEN SWEEP — the edge that makes a remembered scar hunt.
 *
 * `memory-infusion.engine.js` promises to convert memory findings into
 * "structured hypotheses for the immune system". Until now the only consumer of
 * INFUSED_ANTIGENS was run-diagnostic.cli.js, which prints the titles. An
 * antigen was a scar the system could recite, not one it hunts.
 *
 * This runs every huntable antigen through cleri-probe and aggregates.
 *
 * ── Three traps this deliberately does not fall into ─────────────────────────
 * All three were measured on 2026-08-12, and each one silently reports ZERO:
 *
 *   1. RUNTIME BUDGET. A single wide investigation exceeds the 30s budget
 *      (measured 35,623ms over codex+src) and returns PARTIAL with zero
 *      findings while setting coverage.complete = true, because coverage tracks
 *      RETRIEVAL and the budget kills VERIFICATION. So: chunk by subdirectory.
 *
 *   2. PIPED JSON TRUNCATION. `--format json` through a pipe is cut at exactly
 *      65,536 bytes, yielding unparseable output. Two chunks that looked like
 *      "bad JSON" actually held 330 findings. So: always --output to a file.
 *
 *   3. UNHUNTABLE ANTIGENS. The planner matches EXACT PHRASES. An antigen whose
 *      title misses them compiles to zero pathology classes and the sweep
 *      returns INCONCLUSIVE — which is not "clean", it is "never asked".
 *
 * PARTIAL, INCONCLUSIVE and budget-blown chunks are reported as UNCLEARED and
 * are never counted as zero. A sweep that cannot prove it looked does not get
 * to say it found nothing.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { INFUSED_ANTIGENS } from '../codex/core/immunity/clerical-raid.substrate.js';
import { compileInvestigationPlan } from '../codex/core/immunity/cleri-probe/planner.js';

const ROOT = resolve(fileURLToPath(import.meta.url), '../..');
const DEFAULT_ROOTS = ['codex/core', 'codex/server', 'codex/runtime', 'codex/cli', 'src/lib', 'src/pages', 'src/components'];

/** Chunk small enough that verification finishes inside the probe's budget. */
export function buildChunks(roots = DEFAULT_ROOTS) {
  const chunks = [];
  for (const base of roots) {
    let st;
    try { st = statSync(join(ROOT, base)); } catch { continue; }
    if (!st.isDirectory()) continue;
    // codex/core and src/lib are far too large to clear in one budget.
    if (base === 'codex/core' || base === 'src/lib') {
      for (const name of readdirSync(join(ROOT, base))) {
        try {
          if (statSync(join(ROOT, base, name)).isDirectory()) chunks.push(`${base}/${name}`);
        } catch { /* unreadable entry */ }
      }
    } else chunks.push(base);
  }
  return chunks;
}

/** An antigen is huntable only if its title compiles to at least one pathology class. */
export function triageAntigens(antigens) {
  const huntable = [];
  const unhuntable = [];
  for (const antigen of antigens) {
    let classes = [];
    try {
      const plan = compileInvestigationPlan(antigen.title, {});
      classes = plan.pathologyClasses ?? plan.selectedPathologyClasses ?? [];
    } catch (error) {
      unhuntable.push({ antigen, why: `planner threw: ${error.message.slice(0, 80)}` });
      continue;
    }
    if (classes.length === 0) unhuntable.push({ antigen, why: 'no pathology class — title misses every planner phrase' });
    else huntable.push({ antigen, classes });
  }
  return { huntable, unhuntable };
}

function probeChunk(hypothesis, scope, outDir) {
  const outPath = join(outDir, `${scope.replace(/[^\w]/g, '_')}.json`);
  try {
    execFileSync('node', ['scripts/cleri-probe.js', 'investigate', hypothesis,
      '--scope', scope, '--format', 'json', '--output', outPath],
    { cwd: ROOT, encoding: 'utf8', timeout: 180_000, stdio: 'ignore' });
  } catch (error) {
    return { uncleared: `probe failed: ${String(error.message).slice(0, 70)}` };
  }
  let report;
  try { report = JSON.parse(readFileSync(outPath, 'utf8')); }
  catch { return { uncleared: 'unparseable report' }; }

  const budgetBlown = (report.diagnostics ?? []).some((d) => String(d).includes('IMMUNE-0402'));
  if (budgetBlown) return { uncleared: 'runtime budget exceeded — verification incomplete' };
  if (report.status === 'PARTIAL') return { uncleared: 'status PARTIAL — coverage incomplete' };
  if (report.status === 'INCONCLUSIVE') return { uncleared: 'status INCONCLUSIVE — hypothesis reached no class' };
  return { findings: report.findings ?? [], status: report.status };
}

export function sweep({ antigens = INFUSED_ANTIGENS, chunks = buildChunks(), log = console.log } = {}) {
  const { huntable, unhuntable } = triageAntigens(antigens);
  const outDir = mkdtempSync(join(tmpdir(), 'antigen-sweep-'));

  log(`antigens: ${antigens.length}  huntable: ${huntable.length}  unhuntable: ${unhuntable.length}`);
  for (const u of unhuntable) log(`  UNHUNTABLE  ${u.antigen.title.slice(0, 62)}  — ${u.why}`);

  const results = [];
  for (const { antigen, classes } of huntable) {
    log(`\n══ ${classes.join(',')}  ← ${antigen.title.slice(0, 62)}`);
    const findings = [];
    const uncleared = [];
    for (const scope of chunks) {
      const out = probeChunk(antigen.title, scope, outDir);
      if (out.uncleared) { uncleared.push({ scope, why: out.uncleared }); continue; }
      for (const f of out.findings) {
        const span = f.supportingEvidence?.[0]?.span ?? f.span ?? {};
        findings.push({
          scope,
          // The finding's OWN class, not the antigen's. A title can reach two
          // pathology classes, and a consumer that reads the antigen's list
          // instead hands a finding the other family's repair.
          pathologyClass: f.pathologyClass ?? null,
          path: span.path ?? null,
          line: span.startLine ?? null,
          symbol: span.symbol ?? f.symbol ?? null,
        });
      }
    }
    log(`   verified findings: ${findings.length}   uncleared chunks: ${uncleared.length}`);
    for (const u of uncleared) log(`     UNCLEARED  ${u.scope}  — ${u.why}`);
    results.push({ antigen: antigen.title, classes, findings, uncleared });
  }

  return { results, unhuntable: unhuntable.map((u) => ({ title: u.antigen.title, why: u.why })) };
}

function main() {
  const outIndex = process.argv.indexOf('--output');
  const summary = sweep();

  const totalFindings = summary.results.reduce((n, r) => n + r.findings.length, 0);
  const totalUncleared = summary.results.reduce((n, r) => n + r.uncleared.length, 0);
  console.log('\n════ ANTIGEN SWEEP ════');
  console.log(`verified findings : ${totalFindings}`);
  console.log(`uncleared chunks  : ${totalUncleared}  (unknown, NOT clean)`);
  console.log(`unhuntable antigens: ${summary.unhuntable.length}  (never asked, NOT clean)`);

  if (outIndex !== -1 && process.argv[outIndex + 1]) {
    writeFileSync(process.argv[outIndex + 1], `${JSON.stringify(summary, null, 2)}\n`);
    console.log(`written → ${process.argv[outIndex + 1]}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
