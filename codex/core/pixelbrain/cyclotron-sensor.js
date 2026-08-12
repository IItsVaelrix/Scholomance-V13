/**
 * CYCLOTRON C-SENSOR — the reactor audits itself.
 *
 * Built from nucleus composition C, proposed by the Semantic Valence Cyclotron:
 *
 *   cyclotron-reactor    --experiment-receipt--> evidence-ledger
 *   evidence-ledger      --structure----------> canonical-serializer
 *   canonical-serializer --artifact-----------> bytecode-seal
 *   canonical-serializer --artifact-----------> schema-verifier
 *
 * C is the only one of the three emitted compositions that closes its own input:
 * evidence-ledger is the sole atom offering the `structure` that canonical-serializer
 * seeks. Its dangling `validation-verdict` port is where baseline approval enters.
 *
 * WHY IT EXISTS: evidence-integrity-harness.mjs (composition A2) audits artifacts at
 * rest — it detects that a file changed. It cannot detect that the REACTOR changed
 * while its outputs were rewritten legitimately. On 2026-08-11 a scoring change
 * silently altered every downstream benchmark number and was caught by hand.
 *
 * Sensors, then immune response — in that order (PDR §4.5). This module reports and
 * refuses. It never heals, and it never promotes its own baseline.
 *
 * Pure: no file I/O, no clock, no randomness.
 */

import { sha256Hex, stableStringify } from '../immunity/cleri-probe/canonical-report.js';

export const CYCLOTRON_SENSOR_CONTRACT = 'PB-CYCLOTRON-SENSOR-v1';
export const CYCLOTRON_SENSOR_SCHEMA_VERSION = '1.0.0';

const round12 = (value) => Number(Number(value).toFixed(12));

const mean = (values) => (values.length
  ? values.reduce((sum, value) => sum + value, 0) / values.length
  : 0);

function fail(code, message) {
  throw new TypeError(`${CYCLOTRON_SENSOR_CONTRACT}: ${code} — ${message}`);
}

function required(value, field) {
  if (value === undefined || value === null || value === '') {
    fail('INCOMPLETE_REPORT', `report is missing required field "${field}"`);
  }
  return value;
}

// ── [RX] cyclotron-reactor (offers: experiment-receipt) ────────────────────
// seeks candidate-frontier + feasibility-score, both supplied by the real run
// and carried inside the report.
export function buildReceipt(report) {
  if (!report || typeof report !== 'object' || Array.isArray(report)) {
    fail('INCOMPLETE_REPORT', 'report must be an object');
  }
  const provenance = report.chemistryProvenance;
  if (!provenance || typeof provenance !== 'object') {
    fail('NO_CHEMISTRY_PROVENANCE',
      'report carries no chemistryProvenance; it predates the stamp and cannot be assessed');
  }
  const candidates = Array.isArray(report.candidates) ? report.candidates : [];

  const inputs = {
    reportContract: required(report.contract, 'contract'),
    reportSchemaVersion: required(report.schemaVersion, 'schemaVersion'),
    atomBankChecksum: required(report.atomBankChecksum, 'atomBankChecksum'),
    groundingIndexChecksum: required(report.groundingIndexChecksum, 'groundingIndexChecksum'),
    chemistryVersion: required(provenance.version, 'chemistryProvenance.version'),
    chemistryWeights: required(provenance.weights, 'chemistryProvenance.weights'),
    configuration: required(report.configuration, 'configuration'),
    seed: required(report.seed, 'seed'),
    requestedTrials: required(report.requestedTrials, 'requestedTrials'),
  };

  const shortlist = candidates
    .map((row) => [[...(row.molecule?.atomIds ?? [])].sort(), round12(row.finalScore ?? 0)])
    // Code-unit ordering, never localeCompare: the shortlist digest must be
    // identical on every machine, and localeCompare is ICU/locale-sensitive.
    .sort((a, b) => {
      const x = stableStringify(a);
      const y = stableStringify(b);
      return x < y ? -1 : x > y ? 1 : 0;
    });

  const outputs = {
    reportChecksum: required(report.checksum, 'checksum'),
    controlBar: round12(report.control?.bar ?? 0),
    meanFinalScore: round12(mean(candidates.map((row) => row.finalScore ?? 0))),
    meanEnergy: round12(mean(candidates.map((row) => row.molecule?.energy ?? 0))),
    meanNovelty: round12(mean(candidates.map((row) => row.molecule?.novelty ?? 0))),
    meanGrounding: round12(mean(candidates.map((row) => row.molecule?.grounding ?? 0))),
    meanChemistryFeasibility: round12(
      mean(candidates.map((row) => row.conceptChemistry?.feasibility ?? 0)),
    ),
    shortlistDigest: `shortlist1:${sha256Hex(shortlist)}`,
  };
  for (const [name, value] of Object.entries(required(report.counts, 'counts'))) {
    outputs[`count.${name}`] = value;
  }

  return {
    contract: CYCLOTRON_SENSOR_CONTRACT,
    schemaVersion: CYCLOTRON_SENSOR_SCHEMA_VERSION,
    inputClass: `inclass1:${sha256Hex(inputs)}`,
    inputs,
    outputs,
  };
}

