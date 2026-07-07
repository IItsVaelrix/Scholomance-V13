/**
 * combatAssets.js — WAND-authored combat art (Combat surface), full treatment.
 *
 * Each combatant is composited from many Wand formula layers (edge_trace
 * silhouettes + parametric_curve orbs) with painterly gradient shading, soft
 * volume shadows, rim light, and neon glow via wandSvg.renderWandSvg. edge_trace
 * authors a half-silhouette; the `mirror` flag reflects it for bilateral symmetry.
 *
 * Textures are base64 data-URIs loaded by the isometric Phaser scene.
 *
 * LAW note: illustrated sprite art (owner decision, 2026-06-06) departs from the
 * anti-skeuomorphic sigil mandate.
 */

import { renderWandSvgUri } from './wandSvg.js';
import { bakeAll } from '../scenes/CharacterShaderRenderer.js';
import { combat_tileUri } from './generated/combat-tile.js';
import { combat_torchUri } from './generated/combat-torch.js';
import { combat_leylineUri } from './generated/combat-leyline.js';

export const SCHOOL_PALETTE = {
  SONIC:      { primary: '#8a5bff', glow: '#b79bff', dark: '#1a0f33', accent: '#ffe27a' },
  VOID:       { primary: '#9a6bff', glow: '#c8a2ff', dark: '#0c0c1a', accent: '#ff7ae0' },
  PSYCHIC:    { primary: '#00e5ff', glow: '#9bf6ff', dark: '#04222b', accent: '#ffe27a' },
  ALCHEMY:    { primary: '#ff3d8b', glow: '#ff9dc4', dark: '#2b0418', accent: '#ffd36e' },
  WILL:       { primary: '#ffd400', glow: '#fff19b', dark: '#2b2200', accent: '#fff7cc' },
  NECROMANCY: { primary: '#22c55e', glow: '#4ade80', dark: '#052e16', accent: '#bbf7d0' },
  ABJURATION: { primary: '#06b6d4', glow: '#22d3ee', dark: '#083344', accent: '#cffafe' },
  DIVINATION: { primary: '#eab308', glow: '#facc15', dark: '#422006', accent: '#fef08a' },
};

function palette(school) {
  return SCHOOL_PALETTE[school] || SCHOOL_PALETTE.SONIC;
}

function edgeTrace(tracePath) {
  return { coordinateFormula: { type: 'edge_trace', tracePath } };
}

function circle(cx, cy, r, n = 36) {
  return { coordinateFormula: { type: 'parametric_curve', parameters: { cx, cy, a: r, n } } };
}

function ellipsePath(cx, cy, rx, ry, n = 40) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2;
    pts.push({ x: cx + rx * Math.cos(t), y: cy + ry * Math.sin(t) });
  }
  return pts;
}

const eyeGradient = (core, mid, edge) => ({
  type: 'radial', cx: 0.5, cy: 0.5, r: 0.5,
  stops: [[0, '#ffffff', 1], [0.3, core, 1], [0.65, mid, 0.85], [1, edge, 0]],
});

// ---------------------------------------------------------------------------
// Isometric floor tile — a shaded diamond with a glowing rim
// ---------------------------------------------------------------------------

export function buildTileTexture({ w = 128, h = 64, school = 'SONIC' } = {}) {
  const p = palette(school);
  const cx = w / 2;
  const diamond = [
    { x: cx, y: 1 }, { x: w - 1, y: h / 2 }, { x: cx, y: h - 1 }, { x: 1, y: h / 2 },
  ];
  return renderWandSvgUri({
    width: w, height: h,
    layers: [
      {
        formula: edgeTrace(diamond), close: true,
        gradient: { type: 'linear', x1: 0, y1: 0, x2: 0, y2: 1, stops: [[0, p.dark, 0.95], [1, '#02030a', 0.85]] },
      },
      { formula: edgeTrace(diamond), close: true, stroke: p.primary, strokeWidth: 1.4, opacity: 0.6, glow: 2 },
    ],
  });
}

// ---------------------------------------------------------------------------
// The Scholar (player) — a hooded caster with staff, painted robe + rim light
// ---------------------------------------------------------------------------

