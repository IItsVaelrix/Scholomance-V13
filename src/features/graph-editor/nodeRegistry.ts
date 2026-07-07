/**
 * Node Registry for Scholomance Graph Editor (Rete.js backed)
 *
 * Every node kind must be registered here.
 * Unknown nodes are rejected at packet import and creation time.
 * This enforces the "no mystery meat" rule.
 */

import { ScholomanceGraphNodeDefinition } from './graphPacketSchema';

export const NODE_REGISTRY: Record<string, ScholomanceGraphNodeDefinition> = {
  'wand.formula': {
    kind: 'wand.formula',
    label: 'Wand Formula',
    category: 'Wand',
    inputs: {
      intent: { type: 'intent.text', optional: true },
    },
    outputs: {
      formula: { type: 'formula.curve' },
    },
    paramsSchema: {
      type: 'object',
      properties: {
        rationale: { type: 'string' },
        confidence: { type: 'number' },
        formula: { type: 'object' }, // the actual Wand proposal
      },
    },
    resolverId: 'wand.formula.v1',
    deterministic: true,
    pure: true,
    ui: {
      defaultWidth: 220,
      defaultHeight: 120,
      icon: '🪄',
      colorToken: '--color-wand',
    },
  },

  'wand.mathematicalStroke': {
    kind: 'wand.mathematicalStroke',
    label: 'Mathematical Stroke',
    category: 'Wand',
    inputs: {
      basePath: { type: 'formula.curve', optional: true },
    },
    outputs: {
      stroke: { type: 'formula.stroke' },
    },
    paramsSchema: {
      type: 'object',
      properties: {
        cx: { type: 'number' },
        cy: { type: 'number' },
        length: { type: 'number' },
        angle: { type: 'number' },
        baseWidth: { type: 'number' },
        widthVariation: { type: 'number' },
        frequency: { type: 'number' },
        density: { type: 'number' },
        bleed: { type: 'number' },
        n: { type: 'number' },
      },
    },
    resolverId: 'wand.stroke.v1',
    deterministic: true,
    pure: true,
    ui: {
      defaultWidth: 260,
      defaultHeight: 180,
      icon: '🖌️',
      colorToken: '--color-wand',
    },
  },

  'math.expression': {
    kind: 'math.expression',
    label: 'Math Expression (AST)',
    category: 'PixelBrain',
    inputs: {
      x: { type: 'math.scalar', optional: true },
      y: { type: 'math.scalar', optional: true },
      t: { type: 'math.scalar', optional: true },
    },
    outputs: {
      value: { type: 'math.scalar' },
      vector: { type: 'math.vector2', optional: true },
    },
    paramsSchema: {
      type: 'object',
      properties: {
        expression: { type: 'object' }, // the AST from previous pipeline work
        seed: { type: 'number' },
        precision: { type: 'number' },
        modifiers: { type: 'array' },
      },
    },
    resolverId: 'math.expression.v1',
    deterministic: true,
    pure: true,
    ui: {
      defaultWidth: 240,
      defaultHeight: 140,
      icon: '∑',
      colorToken: '--color-pixelbrain',
    },
  },

  'source.scdl': {
    kind: 'source.scdl',
    label: 'SCDL Source',
    category: 'SCDL',
    inputs: {},
    outputs: {
      ast: { type: 'scdl.ast' },
      source: { type: 'scdl.source' },
    },
    paramsSchema: {
      type: 'object',
      properties: {
        code: { type: 'string' },
      },
    },
    resolverId: 'scdl.parse.v1',
    deterministic: true,
    pure: true,
    ui: {
      defaultWidth: 200,
      defaultHeight: 120,
      icon: '📝',
      colorToken: '--color-scdl',
    },
  },

  'scdl.vectorOps': {
    kind: 'scdl.vectorOps',
    label: 'SCDL Vector Ops',
    category: 'SCDL',
    inputs: {
      ast: { type: 'scdl.ast' },
    },
    outputs: {
      vector: { type: 'formula.stroke' },
    },
    paramsSchema: {
      type: 'object',
      properties: {
        operation: { type: 'string', enum: ['normalize', 'scale', 'rotate'] },
        amount: { type: 'number' },
      },
    },
    resolverId: 'scdl.vectorOps.v1',
    deterministic: true,
    pure: true,
    ui: {
      defaultWidth: 220,
      defaultHeight: 140,
      icon: '↗️',
      colorToken: '--color-scdl',
    },
  },

  'pixelbrain.compile': {
    kind: 'pixelbrain.compile',
    label: 'PixelBrain Compile',
    category: 'PixelBrain',
    inputs: {
      vector: { type: 'formula.stroke' },
      palette: { type: 'pixelbrain.palette', optional: true },
    },
    outputs: {
      packet: { type: 'pixelbrain.packet' },
    },
    paramsSchema: {
      type: 'object',
      properties: {
        targetResolution: { type: 'number' },
        useSymmetry: { type: 'boolean' },
        antiAlias: { type: 'boolean' }
      },
    },
    resolverId: 'pixelbrain.compile.v1',
    deterministic: true,
    pure: true,
    ui: {
      defaultWidth: 200,
      defaultHeight: 100,
      icon: '🧬',
      colorToken: '--color-pixelbrain',
    },
  },

  'diagnostics.gate': {
    kind: 'diagnostics.gate',
    label: 'Diagnostics Gate',
    category: 'Diagnostics',
    inputs: {
      packet: { type: 'pixelbrain.packet' },
    },
    outputs: {
      validated: { type: 'pixelbrain.packet' },
    },
    paramsSchema: {
      type: 'object',
      properties: {
        failOn: { type: 'string', enum: ['error', 'warn'] },
      },
    },
    resolverId: 'diagnostics.gate.v1',
    deterministic: true,
    pure: true,
    ui: {
      defaultWidth: 180,
      defaultHeight: 90,
      icon: '🛡️',
      colorToken: '--color-diagnostics',
    },
  },

  'pixelbrain.geometryKernel': {
    kind: 'pixelbrain.geometryKernel',
    label: 'Geometry Kernel (Vector)',
    category: 'PixelBrain',
    inputs: {
      ast: { type: 'math.expression', optional: true }
    },
    outputs: {
      vector: { type: 'formula.stroke' },
    },
    paramsSchema: {
      type: 'object',
      properties: {
        shape: { type: 'string', enum: ['polygon', 'bezier', 'morph', 'blob'] },
        vertices: { type: 'number' },
        tension: { type: 'number' },
        scale: { type: 'number' },
        rotation: { type: 'number' },
        goldenRatio: { type: 'boolean' }
      }
    },
    resolverId: 'pixelbrain.geometry.v1',
    deterministic: true,
    pure: true,
    ui: {
      defaultWidth: 240,
      defaultHeight: 140,
      icon: '📐',
      colorToken: '--color-pixelbrain'
    }
  },

  'export.svg': {
    kind: 'export.svg',
    label: 'Export SVG',
    category: 'Export',
    inputs: {
      packet: { type: 'pixelbrain.packet' },
    },
    outputs: {
      artifact: { type: 'export.artifact' },
    },
    paramsSchema: {
      type: 'object',
      properties: {
        filename: { type: 'string' },
      },
    },
    resolverId: 'export.svg.v1',
    deterministic: true,
    pure: true,
    ui: {
      defaultWidth: 160,
      defaultHeight: 80,
      icon: '📄',
      colorToken: '--color-export',
    },
  },

  'divwand.lattice': {
    kind: 'divwand.lattice',
    label: 'DivWand Lattice',
    category: 'DivWand',
    inputs: {
      formula: { type: 'formula.stroke' },
      intent: { type: 'intent.text', optional: true },
    },
    outputs: {
      lattice: { type: 'lattice.qbit' },
    },
    paramsSchema: {
      type: 'object',
      properties: {
        resolution: { type: 'number' },
        density: { type: 'number' },
      },
    },
    resolverId: 'divwand.lattice.v1',
    deterministic: true,
    pure: true,
    ui: {
      defaultWidth: 200,
      defaultHeight: 120,
      icon: '🕸️',
      colorToken: '--color-divwand',
    },
  },

  'turboquant.semanticNormalize': {
    kind: 'turboquant.semanticNormalize',
    label: 'Semantic Normalize',
    category: 'SCDL',
    inputs: {
      intent: { type: 'intent.text' },
    },
    outputs: {
      normalized: { type: 'intent.text' },
    },
    paramsSchema: {
      type: 'object',
      properties: {
        strict: { type: 'boolean' },
      },
    },
    resolverId: 'turboquant.normalize.v1',
    deterministic: true,
    pure: true,
    ui: {
      defaultWidth: 200,
      defaultHeight: 100,
      icon: '🧠',
      colorToken: '--color-scdl',
    },
  },

  'pixelbrain.colorResolve': {
    kind: 'pixelbrain.colorResolve',
    label: 'Color Resolve',
    category: 'PixelBrain',
    inputs: {
      intent: { type: 'intent.text' },
    },
    outputs: {
      palette: { type: 'pixelbrain.palette' },
    },
    paramsSchema: {
      type: 'object',
      properties: {
        colorSpace: { type: 'string', enum: ['rgb', 'hsl', 'lab'] },
      },
    },
    resolverId: 'pixelbrain.colorResolve.v1',
    deterministic: true,
    pure: true,
    ui: {
      defaultWidth: 200,
      defaultHeight: 100,
      icon: '🎨',
      colorToken: '--color-pixelbrain',
    },
  },

  'pixelbrain.symmetryAmp': {
    kind: 'pixelbrain.symmetryAmp',
    label: 'Symmetry Amp',
    category: 'PixelBrain',
    inputs: {
      packet: { type: 'pixelbrain.packet' },
    },
    outputs: {
      packet: { type: 'pixelbrain.packet' },
    },
    paramsSchema: {
      type: 'object',
      properties: {
        axes: { type: 'number' },
      },
    },
    resolverId: 'pixelbrain.symmetryAmp.v1',
    deterministic: true,
    pure: true,
    ui: {
      defaultWidth: 200,
      defaultHeight: 100,
      icon: '❄️',
      colorToken: '--color-pixelbrain',
    },
  },

  'source.pixelbrain': {
    kind: 'source.pixelbrain',
    label: 'PixelBrain Source',
    category: 'Source',
    inputs: {},
    outputs: {
      packet: { type: 'pixelbrain.packet' },
    },
    paramsSchema: {
      type: 'object',
      properties: {
        assetId: { type: 'string' },
      },
    },
    resolverId: 'source.pixelbrain.v1',
    deterministic: true,
    pure: true,
    ui: {
      defaultWidth: 200,
      defaultHeight: 100,
      icon: '📦',
      colorToken: '--color-source',
    },
  },

  'source.imageSeed': {
    kind: 'source.imageSeed',
    label: 'Image Seed',
    category: 'Source',
    inputs: {},
    outputs: {
      intent: { type: 'intent.visual' },
    },
    paramsSchema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        seed: { type: 'string' },
      },
    },
    resolverId: 'source.imageSeed.v1',
    deterministic: true,
    pure: true,
    ui: {
      defaultWidth: 200,
      defaultHeight: 100,
      icon: '🌱',
      colorToken: '--color-source',
    },
  },

  'export.png': {
    kind: 'export.png',
    label: 'Export PNG',
    category: 'Export',
    inputs: {
      packet: { type: 'pixelbrain.packet' },
    },
    outputs: {
      artifact: { type: 'export.artifact' },
    },
    paramsSchema: {
      type: 'object',
      properties: {
        filename: { type: 'string' },
        resolution: { type: 'number' },
      },
    },
    resolverId: 'export.png.v1',
    deterministic: true,
    pure: true,
    ui: {
      defaultWidth: 160,
      defaultHeight: 100,
      icon: '🖼️',
      colorToken: '--color-export',
    },
  },

  'export.remotion': {
    kind: 'export.remotion',
    label: 'Export Remotion',
    category: 'Export',
    inputs: {
      project: { type: 'video.project' },
    },
    outputs: {
      artifact: { type: 'export.artifact' },
    },
    paramsSchema: {
      type: 'object',
      properties: {
        compositionId: { type: 'string' },
      },
    },
    resolverId: 'export.remotion.v1',
    deterministic: true,
    pure: true,
    ui: {
      defaultWidth: 180,
      defaultHeight: 100,
      icon: '🎬',
      colorToken: '--color-export',
    },
  },

  'combat.spellEffect': {
    kind: 'combat.spellEffect',
    label: 'Spell Effect',
    category: 'Combat',
    inputs: {
      tileState: { type: 'combat.tileState', optional: true },
    },
    outputs: {
      spell: { type: 'combat.spell' },
    },
    paramsSchema: {
      type: 'object',
      properties: {
        damage: { type: 'number' },
        element: { type: 'string' },
      },
    },
    resolverId: 'combat.spellEffect.v1',
    deterministic: true,
    pure: true,
    ui: {
      defaultWidth: 200,
      defaultHeight: 120,
      icon: '🔥',
      colorToken: '--color-combat',
    },
  },

  'combat.tileQuery': {
    kind: 'combat.tileQuery',
    label: 'Tile Query',
    category: 'Combat',
    inputs: {},
    outputs: {
      tileState: { type: 'combat.tileState' },
    },
    paramsSchema: {
      type: 'object',
      properties: {
        x: { type: 'number' },
        y: { type: 'number' },
        radius: { type: 'number' },
      },
    },
    resolverId: 'combat.tileQuery.v1',
    deterministic: true,
    pure: true,
    ui: {
      defaultWidth: 200,
      defaultHeight: 120,
      icon: '🗺️',
      colorToken: '--color-combat',
    },
  },

  'combat.damagePreview': {
    kind: 'combat.damagePreview',
    label: 'Damage Preview',
    category: 'Combat',
    inputs: {
      spell: { type: 'combat.spell' },
    },
    outputs: {
      artifact: { type: 'export.artifact' },
    },
    paramsSchema: {
      type: 'object',
      properties: {
        targetDummy: { type: 'string' },
      },
    },
    resolverId: 'combat.damagePreview.v1',
    deterministic: true,
    pure: true,
    ui: {
      defaultWidth: 200,
      defaultHeight: 100,
      icon: '💥',
      colorToken: '--color-combat',
    },
  },
};

export function getNodeDefinition(kind: string): ScholomanceGraphNodeDefinition | undefined {
  return NODE_REGISTRY[kind];
}

export function listNodeKinds(): string[] {
  return Object.keys(NODE_REGISTRY);
}
