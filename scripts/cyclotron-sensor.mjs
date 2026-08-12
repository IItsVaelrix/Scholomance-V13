#!/usr/bin/env node

/**
 * CYCLOTRON C-SENSOR — shell.
 *
 * Reads an already-written cyclotron report, builds a sealed receipt, compares it
 * against the approved baseline for its input class, and sets the exit code.
 * It does not run the cyclotron, and it never promotes a baseline on its own.
 *
 *   node scripts/cyclotron-sensor.mjs --report=<path>
 *   node scripts/cyclotron-sensor.mjs --report=<path> --record
 *   node scripts/cyclotron-sensor.mjs --report=<path> --approve --reason="<why>"
 *
 * Exit codes: 0 STABLE/ABSTAIN/NO_BASELINE, 1 DEVIATION, 2 refusal (incl. FORGED).
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import {
  buildReceipt, assess, sealReceipt, verifyReceiptSchema,
} from '../codex/core/pixelbrain/cyclotron-sensor.js';
import { verifySemanticCyclotronReport } from '../codex/core/pixelbrain/semantic-valence-cyclotron.js';
import { sha256Hex, stableStringify } from '../codex/core/immunity/cleri-probe/canonical-report.js';

const LEDGER_CONTRACT = 'PB-CYCLOTRON-SENSOR-LEDGER-v1';
const LEDGER_SCHEMA_VERSION = '1.0.0';
const DEFAULT_LEDGER = 'docs/superpowers/evidence/CYCLOTRON-SENSOR-LEDGER.json';

const flag = (name) => {
  const prefix = `--${name}=`;
  const raw = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return raw ? raw.slice(prefix.length) : null;
};
const has = (name) => process.argv.slice(2).includes(`--${name}`);

function refuse(code, message) {
  console.error(`REFUSED ${code}: ${message}`);
  process.exit(2);
}

const sealLedger = (ledger) => {
  const { checksum, ...body } = ledger;
  return { ...body, checksum: `cyclosensor-ledger1:${sha256Hex(body)}` };
};

function readLedger(path) {
  if (!existsSync(path)) {
    return { contract: LEDGER_CONTRACT, schemaVersion: LEDGER_SCHEMA_VERSION, baselines: {}, receipts: {} };
  }
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  const { checksum, ...body } = parsed;
  if (checksum !== `cyclosensor-ledger1:${sha256Hex(body)}`) {
    refuse('LEDGER_SEAL_MISMATCH',
      `${path} does not match its own seal — the sensor's record cannot be trusted, no verdict issued`);
  }
  return parsed;
}

const reportPath = flag('report');
if (!reportPath) refuse('NO_REPORT', 'pass --report=<path>');
const ledgerPath = flag('ledger') ?? DEFAULT_LEDGER;

let report;
try {
  report = JSON.parse(readFileSync(reportPath, 'utf8'));
} catch (error) {
  refuse('UNREADABLE_REPORT', `${reportPath}: ${error.message}`);
}

let trusted = false;
if (has('trust-report')) {
  trusted = true;
} else if (!verifySemanticCyclotronReport(report)) {
  refuse('REPORT_CHECKSUM_FAILED',
    `${reportPath} does not verify against its own checksum; refusing to seal an unverified reading`);
}

let receipt;
try {
  receipt = buildReceipt(report);
} catch (error) {
  refuse('INCOMPLETE_REPORT', error.message);
}
if (trusted) receipt.trustedReportUnverified = true;

const schema = verifyReceiptSchema(receipt);
if (!schema.ok) refuse('RECEIPT_SCHEMA', schema.findings.join(', '));

const seal = sealReceipt(receipt);
const ledger = readLedger(ledgerPath);

// Exact inputClass hit → STABLE/DEVIATION. Class miss against an approved
// same-contract baseline → ABSTAIN (inputs moved), never a silent NO_BASELINE
// that hides a deliberate seed/weight/config change.
function resolveBaseline(ledgerBody, receiptBody) {
  const exact = ledgerBody.baselines?.[receiptBody.inputClass];
  if (exact) return exact;
  const candidates = Object.values(ledgerBody.baselines ?? {}).filter(
    (row) => row?.contract === receiptBody.contract
      && row?.schemaVersion === receiptBody.schemaVersion,
  );
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  let best = candidates[0];
  let bestDiff = Infinity;
  for (const candidate of candidates) {
    const names = new Set([
      ...Object.keys(receiptBody.inputs ?? {}),
      ...Object.keys(candidate.inputs ?? {}),
    ]);
    const diffCount = [...names].filter(
      (name) => stableStringify(receiptBody.inputs?.[name]) !== stableStringify(candidate.inputs?.[name]),
    ).length;
    if (diffCount < bestDiff
      || (diffCount === bestDiff && String(candidate.inputClass) < String(best.inputClass))) {
      best = candidate;
      bestDiff = diffCount;
    }
  }
  return best;
}

const baseline = resolveBaseline(ledger, receipt);
const reading = assess(receipt, baseline);

console.log(`report      ${reportPath}`);
console.log(`inputClass  ${receipt.inputClass}`);
console.log(`receipt     ${seal.checksum}`);
if (trusted) console.log('TRUSTED_REPORT_UNVERIFIED  report checksum was not verified');
console.log(`VERDICT     ${reading.verdict}${reading.reason ? ` (${reading.reason})` : ''}`);
for (const name of reading.differing) console.log(`  input changed  ${name}`);
for (const m of reading.moved) console.log(`  output moved   ${m.field}: ${stableStringify(m.baseline)} -> ${stableStringify(m.observed)}`);

if (has('approve')) {
  const reason = flag('reason');
  if (!reason) refuse('NO_REASON', 'approving a baseline requires --reason="<why>"');
  // Approval never erases what it replaces: the superseded baseline is
  // archived under baselineHistory[inputClass], and the new approval names
  // what it supersedes. The sensor audits the reactor; this keeps the
  // sensor's own approval trail auditable too.
  const prior = ledger.baselines[receipt.inputClass];
  ledger.baselines[receipt.inputClass] = {
    ...receipt,
    approval: {
      reason,
      approvedAt: new Date().toISOString(),
      reportChecksum: receipt.outputs.reportChecksum,
      ...(prior ? { supersedes: prior.approval ?? null } : {}),
    },
  };
  if (prior) {
    ledger.baselineHistory ??= {};
    (ledger.baselineHistory[receipt.inputClass] ??= []).push(prior);
  }
  writeFileSync(ledgerPath, `${JSON.stringify(sealLedger(ledger), null, 2)}\n`, 'utf8');
  console.log(`APPROVED    baseline for ${receipt.inputClass} written to ${ledgerPath}`);
  process.exit(0);
}

if (has('record')) {
  ledger.receipts[seal.checksum] = receipt;
  writeFileSync(ledgerPath, `${JSON.stringify(sealLedger(ledger), null, 2)}\n`, 'utf8');
  console.log(`RECORDED    ${seal.checksum} -> ${ledgerPath}`);
}

process.exit(reading.verdict === 'DEVIATION' ? 1 : reading.verdict === 'FORGED' ? 2 : 0);
