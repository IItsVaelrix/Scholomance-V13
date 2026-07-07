/**
 * Scholomance Graph Editor (Rete.js backed)
 *
 * Entry point for the visual node authoring surface.
 *
 * Follows the PDR strictly:
 * - Rete.js = interactive canvas
 * - ScholomanceGraphPacket-v1 = canonical truth
 * - Determinism and existing compilers are preserved
 */

export * from './graphPacketSchema';
export * from './nodeRegistry';
export * from './reteGraphAdapter';
export * from './graphPacketCompiler';
export * from './reteSocketRegistry';
export { ScholomanceGraphEditor } from './ScholomanceGraphEditor';
export { createReteEditor } from './createReteEditor';

/**
 * Quick helper to create a minimal Wand + Math graph packet
 * (useful for testing the recent procedural vector pipeline improvements)
 */
export function createExampleWandMathPacket(seed = '9999'): any {
  return {
    schemaVersion: 'scholomance.graph.v1',
    graphId: 'crimson-fire-slime',
    title: 'Crimson Slime (Fire Affinity)',
    determinism: {
      seed,
      canonicalJsonVersion: 'canonical-json.v1',
      createdBy: 'ai',
      compilationMode: 'shadow',
    },
    nodes: [
      {
        id: 'n1',
        kind: 'turboquant.semanticNormalize',
        label: 'Concept Core',
        inputs: { intent: { type: 'intent.text' } },
        outputs: { normalized: { type: 'intent.text' } },
        params: { strict: true, raw: "Crimson slime monster with fire affinity" },
        compiler: { resolverId: 'turboquant.normalize.v1', version: 'v1', pure: true, deterministic: true, allowAsync: false },
      },
      {
        id: 'n2',
        kind: 'pixelbrain.colorResolve',
        label: 'Crimson Fire Palette',
        inputs: { intent: { type: 'intent.text' } },
        outputs: { palette: { type: 'pixelbrain.palette' } },
        params: { colorSpace: 'rgb', primary: '#DC143C', secondary: '#FF4500', glow: '#FFD700' },
        compiler: { resolverId: 'pixelbrain.colorResolve.v1', version: 'v1', pure: true, deterministic: true, allowAsync: false },
      },
      {
        id: 'n3',
        kind: 'pixelbrain.geometryKernel',
        label: 'Slime Vector Geometry',
        inputs: {},
        outputs: { vector: { type: 'formula.stroke' } },
        params: { shape: 'blob', vertices: 12, tension: 0.8, scale: 1.5, rotation: 0, goldenRatio: true },
        compiler: { resolverId: 'pixelbrain.geometry.v1', version: 'v1', pure: true, deterministic: true, allowAsync: false },
      },
      {
        id: 'n4',
        kind: 'pixelbrain.compile',
        label: 'Rasterize Monster',
        inputs: { vector: { type: 'formula.stroke' }, palette: { type: 'pixelbrain.palette' } },
        outputs: { packet: { type: 'pixelbrain.packet' } },
        params: { targetResolution: 64, useSymmetry: true, antiAlias: true },
        compiler: { resolverId: 'pixelbrain.compile.v1', version: 'v1', pure: true, deterministic: true, allowAsync: false },
      },
      {
        id: 'n5',
        kind: 'combat.spellEffect',
        label: 'Fire Affinity Aura',
        inputs: { tileState: { type: 'combat.tileState' } },
        outputs: { spell: { type: 'combat.spell' } },
        params: { damage: 15, element: 'Fire', dot: true },
        compiler: { resolverId: 'combat.spellEffect.v1', version: 'v1', pure: true, deterministic: true, allowAsync: false },
      }
    ],
    connections: [
      { id: 'c1', source: { nodeId: 'n1', socket: 'normalized' }, target: { nodeId: 'n2', socket: 'intent' }, type: 'intent.text' },
      { id: 'c3', source: { nodeId: 'n3', socket: 'vector' }, target: { nodeId: 'n4', socket: 'vector' }, type: 'formula.stroke' },
      { id: 'c5', source: { nodeId: 'n2', socket: 'palette' }, target: { nodeId: 'n4', socket: 'palette' }, type: 'pixelbrain.palette' }
    ],
    uiLayout: { 
      renderer: 'rete', 
      version: 'rete-layout.v1', 
      positions: {
        n1: { x: 50, y: 150 },
        n2: { x: 350, y: 50 },
        n3: { x: 350, y: 250 },
        n4: { x: 700, y: 150 },
        n5: { x: 700, y: 400 }
      } 
    },
    metadata: { tags: ['monster', 'slime', 'fire'], domain: 'mixed', authoringSurface: 'ScholomanceReteGraphEditor' },
    diagnostics: [],
  };
}