// ── [LEDGER] evidence-ledger (offers: structure) ──────────────────────────
// seeks experiment-receipt + validation-verdict. The validation-verdict port is
// the baseline's approval: an unapproved class yields NO_BASELINE, never a verdict.
export function assess(receipt, baseline) {
  const base = {
    verdict: 'NO_BASELINE',
    inputClass: receipt.inputClass,
    reason: null,
    differing: [],
    moved: [],
  };

  // The claimed inputClass must be the hash of the inputs it travels with.
  // A receipt that keeps the baseline's class while carrying different inputs
  // would skip the ABSTAIN branch and be judged on outputs alone — possibly
  // as STABLE. The claim is never trusted: recompute, and refuse on mismatch.
  // A forged receipt gets NO verdict, not even NO_BASELINE.
  if (receipt.inputClass !== `inclass1:${sha256Hex(receipt.inputs ?? {})}`) {
    return { ...base, verdict: 'FORGED', reason: 'INPUT_CLASS_FORGED' };
  }

  if (!baseline) return base;

  if (baseline.contract !== receipt.contract
    || baseline.schemaVersion !== receipt.schemaVersion) {
    return { ...base, verdict: 'ABSTAIN', reason: 'SENSOR_CONTRACT_CHANGED' };
  }

  if (baseline.inputClass !== receipt.inputClass) {
    const names = new Set([
      ...Object.keys(receipt.inputs ?? {}),
      ...Object.keys(baseline.inputs ?? {}),
    ]);
    const differing = [...names].sort().filter(
      (name) => stableStringify(receipt.inputs?.[name]) !== stableStringify(baseline.inputs?.[name]),
    );
    return { ...base, verdict: 'ABSTAIN', reason: 'INPUT_CLASS_CHANGED', differing };
  }

  const names = new Set([
    ...Object.keys(receipt.outputs ?? {}),
    ...Object.keys(baseline.outputs ?? {}),
  ]);
  const moved = [];
  for (const name of [...names].sort()) {
    const observed = receipt.outputs?.[name];
    const expected = baseline.outputs?.[name];
    if (stableStringify(observed) !== stableStringify(expected)) {
      moved.push({ field: name, baseline: expected ?? null, observed: observed ?? null });
    }
  }
  return moved.length === 0
    ? { ...base, verdict: 'STABLE' }
    : { ...base, verdict: 'DEVIATION', moved };
}

// ── [SER] canonical-serializer (offers: artifact; seeks: structure) ────────
// ── [SEAL] bytecode-seal      (offers: checksum; seeks: artifact) ──────────
//
// NOTE: the canonical-serializer atom cites codex/core/pixelbrain/canonical-json.js.
// That module implements a DIFFERENT canonical form (Python float repr, for .pbrain
// packets). The evidence-integrity harness verifies self-seals by recomputing
// sha256Hex(body) === JSON.stringify(sortKeys(body)), so using the cited module here
// would make every receipt fail SELF_CHECKSUM_MISMATCH. Interop wins; the deviation
// is recorded in the spec.
export function sealReceipt(receipt) {
  const { checksum, ...body } = receipt;
  return { artifact: stableStringify(body), checksum: `cyclosensor1:${sha256Hex(body)}` };
}

// ── [VER] schema-verifier (offers: schema-verdict; seeks: artifact) ────────
export function verifyReceiptSchema(receipt) {
  const findings = [];
  if (receipt?.contract !== CYCLOTRON_SENSOR_CONTRACT) findings.push('NO_CONTRACT');
  if (typeof receipt?.schemaVersion !== 'string') findings.push('NO_SCHEMA_VERSION');
  if (typeof receipt?.inputClass !== 'string') findings.push('NO_INPUT_CLASS');
  if (!receipt?.inputs || Object.keys(receipt.inputs).length === 0) findings.push('NO_INPUTS');
  if (!receipt?.outputs || Object.keys(receipt.outputs).length === 0) findings.push('NO_OUTPUTS');
  return { ok: findings.length === 0, findings };
}
