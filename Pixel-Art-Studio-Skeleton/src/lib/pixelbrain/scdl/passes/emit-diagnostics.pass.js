/**
 * SCDL Emit Diagnostics Pass
 *
 * Converts SCDLError[] into hover-decodable diagnostic entries.
 * These are structured for the existing SCD64 diagnostic infrastructure.
 */

/**
 * @param {object} ast
 * @param {import('../scdl.errors.js').SCDLError[]} errors
 * @param {object|null} packet - PixelBrainAssetPacket (may be null on compile failure)
 * @returns {object[]} diagnostic entries
 */
export function emitDiagnosticsPass(ast, errors, packet) {
  const diagnostics = errors.map(err => {
    const isSemantic = err.semantic === true || String(err.code || '').startsWith('PB-SEM');
    return {
      source:         isSemantic ? 'PB-Semantics' : 'SCDL-v1',
      module:         isSemantic ? 'semantic-unifier' : 'scdl-compiler',
      severity:       err.severity || 'ERROR',
      code:           err.code || err.label || 'SCDL-???',
      message:        err.message,
      loc:            err.loc || { line: 0, col: 0 },
      bytecodeString: err.bytecodeString || (isSemantic ? String(err.code || 'PB-SEM-000') : undefined),
      context:        err.context || {},
      assetId:        ast?.asset || null,
      packetId:       packet?.id || null,
      _semantic:      isSemantic,
    };
  });

  return diagnostics;
}
