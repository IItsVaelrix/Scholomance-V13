/**
 * PLACEBO-B — canonical-serializer + schema-verifier
 *
 * Blind label until autopsy. Port story:
 *   structure --[canonical-serializer]--> artifact
 *   artifact  --[schema-verifier]------> schema-verdict
 *
 * Open ports at selection: structure.
 */

import { stableStringify } from '../immunity/cleri-probe/canonical-report.js';

export const PLACEBO_B_CONTRACT = 'PB-PLACEBO-B-SERIALIZE-VERIFY-v1';
export const PLACEBO_B_SCHEMA_VERSION = '1.0.0';

/**
 * @param {unknown} structure
 * @returns {{
 *   contract: string,
 *   schemaVersion: string,
 *   artifact: string,
 *   schemaVerdict: 'PASS' | 'FAIL',
 *   findings: string[],
 * }}
 */
export function serializeAndVerify(structure) {
  if (structure === undefined || structure === null || typeof structure !== 'object') {
    throw new TypeError(`${PLACEBO_B_CONTRACT}: structure must be an object`);
  }
  const artifact = stableStringify(structure);
  const findings = [];
  if (typeof structure.contract !== 'string' || !structure.contract) {
    findings.push('NO_CONTRACT');
  }
  if (typeof structure.schemaVersion !== 'string' || !structure.schemaVersion) {
    findings.push('NO_SCHEMA_VERSION');
  }
  // Load-bearing shape: a structure without keys is not a schema-bearing artifact.
  if (Object.keys(structure).length === 0) {
    findings.push('EMPTY_STRUCTURE');
  }
  return {
    contract: PLACEBO_B_CONTRACT,
    schemaVersion: PLACEBO_B_SCHEMA_VERSION,
    artifact,
    schemaVerdict: findings.length === 0 ? 'PASS' : 'FAIL',
    findings,
  };
}
