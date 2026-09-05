// AMP REGISTRY
//
// STATUS: EXPERIMENTAL — WRITE-ONLY for dispatch — NOT a product API.
//
// Truth pass 2026-08-12 (PixelBrain suite audit follow-up); consumers updated
// by the 2026-09-03 asset-pipeline UX audit (MAJOR: no way to discover effects).
//
// Measured facts:
//   - Exactly two AMPs are registered, both as side effects at import time:
//       1. 'semantic-unifier'            (self-registered below, lazy bridge)
//       2. 'scholomance.character.motif' (scholomance-character-motif-amp.js)
//   - The REAL semantic path bypasses this registry: consumers import
//     semanticUnifierPass directly from semantic/semantic-unifier.js.
//   - The amps/ microprocessor family (TileForgeMicroprocessor) is a SEPARATE
//     system and is deliberately NOT registered here.
//   - Nothing calls getAmp() to ROUTE work, which is what "write-only" means
//     here and why this registry must not be promoted to a product API on the
//     strength of existing.
//
// WHAT THIS IS NOT ANYMORE: the answer to "what effects exist?"
//   2 of 53 effect modules registering here made this the wrong place to look,
//   and the 2026-09-03 audit found readers had nothing else — their only
//   discovery method was opening source files one at a time by filename
//   guesswork. That question now has a real, self-updating answer:
//
//     codex/core/pixelbrain/EFFECT_CATALOG.md      (generated inventory + status)
//     node scripts/pixelbrain-effect-catalog.mjs   (regenerate; --check for CI)
//     npm run effects                              (print the catalog)
//
//   listAmps() has exactly one consumer, the catalog generator, which reads it
//   to report registration coverage. getAmp() still has none. The catalog's
//   liveness column comes from the import graph, NOT from this registry, so it
//   stays correct even if this file never gains another registrant.
//
// Do NOT treat listAmps() as an inventory of PixelBrain capabilities — read
// EFFECT_CATALOG.md for that.
//
// This module also remains a load shim: character-foundry.js side-effect-imports
// scholomance-character-motif-amp.js, which imports registerAmp from here.
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