export function buildScholarTexture({ school = 'PSYCHIC', w = 170, h = 232 } = {}) {
  const p = palette(school);
  const cx = w / 2;
  const half = [
    { x: cx, y: 16 },        // hood peak
    { x: cx + 17, y: 38 },   // hood brow
    { x: cx + 9, y: 52 },    // neck
    { x: cx + 33, y: 84 },   // shoulder / sleeve
    { x: cx + 24, y: 120 },  // waist
    { x: cx + 42, y: 168 },  // robe flare
    { x: cx + 56, y: 214 },  // hem out
    { x: cx + 26, y: 206 },  // hem notch
    { x: cx + 36, y: 218 },  // hem point
    { x: cx, y: 210 },       // center base
  ];
  const robeGrad = {
    type: 'linear', x1: 0, y1: 0, x2: 0, y2: 1,
    stops: [[0, '#15576a', 1], [0.45, '#0e3c49', 1], [1, '#05161b', 1]],
  };
  return renderWandSvgUri({
    width: w, height: h,
    layers: [
      // Ground glow.
      { formula: edgeTrace(ellipsePath(cx, 214, 52, 14)), close: true,
        gradient: { type: 'radial', cx: 0.5, cy: 0.5, r: 0.5, stops: [[0, p.primary, 0.5], [1, p.primary, 0]] }, blur: 3 },
      // Outer aura.
      { formula: edgeTrace(half), close: true, mirror: true, stroke: p.glow, strokeWidth: 7, opacity: 0.18, glow: 11 },
      // Robe body, painted.
      { formula: edgeTrace(half), close: true, mirror: true, gradient: robeGrad },
      // Inner volume shadow.
      { formula: edgeTrace(half.map((q) => ({ x: q.x - (q.x - cx) * 0.22, y: q.y + 4 }))), close: true, mirror: true, fill: '#02090c', opacity: 0.5, blur: 3 },
      // Rim light.
      { formula: edgeTrace(half), close: true, mirror: true, stroke: p.primary, strokeWidth: 2.2, glow: 4, opacity: 0.95 },
      // Robe seam / fold accents.
      { formula: edgeTrace([{ x: cx, y: 58 }, { x: cx, y: 200 }]), stroke: p.glow, strokeWidth: 1, opacity: 0.3 },
      { formula: edgeTrace([{ x: cx + 16, y: 96 }, { x: cx + 30, y: 160 }]), stroke: p.primary, strokeWidth: 1, opacity: 0.35, mirror: true },
      // Hood cavity.
      { formula: edgeTrace(ellipsePath(cx, 44, 15, 19)), close: true,
        gradient: { type: 'radial', cx: 0.5, cy: 0.45, r: 0.6, stops: [[0, '#000000', 1], [0.7, '#000814', 0.95], [1, '#06303a', 0.3]] } },
      // Eyes.
      { formula: circle(cx + 6, 44, 3.2), close: true, gradient: eyeGradient('#7af6ff', p.primary, p.primary), mirror: true, glow: 5 },
      // Chest sigil.
      { formula: circle(cx, 98, 8), close: true, stroke: p.accent, strokeWidth: 1.6, opacity: 0.85, glow: 4 },
      { formula: edgeTrace([{ x: cx - 6, y: 98 }, { x: cx + 6, y: 98 }]), stroke: p.accent, strokeWidth: 1.4, opacity: 0.8 },
      { formula: edgeTrace([{ x: cx, y: 92 }, { x: cx, y: 104 }]), stroke: p.accent, strokeWidth: 1.4, opacity: 0.8 },
      // Staff with crowned orb.
      { formula: edgeTrace([{ x: cx + 52, y: 62 }, { x: cx + 50, y: 216 }]), stroke: '#caa15a', strokeWidth: 2.6, opacity: 0.9 },
      { formula: circle(cx + 52, 54, 9), close: true,
        gradient: { type: 'radial', cx: 0.5, cy: 0.5, r: 0.5, stops: [[0, '#fff7df', 1], [0.5, p.accent, 1], [1, '#caa15a', 0]] }, glow: 8 },
      { formula: circle(cx + 52, 54, 12), close: true, stroke: p.accent, strokeWidth: 1.4, opacity: 0.6, glow: 5 },
    ],
  });
}

