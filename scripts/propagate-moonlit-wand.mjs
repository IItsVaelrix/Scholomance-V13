#!/usr/bin/env node
/**
 * WAND CHEMICAL STROKE PROPAGATION — moonlit-shrine-forest v4
 *
 * Gene: WAND_CHEMICAL_STROKE_PROPAGATION
 * Fence offset bonding, torii/moon accents, tree trunk contours, and winding path vectors.
 */

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CANVAS = { width: 160, height: 90 };
const OUT = resolve('PolarisOS/worldpacks/shrine-demo/wand/moonlit-shrine-forest.wand.json');

function q(n) {
  return Math.round(n * 10) / 10;
}

function strokeLaw(role, origin, target, opts = {}) {
  return {
    role,
    type: 'mathematical_stroke',
    description: opts.description || role,
    formula: {
      coordinateFormula: {
        type: 'mathematical_stroke',
        parameters: {
          origin: { x: q(origin.x), y: q(origin.y) },
          target: { x: q(target.x), y: q(target.y) },
          baseWidth: opts.baseWidth ?? 1.2,
          widthVariation: opts.widthVariation ?? 0.2,
          frequency: opts.frequency ?? 1.4,
          density: opts.density ?? 1.0,
          bleed: opts.bleed ?? 0.1,
          n: opts.n ?? 36,
        },
      },
    },
    pressure: opts.pressure ?? 0.85,
  };
}

const formulas = [];

// ── Fallen Fence / Cross: Gold Vector Strokes ──────────────────────────────
formulas.push(
  strokeLaw('moonlit.fence_strut_a', { x: 10, y: 74 }, { x: 48, y: 58 }, {
    baseWidth: 1.4,
    pressure: 0.88,
    description: 'fence primary strut',
  }),
);
formulas.push(
  strokeLaw('moonlit.fence_strut_b', { x: 14, y: 82 }, { x: 52, y: 66 }, {
    baseWidth: 1.3,
    pressure: 0.82,
    description: 'fence parallel strut',
  }),
);
formulas.push(
  strokeLaw('moonlit.fence_cross', { x: 20, y: 64 }, { x: 38, y: 78 }, {
    baseWidth: 1.1,
    pressure: 0.78,
    description: 'fence cross beam',
  }),
);

// ── Torii Gate: Cyan Vector Contours ────────────────────────────────────────
formulas.push(
  strokeLaw('moonlit.torii_lintel', { x: 93, y: 26 }, { x: 119, y: 26 }, {
    baseWidth: 1.2,
    pressure: 0.95,
    frequency: 1.0,
    bleed: 0.08,
  }),
);
formulas.push(
  strokeLaw('moonlit.torii_pillar_l', { x: 98, y: 28 }, { x: 98, y: 44 }, {
    baseWidth: 1.1,
    pressure: 0.9,
  }),
);
formulas.push(
  strokeLaw('moonlit.torii_pillar_r', { x: 112, y: 28 }, { x: 112, y: 44 }, {
    baseWidth: 1.1,
    pressure: 0.9,
  }),
);

// ── Moon Halo Ring ──────────────────────────────────────────────────────────
formulas.push({
  role: 'moonlit.moon_halo_ring',
  type: 'parametric_curve',
  description: 'moon halo ring',
  formula: {
    coordinateFormula: {
      type: 'parametric_curve',
      curveType: 'circle',
      center: { x: 118, y: 14 },
      radius: 8,
      parameters: {
        cx: 118,
        cy: 14,
        a: 8,
        b: 1,
        c: 0,
        n: 48,
      },
    },
  },
  pressure: 0.75,
});

// ── Tree Trunk Contours: Gold Edge Accents ─────────────────────────────────
formulas.push(
  strokeLaw('moonlit.tree_left_contour', { x: 31, y: 34 }, { x: 25, y: 88 }, {
    baseWidth: 1.0,
    pressure: 0.75,
    description: 'left trunk edge highlight',
  }),
);
formulas.push(
  strokeLaw('moonlit.tree_right_contour', { x: 134, y: 34 }, { x: 137, y: 88 }, {
    baseWidth: 1.0,
    pressure: 0.75,
    description: 'right trunk edge highlight',
  }),
);

// ── Invisible Grain Flow Guides (Skipped during stroke draw) ───────────────
formulas.push(
  strokeLaw('grain.tree_left', { x: 18, y: 88 }, { x: 22, y: 4 }, {
    baseWidth: 0.6,
    pressure: 0.22,
    frequency: 1.0,
    bleed: 0.05,
    n: 28,
    description: 'left trunk grain flow axis (invisible)',
  }),
);
formulas.push(
  strokeLaw('grain.tree_right', { x: 140, y: 88 }, { x: 142, y: 4 }, {
    baseWidth: 0.6,
    pressure: 0.22,
    frequency: 1.0,
    bleed: 0.05,
    n: 28,
    description: 'right trunk grain flow axis (invisible)',
  }),
);

const packet = {
  asset: 'moonlit-shrine-forest',
  canvas: CANVAS,
  description:
    'v4 native language — dense pixel craft + scene lighting field, S-curve path, authored bark craft, torii/moon/fence vector superposition.',
  propagation: {
    gene: 'WAND_CHEMICAL_STROKE_PROPAGATION',
    mode: 'chemical-reaction',
    depthMax: 0,
    jitter: false,
    catalysts: ['offset-bonding', 'turboquant-round'],
    visibleRoles: ['fence', 'torii', 'moon', 'tree'],
    invisibleRoles: ['grain.*'],
  },
  formulas,
};

writeFileSync(OUT, `${JSON.stringify(packet, null, 2)}\n`);
console.log(`Wrote ${formulas.length} formulas → ${OUT}`);
