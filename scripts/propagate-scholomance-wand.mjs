#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CANVAS = { width: 160, height: 90 };
const OUT = resolve('PolarisOS/worldpacks/shrine-demo/wand/scholomance-forest-entrance.wand.json');

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

// Sign & Altar vectors
formulas.push(strokeLaw('scholomance.sign_border', { x: 10, y: 34 }, { x: 36, y: 34 }, { baseWidth: 1.2, pressure: 0.9 }));
formulas.push(strokeLaw('scholomance.book_pages', { x: 21, y: 62 }, { x: 33, y: 62 }, { baseWidth: 1.0, pressure: 0.95 }));

// Banners 'S' Emblem vectors
formulas.push(strokeLaw('scholomance.banner_left_emblem', { x: 35, y: 24 }, { x: 35, y: 32 }, { baseWidth: 1.1, pressure: 0.9 }));
formulas.push(strokeLaw('scholomance.banner_right_emblem', { x: 143, y: 36 }, { x: 143, y: 44 }, { baseWidth: 1.1, pressure: 0.9 }));

// Lantern chain
formulas.push(strokeLaw('scholomance.lantern_chain', { x: 121, y: 10 }, { x: 121, y: 20 }, { baseWidth: 0.8, pressure: 0.85 }));

// Rune Monolith Glyphs
formulas.push(strokeLaw('scholomance.rune_glyph_l', { x: 55, y: 46 }, { x: 55, y: 54 }, { baseWidth: 1.0, pressure: 0.95 }));
formulas.push(strokeLaw('scholomance.rune_glyph_r', { x: 103, y: 52 }, { x: 103, y: 60 }, { baseWidth: 1.0, pressure: 0.95 }));

const packet = {
  asset: 'scholomance-forest-entrance',
  canvas: CANVAS,
  description: 'Scholomance Forest Entrance Wand formulas - sign, banners, lantern chain, book, and runes.',
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