// ---------------------------------------------------------------------------
// Void Wraith (enemy) — horned hooded specter, burning eyes, glowing core
// ---------------------------------------------------------------------------

export function buildWraithTexture({ school = 'VOID', w = 200, h = 264 } = {}) {
  const p = palette(school);
  const cx = w / 2;
  const half = [
    { x: cx, y: 22 },        // hood crown
    { x: cx + 18, y: 30 },   // hood curve
    { x: cx + 28, y: 52 },   // hood side
    { x: cx + 16, y: 66 },   // jaw
    { x: cx + 8, y: 74 },    // neck
    { x: cx + 38, y: 92 },   // shoulder rise
    { x: cx + 70, y: 120 },  // wing / shoulder tip
    { x: cx + 48, y: 138 },  // under-shoulder
    { x: cx + 56, y: 176 },  // torso side
    { x: cx + 40, y: 202 },  // lower robe
    { x: cx + 62, y: 254 },  // tatter spike 1
    { x: cx + 38, y: 234 },  // notch
    { x: cx + 46, y: 258 },  // spike 2
    { x: cx + 18, y: 240 },  // notch
    { x: cx + 24, y: 260 },  // spike 3
    { x: cx, y: 248 },       // center hem
  ];
  const bodyGrad = {
    type: 'linear', x1: 0, y1: 0, x2: 0, y2: 1,
    stops: [[0, '#2c1a52', 1], [0.35, '#3a2363', 1], [0.62, '#1b1230', 1], [1, '#06050f', 1]],
  };
  return renderWandSvgUri({
    width: w, height: h,
    layers: [
      // Ground glow.
      { formula: edgeTrace(ellipsePath(cx, 250, 64, 16)), close: true,
        gradient: { type: 'radial', cx: 0.5, cy: 0.5, r: 0.5, stops: [[0, p.primary, 0.55], [1, p.primary, 0]] }, blur: 4 },
      // Outer aura.
      { formula: edgeTrace(half), close: true, mirror: true, stroke: p.glow, strokeWidth: 8, opacity: 0.2, glow: 13 },
      // Body, painted.
      { formula: edgeTrace(half), close: true, mirror: true, gradient: bodyGrad },
      // Volume shadow.
      { formula: edgeTrace(half.map((q) => ({ x: q.x - (q.x - cx) * 0.2, y: q.y + 5 }))), close: true, mirror: true, fill: '#040308', opacity: 0.55, blur: 4 },
      // Rim light.
      { formula: edgeTrace(half), close: true, mirror: true, stroke: p.glow, strokeWidth: 2.4, glow: 5, opacity: 0.92 },
      // Shoulder / rib seams.
      { formula: edgeTrace([{ x: cx, y: 96 }, { x: cx + 30, y: 104 }, { x: cx + 56, y: 116 }]), stroke: p.primary, strokeWidth: 1.4, opacity: 0.5, mirror: true, glow: 2 },
      { formula: edgeTrace([{ x: cx, y: 124 }, { x: cx + 24, y: 132 }]), stroke: p.primary, strokeWidth: 1.2, opacity: 0.4, mirror: true },
      // Hood cavity.
      { formula: edgeTrace(ellipsePath(cx, 50, 19, 24)), close: true,
        gradient: { type: 'radial', cx: 0.5, cy: 0.42, r: 0.62, stops: [[0, '#000000', 1], [0.7, '#05010f', 0.96], [1, '#2a1250', 0.35]] } },
      // Horns curving up & out.
      { formula: edgeTrace([{ x: cx + 8, y: 30 }, { x: cx + 20, y: 12 }, { x: cx + 30, y: 2 }]), stroke: p.glow, strokeWidth: 3, opacity: 0.9, mirror: true, glow: 4 },
      // Burning eyes.
      { formula: circle(cx + 9, 48, 4), close: true, gradient: eyeGradient(p.accent, p.accent, p.primary), mirror: true, glow: 8 },
      // Glowing chest core.
      { formula: circle(cx, 118, 11), close: true,
        gradient: { type: 'radial', cx: 0.5, cy: 0.5, r: 0.5, stops: [[0, '#ffffff', 1], [0.4, p.accent, 1], [1, p.primary, 0]] }, glow: 10 },
      { formula: circle(cx, 118, 16), close: true, stroke: p.accent, strokeWidth: 1.4, opacity: 0.55, glow: 6 },
    ],
  });
}

