/**
 * PB-Semantics (SemQuant) public surface.
 * TurboQuant-style semantic unification for PixelBrain.
 */

export * from './semantic-types.js';
export * from './semantic-aliases.js';
export { createIRNode } from './pixelbrain-ir-node.js';
export { semanticUnifierPass } from './semantic-unifier.js';
export { scdlAstToIR } from './adapters/scdl-to-ir.adapter.js';
export { constructionSpecToIR } from './adapters/construction-to-ir.adapter.js';
export { partsSpecToIR } from './adapters/parts-spec-to-ir.adapter.js';

// Connective tissue bridge to rest of PixelBrain
export * from '../semantic-bridge.js';

// Shared semantic source of truth
export * from '../semantic-registry.js';
