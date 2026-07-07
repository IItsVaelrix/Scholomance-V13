/**
 * SCDL Diagnostic Bridge
 *
 * Converts CompileResult diagnostics into the format expected by the
 * existing SCD64 diagnostic infrastructure (DiagnosticReport.js).
 *
 * Registers SCDL as a known diagnostic source: 'SCDL-v1'.
 */

/**
 * Build a DiagnosticReport-compatible entry list from a CompileResult.
 *
 * @param {import('./scdl.compiler.js').CompileResult} result
 * @returns {{ source: string, entries: object[], summary: object }}
 */
export function buildSCDLDiagnosticReport(result) {
  const entries = (result.diagnostics || []).map(d => ({
    source:        d.source || 'SCDL-v1',
    module:        d.module || 'scdl-compiler',
    severity:      d.severity,
    code:          d.code,
    message:       d.message,
    loc:           d.loc,
    bytecodeString: d.bytecodeString,
    context:       d.context,
    assetId:       d.assetId,
    packetId:      d.packetId,
  }));

  const errorCount = entries.filter(e => e.severity === 'ERROR').length;
  const warnCount  = entries.filter(e => e.severity === 'WARN').length;
  const infoCount  = entries.filter(e => e.severity === 'INFO').length;

  return {
    source:  'SCDL-v1',
    ok:      result.ok,
    entries,
    summary: {
      total:  entries.length,
      errors: errorCount,
      warns:  warnCount,
      infos:  infoCount,
      regressionSeed: result.regressionSeed,
    },
  };
}

/**
 * Format a single SCDLError as a hover-decodable diagnostic string
 * suitable for display in the IDE diagnostic panel.
 *
 * Format: "[SCDL-xxx] message (line:col) | PB-ERR-v1-..."
 *
 * @param {import('./scdl.errors.js').SCDLError} err
 * @returns {string}
 */
export function formatSCDLDiagnostic(err) {
  const loc = err.loc ? `line ${err.loc.line}:${err.loc.col}` : 'unknown location';
  return `[${err.label}] ${err.message} (${loc}) | ${err.bytecodeString}`;
}