// ---------------------------------------------------------------------------
// Obsidian pillar — a faceted monolith framing the VOID arena
// ---------------------------------------------------------------------------

export function buildPillarTexture({ school = 'VOID', w = 96, h = 248 } = {}) {
  const p = palette(school);
  const cx = w / 2;
  // Right-half obelisk: narrow crown, faceted shaft, broad base.
  const half = [
    { x: cx, y: 6 },         // crown point
    { x: cx + 16, y: 34 },   // crown shoulder
    { x: cx + 22, y: 70 },   // upper shaft
    { x: cx + 19, y: 200 },  // lower shaft (slight taper)
    { x: cx + 30, y: 224 },  // base flare
    { x: cx + 34, y: 244 },  // base foot
    { x: cx, y: 244 },       // center base
  ];
  const stoneGrad = {
    type: 'linear', x1: 0, y1: 0, x2: 0, y2: 1,
    stops: [[0, '#16122a', 1], [0.4, '#0d0a1c', 1], [1, '#040308', 1]],
  };
  return renderWandSvgUri({
    width: w, height: h,
    layers: [
      // Base ground glow.
      { formula: edgeTrace(ellipsePath(cx, 242, 40, 11)), close: true,
        gradient: { type: 'radial', cx: 0.5, cy: 0.5, r: 0.5, stops: [[0, p.primary, 0.5], [1, p.primary, 0]] }, blur: 4 },
      // Monolith body.
      { formula: edgeTrace(half), close: true, mirror: true, gradient: stoneGrad },
      // Lit facet (front-left edge catches arena light).
      { formula: edgeTrace([{ x: cx, y: 8 }, { x: cx, y: 242 }]), stroke: '#2a2150', strokeWidth: 2, opacity: 0.6 },
      // Amethyst veins cracking up the shaft.
      { formula: edgeTrace([{ x: cx + 4, y: 60 }, { x: cx + 12, y: 110 }, { x: cx + 6, y: 150 }, { x: cx + 14, y: 205 }]), stroke: p.primary, strokeWidth: 1.6, opacity: 0.7, glow: 4, mirror: true },
      // Rim light.
      { formula: edgeTrace(half), close: true, mirror: true, stroke: p.glow, strokeWidth: 1.8, opacity: 0.55, glow: 3 },
      // Crown ember.
      { formula: circle(cx, 14, 4), close: true,
        gradient: { type: 'radial', cx: 0.5, cy: 0.5, r: 0.5, stops: [[0, '#ffffff', 1], [0.5, p.accent, 1], [1, p.primary, 0]] }, glow: 7 },
    ],
  });
}

// ---------------------------------------------------------------------------
// Texture registry — keys consumed by the isometric scene loader
// ---------------------------------------------------------------------------

export function buildCombatTextures({ school = 'SONIC' } = {}) {
  const tileW = 256, tileH = 128;
  const torchW = 120, torchH = 240;
  // Fallbacks for characters (since they are dynamically baked now)
  const scholarW = 128, scholarH = 192;
  const wraithW = 128, wraithH = 192;

  // For characters, the placeholder can just be an empty transparent URI or we rely on them baking in.
  // Using the tile URI as a placeholder so Phaser has *something* before bakeAll finishes
  return {
    'combat-tile':    { uri: combat_tileUri, w: tileW, h: tileH },
    'combat-scholar': { uri: combat_tileUri, w: scholarW, h: scholarH },
    'combat-wraith':  { uri: combat_tileUri, w: wraithW, h: wraithH },
    'combat-torch':   { uri: combat_torchUri, w: torchW, h: torchH },
    'combat-leyline': { uri: combat_leylineUri, w: tileW, h: tileH },
  };
}

