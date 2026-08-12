/**
 * PROCESS-SENSOR + VALENCE-COMPILER wire
 *
 * Nucleus mined by codebase nuclei experiment:
 *   process-sensor + valence-compiler
 *
 * Port story:
 *   valence-compiler offers candidate-frontier (the shortlist in a cyclotron report)
 *   process-sensor seeks candidate-frontier + feasibility-score + validation-verdict
 *   process-sensor offers process-verdict + experiment-receipt
 *
 * This module is the pure composition. It does not run the cyclotron and does not
 * write a ledger. The shell (scripts/semantic-valence-cyclotron.mjs --sensor, or
 * scripts/cyclotron-sensor.mjs) owns I/O. Keeping I/O out of the pure core was a
 * deliberate C-sensor design constraint — this wire respects it.
 *
 * Why wire this first: every later experiment that produces a cyclotron report
 * can be assessed for process drift. That makes it harder for us — or the
 * cyclotron — to accidentally fool ourselves with a silently rewritten scorer.
 */

import {
  buildReceipt,
  assess,
  sealReceipt,
  verifyReceiptSchema,
  CYCLOTRON_SENSOR_CONTRACT,
} from './cyclotron-sensor.js';

export const PROCESS_SENSOR_VALENCE_WIRE_CONTRACT = 'PB-PROCESS-SENSOR-VALENCE-WIRE-v1';
export const PROCESS_SENSOR_VALENCE_WIRE_SCHEMA_VERSION = '1.0.0';

/**
 * Sense a valence-compiler (cyclotron) report.
 *
 * @param {object} report - PB-SEMANTIC-CYCLOTRON-REPORT-v1 body
 * @param {object|null} baseline - approved receipt for this input class, or null
 * @returns {{
 *   contract: string,
 *   schemaVersion: string,
 *   frontierSize: number,
 *   hasFeasibility: boolean,
 *   receipt: object,
 *   seal: { artifact: string, checksum: string },
 *   schema: { ok: boolean, findings: string[] },
 *   reading: object,
 * }}
 */
export function senseValenceCompile(report, baseline = null) {
  if (!report || typeof report !== 'object' || Array.isArray(report)) {
    throw new TypeError(
      `${PROCESS_SENSOR_VALENCE_WIRE_CONTRACT}: report must be an object`,
    );
  }
  const candidates = Array.isArray(report.candidates) ? report.candidates : [];
  // Valence-compiler surface: a non-empty candidate frontier is the port offer.
  // Empty shortlist is still assessable (control-only / total refusal runs).
  const hasFeasibility = candidates.some(
    (row) => row?.conceptChemistry?.feasibility != null
      || Number.isFinite(row?.finalScore),
  );

  const receipt = buildReceipt(report);
  const schema = verifyReceiptSchema(receipt);
  if (!schema.ok) {
    throw new TypeError(
      `${PROCESS_SENSOR_VALENCE_WIRE_CONTRACT}: RECEIPT_SCHEMA — ${schema.findings.join(', ')}`,
    );
  }
  const seal = sealReceipt(receipt);
  const reading = assess(receipt, baseline);

  return {
    contract: PROCESS_SENSOR_VALENCE_WIRE_CONTRACT,
    schemaVersion: PROCESS_SENSOR_VALENCE_WIRE_SCHEMA_VERSION,
    sensorContract: CYCLOTRON_SENSOR_CONTRACT,
    frontierSize: candidates.length,
    hasFeasibility,
    receipt,
    seal,
    schema,
    reading,
  };
}

/**
 * Exit code policy shared with the C-sensor shell.
 * 0 STABLE/ABSTAIN/NO_BASELINE, 1 DEVIATION, 2 refusal (caller decides refusals).
 */
export function exitCodeForReading(reading) {
  if (!reading || typeof reading !== 'object') return 2;
  return reading.verdict === 'DEVIATION' ? 1 : 0;
}
