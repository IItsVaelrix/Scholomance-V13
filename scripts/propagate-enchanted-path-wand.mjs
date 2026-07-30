#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CANVAS = { width: 288, height: 192 };
const OUT = resolve('PolarisOS/worldpacks/shrine-demo/wand/scholomance-enchanted-forest-path.wand.json');

function q(n) { return Math.round(n * 10) / 10; }

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

// Citadel spires and sunbeam vectors
formulas.push(strokeLaw('scholomance.citadel_spire_l', { x: 138, y: 15 }, { x: 138, y: 35 }, { baseWidth: 1.1, pressure: 0.9 }));
formulas.push(strokeLaw('scholomance.citadel_spire_r', { x: 150, y: 15 }, { x: 150, y: 35 }, { baseWidth: 1.1, pressure: 0.9 }));
formulas.push(strokeLaw('scholomance.citadel_cross', { x: 136, y: 30 }, { x: 152, y: 30 }, { baseWidth: 1.0, pressure: 0.85 }));

// Rune Monolith Glyphs
formulas.push(strokeLaw('scholomance.rune_glyph_1', { x: 72, y: 104 }, { x: 72, y: 116 }, { baseWidth: 1.0, pressure: 0.95 }));
formulas.push(strokeLaw('scholomance.rune_glyph_2', { x: 172, y: 108 }, { x: 172, y: 120 }, { baseWidth: 1.0, pressure: 0.95 }));
formulas.push(strokeLaw('scholomance.rune_glyph_3', { x: 248, y: 124 }, { x: 248, y: 136 }, { baseWidth: 1.0, pressure: 0.95 }));
formulas.push(strokeLaw('scholomance.rune_glyph_4', { x: 232, y: 150 }, { x: 232, y: 164 }, { baseWidth: 1.2, pressure: 0.95 }));

// Stream water ripples & light strokes
formulas.push(strokeLaw('scholomance.stream_ripple_1', { x: 220, y: 100 }, { x: 220, y: 110 }, { baseWidth: 0.9, pressure: 0.9 }));
formulas.push(strokeLaw('scholomance.stream_ripple_2', { x: 200, y: 125 }, { x: 215, y: 125 }, { baseWidth: 0.9, pressure: 0.9 }));
formulas.push(strokeLaw('scholomance.stream_ripple_3', { x: 200, y: 160 }, { x: 225, y: 160 }, { baseWidth: 1.0, pressure: 0.9 }));

// Path specular borders
formulas.push(strokeLaw('scholomance.path_border_l', { x: 144, y: 92 }, { x: 80, y: 192 }, { baseWidth: 1.1, pressure: 0.85 }));
formulas.push(strokeLaw('scholomance.path_border_r', { x: 144, y: 92 }, { x: 188, y: 192 }, { baseWidth: 1.1, pressure: 0.85 }));

const packet = {
  asset: 'scholomance-enchanted-forest-path',
  canvas: CANVAS,
  description: 'Scholomance Enchanted Forest Path Wand formulas - citadel spires, rune glyphs, stream ripples, and path borders.',
  propagation: {
    gene: 'WAND_CHEMICAL_STROKE_PROPAGATION',
    mode: 'chemical-reaction',
    visibleRoles: ['scholomance.*'],
    invisibleRoles: [],
  },
  formulas,
};

writeFileSync(OUT, `${JSON.stringify(packet, null, 2)}\n`);
console.log(`Wrote ${formulas.length} formulas → ${OUT}`);