export function textureKeyForUnit(unit) {
  return unit?.id === 'player' ? 'combat-scholar' : 'combat-wraith';
}

export function buildLeylineTexture({ w = 128, h = 64 } = {}) {
  const cx = w / 2;

  // Outer esoteric ring (drawn as points on an ellipse to match isometric projection)
  const outerRing = ellipsePath(cx, h / 2, w * 0.35, h * 0.35, 36);

  // Inner diamond rune
  const rune = [
    { x: cx, y: h * 0.25 },
    { x: cx + w * 0.2, y: h / 2 },
    { x: cx, y: h * 0.75 },
    { x: cx - w * 0.2, y: h / 2 },
  ];

  // Small center dot
  const centerDot = [
    { x: cx, y: h * 0.45 },
    { x: cx + w * 0.05, y: h / 2 },
    { x: cx, y: h * 0.55 },
    { x: cx - w * 0.05, y: h / 2 },
  ];

  return renderWandSvgUri({
    width: w, height: h,
    layers: [
      {
        formula: edgeTrace(outerRing), close: true,
        stroke: '#ffffff', strokeWidth: 1.5, opacity: 0.7, glow: 3
      },
      {
        formula: edgeTrace(rune), close: true,
        stroke: '#ffffff', strokeWidth: 2.0, opacity: 0.9, glow: 4
      },
      {
        formula: edgeTrace(centerDot), close: true,
        gradient: { type: 'linear', x1: 0, y1: 0, x2: 1, y2: 1, stops: [[0, '#ffffff', 1], [1, '#ffffff', 0.8]] },
        glow: 6
      }
    ]
  });
}

export function buildTorchTexture({ w = 60, h = 120 } = {}) {
  const cx = w / 2;
  const stoneColor = '#4a5061';
  const stoneDark = '#1a1c22';

  // Torch base (pillar)
  const pillarHalf = [
    { x: cx, y: h },
    { x: cx + 12, y: h },
    { x: cx + 8, y: h * 0.6 },
    { x: cx, y: h * 0.6 },
  ];

  // Torch bowl
  const bowlHalf = [
    { x: cx, y: h * 0.65 },
    { x: cx + 16, y: h * 0.65 },
    { x: cx + 22, y: h * 0.45 },
    { x: cx + 10, y: h * 0.45 },
    { x: cx, y: h * 0.5 },
  ];

  // Static inner flame core (cyan)
  const flameCore = [
    { x: cx, y: h * 0.5 },
    { x: cx + 8, y: h * 0.4 },
    { x: cx + 4, y: h * 0.2 },
    { x: cx, y: h * 0.1 },
  ];

  return renderWandSvgUri({
    width: w, height: h,
    layers: [
      {
        formula: edgeTrace(pillarHalf), close: true, mirror: true,
        gradient: { type: 'linear', x1: 0, y1: 0, x2: 1, y2: 0, stops: [[0, stoneDark, 1], [0.5, stoneColor, 1], [1, stoneDark, 1]] },
      },
      {
        formula: edgeTrace(bowlHalf), close: true, mirror: true,
        gradient: { type: 'linear', x1: 0, y1: 0, x2: 1, y2: 0, stops: [[0, stoneDark, 1], [0.4, '#6b7282', 1], [1, stoneDark, 1]] },
      },
      {
        formula: edgeTrace(bowlHalf), close: true, mirror: true,
        stroke: '#00ffff', strokeWidth: 1, opacity: 0.5, glow: 1
      },
      {
        formula: edgeTrace(flameCore), close: true, mirror: true,
        gradient: { type: 'linear', x1: 0, y1: 1, x2: 0, y2: 0, stops: [[0, '#00ffff', 1], [1, '#ffffff', 0.1]] },
        glow: 3
      }
    ]
  });
}

/**
 * Build character textures for all combat actors via CharacterShaderRenderer.
 * Returns Map<actorId, {textureKey, uniforms, enhancements}>.
 */
export async function buildCharacterTextures(actors, scene) {
  return bakeAll(actors, scene);
}
