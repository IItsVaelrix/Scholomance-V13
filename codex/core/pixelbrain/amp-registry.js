// Minimal stub for amp-registry to allow character-foundry to load.
// The real implementation would register and manage AMP processors.
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
