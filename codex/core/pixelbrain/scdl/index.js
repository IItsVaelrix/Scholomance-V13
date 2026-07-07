/**
 * SCDL — Public API
 *
 * Main entry point for all SCDL operations.
 * Import from here, not from individual sub-modules.
 */

export { compileSCDL }               from './scdl.compiler.js';
export { parseSCDL, tokenize }       from './scdl.grammar.js';
export { exportSCDL, buildAsepritePayload } from './scdl.exporters.js';
export { emitLattice }               from './scdl.lattice-emitter.js';
export { SCDL_ERROR_CODES, SCDLError, scdlError, scdlWarn, scdlInfo } from './scdl.errors.js';
export { buildSCDLDiagnosticReport, formatSCDLDiagnostic } from './scdl.diagnostics.js';

// SemQuant / PB-Semantics (Phase 1)
export * as SemQuant from '../semantic/index.js';
export { semanticUnifierPass } from '../semantic/semantic-unifier.js';
export { scdlAstToIR } from '../semantic/adapters/scdl-to-ir.adapter.js';
export { constructionSpecToIR } from '../semantic/adapters/construction-to-ir.adapter.js';
export * from '../semantic-bridge.js';
export * from '../semantic-registry.js';
