// AMP REGISTRY
//
// STATUS: EXPERIMENTAL — WRITE-ONLY — NOT a product API.
//
// Truth pass 2026-08-12 (PixelBrain suite audit follow-up). Measured facts:
//   - getAmp()/listAmps() have ZERO consumers anywhere in the repo.
//   - Exactly two AMPs are registered, both as side effects at import time:
//       1. 'semantic-unifier'            (self-registered below, lazy bridge)
//       2. 'scholomance.character.motif' (scholomance-character-motif-amp.js)
//   - The REAL semantic path bypasses this registry: consumers import
//     semanticUnifierPass directly from semantic/semantic-unifier.js.
//   - The amps/ microprocessor family (TileForgeMicroprocessor) is a SEPARATE
//     system and is deliberately NOT registered here.
//
// This module exists as a load shim: character-foundry.js side-effect-imports
// scholomance-character-motif-amp.js, which imports registerAmp from here.
// Do NOT treat listAmps() as an inventory of PixelBrain capabilities.
// If you add a real consumer of getAmp/listAmps, update EXPECTED_AMPS in
// tests/codex/core/pixelbrain/amp-registry-truth.test.js in the same commit.
const REGISTRY = Object.create(null);

export function registerAmp(id, impl, meta = {}) {
  REGISTRY[id] = { impl, meta };
}

export function getAmp(id) {
  return REGISTRY[id] || null;
}

export function listAmps() {
  return Object.keys(REGISTRY);
}

// Wire SemQuant / PB-Semantics as a first-class capability (connective tissue)
let _semanticModulePromise = null;

async function getSemanticModule() {
  if (!_semanticModulePromise) {
    _semanticModulePromise = import('./semantic-bridge.js').catch(() => ({}));
  }
  return _semanticModulePromise;
}

registerAmp('semantic-unifier', {
  async applyAuthoringSemantics(...args) {
    const mod = await getSemanticModule();
    return mod.applyAuthoringSemantics ? mod.applyAuthoringSemantics(...args) : null;
  },
  async enrichPacketWithSemantics(...args) {
    const mod = await getSemanticModule();
    return mod.enrichPacketWithSemantics ? mod.enrichPacketWithSemantics(...args) : null;
  },
}, {
  version: 'PB-SEM-v1',
  category: 'authoring',
  description: 'SemQuant authoring semantic unification (roles, effects, parts, provenance) - async loaded',
});

export default { registerAmp, getAmp, listAmps };
