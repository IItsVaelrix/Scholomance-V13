#!/usr/bin/env node
/**
 * Isolated real-ledger replay for the Subtlety APM hourly reporter.
 *
 * Proves the implemented Stateless Chronicle Compiler against the REAL
 * resonance ledger without touching the production report directory:
 *  - two compile passes over the same report dir must be byte-identical;
 *  - the source ledger must be unchanged;
 *  - recurrence growth (lifetime occurrence count > 1) must be visible.
 *
 * The manifest records Level-2 evidence with state
 * `IMPLEMENTED_METASTABLE`. The CLI refuses to target
 * `divtube_downloader/APM-Hourly-Reports` and only writes the manifest
 * when every boolean gate passes.
 */

import { execFileSync } from 'node:child_process';
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256Hex } from '../codex/core/pixelbrain/sha256.js';
import {
  compileHourlyReport,
  discoverCompletedActiveWindows,
} from '../codex/core/pixelbrain/subtlety-apm-hourly-compiler.js';
import { createSubtletyApmReportStore } from '../codex/services/subtlety-apm-report-store.js';

const PRODUCTION_REPORT_DIR = 'divtube_downloader/APM-Hourly-Reports';

async function inventory(directory) {
  const names = (await readdir(directory)).filter((name) => name.endsWith('.md')).sort();
  return Promise.all(names.map(async (filename) => ({
    filename,
    checksum: sha256Hex(await readFile(resolve(directory, filename), 'utf8')),
  })));
}

export async function replayLedger({ ledgerPath, reportDir, testCommit }) {
  const sourceBefore = await readFile(ledgerPath, 'utf8');
  const store = createSubtletyApmReportStore({ ledgerPath, reportDir });
  const timestampValues = sourceBefore.split('\n').filter(Boolean).map((line) => {
    try { return Date.parse(JSON.parse(line).recordedAt); } catch { return Number.NaN; }
  }).filter(Number.isFinite);
  const replayCutoffMs = Math.max(...timestampValues) + 48 * 60 * 60 * 1000;
  const windows = discoverCompletedActiveWindows({ ledgerText: sourceBefore, nowMs: replayCutoffMs });

  for (const window of windows) {
    const result = compileHourlyReport({ ledgerText: sourceBefore, sourcePath: ledgerPath, window });
    if (result.status === 'report') await store.publish({ filename: result.filename, markdown: result.markdown });
  }
  const firstInventory = await inventory(reportDir);

  for (const window of windows) {
    const result = compileHourlyReport({ ledgerText: sourceBefore, sourcePath: ledgerPath, window });
    if (result.status === 'report') await store.publish({ filename: result.filename, markdown: result.markdown });
  }
  const secondInventory = await inventory(reportDir);
  const sourceAfter = await readFile(ledgerPath, 'utf8');

  const lifetimeCounts = await Promise.all(firstInventory.map(async ({ filename }) => {
    const markdown = await readFile(resolve(reportDir, filename), 'utf8');
    return [...markdown.matchAll(/- Lifetime occurrences: (\d+)/g)].map((match) => Number(match[1]));
  }));

  return {
    schema: 'PB-CONCEPT-CHEM-APM-IMPLEMENTATION-REPLAY-v1',
    state: 'IMPLEMENTED_METASTABLE',
    sourceLedger: ledgerPath,
    sourceChecksum: sha256Hex(sourceBefore),
    sourceUnchanged: sourceBefore === sourceAfter,
    reports: firstInventory,
    secondPassByteIdentical: JSON.stringify(firstInventory) === JSON.stringify(secondInventory),
    recurrenceGrowthObserved: lifetimeCounts.flat().some((count) => count > 1),
    testCommit,
  };
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--ledger') options.ledger = argv[index + 1];
    if (argv[index] === '--reports') options.reports = argv[index + 1];
    if (argv[index] === '--manifest') options.manifest = argv[index + 1];
  }
  return options;
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isDirectRun) {
  const { ledger, reports, manifest } = parseArgs(process.argv.slice(2));
  if (!ledger || !reports || !manifest) {
    console.error('usage: node scripts/replay-subtlety-apm-hourly-reports.mjs --ledger <path> --reports <temporary-dir> --manifest <path>');
    process.exit(2);
  }
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const resolvedReports = resolve(reports);
  if (resolvedReports === resolve(repoRoot, PRODUCTION_REPORT_DIR)) {
    console.error(`refusing to replay into the production report directory: ${PRODUCTION_REPORT_DIR}`);
    process.exit(2);
  }
  const testCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  try {
    const result = await replayLedger({ ledgerPath: resolve(ledger), reportDir: resolvedReports, testCommit });
    const gatesOk = result.reports.length > 0
      && result.sourceUnchanged
      && result.secondPassByteIdentical
      && result.recurrenceGrowthObserved;
    if (!gatesOk) {
      console.error(JSON.stringify(result, null, 2));
      console.error('replay gates failed; manifest not written');
      process.exit(1);
    }
    await mkdir(dirname(resolve(manifest)), { recursive: true });
    await writeFile(resolve(manifest), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
    console.log(`replay complete: ${result.reports.length} reports, manifest written to ${manifest}`);
  } catch (error) {
    console.error(`replay failed: ${error.stack ?? error.message}`);
    process.exit(1);
  }
}
