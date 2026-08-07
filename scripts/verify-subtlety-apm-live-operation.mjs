#!/usr/bin/env node
/**
 * Two-phase live-operation proof for the Subtlety APM hourly reporter.
 *
 * Phase 1 (capture): snapshot the most recently modified valid report —
 * its bytes, checksum, canonical window-end boundary line, the ledger
 * checksum, and the current server commit — into a caller-supplied
 * /tmp state file. No production path is mutated.
 *
 * Phase 2 (verify), after a real server restart: require the same
 * filename exactly once, byte-identical report content, and at least
 * one valid fingerprint from the current ledger inside the report's
 * window. Only then write STABLE_OPERATIONAL evidence. Any mismatch
 * refuses and writes nothing.
 */

import { execFileSync } from 'node:child_process';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256Hex } from '../codex/core/pixelbrain/sha256.js';
import { createSubtletyApmReportStore } from '../codex/services/subtlety-apm-report-store.js';

function gitHead() {
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
}

function windowLine(markdown, label) {
  const match = markdown.match(new RegExp(`^- ${label}: (.+)$`, 'm'));
  if (!match) throw new Error(`report missing '${label}' line`);
  return match[1];
}

export async function captureState({ ledgerPath, reportDir, statePath }) {
  const ledger = await readFile(ledgerPath, 'utf8');
  const store = createSubtletyApmReportStore({ ledgerPath, reportDir });
  const filenames = await store.listReportFilenames();
  if (filenames.length === 0) throw new Error('no valid APM reports found to capture');
  const withStats = await Promise.all(filenames.map(async (filename) => ({
    filename,
    mtimeMs: (await stat(resolve(reportDir, filename))).mtimeMs,
  })));
  withStats.sort((left, right) => right.mtimeMs - left.mtimeMs || left.filename.localeCompare(right.filename));
  const reportFilename = withStats[0].filename;
  const reportBytes = await readFile(resolve(reportDir, reportFilename), 'utf8');
  const state = {
    capturedAt: new Date().toISOString(),
    reportFilename,
    reportBytes,
    reportChecksum: sha256Hex(reportBytes),
    ledgerChecksum: sha256Hex(ledger),
    boundaryTime: windowLine(reportBytes, 'Window end'),
    serverCommit: gitHead(),
  };
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  return state;
}

export async function verifyLive({ ledgerPath, reportDir, statePath, evidencePath }) {
  const before = JSON.parse(await readFile(statePath, 'utf8'));
  const afterLedger = await readFile(ledgerPath, 'utf8');
  const store = createSubtletyApmReportStore({ ledgerPath, reportDir });
  const filenames = await store.listReportFilenames();
  const duplicateCount = filenames.filter((name) => name === before.reportFilename).length;
  if (duplicateCount !== 1) {
    throw new Error(`expected exactly one '${before.reportFilename}', found ${duplicateCount}`);
  }
  const afterReport = await readFile(resolve(reportDir, before.reportFilename), 'utf8');
  const afterReportChecksum = sha256Hex(afterReport);
  if (afterReportChecksum !== before.reportChecksum) {
    throw new Error(`report '${before.reportFilename}' changed between capture and verify`);
  }

  const startMs = Date.parse(windowLine(afterReport, 'Window start'));
  const endMs = Date.parse(windowLine(afterReport, 'Window end'));
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    throw new Error('report window lines are not parseable timestamps');
  }
  const fingerprintsInWindow = afterLedger.split('\n').filter(Boolean).filter((line) => {
    try {
      const record = JSON.parse(line);
      if (record.kind !== 'fingerprint') return false;
      const atMs = Date.parse(record.recordedAt);
      return Number.isFinite(atMs) && atMs >= startMs && atMs < endMs;
    } catch { return false; }
  }).length;
  if (fingerprintsInWindow === 0) {
    throw new Error('report window contains no valid fingerprints from the current ledger');
  }

  const evidence = {
    schema: 'PB-CONCEPT-CHEM-APM-LIVE-OPERATION-v1',
    state: 'STABLE_OPERATIONAL',
    reportFilename: before.reportFilename,
    reportChecksum: afterReportChecksum,
    ledgerChecksum: sha256Hex(afterLedger),
    boundaryTime: before.boundaryTime,
    serverCommitBeforeRestart: before.serverCommit,
    serverCommitAfterRestart: gitHead(),
    byteIdenticalAfterRestart: before.reportBytes === afterReport,
    duplicateCount,
  };
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  return evidence;
}

function parseArgs(argv) {
  const mode = argv[0];
  const options = { mode };
  for (let index = 1; index < argv.length; index += 1) {
    if (argv[index] === '--ledger') options.ledger = argv[index + 1];
    if (argv[index] === '--reports') options.reports = argv[index + 1];
    if (argv[index] === '--state') options.state = argv[index + 1];
    if (argv[index] === '--evidence') options.evidence = argv[index + 1];
  }
  return options;
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isDirectRun) {
  const { mode, ledger, reports, state, evidence } = parseArgs(process.argv.slice(2));
  if (mode === 'capture' && ledger && reports && state) {
    try {
      const captured = await captureState({ ledgerPath: resolve(ledger), reportDir: resolve(reports), statePath: resolve(state) });
      console.log(`captured ${captured.reportFilename} at boundary ${captured.boundaryTime}; state written to ${state}`);
    } catch (error) {
      console.error(`capture failed: ${error.stack ?? error.message}`);
      process.exit(1);
    }
  } else if (mode === 'verify' && ledger && reports && state && evidence) {
    try {
      const result = await verifyLive({
        ledgerPath: resolve(ledger),
        reportDir: resolve(reports),
        statePath: resolve(state),
        evidencePath: resolve(evidence),
      });
      console.log(`live operation verified: ${result.reportFilename} byte-identical=${result.byteIdenticalAfterRestart}; evidence written to ${evidence}`);
    } catch (error) {
      console.error(`verify failed: ${error.stack ?? error.message}`);
      process.exit(1);
    }
  } else {
    console.error('usage:');
    console.error('  node scripts/verify-subtlety-apm-live-operation.mjs capture --ledger <path> --reports <dir> --state <path>');
    console.error('  node scripts/verify-subtlety-apm-live-operation.mjs verify --ledger <path> --reports <dir> --state <path> --evidence <path>');
    process.exit(2);
  }
}
