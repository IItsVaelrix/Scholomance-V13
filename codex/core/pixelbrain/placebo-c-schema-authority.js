/**
 * PLACEBO-C — schema-verifier + server-authority
 *
 * Blind label until autopsy. Port story:
 *   artifact --[schema-verifier]--> schema-verdict
 *   diagnostic-event + schema-verdict --[server-authority]--> authoritative-verdict
 *
 * Open ports at selection: artifact (input), diagnostic-event (input).
 * server-authority evidence path is a directory, not a pure API — this module
 * implements the *port contract* only, without importing codex/server.
 */

export const PLACEBO_C_CONTRACT = 'PB-PLACEBO-C-SCHEMA-AUTHORITY-v1';
export const PLACEBO_C_SCHEMA_VERSION = '1.0.0';

function verifyArtifactSchema(artifact) {
  const findings = [];
  let parsed = artifact;
  if (typeof artifact === 'string') {
    try {
      parsed = JSON.parse(artifact);
    } catch {
      return { ok: false, findings: ['ARTIFACT_NOT_JSON'], parsed: null };
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, findings: ['ARTIFACT_NOT_OBJECT'], parsed: null };
  }
  if (typeof parsed.contract !== 'string') findings.push('NO_CONTRACT');
  if (typeof parsed.schemaVersion !== 'string') findings.push('NO_SCHEMA_VERSION');
  return { ok: findings.length === 0, findings, parsed };
}

/**
 * @param {{ artifact: unknown, diagnosticEvent: unknown }} input
 * @returns {{
 *   contract: string,
 *   schemaVersion: string,
 *   schemaVerdict: 'PASS' | 'FAIL',
 *   findings: string[],
 *   authoritativeVerdict: 'AUTHORITATIVE' | 'REFUSED',
 *   reason: string | null,
 * }}
 */
export function authorize(input) {
  if (!input || typeof input !== 'object') {
    throw new TypeError(`${PLACEBO_C_CONTRACT}: input must be an object`);
  }
  const { artifact, diagnosticEvent } = input;
  const schema = verifyArtifactSchema(artifact);
  if (!schema.ok) {
    return {
      contract: PLACEBO_C_CONTRACT,
      schemaVersion: PLACEBO_C_SCHEMA_VERSION,
      schemaVerdict: 'FAIL',
      findings: schema.findings,
      authoritativeVerdict: 'REFUSED',
      reason: 'SCHEMA_FAIL',
    };
  }
  if (!diagnosticEvent || typeof diagnosticEvent !== 'object') {
    return {
      contract: PLACEBO_C_CONTRACT,
      schemaVersion: PLACEBO_C_SCHEMA_VERSION,
      schemaVerdict: 'PASS',
      findings: [],
      authoritativeVerdict: 'REFUSED',
      reason: 'NO_DIAGNOSTIC_EVENT',
    };
  }
  if (typeof diagnosticEvent.code !== 'string' || !diagnosticEvent.code) {
    return {
      contract: PLACEBO_C_CONTRACT,
      schemaVersion: PLACEBO_C_SCHEMA_VERSION,
      schemaVerdict: 'PASS',
      findings: [],
      authoritativeVerdict: 'REFUSED',
      reason: 'DIAGNOSTIC_EVENT_INCOMPLETE',
    };
  }
  return {
    contract: PLACEBO_C_CONTRACT,
    schemaVersion: PLACEBO_C_SCHEMA_VERSION,
    schemaVerdict: 'PASS',
    findings: [],
    authoritativeVerdict: 'AUTHORITATIVE',
    reason: null,
  };
}
